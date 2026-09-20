import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareSnapshots } from '../../src/commands/compareSnapshots.js';
import { init } from '../../src/commands/init.js';
import { writeJson } from '../../src/shared/io.js';

const ORIGIN = 'https://comparison-fixture.test';

function coverage({ state = 'evaluated', coverageStatus = 'complete', url = `${ORIGIN}/200` } = {}) {
  const populations = {
    discovered: 1, eligible: 1, excluded: 0, attempted: 1, retrieved: state === 'failed' ? 0 : 1,
    valid_resource: state === 'evaluated' ? 1 : 0, evaluated: state === 'evaluated' ? 1 : 0,
    valid_but_unevaluated: state === 'valid_but_unevaluated' ? 1 : 0,
    failed: state === 'failed' ? 1 : 0, indeterminate: state === 'indeterminate' ? 1 : 0,
    unvisited: state === 'unvisited' ? 1 : 0,
  };
  return {
    schema_version: 1, normalization_version: 'url-identity-v1',
    requested_scope: { start_url: `${ORIGIN}/`, origin: ORIGIN, max_pages: 500, time_budget_seconds: 1800 },
    discovery: { status: coverageStatus === 'complete' ? 'complete' : 'truncated', methods: ['links'], limitations: [] },
    populations,
    resources: [{ normalized_url: url, original_urls: [url], state, ...(state === 'evaluated' ? { evaluation: {} } : {}) }],
    stop_reason: coverageStatus === 'complete' ? 'frontier_exhausted' : 'page_budget_exhausted',
    coverage_status: coverageStatus,
    reconciliation: { valid: true, errors: [] }, limitations: [],
  };
}

function finding(summary = 'Finding on page 200') {
  return {
    finding_id: 'F-TECH-200', detector_id: 'TECH-200',
    run_id: 'fixture', timestamp: '2026-09-19T00:00:00Z', discipline: ['seo'],
    subject: { type: 'page', identifier: `${ORIGIN}/200` },
    observation: { summary, evidence: ['fixture'] }, classification: { finding_type: 'deterministic_observation', severity: 'high', confidence: 'high', deterministic: true, impact: { citation: 'high' } },
    remediation: { preferred: 'Review', review_required: false }, verification: { method: 'fixture' }, status: { state: 'open' },
  };
}

function run(root, id, findings, cov, overrides = {}) {
  const dir = path.join(root, '.citable', 'runs', id);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'findings.json'), findings);
  writeJson(path.join(dir, 'coverage.json'), cov);
  writeJson(path.join(dir, 'manifest.json'), {
    timestamp: `2026-09-19T00:00:${id === 'A' ? '00' : '01'}Z`, tool_version: '1.19.0', command: 'audit', argv: [],
    target: { kind: 'url', location: ORIGIN }, configuration_hash: 'same', input_hashes: {}, output_hashes: {}, detectors_run: ['TECH-200'],
    run_id: id, skill_version: '1.19.0', status: 'completed', schema_version: 2, execution_status: 'completed', coverage_status: cov.coverage_status,
    determination_status: cov.coverage_status === 'complete' ? 'supported' : 'qualified', ...overrides,
  });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-comparison-'));
  init(root);
  return root;
}

test('missing or failed page in B is not resolved', () => {
  const root = fixture();
  run(root, 'A', [finding()], coverage());
  run(root, 'B', [], coverage({ state: 'failed', coverageStatus: 'indeterminate' }));
  const result = compareSnapshots(root, { runA: 'A', runB: 'B' });
  assert.equal(result.resolved.length, 0);
  assert.equal(result.not_reobserved.length, 1);
  assert.equal(result.not_reobserved[0].comparison_state, 'not_reobserved');
});

test('complete reobservation permits resolved, while changed is explicit', () => {
  const root = fixture();
  run(root, 'A', [finding()], coverage());
  run(root, 'B', [], coverage());
  let result = compareSnapshots(root, { runA: 'A', runB: 'B' });
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].comparison_state, 'resolved');

  run(root, 'C', [finding('Changed finding')], coverage());
  result = compareSnapshots(root, { runA: 'A', runB: 'C' });
  assert.equal(result.changed.length, 1);
  assert.equal(result.persisting.length, 0);
  assert.equal(result.changed[0].comparison_state, 'changed');
});

test('incomplete B preserves positive new findings but does not resolve A', () => {
  const root = fixture();
  run(root, 'A', [finding()], coverage());
  const newer = { ...finding('New positive observation'), finding_id: 'F-TECH-201', subject: { type: 'page', identifier: `${ORIGIN}/201` } };
  run(root, 'B', [newer], coverage({ state: 'unvisited', coverageStatus: 'truncated' }), { coverage_status: 'truncated', determination_status: 'qualified' });
  const result = compareSnapshots(root, { runA: 'A', runB: 'B' });
  assert.equal(result.resolved.length, 0);
  assert.equal(result.not_reobserved.length, 1);
  assert.equal(result.new.length, 1);
  assert.equal(result.new[0].subject.identifier, `${ORIGIN}/201`);
});

test('incomparable evaluator envelopes do not produce resolution', () => {
  const root = fixture();
  run(root, 'A', [finding()], coverage());
  run(root, 'B', [], coverage(), { tool_version: '2.0.0' });
  const result = compareSnapshots(root, { runA: 'A', runB: 'B' });
  assert.equal(result.resolved.length, 0);
  assert.equal(result.not_comparable.length, 1);
  assert.equal(result.not_comparable[0].comparison_state, 'not_comparable');
});

test('redirected resources compare by resource identity, not canonical URL or raw subject text', () => {
  const root = fixture();
  const redirected = {
    ...finding(),
    subject: {
      type: 'page', identifier: `${ORIGIN}/old`, resource_id: 'RESOURCE-REDIRECT',
      urlIdentity: {
        resource_id: 'RESOURCE-REDIRECT',
        requested: { normalized_url: `${ORIGIN}/old` },
        effective: { normalized_url: `${ORIGIN}/200` },
        canonical: { normalized_url: `${ORIGIN}/canonical` },
      },
    },
  };
  const current = {
    ...finding(),
    subject: {
      type: 'page', identifier: `${ORIGIN}/200`, resource_id: 'RESOURCE-REDIRECT',
      urlIdentity: {
        resource_id: 'RESOURCE-REDIRECT',
        requested: { normalized_url: `${ORIGIN}/200` },
        effective: { normalized_url: `${ORIGIN}/200` },
        canonical: { normalized_url: `${ORIGIN}/canonical` },
      },
    },
  };
  run(root, 'A', [redirected], coverage({ url: `${ORIGIN}/200` }));
  run(root, 'B', [current], coverage({ url: `${ORIGIN}/200` }));
  let result = compareSnapshots(root, { runA: 'A', runB: 'B' });
  assert.equal(result.persisting.length, 1, 'requested/effective redirect identity must persist');

  const canonicalOnly = { ...current, subject: { type: 'page', identifier: `${ORIGIN}/canonical`, urlIdentity: { canonical: { normalized_url: `${ORIGIN}/canonical` } } } };
  run(root, 'C', [canonicalOnly], coverage({ url: `${ORIGIN}/canonical` }));
  result = compareSnapshots(root, { runA: 'A', runB: 'C' });
  assert.equal(result.persisting.length, 0, 'canonical URL must not stand in for evaluated resource identity');
  assert.equal(result.new.length, 1);
  assert.equal(result.not_reobserved.length, 1);
});
