import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { observe } from '../../src/commands/observe.js';
import { applyRemediation } from '../../src/commands/applyRemediation.js';
import { monitor } from '../../src/commands/monitor.js';
import { readJson, sha256 } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const OBS = path.join(FIX, 'observations');
const fresh = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-obs-')); init(root); return root; };

test('observation collectors normalize owner evidence and preserve boundaries', async () => {
  const root = fresh();
  const index = await observe(root, 'index', { input: path.join(OBS, 'index.json') });
  assert.equal(index.observations[0].data.indexed, true);
  assert.equal(index.observations[0].collection_method, 'owner_import');

  const citations = await observe(root, 'citations', { input: path.join(OBS, 'citations.json') });
  assert.equal(citations.summary.citation_metrics.citation_presence_rate, 1);
  assert.equal(citations.summary.citation_metrics.supported_citation_rate, 0.5);
  assert.deepEqual(citations.summary.citation_metrics.competitive_domains, ['competitor.test']);

  const logs = await observe(root, 'logs', { input: path.join(OBS, 'logs.json') });
  assert.equal(logs.manifest.status, 'incomplete');
  assert.ok(logs.observations.some((o) => o.confidence === 'confirmed'));
  assert.ok(logs.observations.some((o) => o.confidence === 'high'));
  assert.equal(logs.observations[0].data.crawler_identity.verification_status, 'fully_verified');
  assert.equal(logs.observations[1].data.crawler_identity.verification_status, 'contradictory');
  assert.equal(logs.observations[0].authority.authenticity_status, 'provider_range_verified');
  assert.equal(logs.observations[0].authority.collection_authority, 'production_log');
  const unsafeLog = path.join(root, 'unsafe-log.json');
  fs.writeFileSync(unsafeLog, JSON.stringify({ requests: [{ timestamp: '2026-07-18T00:00:00Z', url: '/', user_agent: 'Bot', status: 200, authorization: 'Bearer secret' }] }));
  await assert.rejects(observe(root, 'logs', { input: unsafeLog }), /sensitive fields/);

  const performance = await observe(root, 'performance', { input: path.join(OBS, 'performance.json') });
  assert.equal(performance.observations[0].kind, 'performance');
  assert.equal(performance.observations[0].data.evidence_type, 'field');
  const corroboration = await observe(root, 'corroboration', { input: path.join(OBS, 'corroboration.json') });
  assert.equal(corroboration.observations[0].confidence, 'high');
  for (const result of [index, citations, logs, performance, corroboration]) {
    assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
  }
});

test('Bing owner exports preserve dataset boundaries and never imply ranking or causation', async () => {
  const root = fresh();
  const ai = await observe(root, 'bing', { input: path.join(OBS, 'bing-ai-performance.csv'), dataset: 'ai_performance' });
  assert.equal(ai.observations.length, 2);
  assert.equal(ai.observations[0].data.metrics.total_citations, 12);
  assert.match(ai.observations[0].data.interpretation_boundary.join(' '), /do not indicate ranking/);
  assert.equal(ai.observations[0].authority.collection_authority, 'owner_export');
  assert.equal(ai.observations[0].authority.representativeness, 'unknown');

  const search = await observe(root, 'bing', { input: path.join(OBS, 'bing-search-performance.json'), dataset: 'search_performance' });
  assert.equal(search.observations[0].data.dimensions.source, 'Web');
  assert.equal(search.observations[0].authority.representativeness, 'complete_export');
  assert.match(search.observations[0].data.interpretation_boundary.join(' '), /does not establish/);

  await assert.rejects(observe(root, 'bing', { input: path.join(OBS, 'bing-invalid.json'), dataset: 'ai_performance' }), /valid date/);
});

test('passage and consensus collectors analyze site artifacts without external claims', async () => {
  const root = fresh();
  const options = { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test' };
  const passages = await observe(root, 'passages', options);
  assert.ok(passages.observations.length > 0);
  assert.ok(passages.observations.every((o) => o.collection_method === 'static_analysis'));
  const consensus = await observe(root, 'consensus', options);
  assert.ok(consensus.observations.some((o) => o.data.canonical_consensus === true));
  assert.ok(consensus.observations.every((o) => o.data.engine_selected_canonical === null));
});

test('controlled citation runner repeats a disclosed prompt corpus through an adapter', async () => {
  const root = fresh();
  let calls = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      calls++;
      const payload = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ provider: 'fixture-provider', answer_text: `Answer ${payload.run_index}`, citations: ['https://example.test/products/gatekeeper/'] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/run`;
    const result = await observe(root, 'citations', { input: path.join(OBS, 'prompt-corpus.json'), endpoint, repeat: 3, target: 'https://example.test/' });
    assert.equal(calls, 3);
    assert.equal(result.summary.citation_metrics.runs, 3);
    assert.equal(result.summary.citation_metrics.citation_presence_rate, 1);
    assert.ok(result.observations.filter((o) => o.kind === 'citation').every((o) => o.collection_method === 'live_api'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('missing live credentials and browser dependency fail closed as incomplete', async () => {
  const root = fresh();
  const oldGsc = process.env.GSC_ACCESS_TOKEN, oldCrux = process.env.CRUX_API_KEY;
  delete process.env.GSC_ACCESS_TOKEN; delete process.env.CRUX_API_KEY;
  try {
    const index = await observe(root, 'index', { target: 'https://example.test/', siteUrl: 'sc-domain:example.test' });
    assert.equal(index.manifest.status, 'incomplete');
    assert.equal(index.observations[0].state, 'not_evidenced');
    const perf = await observe(root, 'performance', { target: 'https://example.test/' });
    assert.equal(perf.observations[0].state, 'not_evidenced');
    const rendered = await observe(root, 'render', { target: 'https://example.test/' });
    assert.equal(rendered.observations[0].state, 'not_evidenced');
  } finally {
    if (oldGsc) process.env.GSC_ACCESS_TOKEN = oldGsc;
    if (oldCrux) process.env.CRUX_API_KEY = oldCrux;
  }
});

test('render profiles preserve partial failures and resume only successful immutable evidence', async () => {
  const root = fresh();
  const target = 'https://example.test/';
  const fetchUrl = async () => ({ body: '<main>Raw server rendered content for parity comparison.</main>' });
  const captured = [];
  const captureProfile = async (name, viewport, settings = {}) => {
    captured.push(name);
    if (name === 'javascript_disabled') throw new Error('fixture profile failure');
    return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: `<main>${name} rendered content</main>`, text: `${name} rendered content`, screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [{ tag: 'summary', text: 'Details' }], executed: ['Details'] } };
  };
  const first = await observe(root, 'render', { target, interactions: true, captureProfile, fetchUrl });
    assert.equal(first.manifest.status, 'incomplete');
    assert.deepEqual(captured, ['desktop', 'mobile', 'javascript_disabled']);
    assert.equal(first.observations.find((item) => item.data.profile === 'javascript_disabled').state, 'failed');
    assert.ok(fs.existsSync(path.join(first.dir, 'screenshots', 'mobile.png')));

    captured.length = 0;
    const resumed = await observe(root, 'render', { target, interactions: true, resumeRun: first.runId, fetchUrl, captureProfile: async (name, viewport, settings = {}) => {
      captured.push(name);
      return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: '<main>Server fallback content</main>', text: 'Server fallback content', screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [], executed: [] } };
    } });
    assert.deepEqual(captured, ['javascript_disabled']);
    assert.equal(resumed.manifest.status, 'completed');
    assert.equal(resumed.observations.filter((item) => item.data.profile === 'desktop').length, 1);
  assert.equal(resumed.observations.find((item) => item.data.profile === 'parity').data.resumed_from_run_id, first.runId);
  assert.match(resumed.manifest.warnings.join(' '), /reused from immutable run/);

  captured.length = 0;
  await observe(root, 'render', { target: 'https://other.example.test/', interactions: true, resumeRun: first.runId, fetchUrl, captureProfile: async (name, viewport, settings = {}) => {
    captured.push(name);
    return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: '<main>Other target</main>', text: 'Other target', screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [], executed: [] } };
  } });
  assert.deepEqual(captured, ['desktop', 'mobile', 'javascript_disabled']);
});

test('local Lighthouse execution preserves repeated lab runs and a median summary', async () => {
  const root = fresh();
  const scores = [0.7, 0.9, 0.8];
  const result = await observe(root, 'performance', { target: 'https://example.test/', lighthouse: true, repeat: 3, lighthouseRunner: async (_target, runIndex) => ({
    lighthouseVersion: '13.4.0', userAgent: 'Fixture Chrome/140', fetchTime: `2026-07-19T00:00:0${runIndex}Z`, finalDisplayedUrl: 'https://example.test/',
    configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate', screenEmulation: { mobile: true }, throttling: { rttMs: 150 } },
    categories: { performance: { score: scores[runIndex - 1] } },
    audits: { 'first-contentful-paint': { numericValue: 1000 + runIndex }, 'largest-contentful-paint': { numericValue: 2000 + runIndex }, 'cumulative-layout-shift': { numericValue: 0.1 * runIndex }, 'total-blocking-time': { numericValue: 100 + runIndex }, 'speed-index': { numericValue: 1500 + runIndex } },
  }) });
  assert.equal(result.manifest.status, 'completed');
  assert.equal(result.observations.length, 4);
  assert.equal(result.observations.at(-1).data.median_metrics.performance_score, 0.8);
  assert.equal(result.observations.at(-1).data.median_metrics.largest_contentful_paint_ms, 2002);
  assert.equal(result.observations[0].data.evidence_type, 'lab');
  assert.equal(result.observations[0].data.configuration.throttling_method, 'simulate');
  assert.ok(fs.existsSync(path.join(result.dir, 'lighthouse', 'run-03.json')));
});

test('guarded remediation requires source run, reviewer, exact hash, and unique match', async () => {
  const root = fresh();
  const source = path.join(root, 'page.html');
  fs.writeFileSync(source, '<title>Old title</title>');
  const auditRun = await audit(root, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test' });
  const specFile = path.join(root, 'remediation.json');
  const spec = { source_run_id: auditRun.runId, operations: [{ operation_id: 'OP-1', file: 'page.html', find: 'Old title', replace: 'Bounded title', expected_file_hash: sha256(fs.readFileSync(source)), finding_ids: [auditRun.findings[0].finding_id], reviewer: 'Fixture Reviewer' }] };
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const dry = applyRemediation(root, { input: specFile });
  assert.equal(dry.operations[0].status, 'proposed');
  assert.match(fs.readFileSync(source, 'utf8'), /Old title/);
  const wet = applyRemediation(root, { input: specFile, write: true });
  assert.equal(wet.operations[0].status, 'applied');
  assert.match(fs.readFileSync(source, 'utf8'), /Bounded title/);
  assert.throws(() => applyRemediation(root, { input: specFile, write: true }), /hash changed/);
  spec.operations[0].expected_file_hash = sha256(fs.readFileSync(source));
  spec.operations[0].find = 'Bounded title';
  spec.operations[0].finding_ids = ['F-NOT-IN-SOURCE-RUN'];
  fs.writeFileSync(specFile, JSON.stringify(spec));
  assert.throws(() => applyRemediation(root, { input: specFile }), /outside source run/);
});

test('monitor reports index loss between normalized observation runs', async () => {
  const root = fresh();
  const first = await observe(root, 'index', { input: path.join(OBS, 'index.json') });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const changedFile = path.join(root, 'index-changed.json');
  const changed = readJson(path.join(OBS, 'index.json'));
  changed[0].verdict = 'FAIL';
  fs.writeFileSync(changedFile, JSON.stringify(changed));
  const second = await observe(root, 'index', { input: changedFile });
  const result = monitor(root, { runA: first.runId, runB: second.runId });
  assert.ok(result.alerts.some((a) => a.type === 'index_loss'));
  assert.ok(result.summary.critical_or_high > 0);
});
