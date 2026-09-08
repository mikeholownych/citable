import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGoldenBenchmark } from '../../src/commands/goldenCorpus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS = path.join(ROOT, 'tests', 'fixtures', 'golden-corpus');

test('golden corpus benchmark passes gate with full precision and recall for exercised detectors', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = await runGoldenBenchmark(dir, { corpusDir: CORPUS });
  assert.equal(r.corpus_version, 1);
  assert.equal(r.anonymized, true);
  assert.equal(r.sites_evaluated, 5);
  assert.equal(r.pages_evaluated, 5);
  assert.equal(r.gate.ok, true, `violations: ${JSON.stringify(r.violations)}`);

  const cro021 = r.per_detector.find((d) => d.detector_id === 'CRO-021');
  assert.equal(cro021.true_positives, 1, 'CRO-021 must fire on the checkout page');
  assert.equal(cro021.false_negatives, 0);
  assert.equal(cro021.precision, 1);
  assert.equal(cro021.recall, 1);

  for (const id of ['CRO-007', 'CRO-008', 'CRO-009', 'CRO-013', 'CRO-015', 'CRO-006']) {
    const d = r.per_detector.find((x) => x.detector_id === id);
    assert.ok(d.true_positives >= 1, `${id} must be exercised`);
    assert.equal(d.false_negatives, 0, `${id} must have zero false negatives`);
  }

  assert.ok(r.saliency.length === 5);
  for (const s of r.saliency) {
    assert.match(s.methodology, /modeled heuristic index .* not observed user attention/);
  }
  assert.ok(r.limitations.some((l) => /not real-world accuracy/.test(l)));
});

test('benchmark gate fails when a detector stops detecting (mutation proof)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-mut-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Mutate the corpus: fix the checkout page's missing express payment so
  // CRO-021 no longer fires; the labeled expectation must fail the gate.
  const mutated = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-corpus-'));
  t.after(() => fs.rmSync(mutated, { recursive: true, force: true }));
  fs.cpSync(CORPUS, mutated, { recursive: true });
  const checkout = path.join(mutated, 'checkout', 'checkout.html');
  let html = fs.readFileSync(checkout, 'utf8');
  html = html.replace('<button type="submit">Complete Order</button>', '<button type="submit" class="apple-pay">Apple Pay</button>\n  <button type="submit">Complete Order</button>');
  fs.writeFileSync(checkout, html);

  const r = await runGoldenBenchmark(dir, { corpusDir: mutated });
  assert.equal(r.gate.ok, false, 'mutated corpus must fail the gate');
  assert.ok(r.violations.some((v) => v.detector_id === 'CRO-021' && v.kind === 'false_negative'), 'CRO-021 must be reported as false negative');

  const cro021 = r.per_detector.find((d) => d.detector_id === 'CRO-021');
  assert.equal(cro021.false_negatives, 1);
  assert.equal(cro021.recall, 0);
});

test('benchmark reports unexpected findings as precision failures', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-fp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Remove the labeled autocomplete fix on the agency page: CRO-007 now fires
  // where the corpus expects clean, producing a labeled violation.
  const mutated = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-corpus-'));
  t.after(() => fs.rmSync(mutated, { recursive: true, force: true }));
  fs.cpSync(CORPUS, mutated, { recursive: true });
  const contact = path.join(mutated, 'agency', 'contact.html');
  fs.writeFileSync(contact, fs.readFileSync(contact, 'utf8').replace(' autocomplete="email"', ''));

  const r = await runGoldenBenchmark(dir, { corpusDir: mutated });
  assert.equal(r.gate.ok, false);
  assert.ok(r.violations.some((v) => v.site === 'agency' && v.detector_id === 'CRO-007' && v.kind === 'labeled_clean_violation'));
  assert.ok(r.gate.precision_failures.includes('CRO-007'));
});

test('benchmark refuses a missing manifest (fail closed)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-golden-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(() => runGoldenBenchmark(dir, { corpusDir: dir }), /manifest not found/);
});
