import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { evaluateDispositions, recordHash, validateGovernance } from '../../src/commands/governance.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';
import { writeJson } from '../../src/shared/io.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-governance-'));
  init(root);
  const runId = 'RUN-GOVERNANCE';
  const finding = {
    finding_id: 'F-GOV-1', detector_id: 'TECH-001', run_id: runId, timestamp: '2026-07-18T00:00:00Z',
    discipline: ['seo'], subject: { type: 'url', identifier: 'https://example.test/' },
    observation: { summary: 'Blocked', evidence: ['HTTP 403'] },
    classification: { finding_type: 'deterministic_observation', severity: 'high', confidence: 'confirmed', deterministic: true, impact: { retrieval: 'high' } },
    remediation: { preferred: 'Permit the intended crawler.' }, verification: { method: 'Refetch.' }, status: { state: 'open' },
  };
  const runDir = path.join(root, '.citable', 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  writeJson(path.join(runDir, 'findings.json'), [finding]);
  const { registries } = loadRegistries(root);
  registries.reviewers.entries = [
    { reviewer_id: 'REVIEWER-TECH', name: 'Technical reviewer', status: 'active', roles: ['technical_reviewer'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-APPROVER', name: 'Approver', status: 'active', roles: ['approver'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-RISK', name: 'Risk acceptor', status: 'active', roles: ['risk_acceptor'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-OWNER', name: 'Owner', status: 'active', roles: ['content_author'], authorized_scopes: ['*'], conflicts: [] },
  ];
  const policy = {
    policy_id: 'POLICY-DEFAULT', name: 'Default exception policy', status: 'active',
    required_roles: ['technical_reviewer', 'approver', 'risk_acceptor'],
    separation_rules: ['author_cannot_verify_own_claim', 'implementer_cannot_solely_verify', 'risk_acceptor_must_be_authorized'],
    max_exception_days: 90, max_renewals: 1,
  };
  registries.review_policies.entries = [policy];
  registries.exceptions.entries = [{
    exception_id: 'EXCEPTION-ONE', policy_id: policy.policy_id, policy_hash: recordHash(policy), status: 'approved',
    source_run_id: runId, finding_ids: [finding.finding_id], finding_hashes: { [finding.finding_id]: recordHash(finding) },
    reason: 'Temporary edge migration.', risk_statement: 'The crawler remains unable to retrieve this URL.', residual_risk: 'documented',
    compensating_controls: ['Monitor verified production crawler logs.'], evidence_ids: [], evidence_hashes: {}, owner_reviewer_id: 'REVIEWER-OWNER',
    reviewer_assignments: [
      { reviewer_id: 'REVIEWER-TECH', role: 'technical_reviewer' },
      { reviewer_id: 'REVIEWER-APPROVER', role: 'approver' },
      { reviewer_id: 'REVIEWER-RISK', role: 'risk_acceptor' },
      { reviewer_id: 'REVIEWER-OWNER', role: 'content_author' },
    ],
    reviewer_independence: 'established', created_at: '2026-07-18T00:00:00Z', expires_at: '2026-08-18T00:00:00Z',
    renewal_count: 0, renewal_limit: 1, invalidation_conditions: ['finding_changed', 'policy_changed'],
    related_intervention_id: null, supersedes_exception_id: null, superseded_by_exception_id: null,
    audit_history: [{ timestamp: '2026-07-18T00:00:00Z', actor_reviewer_id: 'REVIEWER-APPROVER', action: 'approved', note: 'Approved for the migration window.' }],
  }];
  for (const kind of ['reviewers', 'review_policies', 'exceptions']) saveRegistry(root, kind, registries[kind]);
  return { root, runId, finding };
}

test('active governed exception changes disposition but not technical state or source finding', () => {
  const { root, runId } = fixture();
  const source = path.join(root, '.citable', 'runs', runId, 'findings.json');
  const before = fs.readFileSync(source);
  assert.equal(validateGovernance(root, { refDate: '2026-07-19' }).ok, true);
  const result = evaluateDispositions(root, { runId, refDate: '2026-07-19' });
  assert.equal(result.dispositions[0].technical_state, 'failed');
  assert.equal(result.dispositions[0].enforcement_disposition, 'accepted_exception');
  assert.equal(result.dispositions[0].exception_validity, 'active');
  assert.equal(result.dispositions[0].residual_risk, 'documented');
  assert.deepEqual(fs.readFileSync(source), before);
});

test('expired, over-renewed, conflicted, and stale exceptions fail closed', () => {
  const { root, runId } = fixture();
  const { registries } = loadRegistries(root);
  const exception = registries.exceptions.entries[0];
  exception.expires_at = '2026-07-18T00:00:00Z';
  exception.renewal_count = 2;
  registries.reviewers.entries.find((item) => item.reviewer_id === 'REVIEWER-TECH').conflicts = ['https://example.test/'];
  exception.finding_hashes['F-GOV-1'] = '0'.repeat(64);
  saveRegistry(root, 'reviewers', registries.reviewers);
  saveRegistry(root, 'exceptions', registries.exceptions);
  const validation = validateGovernance(root, { refDate: '2026-07-19' });
  assert.equal(validation.ok, false);
  assert.ok(validation.problems.some((item) => item.includes('expired')));
  assert.ok(validation.problems.some((item) => item.includes('renewal limit exceeded')));
  assert.ok(validation.problems.some((item) => item.includes('declared conflict')));
  assert.ok(validation.problems.some((item) => item.includes('changed since approval')));
  const result = evaluateDispositions(root, { runId, refDate: '2026-07-19' });
  assert.equal(result.dispositions[0].enforcement_disposition, 'enforce');
  assert.equal(result.dispositions[0].exception_validity, 'invalid');
});

test('policy changes, role conflicts, and multiple active exceptions cannot silently authorize', () => {
  const { root, runId } = fixture();
  const { registries } = loadRegistries(root);
  registries.review_policies.entries[0].max_exception_days = 45;
  const exception = registries.exceptions.entries[0];
  exception.reviewer_assignments.push({ reviewer_id: 'REVIEWER-OWNER', role: 'technical_reviewer' });
  registries.reviewers.entries.find((item) => item.reviewer_id === 'REVIEWER-OWNER').roles.push('technical_reviewer');
  const duplicate = structuredClone(exception);
  duplicate.exception_id = 'EXCEPTION-TWO';
  duplicate.policy_hash = recordHash(registries.review_policies.entries[0]);
  duplicate.reviewer_assignments = duplicate.reviewer_assignments.filter((item) => item.reviewer_id !== 'REVIEWER-OWNER' || item.role !== 'technical_reviewer');
  registries.exceptions.entries.push(duplicate);
  saveRegistry(root, 'reviewers', registries.reviewers);
  saveRegistry(root, 'review_policies', registries.review_policies);
  saveRegistry(root, 'exceptions', registries.exceptions);
  const validation = validateGovernance(root, { refDate: '2026-07-19' });
  assert.equal(validation.ok, false);
  assert.ok(validation.problems.some((item) => item.includes('policy changed since approval')));
  assert.ok(validation.problems.some((item) => item.includes('content author also verifies')));
  const result = evaluateDispositions(root, { runId, refDate: '2026-07-19' });
  assert.equal(result.dispositions[0].enforcement_disposition, 'accepted_exception');
  assert.equal(result.dispositions[0].exception_id, 'EXCEPTION-TWO');
});

test('multiple active exceptions block enforcement as ambiguous', () => {
  const { root, runId } = fixture();
  const { registries } = loadRegistries(root);
  const duplicate = structuredClone(registries.exceptions.entries[0]);
  duplicate.exception_id = 'EXCEPTION-TWO';
  registries.exceptions.entries.push(duplicate);
  saveRegistry(root, 'exceptions', registries.exceptions);
  const validation = validateGovernance(root, { refDate: '2026-07-19' });
  assert.equal(validation.ok, false);
  assert.ok(validation.problems.some((item) => item.includes('ambiguous active exceptions')));
  const result = evaluateDispositions(root, { runId, refDate: '2026-07-19' });
  assert.equal(result.dispositions[0].technical_state, 'failed');
  assert.equal(result.dispositions[0].enforcement_disposition, 'blocked_ambiguous_exception');
  assert.equal(result.dispositions[0].exception_validity, 'ambiguous');
});
