import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareSnapshots } from '../../src/commands/compareSnapshots.js';
import { init } from '../../src/commands/init.js';
import { writeJson } from '../../src/shared/io.js';
import { DETERMINATION_STATUS, TRANSITION_TYPES } from '../../src/conditions/constants.js';

const ORIGIN = 'https://transition-test.test';

function makeCoverage({ url = `${ORIGIN}/page1`, state = 'evaluated' } = {}) {
  return {
    schema_version: 1,
    normalization_version: 'url-identity-v1',
    requested_scope: { start_url: `${ORIGIN}/`, origin: ORIGIN, max_pages: 10, time_budget_seconds: 60 },
    discovery: { status: 'complete', methods: ['links'], limitations: [] },
    populations: {
      discovered: 1, eligible: 1, excluded: 0, attempted: 1, retrieved: 1,
      valid_resource: 1, evaluated: 1, valid_but_unevaluated: 0,
      failed: 0, indeterminate: 0, unvisited: 0,
    },
    resources: [{ normalized_url: url, original_urls: [url], state, evaluation: {} }],
    stop_reason: 'frontier_exhausted',
    coverage_status: 'complete',
    reconciliation: { valid: true, errors: [] },
    limitations: [],
  };
}

function makeFinding(detectorId, url, summary = 'Sample finding') {
  return {
    finding_id: `F-${detectorId}-${Buffer.from(url).toString('hex').slice(0, 6)}`,
    detector_id: detectorId,
    detector_name: `Detector ${detectorId}`,
    run_id: 'test',
    timestamp: '2026-09-25T12:00:00Z',
    discipline: ['seo'],
    subject: { type: 'page', identifier: url, url },
    observation: { summary, evidence: ['test'] },
    classification: { finding_type: 'deterministic_observation', severity: 'high', confidence: 'high', deterministic: true, impact: { citation: 'high' } },
    remediation: { preferred: 'Fix it', review_required: false },
    verification: { method: 'rerun' },
    status: { state: 'open' },
  };
}

function makeDetermination({ conditionId, url, status, findingId = null }) {
  return {
    schema_version: 1,
    determination_id: `DET-${conditionId}-${status}`,
    condition_id: conditionId,
    detector_id: conditionId,
    detector_name: `Detector ${conditionId}`,
    run_id: 'test',
    timestamp: '2026-09-25T12:00:00Z',
    subject: { type: 'page', identifier: url, url },
    status,
    finding_id: findingId,
    discipline: ['seo'],
    severity: 'high',
    collector_failure: null,
    applicable: status !== DETERMINATION_STATUS.NOT_APPLICABLE,
  };
}

function createRun(root, runId, { findings = [], determinations = [], coverage = null, timestamp = '2026-09-25T12:00:00Z' }) {
  const dir = path.join(root, '.citable', 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'findings.json'), findings);
  if (determinations) writeJson(path.join(dir, 'determinations.json'), determinations);
  if (coverage) writeJson(path.join(dir, 'coverage.json'), coverage);
  writeJson(path.join(dir, 'manifest.json'), {
    run_id: runId,
    timestamp,
    tool_version: '1.23.0',
    skill_version: '1.23.0',
    command: 'audit',
    argv: [],
    target: { kind: 'url', location: ORIGIN },
    configuration_hash: 'hash-abc',
    input_hashes: {},
    output_hashes: {},
    detectors_run: ['TECH-001', 'TECH-002', 'SCHEMA-006'],
    status: 'completed',
    execution_status: 'completed',
    schema_version: 2,
    coverage_status: 'complete',
    determination_status: 'supported',
  });
}

function setupWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-transitions-'));
  init(root);
  return root;
}

test('B-012: REGRESSION — condition passed in baseline and now fails', () => {
  const root = setupWorkspace();
  const pageUrl = `${ORIGIN}/about`;

  // Run A: TECH-001 evaluated and passed (no finding)
  createRun(root, 'run-1', {
    findings: [],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.PASS }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  // Run B: TECH-001 evaluated and failed (finding generated)
  const f = makeFinding('TECH-001', pageUrl);
  createRun(root, 'run-2', {
    findings: [f],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  assert.equal(diff.regressions.length, 1);
  assert.equal(diff.new_failures.length, 0);
  assert.equal(diff.regressions[0].comparison_state, 'regression');
  assert.equal(diff.summary.regressions, 1);
  assert.equal(diff.summary.new_failures, 0);

  const t = diff.transitions.find((tr) => tr.condition_id === 'TECH-001');
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.REGRESSION);
  assert.equal(t.from_status, DETERMINATION_STATUS.PASS);
  assert.equal(t.to_status, DETERMINATION_STATUS.FAIL);
});

test('B-012: NEW_FAILURE — new finding on an un-evaluated subject is NEVER labeled a regression', () => {
  const root = setupWorkspace();
  const oldPage = `${ORIGIN}/old-page`;
  const newPage = `${ORIGIN}/brand-new-page`;

  // Run A: only oldPage was evaluated
  createRun(root, 'run-1', {
    findings: [],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: oldPage, status: DETERMINATION_STATUS.PASS }),
    ],
    coverage: makeCoverage({ url: oldPage }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  // Run B: newPage discovered and fails TECH-001
  const f = makeFinding('TECH-001', newPage);
  createRun(root, 'run-2', {
    findings: [f],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: oldPage, status: DETERMINATION_STATUS.PASS }),
      makeDetermination({ conditionId: 'TECH-001', url: newPage, status: DETERMINATION_STATUS.FAIL, findingId: f.finding_id }),
    ],
    coverage: makeCoverage({ url: newPage }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  // INVARIANT: Never labeled a regression!
  assert.equal(diff.regressions.length, 0, 'new finding on un-evaluated page must NOT be a regression');
  assert.equal(diff.new_failures.length, 1, 'must be classified as new_failure');
  assert.equal(diff.new_failures[0].comparison_state, 'new_failure');
  assert.equal(diff.summary.regressions, 0);
  assert.equal(diff.summary.new_failures, 1);

  const t = diff.transitions.find((tr) => tr.condition_id === 'TECH-001' && tr.subject.identifier === newPage);
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.NEW_FAILURE);
});

test('B-012: RESOLVED — condition failed in baseline and now passes', () => {
  const root = setupWorkspace();
  const pageUrl = `${ORIGIN}/contact`;

  // Run A: TECH-001 failed
  const f = makeFinding('TECH-001', pageUrl);
  createRun(root, 'run-1', {
    findings: [f],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl, state: 'evaluated' }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  // Run B: TECH-001 fixed and passed
  createRun(root, 'run-2', {
    findings: [],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.PASS }),
    ],
    coverage: makeCoverage({ url: pageUrl, state: 'evaluated' }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  assert.equal(diff.resolved.length, 1);
  assert.equal(diff.summary.resolved_findings, 1);

  const t = diff.transitions.find((tr) => tr.condition_id === 'TECH-001');
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.RESOLVED);
  assert.equal(t.from_status, DETERMINATION_STATUS.FAIL);
  assert.equal(t.to_status, DETERMINATION_STATUS.PASS);
});

test('B-012: UNCHANGED_FAILURE — condition continues to fail across both runs', () => {
  const root = setupWorkspace();
  const pageUrl = `${ORIGIN}/home`;

  const f1 = makeFinding('TECH-001', pageUrl, 'Still failing');
  createRun(root, 'run-1', {
    findings: [f1],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f1.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  const f2 = makeFinding('TECH-001', pageUrl, 'Still failing');
  createRun(root, 'run-2', {
    findings: [f2],
    determinations: [
      makeDetermination({ conditionId: 'TECH-001', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f2.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  assert.equal(diff.unchanged_failures.length, 1);
  assert.equal(diff.summary.unchanged_failures, 1);
  assert.equal(diff.regressions.length, 0);
  assert.equal(diff.new_failures.length, 0);

  const t = diff.transitions.find((tr) => tr.condition_id === 'TECH-001');
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.UNCHANGED_FAILURE);
  assert.equal(t.from_status, DETERMINATION_STATUS.FAIL);
  assert.equal(t.to_status, DETERMINATION_STATUS.FAIL);
});

test('B-012: NEWLY_APPLICABLE — condition was NOT_APPLICABLE and is now evaluated and failing', () => {
  const root = setupWorkspace();
  const pageUrl = `${ORIGIN}/product-1`;

  // Run A: SCHEMA-006 (ecommerce offer) was NOT_APPLICABLE (content-only site)
  createRun(root, 'run-1', {
    findings: [],
    determinations: [
      makeDetermination({ conditionId: 'SCHEMA-006', url: pageUrl, status: DETERMINATION_STATUS.NOT_APPLICABLE }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  // Run B: Store activated, SCHEMA-006 is now applicable and fails
  const f = makeFinding('SCHEMA-006', pageUrl, 'Missing offer price');
  createRun(root, 'run-2', {
    findings: [f],
    determinations: [
      makeDetermination({ conditionId: 'SCHEMA-006', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  assert.equal(diff.newly_applicable.length, 1);
  assert.equal(diff.regressions.length, 0, 'newly applicable failure must NOT be labeled regression');
  assert.equal(diff.new_failures.length, 0);
  assert.equal(diff.summary.newly_applicable, 1);

  const t = diff.transitions.find((tr) => tr.condition_id === 'SCHEMA-006');
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.NEWLY_APPLICABLE);
  assert.equal(t.from_status, DETERMINATION_STATUS.NOT_APPLICABLE);
  assert.equal(t.to_status, DETERMINATION_STATUS.FAIL);
});

test('B-012: NO_LONGER_APPLICABLE — condition was failing in baseline and is now NOT_APPLICABLE', () => {
  const root = setupWorkspace();
  const pageUrl = `${ORIGIN}/legacy-shop`;

  // Run A: SCHEMA-006 failed
  const f = makeFinding('SCHEMA-006', pageUrl, 'Missing offer price');
  createRun(root, 'run-1', {
    findings: [f],
    determinations: [
      makeDetermination({ conditionId: 'SCHEMA-006', url: pageUrl, status: DETERMINATION_STATUS.FAIL, findingId: f.finding_id }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:00:00Z',
  });

  // Run B: Shop decommissioned, now content-only; condition is NOT_APPLICABLE
  createRun(root, 'run-2', {
    findings: [],
    determinations: [
      makeDetermination({ conditionId: 'SCHEMA-006', url: pageUrl, status: DETERMINATION_STATUS.NOT_APPLICABLE }),
    ],
    coverage: makeCoverage({ url: pageUrl }),
    timestamp: '2026-09-25T12:01:00Z',
  });

  const diff = compareSnapshots(root, { runA: 'run-1', runB: 'run-2' });

  assert.equal(diff.no_longer_applicable.length, 1);
  assert.equal(diff.summary.no_longer_applicable, 1);

  const t = diff.transitions.find((tr) => tr.condition_id === 'SCHEMA-006');
  assert.ok(t);
  assert.equal(t.transition_type, TRANSITION_TYPES.NO_LONGER_APPLICABLE);
  assert.equal(t.from_status, DETERMINATION_STATUS.FAIL);
  assert.equal(t.to_status, DETERMINATION_STATUS.NOT_APPLICABLE);
});
