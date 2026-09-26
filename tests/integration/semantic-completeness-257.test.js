import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { buildSiteFromUrl } from '../../src/extractor/site.js';
import { actionPlan } from '../../src/commands/actionPlan.js';
import { compareSnapshots } from '../../src/commands/compareSnapshots.js';
import { exportExecutiveReport } from '../../src/reporting/executiveExport.js';
import { formatPrReviewComment } from '../../src/commands/ciWorkflow.js';
import { auditCroSuite } from '../../src/commands/croSuite.js';
import { evaluateStaticCwv, sweepTechnical } from '../../src/commands/sweep.js';
import { loadVerifiedRun } from '../../src/shared/verifiedRunLoader.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';
import { readJson } from '../../src/shared/io.js';
import { evaluateRequirement, REQUIREMENTS } from '../../src/evidence/determination.js';
import { createSite257, pageUrl } from '../fixtures/site-257/fixture.js';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-site-257-'));
  init(root);
  return root;
}

function resource(coverage, number) {
  return coverage.resources.find(({ normalized_url: url }) => url === pageUrl(number));
}

async function runFixture(root, fixture, maxPages, extra = {}) {
  return audit(root, {
    target: fixture.startUrl,
    scope: 'technical',
    maxPages,
    timeBudgetSeconds: 60,
    fetcher: fixture.fetcher,
    ...extra,
  });
}

test('collection concurrency is an explicit sequential contract', async () => {
  const fixture = createSite257();
  let fetches = 0;
  await assert.rejects(
    buildSiteFromUrl(fixture.startUrl, { concurrency: 2, fetcher: async () => { fetches += 1; } }),
    /concurrency is fixed at 1/i,
  );
  assert.equal(fetches, 0, 'unsupported concurrency must fail before collection');
});

test('257-page fixture exposes every requested topology and special retrieval event', async () => {
  const root = project();
  const fixture = createSite257();
  const result = await runFixture(root, fixture, 500);
  const coverage = readJson(path.join(result.dir, 'coverage.json'));

  assert.equal(validateAgainst('audit-coverage.schema.json', coverage).valid, true);
  assert.equal(coverage.reconciliation.valid, true);
  assert.equal(coverage.populations.discovered, 257);
  assert.equal(coverage.populations.unvisited, 0);
  assert.equal(coverage.populations.failed, 1);
  assert.equal(coverage.coverage_status, 'indeterminate');
  assert.equal(resource(coverage, 150).state, 'failed');
  assert.equal(resource(coverage, 101).state, 'indeterminate');
  assert.equal(resource(coverage, 199).state, 'indeterminate');
  assert.equal(resource(coverage, 256).state, 'indeterminate');
  assert.equal(resource(coverage, 201).state, 'evaluated');
  assert.equal(resource(coverage, 201).discovery_sources.some(({ source }) => source === 'sitemap'), true);
  assert.equal(resource(coverage, 149).retrieval.attempts?.length, undefined);
  assert.equal(result.manifest.coverage_status, 'indeterminate');
  assert.match(result.manifest.errors.join('\n'), /sitemap-failed|ETIMEDOUT/);
  assert.equal(fixture.calls.get('/sitemap-child.xml.gz'), 1);
  assert.equal(fixture.calls.get('/sitemap-failed.xml'), 1);
});

test('malformed child sitemap remains visible instead of becoming complete discovery', async () => {
  const fixture = createSite257({ failChildSitemap: false });
  const site = await buildSiteFromUrl(fixture.startUrl, { maxPages: 500, timeBudgetSeconds: 60, fetcher: fixture.fetcher });
  const coverage = site.finalizeCoverage({ evaluated: true });
  assert.equal(site.sitemapTopology.status, 'indeterminate');
  assert.ok(site.sitemapTopology.errors.some(({ url }) => url.endsWith('/sitemap-failed.xml')));
  assert.equal(coverage.discovery.status, 'indeterminate');
  assert.equal(coverage.coverage_status, 'indeterminate');
  assert.equal(coverage.reconciliation.valid, true);
});

test('budgets 50, 100, 256, 257, and 500 differ only at declared evidence boundaries', async () => {
  const root = project();
  const outputs = new Map();
  for (const maxPages of [50, 100, 256, 257, 500]) {
    const fixture = createSite257();
    const result = await runFixture(root, fixture, maxPages);
    const coverage = readJson(path.join(result.dir, 'coverage.json'));
    outputs.set(maxPages, { result, coverage });
    assert.equal(coverage.reconciliation.valid, true);
    assert.equal(coverage.requested_scope.max_pages, maxPages);
    assert.equal(coverage.coverage_status, maxPages <= 256 ? 'truncated' : 'indeterminate');
    assert.equal(coverage.stop_reason, maxPages <= 256 ? 'page_budget_exhausted' : 'frontier_exhausted');
    assert.ok(coverage.populations.unvisited >= 0);
    assert.equal(coverage.populations.discovered, 257);
  }

  assert.equal(resource(outputs.get(50).coverage, 51).state, 'unvisited');
  assert.equal(resource(outputs.get(100).coverage, 100).state, 'evaluated');
  assert.equal(resource(outputs.get(100).coverage, 101).state, 'unvisited');
  assert.equal(resource(outputs.get(256).coverage, 256).state, 'indeterminate');
  assert.equal(resource(outputs.get(256).coverage, 257).state, 'evaluated');
  assert.equal(resource(outputs.get(256).coverage, 201).state, 'unvisited');
  assert.equal(resource(outputs.get(257).coverage, 257).state, 'evaluated');
  assert.equal(resource(outputs.get(500).coverage, 150).state, 'failed');
  assert.equal(resource(outputs.get(500).coverage, 201).state, 'evaluated');
  assert.ok(outputs.get(50).coverage.populations.unvisited > outputs.get(100).coverage.populations.unvisited);
  assert.ok(outputs.get(100).coverage.populations.unvisited > outputs.get(257).coverage.populations.unvisited);
  for (const { result } of outputs.values()) {
    assert.doesNotMatch(result.report, /site-wide.*no issues|verified clean/i);
  }
});

test('retry, redirect, MIME, soft-404, challenge, and canonical evidence retain distinct identities', async () => {
  const root = project();
  const fixture = createSite257();
  const result = await runFixture(root, fixture, 500);
  const site = await buildSiteFromUrl(fixture.startUrl, { maxPages: 500, timeBudgetSeconds: 60, fetcher: fixture.fetcher });
  const siteCoverage = site.finalizeCoverage({ evaluated: true });
  const siteResources = readJson(path.join(result.dir, 'coverage.json')).resources;
  const pages = readJson(path.join(result.dir, 'pages', 'index.json'));
  const page = (number) => pages.find(({ requested_url: url }) => url === pageUrl(number));
  assert.equal(page(99).url, `${fixture.origin}/redirect-target`);
  assert.equal(page(99).effective_url, `${fixture.origin}/redirect-target`);
  assert.equal(page(99).status, 301);
  assert.equal(page(99).url_identity.requested.normalized_url, pageUrl(99));
  assert.equal(page(99).url_identity.effective.normalized_url, `${fixture.origin}/redirect-target`);
  assert.equal(page(99).url_identity.redirect.length, 1);
  assert.equal(page(99).url_identity.redirect[0].location, `${fixture.origin}/redirect-target`);
  assert.equal(page(149).requested_url, pageUrl(149));
  assert.equal(page(149).resource_id.startsWith('RESOURCE-'), true);
  assert.equal(resource(siteCoverage, 101).state, 'indeterminate');
  assert.equal(resource(siteCoverage, 199).state, 'indeterminate');
  assert.equal(resource(siteCoverage, 256).state, 'indeterminate');
  assert.equal(site.pages.find(({ url }) => url === pageUrl(149)).fetchAttempts.length, 2);
  assert.equal(site.pages.find(({ url }) => url === pageUrl(149)).fetchAttempts[0].retryDecision, 'retry');
  assert.equal(site.pages.find(({ crawlUrl }) => crawlUrl === pageUrl(99)).urlIdentity.requested.url, pageUrl(99));
  assert.equal(siteResources.filter(({ normalized_url: url }) => url === pageUrl(249)).length, 1);
  const canonical = page(249);
  assert.equal(canonical.url_identity.requested.normalized_url, pageUrl(249));
  assert.equal(canonical.url_identity.effective.normalized_url, pageUrl(249));
  assert.equal(canonical.url_identity.canonical.normalized_url, pageUrl(248));
  assert.notEqual(canonical.resource_id, page(248).resource_id);
  assert.match(result.report, /Coverage status: \*\*indeterminate\*\*/i);
});

test('missing page 200 in snapshot B is not classified as resolved', async () => {
  const root = project();
  const first = await runFixture(root, createSite257(), 500);
  const second = await runFixture(root, createSite257({ failPage200: true }), 500);
  const comparison = compareSnapshots(root, { runA: first.runId, runB: second.runId });
  assert.equal(comparison.resolved.some(({ subject }) => subject.identifier === pageUrl(200)), false);
  const missing = comparison.not_reobserved.find(({ subject }) => subject.identifier === pageUrl(200));
  assert.ok(missing, 'page 200 must be explicitly marked not_reobserved');
  assert.equal(missing.comparison_state, 'not_reobserved');
});

test('unique page findings only appear once their resource is evaluated', async () => {
  const root = project();
  const fixture = createSite257();
  const run50 = await runFixture(root, fixture, 50);
  const run100 = await runFixture(root, createSite257(), 100);
  const run257 = await runFixture(root, createSite257(), 257);
  const findingPages = (run) => new Set(run.findings.filter(({ detector_id }) => detector_id === 'TECH-002').map(({ subject }) => subject.identifier));
  assert.deepEqual([...findingPages(run50)].sort(), [49, 50].map(pageUrl).sort());
  assert.equal(findingPages(run50).has(pageUrl(51)), false);
  assert.equal(findingPages(run100).has(pageUrl(100)), true);
  assert.equal(findingPages(run100).has(pageUrl(200)), false);
  assert.equal(findingPages(run257).has(pageUrl(200)), true);
  assert.equal(findingPages(run257).has(pageUrl(257)), true);
  const coverage = readJson(path.join(run50.dir, 'coverage.json'));
  assert.equal(evaluateRequirement(REQUIREMENTS.EXHAUSTIVE_SCOPE, coverage).status, 'indeterminate');
  assert.notEqual(run50.manifest.coverage_status, 'complete');
});

test('incomplete fixture remains qualified or indeterminate through downstream consumers', async () => {
  const root = project();
  const fixture = createSite257();
  const result = await runFixture(root, fixture, 50);
  const coverage = readJson(path.join(result.dir, 'coverage.json'));
  const plan = actionPlan(root, { runId: result.runId });
  assert.equal(plan.source_coverage.coverage_status, 'truncated');
  assert.equal(plan.source_coverage.determination_status, 'qualified');
  assert.ok(plan.actions.every((action) => action.coverage_status === 'truncated'));

  // These consumers intentionally receive a local fixture page/corpus and
  // must not convert the source run's incomplete evidence into site-wide truth.
  const localDir = path.join(root, 'local-site');
  fs.mkdirSync(localDir);
  fs.writeFileSync(path.join(localDir, 'index.html'), '<!doctype html><html><body><h1>Fixture</h1><p>Enough substantive text for static analysis.</p></body></html>');
  const sweep = await sweepTechnical(root, { target: localDir });
  assert.ok(['supported', 'qualified', 'indeterminate'].includes(sweep.determination_status));
  const cro = await auditCroSuite(root, { target: localDir });
  assert.ok(['supported', 'qualified', 'indeterminate'].includes(cro.determination_status));
  const executive = await exportExecutiveReport(root, result.runId, { format: 'markdown-deck' });
  assert.match(executive.content, /evaluated .* of .* eligible|coverage|indeterminate/i);
  const ci = formatPrReviewComment([], { coverage_status: coverage.coverage_status, determination_status: 'indeterminate' });
  assert.doesNotMatch(ci, /verified clean/i);
  assert.match(ci, /insufficient evidence/i);

  const loaded = loadVerifiedRun(result.dir, { requireCompletedExecution: false });
  assert.equal(loaded.coverage.coverage_status, 'truncated');
  fs.appendFileSync(path.join(result.dir, 'findings.json'), '\n');
  assert.throws(() => loadVerifiedRun(result.dir, { requireCompletedExecution: false }), /checksum|integrity|tamper/i);
});

test('reversed discovery order has the same normalized coverage populations', async () => {
  const root = project();
  const normal = createSite257();
  const reversed = createSite257();
  const reverseFetcher = async (url, options) => {
    const response = await reversed.fetcher(url, options);
    if (new URL(url).pathname === '/sitemap-main.xml' && response.status === 200) {
      const urls = [...response.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).reverse();
      response.body = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`;
    }
    return response;
  };
  const first = await runFixture(root, normal, 500);
  const second = await runFixture(root, { ...reversed, fetcher: reverseFetcher }, 500, { concurrency: 1 });
  const a = readJson(path.join(first.dir, 'coverage.json'));
  const b = readJson(path.join(second.dir, 'coverage.json'));
  const normalizeResources = (coverage) => coverage.resources.map((item) => ({
    ...item,
    discovery_sources: item.discovery_sources,
  }));
  const normalizeFindings = (run) => run.findings.map((finding) => ({
    detector_id: finding.detector_id,
    subject: finding.subject,
    observation: finding.observation,
    evidence_scope: finding.evidence_scope,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(a.populations, b.populations);
  assert.equal(a.coverage_status, b.coverage_status);
  assert.equal(a.stop_reason, b.stop_reason);
  assert.deepEqual(normalizeResources(a), normalizeResources(b));
  assert.deepEqual(normalizeFindings(first), normalizeFindings(second));
  const firstPages = readJson(path.join(first.dir, 'pages', 'index.json'));
  const secondPages = readJson(path.join(second.dir, 'pages', 'index.json'));
  const byUrl = (pages) => Object.fromEntries(pages.map((page) => [page.requested_url, page.artifact_hash]));
  assert.deepEqual(byUrl(firstPages), byUrl(secondPages));
});

test('default and explicit sequential concurrency produce identical same-fixture outputs', async () => {
  const root = project();
  const first = await runFixture(root, createSite257(), 500);
  const second = await runFixture(root, createSite257(), 500, { concurrency: 1 });
  assert.deepEqual(
    readJson(path.join(first.dir, 'coverage.json')),
    readJson(path.join(second.dir, 'coverage.json')),
  );
  const normalizeFinding = (finding) => {
    const copy = structuredClone(finding);
    delete copy.finding_id;
    delete copy.run_id;
    delete copy.timestamp;
    if (copy.status) {
      delete copy.status.first_seen;
      delete copy.status.last_seen;
      delete copy.status.occurrence_count;
      delete copy.status.persistence;
    }
    return copy;
  };
  assert.deepEqual(
    readJson(path.join(first.dir, 'findings.json')).map(normalizeFinding),
    readJson(path.join(second.dir, 'findings.json')).map(normalizeFinding),
  );
  assert.deepEqual(
    readJson(path.join(first.dir, 'pages', 'index.json')),
    readJson(path.join(second.dir, 'pages', 'index.json')),
  );
  for (const artifact of ['coverage.json', 'summary.json', 'inputs.json', 'report.md', 'pages/index.json']) {
    const readOutput = (runDir, relative) => {
      const bytes = fs.readFileSync(path.join(runDir, relative));
      if (relative !== 'report.md') return bytes;
      return bytes.toString()
        .replace(/\d{8}T\d{6}-audit-[a-z0-9-]+/g, '<run-id>')
        .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, '<timestamp>')
        .replace(/F-[a-z0-9]+/g, '<finding>');
    };
    assert.deepEqual(
      readOutput(first.dir, artifact),
      readOutput(second.dir, artifact),
      artifact,
    );
  }
});

test('every sealed execution component rejects tampering', async () => {
  const root = project();
  const result = await runFixture(root, createSite257(), 50);
  const files = ['findings.json', 'coverage.json', 'manifest.json', 'pages/index.json', 'summary.json'];
  for (const relative of files) {
    const file = path.join(result.dir, relative);
    const original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    assert.throws(
      () => loadVerifiedRun(result.dir, { requireCompletedExecution: false }),
      /checksum|integrity|tamper|malformed|schema/i,
      `tampering ${relative} must fail verification`,
    );
    fs.writeFileSync(file, original);
  }
  assert.equal(loadVerifiedRun(result.dir, { requireCompletedExecution: false }).verified, true);
});

test('fixture page static evaluation remains bounded and deterministic', () => {
  const html = '<!doctype html><html><head><title>Fixture</title></head><body><h1>Fixture</h1><p>Enough substantive text for evaluation.</p></body></html>';
  const page = { html, domNodeCount: 10, maxDomDepth: 3 };
  const first = evaluateStaticCwv(page);
  const second = evaluateStaticCwv(page);
  assert.deepEqual(first, second);
  assert.ok(first.heuristics.dom_nodes < 100);
});
