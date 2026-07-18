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
  assert.ok(logs.observations.some((o) => o.confidence === 'high'));
  assert.ok(logs.observations.some((o) => o.confidence === 'low'));
  assert.equal(logs.observations[0].data.verification_method, 'matched imported PerplexityBot CIDR set');

  const performance = await observe(root, 'performance', { input: path.join(OBS, 'performance.json') });
  assert.equal(performance.observations[0].kind, 'performance');
  assert.equal(performance.observations[0].data.evidence_type, 'field');
  const corroboration = await observe(root, 'corroboration', { input: path.join(OBS, 'corroboration.json') });
  assert.equal(corroboration.observations[0].confidence, 'high');
  for (const result of [index, citations, logs, performance, corroboration]) {
    assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
  }
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
