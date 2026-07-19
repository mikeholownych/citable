import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCorpus, evaluateCorpusData } from '../../src/commands/corpus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'acceptance-corpus.json');

test('corpus metrics preserve confusion matrix denominators and incomplete evidence', () => {
  const corpus = JSON.parse(fs.readFileSync(FIXTURE));
  const result = evaluateCorpusData(corpus);
  assert.deepEqual(result.detector_accuracy.overall, {
    true_positive: 1, false_positive: 1, true_negative: 1, false_negative: 1, incomplete: 1,
    evaluated: 4, precision: 0.5, recall: 0.5, false_positive_rate: 0.5,
    discovered_false_negative_rate: 0.5, incomplete_rate: 0.2,
  });
  assert.equal(result.reviewer_metrics.exact_agreement_rate, 0.5);
  assert.equal(result.reviewer_metrics.adjudication_rate, 0.5);
  assert.equal(result.execution_metrics.average_runtime_ms, 2000);
  assert.equal(result.execution_metrics.p95_runtime_ms, 3000);
  assert.equal(result.execution_metrics.reproducibility_rate, 0.5);
  assert.equal(result.remediation_metrics.verification_success_rate, 1);
  assert.equal(result.remediation_metrics.incomplete, 1);
});

test('corpus evaluation writes immutable evidence and rejects unknown property references', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-corpus-'));
  const result = evaluateCorpus(root, { input: FIXTURE });
  assert.ok(fs.existsSync(path.join(result.dir, 'accuracy-metrics.json')));
  assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
  const corpus = JSON.parse(fs.readFileSync(FIXTURE));
  corpus.detector_cases[0].property_id = 'UNKNOWN';
  assert.throws(() => evaluateCorpusData(corpus), /unknown properties/);
});
