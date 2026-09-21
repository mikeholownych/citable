import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun } from '../../src/evidence/run.js';
import { verifyRunPackage } from '../../src/shared/runPackageVerifier.js';
import {
  createExternalObservation,
  verifyExternalObservation,
  createResearchDataset,
  verifyResearchDataset,
  createDerivation,
  createEvidenceClaim,
  verifyClaim,
  compareExternalObservations,
  compareResearchDatasets,
} from '../../src/evidence/external.js';

const source = { provider: 'fixture-provider', method: 'owner_import', authority: 'external_provider' };
const collector = { id: 'fixture-collector', version: '1.0.0' };
const parser = { id: 'fixture-parser', version: '1.0.0' };
const configuration = { id: 'fixture-config', version: '1.0.0' };

function observation(id, feature, overrides = {}) {
  return createExternalObservation({
    observation_id: id,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'product', id: id.replace('OBS-', 'P-') },
    source,
    collector,
    parser,
    configuration,
    observed_at: '2026-09-20T10:00:00Z',
    retrieved_at: '2026-09-20T10:01:00Z',
    population: { declared: { id: 'POP-1', size: 2 }, observed: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    observation_status: 'observed',
    retrieval_status: 'retrieved',
    data: { feature_x: feature },
    limitations: [],
    ...overrides,
  });
}

function dataset(overrides = {}) {
  return createResearchDataset({
    dataset_id: 'DS-1',
    dataset_version: 1,
    declared_purpose: 'Evaluate feature X in declared products',
    declared_population: { type: 'products', id: 'POP-1', size: 2 },
    population_size: 2,
    inclusion_criteria: ['declared products'],
    exclusion_criteria: [],
    collection: { started_at: '2026-09-20T10:00:00Z', ended_at: '2026-09-20T10:02:00Z' },
    source_references: ['SRC-1'],
    observation_references: ['OBS-1', 'OBS-2'],
    normalization: { method: 'identity', version: '1.0.0' },
    derivation_references: [],
    coverage: { declared: 2, retrieved: 2, evaluated: 2, unavailable: 0, failed: 0 },
    coverage_status: 'complete_for_declared_population',
    limitations: [],
    ...overrides,
  });
}

function countDerivation(overrides = {}) {
  return createDerivation({
    derivation_id: 'DER-1',
    derivation_version: 1,
    operation: 'count_predicate',
    input_observation_references: ['OBS-1', 'OBS-2'],
    predicate: { path: 'data.feature_x', operator: 'equals', value: true },
    result: { count: 1, total: 2 },
    implementation: { id: 'count-predicate', version: '1.0.0' },
    ...overrides,
  });
}

test('ER-0 creates typed observations with provenance, population, context, and integrity', () => {
  const item = observation('OBS-1', true, { context: { supplied: { commercial_relevance: 'high' } } });
  assert.equal(item.observation_type, 'EXTERNAL_OBSERVATION');
  assert.equal(item.source.authority, 'external_provider');
  assert.equal(item.context.supplied.commercial_relevance, 'high');
  assert.match(item.evidence_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyExternalObservation(item), { valid: true, failures: [] });
});

test('ER-0 distinguishes page, external, and derived observation types', () => {
  for (const kind of ['PAGE_OBSERVATION', 'EXTERNAL_OBSERVATION', 'DERIVED_OBSERVATION']) {
    assert.equal(createExternalObservation({ ...observation(`OBS-${kind}`, true), observation_type: kind }).observation_type, kind);
  }
});

test('ER-7 creates immutable, versioned datasets and rejects same-version mutation', () => {
  const first = dataset();
  assert.deepEqual(verifyResearchDataset(first), { valid: true, failures: [] });
  const changed = { ...first, population_size: 99 };
  assert.throws(() => verifyResearchDataset(changed, { previous: first }), /immutable|mutation|hash/i);
  const next = createResearchDataset({ ...first, dataset_version: 2, population_size: 99 });
  assert.equal(next.dataset_version, 2);
});

test('ER-7 preserves partial and truncated coverage instead of complete claims', () => {
  for (const status of ['partial', 'truncated', 'indeterminate', 'error']) {
    const item = dataset({ coverage_status: status, coverage: { declared: 2, retrieved: 1, evaluated: 1, unavailable: 1, failed: 0 } });
    assert.equal(item.coverage_status, status);
  }
});

test('ER-9 does not fully support claims from partial or truncated datasets', () => {
  const observations = [observation('OBS-1', true), observation('OBS-2', false)];
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-COVERAGE', claim_version: 1, proposition: '1 of the observed products has feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' }, evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1'], derivation_references: ['DER-1'], assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  for (const coverage_status of ['partial', 'truncated']) {
    const result = verifyClaim(claim, { observations, datasets: [dataset({ coverage_status, coverage: { declared: 2, retrieved: 1, evaluated: 1, unavailable: 1, failed: 0 } })], derivations: [countDerivation()] });
    assert.equal(result.scope_support, 'PARTIALLY_SUPPORTED');
    assert.equal(result.overall, 'PARTIALLY_SUPPORTED');
  }
});

test('ER-8 preserves direct and derived claim lineage', () => {
  const direct = createEvidenceClaim({
    claim_id: 'CLAIM-1', claim_version: 1, proposition: 'Product P-1 has feature X.',
    declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  assert.deepEqual(direct.evidence_references, ['OBS-1']);
  const derived = createEvidenceClaim({
    claim_id: 'CLAIM-2', claim_version: 1, proposition: '1 of 2 products has feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1'], derivation_references: ['DER-1'],
    assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  assert.deepEqual(derived.derivation_references, ['DER-1']);
});

test('ER-9 verifies a bounded direct claim as SUPPORTED', () => {
  const one = observation('OBS-1', true);
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-DIRECT', claim_version: 1, proposition: 'P-1 has feature X.',
    declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  const result = verifyClaim(claim, { observations: [one] });
  assert.equal(result.overall, 'SUPPORTED');
  assert.equal(result.proposition_support, 'SUPPORTED');
  assert.equal(result.scope_support, 'SUPPORTED');
});

test('ER-9 verifies a derived bounded claim with atomic lineage', () => {
  const observations = [observation('OBS-1', true), observation('OBS-2', false)];
  const d = countDerivation();
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-COUNT', claim_version: 1, proposition: '1 of 2 observed products has feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' },
    evidence_references: observations.map((x) => x.observation_id), observation_references: observations.map((x) => x.observation_id), dataset_references: ['DS-1'], derivation_references: ['DER-1'],
    assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  const result = verifyClaim(claim, { observations, datasets: [dataset()], derivations: [d] });
  assert.equal(result.overall, 'SUPPORTED');
  assert.deepEqual(result.lineage.observation_references, ['OBS-1', 'OBS-2']);
});

test('ER-9 refuses arithmetic-correct overgeneralization', () => {
  const observations = [observation('OBS-1', true), observation('OBS-2', false)];
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-GENERAL', claim_version: 1, proposition: '25% of all products have feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'universal' },
    evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1'], derivation_references: ['DER-1'],
    assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  const result = verifyClaim(claim, { observations, datasets: [dataset()], derivations: [countDerivation()] });
  assert.equal(result.proposition_support, 'SUPPORTED');
  assert.equal(result.scope_support, 'UNSUPPORTED');
  assert.notEqual(result.overall, 'SUPPORTED');
});

test('ER-9 distinguishes NOT_OBSERVED, contradiction, and bounded absence', () => {
  const missingClaim = createEvidenceClaim({
    claim_id: 'CLAIM-MISSING', claim_version: 1, proposition: 'P-3 has feature X.',
    declared_scope: { type: 'observation', observation_reference: 'OBS-3', generalization: 'bounded' }, evidence_references: ['OBS-3'], observation_references: ['OBS-3'], dataset_references: [], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  assert.equal(verifyClaim(missingClaim, { observations: [] }).overall, 'NOT_OBSERVED');
  const contradiction = createEvidenceClaim({ ...missingClaim, claim_id: 'CLAIM-CONTRA', evidence_references: ['OBS-1'], observation_references: ['OBS-1'], declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'bounded' } });
  assert.equal(verifyClaim(contradiction, { observations: [observation('OBS-1', false)] }).overall, 'CONTRADICTED');
  const absent = createEvidenceClaim({
    claim_id: 'CLAIM-ABSENT', claim_version: 1, proposition: 'None of these products has feature X.', declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1'], derivation_references: [], assertion: { type: 'all', path: 'data.feature_x', operator: 'equals', value: false }, limitations: [],
  });
  assert.equal(verifyClaim(absent, { observations: [observation('OBS-1', false), observation('OBS-2', false)], datasets: [dataset()] }).overall, 'SUPPORTED');
});

test('ER-9 refuses scope references that do not match the evidence population', () => {
  const mismatch = createEvidenceClaim({
    claim_id: 'CLAIM-SCOPE-MISMATCH', claim_version: 1, proposition: 'P-1 has feature X.',
    declared_scope: { type: 'observation', observation_reference: 'OBS-2', generalization: 'bounded' },
    evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  const result = verifyClaim(mismatch, { observations: [observation('OBS-1', true)] });
  assert.equal(result.overall, 'INDETERMINATE');
  assert.ok(result.reasons.some((item) => item.code === 'scope_reference_mismatch'));

  const incompletePopulation = createEvidenceClaim({
    claim_id: 'CLAIM-DATASET-SUBSET', claim_version: 1, proposition: 'The dataset has feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: ['DS-1'], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  const subset = verifyClaim(incompletePopulation, { observations: [observation('OBS-1', true)], datasets: [dataset()] });
  assert.equal(subset.overall, 'PARTIALLY_SUPPORTED');
  assert.ok(subset.reasons.some((item) => item.code === 'dataset_members_missing'));
});

test('ER-9 returns PARTIALLY_SUPPORTED with machine-readable reasons', () => {
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-PARTIAL', claim_version: 1, proposition: 'P-1 has X and P-2 has Y.', declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'bounded' },
    evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [], assertion: { type: 'compound', assertions: [{ type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, { type: 'predicate', path: 'data.feature_y', operator: 'equals', value: true }] }, limitations: [],
  });
  const result = verifyClaim(claim, { observations: [observation('OBS-1', true)] });
  assert.equal(result.overall, 'PARTIALLY_SUPPORTED');
  assert.ok(result.reasons.some((reason) => reason.code === 'compound_component_unsupported'));
});

test('ER-9 fails closed on corrupt evidence and preserves provider authority boundary', () => {
  const item = observation('OBS-1', true);
  const corrupt = { ...item, data: { feature_x: false } };
  assert.equal(verifyClaim(createEvidenceClaim({
    claim_id: 'CLAIM-TAMPER', claim_version: 1, proposition: 'P-1 has X.', declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'bounded' }, evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [], assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  }), { observations: [corrupt] }).overall, 'INDETERMINATE');
  const universal = createEvidenceClaim({
    claim_id: 'CLAIM-PROVIDER', claim_version: 1, proposition: 'Feature X is universally true.', declared_scope: { type: 'observation', observation_reference: 'OBS-1', generalization: 'universal' }, evidence_references: ['OBS-1'], observation_references: ['OBS-1'], dataset_references: [], derivation_references: [], assertion: { type: 'predicate', path: 'data.feature_x', operator: 'equals', value: true }, limitations: [],
  });
  const result = verifyClaim(universal, { observations: [item] });
  assert.equal(result.proposition_support, 'SUPPORTED');
  assert.equal(result.scope_support, 'UNSUPPORTED');
});

test('ER-9 fails closed when a derivation is tampered', () => {
  const observations = [observation('OBS-1', true), observation('OBS-2', false)];
  const claim = createEvidenceClaim({
    claim_id: 'CLAIM-DERIVATION-TAMPER', claim_version: 1, proposition: '1 of 2 products has X.', declared_scope: { type: 'dataset', dataset_reference: 'DS-1', generalization: 'bounded' }, evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1'], derivation_references: ['DER-1'], assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  const tampered = { ...countDerivation(), result: { count: 2, total: 2 } };
  const result = verifyClaim(claim, { observations, datasets: [dataset()], derivations: [tampered] });
  assert.equal(result.overall, 'INDETERMINATE');
  assert.ok(result.reasons.some((item) => item.code === 'derivation_unavailable'));
});

test('ER-11 compares compatible, incompatible, and partially specified observations', () => {
  const left = observation('OBS-1', true);
  const right = observation('OBS-2', false, { observation_id: 'OBS-2', subject: left.subject });
  assert.equal(compareExternalObservations(left, right).status, 'COMPARABLE');
  assert.equal(compareExternalObservations(left, observation('OBS-2', false, { source: { ...source, provider: 'other' }, subject: left.subject })).status, 'NOT_COMPARABLE');
  assert.equal(compareExternalObservations(left, observation('OBS-2', false, { configuration: null, subject: left.subject })).status, 'PARTIALLY_COMPARABLE');
});

test('ER-11 compares dataset versions without rewriting historical identity', () => {
  const a = dataset({ dataset_version: 1 });
  const b = dataset({ dataset_version: 2 });
  assert.equal(compareResearchDatasets(a, b).status, 'NOT_COMPARABLE');
  assert.notEqual(a.dataset_hash, b.dataset_hash);
});

test('ER-7/ER-8 bind claims to an exact dataset version', () => {
  const observations = [observation('OBS-1', true), observation('OBS-2', false)];
  const v1 = dataset({ dataset_version: 1 });
  const v2 = dataset({ dataset_version: 2, population_size: 3 });
  const versionedClaim = createEvidenceClaim({
    claim_id: 'CLAIM-VERSIONED', claim_version: 1, proposition: '1 of 2 observed products has feature X.',
    declared_scope: { type: 'dataset', dataset_reference: 'DS-1@1', generalization: 'bounded' },
    evidence_references: ['OBS-1', 'OBS-2'], observation_references: ['OBS-1', 'OBS-2'], dataset_references: ['DS-1@1'], derivation_references: ['DER-1'],
    assertion: { type: 'count', expected: 1 }, limitations: [],
  });
  assert.equal(verifyClaim(versionedClaim, { observations, datasets: [v1, v2], derivations: [countDerivation()] }).overall, 'SUPPORTED');

  const ambiguousClaim = createEvidenceClaim({ ...versionedClaim, claim_id: 'CLAIM-AMBIGUOUS', dataset_references: ['DS-1'], declared_scope: { ...versionedClaim.declared_scope, dataset_reference: 'DS-1' } });
  const ambiguous = verifyClaim(ambiguousClaim, { observations, datasets: [v1, v2], derivations: [countDerivation()] });
  assert.equal(ambiguous.overall, 'INDETERMINATE');
  assert.ok(ambiguous.reasons.some((item) => item.code === 'dataset_reference_ambiguous_or_missing'));
});

test('ER-0/7/8 evidence artifacts use the sealed package integrity boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-external-evidence-'));
  fs.mkdirSync(path.join(root, '.citable', 'runs'), { recursive: true });
  const run = createRun(root, { command: 'external evidence fixture', target: { kind: 'fixture', location: 'local' } });
  const item = observation('OBS-PACKAGE', true);
  const ds = dataset({ observation_references: ['OBS-PACKAGE'] });
  run.writeArtifact('external/observation.json', item);
  run.writeArtifact('external/dataset.json', ds);
  run.finalize('completed');
  const verified = verifyRunPackage(run.dir, { requireCompleted: true, requireFindings: false });
  assert.match(verified.artifactHashes['external/observation.json'], /^[a-f0-9]{64}$/);
  assert.ok(verified.artifactHashes['external/dataset.json']);
  fs.appendFileSync(path.join(run.dir, 'external', 'dataset.json'), '\n');
  assert.throws(() => verifyRunPackage(run.dir, { requireCompleted: true, requireFindings: false }), /checksum|tamper/i);
});
