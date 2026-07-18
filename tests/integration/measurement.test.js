import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { evaluateObjective, importMetrics, initializeObjective, validateObjectives } from '../../src/commands/measurement.js';
import { readJson } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/measurement');

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-measurement-'));
  init(root);
  fs.copyFileSync(path.join(FIX, 'metrics.yaml'), path.join(root, '.citable', 'metrics.yaml'));
  return root;
}

test('objectives are dry-run by default and validate metric references before writing', () => {
  const root = project();
  const input = path.join(FIX, 'objective.json');
  const dry = initializeObjective(root, { input });
  assert.equal(dry.written, false);
  assert.equal(validateObjectives(root).count, 0);
  const written = initializeObjective(root, { input, write: true });
  assert.equal(written.written, true);
  assert.deepEqual(validateObjectives(root), { ok: true, problems: [], count: 1 });
  assert.throws(() => initializeObjective(root, { input, write: true }), /already exists/);
});

test('CSV metric imports produce immutable observations and independent evaluation results', () => {
  const root = project();
  initializeObjective(root, { input: path.join(FIX, 'objective.json'), write: true });
  const imported = importMetrics(root, { input: path.join(FIX, 'gsc.csv'), provider: 'gsc' });
  assert.equal(imported.summary.total, 4);
  assert.equal(imported.summary.by_kind.metric, 4);
  assert.ok(fs.existsSync(path.join(imported.dir, 'checksums.json')));
  const first = readJson(path.join(imported.dir, 'observations', '0001-metric.json'));
  assert.equal(first.data.dimensions.url, 'https://example.test/product/a');
  assert.match(first.evidence_hash, /^[a-f0-9]{64}$/);

  const evaluation = evaluateObjective(root, { objectiveId: 'OBJECTIVE-PRODUCT_DISCOVERY', refDate: '2026-07-18' });
  assert.equal(evaluation.status, 'observed');
  assert.equal(evaluation.metrics[0].baseline, 25);
  assert.equal(evaluation.metrics[0].evaluation, 50);
  assert.equal(evaluation.metrics[0].relative_change, 1);
  assert.equal(evaluation.guardrail_status, 'met');
  assert.equal(evaluation.guardrails[0].passed, true);
  assert.match(evaluation.interpretation, /does not establish/);

  importMetrics(root, { input: path.join(FIX, 'gsc.csv'), provider: 'gsc' });
  const deduplicated = evaluateObjective(root, { objectiveId: 'OBJECTIVE-PRODUCT_DISCOVERY', refDate: '2026-07-18' });
  assert.equal(deduplicated.metrics[0].baseline, 25);
  assert.equal(deduplicated.metrics[0].evaluation, 50);
});

test('imports fail closed for undeclared metrics and provider mismatches', () => {
  const root = project();
  assert.throws(() => importMetrics(root, { input: path.join(FIX, 'invalid-unknown-metric.json'), provider: 'gsc' }), /unknown metric_id/);
  assert.throws(() => importMetrics(root, { input: path.join(FIX, 'gsc.csv'), provider: 'ga4' }), /belongs to gsc, not ga4/);
});

test('insufficient comparison data is inconclusive rather than zero', () => {
  const root = project();
  initializeObjective(root, { input: path.join(FIX, 'objective.json'), write: true });
  const evaluation = evaluateObjective(root, { refDate: '2026-07-18' });
  assert.equal(evaluation.status, 'inconclusive');
  assert.equal(evaluation.metrics[0].baseline, null);
  assert.equal(evaluation.metrics[0].evaluation, null);
  assert.equal(evaluation.guardrail_status, 'inconclusive');
});
