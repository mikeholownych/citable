import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIREMENTS,
  evaluateRequirement,
  propagateDetermination,
} from '../../src/evidence/determination.js';
import { defineDetector, runDetectors } from '../../src/detectors/framework.js';

const completeCoverage = {
  coverage_status: 'complete',
  populations: {
    discovered: 2, eligible: 2, excluded: 0, attempted: 2, retrieved: 2,
    valid_resource: 2, evaluated: 2, valid_but_unevaluated: 0,
    failed: 0, indeterminate: 0, unvisited: 0,
  },
  resources: [
    { resource_id: 'RESOURCE-17', url: 'https://example.test/page-17', state: 'evaluated' },
    { resource_id: 'RESOURCE-18', url: 'https://example.test/page-18', state: 'evaluated' },
  ],
};

const incompleteCoverage = {
  ...completeCoverage,
  coverage_status: 'truncated',
  populations: { ...completeCoverage.populations, discovered: 3, eligible: 3, unvisited: 1 },
};

test('local positive evidence survives incomplete corpus coverage', () => {
  const result = evaluateRequirement(
    REQUIREMENTS.PAGE_RESOURCE,
    incompleteCoverage,
    { type: 'page', identifier: 'https://example.test/page-17', url: 'https://example.test/page-17' },
  );
  assert.equal(result.status, 'supported');
  assert.equal(result.resource_id, 'RESOURCE-17');
});

test('site-wide absence is indeterminate without exhaustive applicable coverage', () => {
  const result = evaluateRequirement(REQUIREMENTS.EXHAUSTIVE_SCOPE, incompleteCoverage);
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reason, 'coverage_incomplete');
});

test('sample determination is qualified with its denominator', () => {
  const result = evaluateRequirement(REQUIREMENTS.DECLARED_SAMPLE, {
    coverage_status: 'complete',
    sample: { numerator: 9, denominator: 10 },
  });
  assert.deepEqual(result, {
    status: 'qualified', population: 'evaluated_subset', numerator: 9, denominator: 10,
  });
});

test('exhaustive scope is supported only for complete, fully evaluated coverage', () => {
  assert.equal(evaluateRequirement(REQUIREMENTS.EXHAUSTIVE_SCOPE, completeCoverage).status, 'supported');
  assert.equal(evaluateRequirement(REQUIREMENTS.EXHAUSTIVE_SCOPE, {
    ...completeCoverage,
    coverage_status: 'indeterminate',
    populations: { ...completeCoverage.populations, failed: 1, retrieved: 1, valid_resource: 1 },
  }).status, 'indeterminate');
});

test('empty and all-indeterminate coverage never becomes supported', () => {
  const coverage = {
    coverage_status: 'indeterminate',
    populations: {
      discovered: 0, eligible: 0, excluded: 0, attempted: 0, retrieved: 0,
      valid_resource: 0, evaluated: 0, valid_but_unevaluated: 0,
      failed: 0, indeterminate: 0, unvisited: 0,
    },
    resources: [],
  };
  assert.equal(evaluateRequirement(REQUIREMENTS.EXHAUSTIVE_SCOPE, coverage).status, 'indeterminate');
  assert.equal(evaluateRequirement(REQUIREMENTS.PAGE_RESOURCE, coverage, { url: 'https://example.test/' }).status, 'indeterminate');
});

test('determination propagation preserves positive support but gates negative claims', () => {
  assert.equal(propagateDetermination({ status: 'supported', polarity: 'positive' }, incompleteCoverage).status, 'supported');
  assert.equal(propagateDetermination({ status: 'supported', polarity: 'negative', requirement: REQUIREMENTS.EXHAUSTIVE_SCOPE }, incompleteCoverage).status, 'indeterminate');
  assert.equal(propagateDetermination({ status: 'indeterminate', polarity: 'positive' }, completeCoverage).status, 'indeterminate');
});

test('detector findings bind to their requirement and never infer corpus scope from page arrays', () => {
  const detector = defineDetector({
    id: 'TECH-TEST-001', name: 'Test page condition', namespace: 'TECH',
    description: 'test', discipline: ['seo'], severity: 'low', deterministic: true,
    requires: ['site'], remediation: 'test remediation', verification: 'test verification',
    coverage_requirement: REQUIREMENTS.PAGE_RESOURCE,
    check: () => [{
      subject: { type: 'page', identifier: 'https://example.test/page-17', url: 'https://example.test/page-17' },
      summary: 'Observed page condition', evidence: ['page-17'],
    }],
  });
  const result = runDetectors([detector], {
    site: {}, coverage: incompleteCoverage, runId: 'RUN-1', timestamp: '2026-09-19T00:00:00Z',
  });
  assert.equal(result.findings[0].schema_version, 2);
  assert.deepEqual(result.findings[0].evidence_scope, {
    requirement: REQUIREMENTS.PAGE_RESOURCE,
    satisfaction: 'supported',
    resource_ids: ['RESOURCE-17'],
    coverage_ref: 'coverage.json',
  });
});
