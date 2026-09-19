import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

function validAuditCoverage() {
  return {
    schema_version: 1,
    normalization_version: '1.0.0',
    requested_scope: {
      start_url: 'https://example.test/',
      origin: 'https://example.test',
      max_pages: 100,
      time_budget_seconds: 300,
    },
    discovery: {
      status: 'complete',
      methods: ['start_url', 'sitemap'],
      limitations: [],
    },
    populations: {
      discovered: 4,
      eligible: 3,
      excluded: 1,
      attempted: 3,
      retrieved: 3,
      valid_resource: 3,
      evaluated: 3,
      valid_but_unevaluated: 0,
      failed: 0,
      indeterminate: 0,
      unvisited: 0,
    },
    resources: [
      { resource_id: 'RESOURCE-1', url: 'https://example.test/' },
    ],
    stop_reason: 'frontier_exhausted',
    coverage_status: 'complete',
    reconciliation: { valid: true, errors: [] },
    limitations: [],
  };
}

function validCollectionResult() {
  return {
    schema_version: 1,
    items: [{ provider_id: 'item-1', provider_specific_value: 42 }],
    pagination_state: { pages_requested: 1, pages_retrieved: 1 },
    provider_reported_total: 1,
    retrieved_total: 1,
    coverage_status: 'complete',
    continuation_state: null,
    limitations: [],
    errors: [],
  };
}

function validLegacyRun() {
  return {
    run_id: 'RUN-1',
    command: 'audit',
    tool_version: '1.19.0',
    skill_version: '1.19.0',
    timestamp: '2026-09-19T00:00:00Z',
    target: { kind: 'url', location: 'https://example.test/' },
    status: 'completed',
  };
}

function validLegacyFinding() {
  return {
    finding_id: 'F-semantic-contract',
    detector_id: 'TECH-001',
    run_id: 'RUN-1',
    timestamp: '2026-09-19T00:00:00Z',
    discipline: ['seo'],
    subject: { type: 'url', identifier: 'https://example.test/' },
    observation: { summary: 'Observed condition', evidence: ['EVIDENCE-1'] },
    classification: {
      finding_type: 'deterministic_observation',
      severity: 'medium',
      confidence: 'confirmed',
      deterministic: true,
      impact: { retrieval: 'medium' },
    },
    remediation: { preferred: 'Review the observed condition.' },
    verification: { method: 'Rerun the detector.' },
    status: { state: 'open' },
  };
}

test('audit coverage accepts a complete v1 coverage envelope', () => {
  assert.equal(validateAgainst('audit-coverage.schema.json', validAuditCoverage()).valid, true);
});

test('audit coverage rejects illegal status values and invalid population counts', () => {
  const illegalStatus = validAuditCoverage();
  illegalStatus.coverage_status = 'provider_bounded';
  assert.equal(validateAgainst('audit-coverage.schema.json', illegalStatus).valid, false);

  const invalidCount = validAuditCoverage();
  invalidCount.populations.evaluated = -1;
  assert.equal(validateAgainst('audit-coverage.schema.json', invalidCount).valid, false);

  const fractionalCount = validAuditCoverage();
  fractionalCount.populations.retrieved = 1.5;
  assert.equal(validateAgainst('audit-coverage.schema.json', fractionalCount).valid, false);
});

test('audit coverage enforces requested-scope bounds and discovery states', () => {
  const tooManyPages = validAuditCoverage();
  tooManyPages.requested_scope.max_pages = 10001;
  assert.equal(validateAgainst('audit-coverage.schema.json', tooManyPages).valid, false);

  const illegalDiscoveryState = validAuditCoverage();
  illegalDiscoveryState.discovery.status = 'failed';
  assert.equal(validateAgainst('audit-coverage.schema.json', illegalDiscoveryState).valid, false);
});

test('collection result accepts provider-specific items and provider-bounded coverage', () => {
  const result = validCollectionResult();
  result.provider_reported_total = null;
  result.coverage_status = 'provider_bounded';
  result.continuation_state = { cursor: 'next-page-token' };
  assert.equal(validateAgainst('collection-result.schema.json', result).valid, true);
});

test('collection result rejects invalid totals, statuses, and unknown envelope fields', () => {
  const negativeTotal = validCollectionResult();
  negativeTotal.retrieved_total = -1;
  assert.equal(validateAgainst('collection-result.schema.json', negativeTotal).valid, false);

  const illegalStatus = validCollectionResult();
  illegalStatus.coverage_status = 'not_applicable';
  assert.equal(validateAgainst('collection-result.schema.json', illegalStatus).valid, false);

  const unknownEnvelopeField = { ...validCollectionResult(), completeness: 'assumed' };
  assert.equal(validateAgainst('collection-result.schema.json', unknownEnvelopeField).valid, false);
});

test('version-2 runs require independent execution and coverage statuses', () => {
  const v2 = {
    ...validLegacyRun(),
    schema_version: 2,
    execution_status: 'completed_with_warnings',
    coverage_status: 'truncated',
  };
  assert.equal(validateAgainst('run.schema.json', v2).valid, true);

  const missingExecution = { ...v2 };
  delete missingExecution.execution_status;
  assert.equal(validateAgainst('run.schema.json', missingExecution).valid, false);

  const missingCoverage = { ...v2 };
  delete missingCoverage.coverage_status;
  assert.equal(validateAgainst('run.schema.json', missingCoverage).valid, false);

  const mixedStatusVocabulary = { ...v2, execution_status: 'indeterminate' };
  assert.equal(validateAgainst('run.schema.json', mixedStatusVocabulary).valid, false);
});

test('legacy run manifests remain valid without semantic-completeness fields', () => {
  assert.equal(validateAgainst('run.schema.json', validLegacyRun()).valid, true);
  assert.equal(validateAgainst('run.schema.json', { ...validLegacyRun(), schema_version: 1 }).valid, true);
});

test('version-2 findings require a bounded evidence scope', () => {
  const v2 = {
    ...validLegacyFinding(),
    schema_version: 2,
    evidence_scope: {
      requirement: 'Every eligible page exposes one canonical URL.',
      satisfaction: 'qualified',
      resource_ids: ['RESOURCE-1'],
      coverage_ref: 'coverage.json',
    },
  };
  assert.equal(validateAgainst('finding.schema.json', v2).valid, true);

  const missingEvidenceScope = { ...v2 };
  delete missingEvidenceScope.evidence_scope;
  assert.equal(validateAgainst('finding.schema.json', missingEvidenceScope).valid, false);

  const mixedStatusVocabulary = {
    ...v2,
    evidence_scope: { ...v2.evidence_scope, satisfaction: 'complete' },
  };
  assert.equal(validateAgainst('finding.schema.json', mixedStatusVocabulary).valid, false);

  const unknownScopeField = {
    ...v2,
    evidence_scope: { ...v2.evidence_scope, inferred_complete: true },
  };
  assert.equal(validateAgainst('finding.schema.json', unknownScopeField).valid, false);

  const unknownTopLevelField = { ...v2, inferred_complete: true };
  assert.equal(validateAgainst('finding.schema.json', unknownTopLevelField).valid, false);
});

test('legacy findings remain valid without semantic-completeness fields', () => {
  assert.equal(validateAgainst('finding.schema.json', validLegacyFinding()).valid, true);
  assert.equal(validateAgainst('finding.schema.json', { ...validLegacyFinding(), schema_version: 1 }).valid, true);
});
