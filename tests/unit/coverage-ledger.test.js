import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVERAGE_SCHEMA_VERSION,
  coverageStatusFor,
  createCoverageLedger,
  reconcileCoverage,
} from '../../src/evidence/coverage.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const OPTIONS = {
  startUrl: 'https://example.test/',
  maxPages: 10,
  timeBudgetSeconds: 30,
};

function ledger() {
  return createCoverageLedger(OPTIONS);
}

test('reconciles every population for a complete audit', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/', 'start_url');
  coverage.discover('https://example.test/about', 'html_link');
  coverage.discover('https://example.test/private', 'sitemap');
  coverage.exclude('https://example.test/private', 'robots_policy');

  for (const url of ['https://example.test/', 'https://example.test/about']) {
    coverage.attempt(url, { attempt: 1 });
    coverage.retrieve(url, { status: 200 });
    coverage.classify(url, { state: 'valid_resource', media_type: 'text/html' });
    coverage.evaluate(url, { detector_count: 4 });
  }

  const result = coverage.finalize('frontier_exhausted');
  assert.equal(COVERAGE_SCHEMA_VERSION, 1);
  assert.deepEqual(result.populations, {
    discovered: 3,
    eligible: 2,
    excluded: 1,
    attempted: 2,
    retrieved: 2,
    valid_resource: 2,
    evaluated: 2,
    valid_but_unevaluated: 0,
    failed: 0,
    indeterminate: 0,
    unvisited: 0,
  });
  assert.deepEqual(result.reconciliation, { valid: true, errors: [] });
  assert.equal(result.coverage_status, 'complete');
});

test('deduplicates populations by normalized URL and retains sorted provenance', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/page#second', 'sitemap', { sitemap: 'b.xml' });
  coverage.discover('https://example.test/page#first', 'html_link', { from: '/z' });
  coverage.discover('https://example.test/page', 'html_link', { from: '/a' });

  const result = coverage.finalize('page_budget_exhausted', { discoveryStatus: 'truncated' });
  assert.equal(result.populations.discovered, 1);
  assert.equal(result.populations.unvisited, 1);
  assert.deepEqual(result.resources[0].original_urls, [
    'https://example.test/page',
    'https://example.test/page#first',
    'https://example.test/page#second',
  ]);
  assert.deepEqual(
    result.resources[0].discovery_sources.map(({ source }) => source),
    ['html_link', 'html_link', 'sitemap'],
  );
});

test('rejects invalid state transitions and unknown stop reasons', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/a', 'start_url');
  assert.throws(() => coverage.retrieve('https://example.test/a', { status: 200 }), /attempt/i);
  assert.throws(() => coverage.evaluate('https://example.test/a', {}), /valid resource/i);

  coverage.attempt('https://example.test/a', { attempt: 1 });
  assert.throws(() => coverage.exclude('https://example.test/a', 'late'), /attempt/i);
  coverage.retrieve('https://example.test/a', { status: 200 });
  assert.throws(() => coverage.evaluate('https://example.test/a', {}), /valid resource/i);
  coverage.classify('https://example.test/a', 'valid_resource');
  coverage.evaluate('https://example.test/a', {});
  assert.throws(() => coverage.fail('https://example.test/a', { reason: 'late' }), /evaluated|terminal/i);
  assert.throws(() => coverage.finalize('operator_stopped'), /stop reason/i);
});

test('retains retry history while counting an attempted URL once', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/flaky', 'start_url');
  coverage.attempt('https://example.test/flaky', { attempt: 1, error: 'timeout' });
  coverage.attempt('https://example.test/flaky', { attempt: 2 });
  coverage.retrieve('https://example.test/flaky', { status: 200 });
  coverage.classify('https://example.test/flaky', 'valid_resource');
  coverage.evaluate('https://example.test/flaky', { result: 'complete' });

  const result = coverage.finalize('frontier_exhausted');
  assert.equal(result.populations.attempted, 1);
  assert.deepEqual(result.resources[0].attempt_history, [
    { attempt: 1, error: 'timeout' },
    { attempt: 2 },
  ]);
});

test('page and time budget stops are truncated and retain unvisited resources', () => {
  for (const stopReason of ['page_budget_exhausted', 'time_budget_exhausted']) {
    const coverage = ledger();
    coverage.discover('https://example.test/visited', 'start_url');
    coverage.discover('https://example.test/unvisited', 'sitemap');
    coverage.attempt('https://example.test/visited', {});
    coverage.retrieve('https://example.test/visited', { status: 200 });
    coverage.classify('https://example.test/visited', 'valid_resource');
    coverage.evaluate('https://example.test/visited', {});

    const result = coverage.finalize(stopReason, { discoveryStatus: 'truncated' });
    assert.equal(result.coverage_status, 'truncated');
    assert.equal(result.populations.unvisited, 1);
    assert.equal(result.resources.find((item) => item.normalized_url.endsWith('/unvisited')).state, 'unvisited');
  }
});

test('failure and indeterminate resources prevent complete frontier coverage', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/failed', 'start_url');
  coverage.attempt('https://example.test/failed', { attempt: 1 });
  coverage.fail('https://example.test/failed', { reason: 'attempts_exhausted' });
  coverage.discover('https://example.test/binary', 'html_link');
  coverage.attempt('https://example.test/binary', {});
  coverage.retrieve('https://example.test/binary', { status: 200 });
  coverage.markIndeterminate('https://example.test/binary', { reason: 'unsupported_media_type' });

  const result = coverage.finalize('frontier_exhausted');
  assert.equal(result.populations.failed, 1);
  assert.equal(result.populations.indeterminate, 1);
  assert.equal(result.coverage_status, 'indeterminate');
  assert.equal(coverageStatusFor({
    stopReason: 'fatal_collection_failure',
    discoveryStatus: 'complete',
    populations: result.populations,
  }), 'indeterminate');
});

test('frontier exhaustion is indeterminate when discovery is incomplete or URLs remain unvisited', () => {
  for (const discoveryStatus of ['truncated', 'indeterminate']) {
    const coverage = ledger();
    coverage.discover('https://example.test/evaluated', 'start_url');
    coverage.attempt('https://example.test/evaluated', {});
    coverage.retrieve('https://example.test/evaluated', { status: 200 });
    coverage.classify('https://example.test/evaluated', 'valid_resource');
    coverage.evaluate('https://example.test/evaluated', {});
    assert.equal(
      coverage.finalize('frontier_exhausted', { discoveryStatus }).coverage_status,
      'indeterminate',
    );
  }

  const coverage = ledger();
  coverage.discover('https://example.test/unvisited', 'start_url');
  const result = coverage.finalize('frontier_exhausted');
  assert.equal(result.populations.unvisited, 1);
  assert.equal(result.coverage_status, 'indeterminate');
});

test('finalize rejects every unresolved intermediate resource state', () => {
  const cases = [
    {
      expectedState: 'attempted',
      arrange(coverage, url) {
        coverage.attempt(url, {});
      },
    },
    {
      expectedState: 'retrieved',
      arrange(coverage, url) {
        coverage.attempt(url, {});
        coverage.retrieve(url, { status: 200 });
      },
    },
    {
      expectedState: 'valid_resource',
      arrange(coverage, url) {
        coverage.attempt(url, {});
        coverage.retrieve(url, { status: 200 });
        coverage.classify(url, 'valid_resource');
      },
    },
  ];

  for (const { expectedState, arrange } of cases) {
    const coverage = ledger();
    const url = `https://example.test/${expectedState}`;
    coverage.discover(url, 'start_url');
    arrange(coverage, url);
    assert.throws(
      () => coverage.finalize('frontier_exhausted'),
      new RegExp(`unresolved state ${expectedState}`),
    );
  }
});

test('records evaluator failure as valid-but-unevaluated', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/evaluator-error', 'start_url');
  coverage.attempt('https://example.test/evaluator-error', {});
  coverage.retrieve('https://example.test/evaluator-error', { status: 200 });
  coverage.classify('https://example.test/evaluator-error', 'valid_resource');
  coverage.markValidButUnevaluated('https://example.test/evaluator-error', {
    reason: 'evaluator_exception',
  });

  const result = coverage.finalize('frontier_exhausted');
  assert.equal(result.populations.valid_resource, 1);
  assert.equal(result.populations.valid_but_unevaluated, 1);
  assert.equal(result.coverage_status, 'indeterminate');
});

test('fragment normalization preserves other URL identity distinctions', () => {
  const coverage = ledger();
  const urls = [
    'https://example.test/path#one',
    'https://example.test/path#two',
    'https://example.test/path/',
    'https://example.test/path?x=1',
    'https://example.test/PATH',
    'http://example.test/path',
  ];
  urls.forEach((url) => coverage.discover(url, 'fixture'));

  const result = coverage.finalize('page_budget_exhausted');
  assert.equal(result.populations.discovered, 5);
  const expected = [
    'http://example.test/path',
    'https://example.test/PATH',
    'https://example.test/path',
    'https://example.test/path/',
    'https://example.test/path?x=1',
  ].sort();
  assert.deepEqual(result.resources.map((item) => item.normalized_url), expected);
});

test('canonical output is independent of discovery insertion order', () => {
  function build(discoveries) {
    const coverage = ledger();
    for (const args of discoveries) coverage.discover(...args);
    return coverage.finalize('page_budget_exhausted', {
      discoveryStatus: 'truncated',
      limitations: ['budget reached'],
    });
  }

  const a = ['https://example.test/a', 'html_link', { from: '/z', depth: 2 }];
  const b = ['https://example.test/b', 'sitemap', { index: 1 }];
  const c = ['https://example.test/a#section', 'sitemap', { sitemap: 'main.xml' }];
  assert.deepEqual(build([a, b, c]), build([c, b, a]));
});

test('snapshots nested caller metadata instead of retaining mutable references', () => {
  const coverage = ledger();
  const url = 'https://example.test/isolated';
  const discoveryMetadata = { context: { parents: ['/original'] } };
  const attemptMetadata = { transport: { errors: ['first'] } };
  const responseMetadata = { identity: { aliases: ['canonical'] } };
  const evaluationMetadata = { detectors: { completed: ['TECH-001'] } };

  coverage.discover(url, 'html_link', discoveryMetadata);
  coverage.attempt(url, attemptMetadata);
  coverage.retrieve(url, responseMetadata);
  coverage.classify(url, 'valid_resource');
  coverage.evaluate(url, evaluationMetadata);

  discoveryMetadata.context.parents.push('/mutated');
  attemptMetadata.transport.errors[0] = 'mutated';
  responseMetadata.identity.aliases.push('mutated');
  evaluationMetadata.detectors.completed.length = 0;

  const resource = coverage.finalize('frontier_exhausted').resources[0];
  assert.deepEqual(resource.discovery_sources[0].metadata, {
    context: { parents: ['/original'] },
  });
  assert.deepEqual(resource.attempt_history[0], {
    transport: { errors: ['first'] },
  });
  assert.deepEqual(resource.retrieval, {
    identity: { aliases: ['canonical'] },
  });
  assert.deepEqual(resource.evaluation, {
    detectors: { completed: ['TECH-001'] },
  });
});

test('successful finalization seals every mutating ledger operation', () => {
  const coverage = ledger();
  const url = 'https://example.test/finalized';
  coverage.discover(url, 'start_url');
  coverage.attempt(url, {});
  coverage.retrieve(url, { status: 200 });
  coverage.classify(url, 'valid_resource');
  coverage.evaluate(url, {});
  coverage.finalize('frontier_exhausted');

  const mutations = [
    () => coverage.discover('https://example.test/new', 'html_link'),
    () => coverage.exclude(url, 'late'),
    () => coverage.attempt(url, {}),
    () => coverage.retrieve(url, {}),
    () => coverage.classify(url, 'valid_resource'),
    () => coverage.evaluate(url, {}),
    () => coverage.fail(url, {}),
    () => coverage.markIndeterminate(url, {}),
    () => coverage.markValidButUnevaluated(url, {}),
    () => coverage.finalize('frontier_exhausted'),
  ];
  for (const mutate of mutations) assert.throws(mutate, /already finalized/);
});

test('a refused finalization leaves the ledger open for valid completion', () => {
  const coverage = ledger();
  const url = 'https://example.test/recoverable';
  coverage.discover(url, 'start_url');
  coverage.attempt(url, { attempt: 1 });

  assert.throws(
    () => coverage.finalize('frontier_exhausted'),
    /unresolved state attempted/,
  );

  coverage.retrieve(url, { status: 200 });
  coverage.classify(url, 'valid_resource');
  coverage.evaluate(url, { detector_count: 1 });
  const result = coverage.finalize('frontier_exhausted');
  assert.equal(result.coverage_status, 'complete');
  assert.equal(result.populations.evaluated, 1);
});

test('final coverage object validates against the audit coverage schema', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/', 'start_url');
  coverage.attempt('https://example.test/', {});
  coverage.retrieve('https://example.test/', { status: 200 });
  coverage.classify('https://example.test/', 'valid_resource');
  coverage.evaluate('https://example.test/', {});

  const result = coverage.finalize('frontier_exhausted', {
    discoveryMethods: ['sitemap', 'start_url'],
    discoveryLimitations: [],
    limitations: [],
  });
  assert.deepEqual(validateAgainst('audit-coverage.schema.json', result), { valid: true, errors: [] });
  assert.equal('timestamp' in result, false);
});

test('reconciliation reports every mutated population equation', () => {
  const coverage = ledger();
  coverage.discover('https://example.test/', 'start_url');
  const result = coverage.finalize('page_budget_exhausted');
  result.populations.discovered = 9;
  result.populations.eligible = 8;
  result.populations.attempted = 3;
  result.populations.retrieved = 2;
  result.populations.valid_resource = 1;

  const reconciliation = reconcileCoverage(result);
  assert.equal(reconciliation.valid, false);
  assert.equal(reconciliation.errors.length, 5);
  assert.match(reconciliation.errors.join('\n'), /discovered = excluded \+ eligible/);
  assert.match(reconciliation.errors.join('\n'), /eligible = evaluated/);
  assert.match(reconciliation.errors.join('\n'), /attempted = retrieved \+ failed/);
  assert.match(reconciliation.errors.join('\n'), /retrieved = valid_resource \+ indeterminate/);
});

test('constructor and resource methods reject invalid inputs', () => {
  assert.throws(() => createCoverageLedger({ ...OPTIONS, maxPages: 0 }), /maxPages/);
  assert.throws(() => createCoverageLedger({ ...OPTIONS, timeBudgetSeconds: 0 }), /timeBudgetSeconds/);
  assert.throws(() => createCoverageLedger({ ...OPTIONS, startUrl: 'not a url' }), /startUrl/);

  const coverage = ledger();
  assert.throws(() => coverage.attempt('https://example.test/missing', {}), /discover/i);
  coverage.discover('https://example.test/x', 'start_url');
  assert.throws(() => coverage.markIndeterminate('https://example.test/x', {}), /retrieve/i);
});
