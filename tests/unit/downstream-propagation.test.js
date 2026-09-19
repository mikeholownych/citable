import test from 'node:test';
import assert from 'node:assert/strict';
import { downstreamEnvelope, coverageDenominator, scoreFromCoverage, downstreamStatus, completeLocalCoverage } from '../../src/evidence/downstream.js';
import { formatPrReviewComment } from '../../src/commands/ciWorkflow.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { actionPlan } from '../../src/commands/actionPlan.js';
import { exportExecutiveReport } from '../../src/reporting/executiveExport.js';
import { writeJson } from '../../src/shared/io.js';

const truncated = {
  ...completeLocalCoverage([{ url: 'https://example.test/' }]),
  coverage_status: 'truncated',
  discovery: { status: 'truncated', methods: ['links'], limitations: ['page budget'] },
  stop_reason: 'page_budget_exhausted',
  populations: {
    discovered: 10, eligible: 10, excluded: 0, attempted: 9, retrieved: 8,
    valid_resource: 8, evaluated: 8, valid_but_unevaluated: 0, failed: 1,
    indeterminate: 0, unvisited: 1,
  },
};

test('downstream envelope qualifies incomplete evidence and preserves denominator', () => {
  const envelope = downstreamEnvelope(truncated);
  assert.equal(envelope.coverage_status, 'truncated');
  assert.equal(envelope.determination_status, 'qualified');
  assert.equal(envelope.evidence_scope.population, 'evaluated_subset');
  assert.equal(envelope.evidence_scope.evaluated, 8);
  assert.match(envelope.limitations.join(' '), /8.*10|failed|unvisited/i);
});

test('empty and indeterminate populations never become a score or maximal assurance', () => {
  assert.equal(coverageDenominator({ coverage_status: 'indeterminate', populations: { evaluated: 0 } }), 0);
  assert.equal(scoreFromCoverage(0, { coverage_status: 'indeterminate', populations: { evaluated: 0 } }), null);
  assert.equal(downstreamEnvelope({ coverage_status: 'indeterminate', populations: { evaluated: 0 } }).determination_status, 'indeterminate');
});

test('supported requires a validated complete contract with no omitted populations', () => {
  const complete = completeLocalCoverage([{ url: 'https://example.test/' }]);
  assert.equal(downstreamStatus(complete), 'supported');
  assert.equal(downstreamStatus({ ...complete, populations: { ...complete.populations, failed: 1 } }), 'indeterminate');
  assert.equal(downstreamStatus({ ...complete, reconciliation: { valid: false, errors: ['tampered'] } }), 'indeterminate');
});

test('malformed or unreconciled truncated coverage is indeterminate, not qualified', () => {
  assert.equal(downstreamStatus({ ...truncated, schema_version: 99 }), 'indeterminate');
  const validTruncated = {
    ...completeLocalCoverage([{ url: 'https://example.test/' }]),
    coverage_status: 'truncated',
    discovery: { status: 'truncated', methods: ['links'], limitations: ['page budget'] },
    populations: { ...completeLocalCoverage([{ url: 'https://example.test/' }]).populations, discovered: 2, eligible: 2, unvisited: 1, evaluated: 1 },
    resources: [
      { resource_id: 'LOCAL-1', normalized_url: 'https://example.test/', original_urls: ['https://example.test/'], state: 'evaluated', evaluation: {} },
      { resource_id: 'LOCAL-2', normalized_url: 'https://example.test/other', original_urls: ['https://example.test/other'], state: 'unvisited' },
    ],
  };
  assert.equal(downstreamStatus(validTruncated), 'qualified');
  assert.equal(downstreamStatus({ ...validTruncated, reconciliation: { valid: false, errors: ['population mismatch'] } }), 'indeterminate');
});

test('CI output qualifies an empty finding set when determination is indeterminate', () => {
  const output = formatPrReviewComment([], { determination_status: 'indeterminate', coverage_status: 'truncated' });
  assert.doesNotMatch(output, /verified clean/i);
  assert.match(output, /no determination.*insufficient evidence/i);
});

test('action plans retain source coverage and limitations for incomplete runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-downstream-'));
  init(root);
  const runDir = path.join(root, '.citable', 'runs', 'RUN-INCOMPLETE');
  fs.mkdirSync(runDir, { recursive: true });
  writeJson(path.join(runDir, 'findings.json'), [{
    finding_id: 'F-TECH-1', detector_id: 'TECH-001', subject: { type: 'site', identifier: 'site' },
    discipline: ['seo'], classification: { severity: 'high', deterministic: true },
    observation: { summary: 'Observed condition', evidence: ['coverage'] },
    remediation: { preferred: 'Review condition', owner: null, review_required: true },
    verification: { method: 'rerun', detector_to_rerun: 'TECH-001', expected_result: 'not reported' },
    reasoning: { limitations: ['Site-wide absence is not established.'] },
  }]);
  writeJson(path.join(runDir, 'manifest.json'), { run_id: 'RUN-INCOMPLETE', target: { kind: 'url', location: 'https://example.test' } });
  writeJson(path.join(runDir, 'coverage.json'), truncated);
  const plan = actionPlan(root, { runId: 'RUN-INCOMPLETE' });
  assert.equal(plan.source_coverage.coverage_status, 'truncated');
  assert.equal(plan.source_coverage.determination_status, 'qualified');
  assert.equal(plan.actions[0].coverage_status, 'truncated');
  assert.match(plan.actions[0].limitations.join(' '), /evaluated resources|unvisited/i);
});

test('action plans re-evaluate exhaustive requirements instead of trusting persisted satisfaction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-action-scope-'));
  init(root);
  const runDir = path.join(root, '.citable', 'runs', 'RUN-EXHAUSTIVE');
  fs.mkdirSync(runDir, { recursive: true });
  writeJson(path.join(runDir, 'findings.json'), [{
    finding_id: 'F-TECH-EXHAUSTIVE', detector_id: 'TECH-EXHAUSTIVE', subject: { type: 'site', identifier: 'site' },
    discipline: ['seo'], classification: { severity: 'high', deterministic: true },
    observation: { summary: 'Persisted site-wide absence', evidence: ['coverage'], determination_status: 'supported' },
    evidence_scope: { requirement: 'exhaustive_requested_scope', satisfaction: 'supported', coverage_ref: 'coverage.json', resource_ids: [] },
    remediation: { preferred: 'Review condition', owner: 'Owner', review_required: false },
    verification: { method: 'rerun', detector_to_rerun: 'TECH-EXHAUSTIVE', expected_result: 'not reported' },
  }]);
  writeJson(path.join(runDir, 'manifest.json'), { run_id: 'RUN-EXHAUSTIVE', target: { kind: 'url', location: 'https://example.test' } });
  writeJson(path.join(runDir, 'coverage.json'), truncated);
  const plan = actionPlan(root, { runId: 'RUN-EXHAUSTIVE' });
  assert.equal(plan.actions[0].status, 'blocked');
  assert.equal(plan.actions[0].determination_status, 'indeterminate');
  assert.match(plan.actions[0].limitations.join(' '), /coverage_incomplete/i);
});

test('executive export includes coverage populations and limitations, not status alone', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-exec-coverage-'));
  init(root);
  const runDir = path.join(root, '.citable', 'runs', 'RUN-COVERAGE');
  fs.mkdirSync(runDir, { recursive: true });
  writeJson(path.join(runDir, 'manifest.json'), { coverage_status: 'truncated', determination_status: 'qualified' });
  writeJson(path.join(runDir, 'summary.json'), { counts: { critical: 0, high: 0, medium: 0, low: 0 } });
  writeJson(path.join(runDir, 'findings.json'), []);
  writeJson(path.join(runDir, 'coverage.json'), truncated);
  const result = await exportExecutiveReport(root, 'RUN-COVERAGE', { format: 'markdown-deck' });
  assert.match(result.content, /evaluated 8 of 10 eligible/i);
  assert.match(result.content, /unvisited|failed/i);
});
