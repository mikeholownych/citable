import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCorpus, evaluateCorpusData, publishCorpus, validateCorpusData, verifyCorpusPublicationReceipt } from '../../src/commands/corpus.js';

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

test('public corpus projection preserves approved artifacts and writes a hash-bound receipt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-corpus-publish-'));
  const output = path.join(root, 'public-corpus.json');
  const result = publishCorpus(root, { input: FIXTURE, output, at: '2026-07-19T10:00:00Z' });
  assert.ok(fs.existsSync(output));
  assert.ok(fs.existsSync(`${output}.receipt.json`));
  assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
  assert.deepEqual(result.receipt.property_ids, ['PROP-A', 'PROP-B']);
  assert.equal(result.receipt.authority, 'owner_authorized_publication_projection');
  assert.equal(verifyCorpusPublicationReceipt(result.receipt, fs.readFileSync(output, 'utf8')).valid, true);
  const tampered = structuredClone(result.receipt);
  tampered.property_ids.push('PROP-UNRECORDED');
  assert.equal(verifyCorpusPublicationReceipt(tampered, fs.readFileSync(output, 'utf8')).valid, false);
  assert.throws(() => publishCorpus(root, { input: FIXTURE, output }), /refuses to overwrite/);
});

test('public corpus fails closed for private scope, expired authority, unsafe refs, and sensitive patterns', () => {
  const base = JSON.parse(fs.readFileSync(FIXTURE));
  const privateCorpus = structuredClone(base);
  privateCorpus.properties[0].publication.level = 'private';
  assert.throws(() => validateCorpusData(privateCorpus, { forPublication: true }), /cannot enter a public corpus/);

  const expired = structuredClone(base);
  expired.properties[0].authorization.expires_at = '2026-07-18T00:00:00Z';
  assert.throws(() => validateCorpusData(expired, { forPublication: true, at: new Date('2026-07-19T10:00:00Z') }), /authorization is expired/);

  const unsafe = structuredClone(base);
  unsafe.properties[0].evidence_package_refs.push('../private/run.json');
  unsafe.properties[0].publication.allowed_artifact_refs.push('../private/run.json');
  assert.throws(() => validateCorpusData(unsafe, { forPublication: true }), /unsafe artifact references/);

  const sensitive = structuredClone(base);
  sensitive.properties[0].authorization.authorized_by = 'customer@example.test';
  assert.throws(() => validateCorpusData(sensitive, { forPublication: true }), /personal-data patterns/);

  const underAuthorized = structuredClone(base);
  underAuthorized.properties[0].authorization.scope = ['publish_artifacts'];
  assert.throws(() => validateCorpusData(underAuthorized, { forPublication: true }), /lacks required scopes/);

  const unapproved = structuredClone(base);
  unapproved.properties[0].publication.allowed_artifact_refs = unapproved.properties[0].publication.allowed_artifact_refs.filter((ref) => ref !== 'RUN-A/RAW');
  assert.throws(() => validateCorpusData(unapproved, { forPublication: true }), /not approved for publication/);

  const futureApproval = structuredClone(base);
  futureApproval.properties[0].publication.approved_at = '2026-07-20T00:00:00Z';
  assert.throws(() => validateCorpusData(futureApproval, { forPublication: true, at: new Date('2026-07-19T10:00:00Z') }), /future-dated/);
});

test('schema v1 corpus is rejected with an explicit migration boundary', () => {
  const corpus = JSON.parse(fs.readFileSync(FIXTURE));
  corpus.schema_version = 1;
  assert.throws(() => evaluateCorpusData(corpus), /schema_version/);
});
