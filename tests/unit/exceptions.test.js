import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { listExceptions, renewException, invalidateException } from '../../src/commands/exceptions.js';
import { recordHash } from '../../src/commands/governance.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';
import { sha256 } from '../../src/shared/io.js';

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-exceptions-test-'));
  init(root);

  const { registries } = loadRegistries(root);
  registries.reviewers.entries = [
    { reviewer_id: 'REVIEWER-TECH', name: 'Technical reviewer', status: 'active', roles: ['technical_reviewer'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-APPROVER', name: 'Approver', status: 'active', roles: ['approver'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-INACTIVE', name: 'Inactive reviewer', status: 'inactive', roles: ['approver'], authorized_scopes: ['*'], conflicts: [] },
  ];

  const policy = {
    policy_id: 'POLICY-DEFAULT',
    name: 'Default exception policy',
    status: 'active',
    required_roles: ['technical_reviewer', 'approver'],
    separation_rules: ['author_cannot_verify_own_claim'],
    max_exception_days: 90,
    max_renewals: 2,
  };
  registries.review_policies.entries = [policy];

  const exception1 = {
    exception_id: 'EXCEPTION-ONE',
    policy_id: policy.policy_id,
    policy_hash: recordHash(policy),
    status: 'approved',
    source_run_id: 'RUN-1',
    finding_ids: ['F-1'],
    finding_hashes: { 'F-1': sha256('F-1') },
    reason: 'Temporary edge migration.',
    risk_statement: 'Crawler unable to retrieve URL.',
    residual_risk: 'documented',
    compensating_controls: ['Monitor logs.'],
    evidence_ids: [],
    evidence_hashes: {},
    owner_reviewer_id: 'REVIEWER-TECH',
    reviewer_assignments: [
      { reviewer_id: 'REVIEWER-TECH', role: 'technical_reviewer' },
      { reviewer_id: 'REVIEWER-APPROVER', role: 'approver' },
    ],
    reviewer_independence: 'established',
    created_at: '2026-07-01T00:00:00.000Z',
    expires_at: '2026-08-01T00:00:00.000Z',
    renewal_count: 0,
    renewal_limit: 2,
    invalidation_conditions: ['finding_changed'],
    related_intervention_id: null,
    supersedes_exception_id: null,
    superseded_by_exception_id: null,
    audit_history: [
      { timestamp: '2026-07-01T00:00:00.000Z', actor_reviewer_id: 'REVIEWER-APPROVER', action: 'approved', note: 'Initial approval' },
    ],
  };

  const exception2 = {
    ...structuredClone(exception1),
    exception_id: 'EXCEPTION-TWO',
    created_at: '2026-05-01T00:00:00.000Z',
    expires_at: '2026-06-01T00:00:00.000Z',
  };

  registries.exceptions.entries = [exception1, exception2];
  for (const kind of ['reviewers', 'review_policies', 'exceptions']) saveRegistry(root, kind, registries[kind]);

  return { root, policy, exception1, exception2 };
}

test('listExceptions reports computed status and expiry relative to reference date', () => {
  const { root } = createFixture();

  // Reference date: 2026-07-25 (exception1 expires in 7 days -> expiring_soon; exception2 expired in June -> expired)
  const res = listExceptions(root, { refDate: '2026-07-25', expiringSoonDays: 14 });

  assert.equal(res.exceptions.length, 2);
  assert.equal(res.summary.total, 2);
  assert.equal(res.summary.expiring_soon, 1);
  assert.equal(res.summary.expired, 1);
  assert.equal(res.summary.active, 0);

  const e1 = res.exceptions.find((e) => e.exception_id === 'EXCEPTION-ONE');
  assert.equal(e1.computed_status, 'expiring_soon');
  assert.equal(e1.is_expiring_soon, true);
  assert.equal(e1.is_expired, false);
  assert.equal(e1.days_remaining, 7);

  const e2 = res.exceptions.find((e) => e.exception_id === 'EXCEPTION-TWO');
  assert.equal(e2.computed_status, 'expired');
  assert.equal(e2.is_expired, true);
});

test('listExceptions filters by expiredOnly', () => {
  const { root } = createFixture();
  const res = listExceptions(root, { refDate: '2026-07-25', expiredOnly: true });
  assert.equal(res.exceptions.length, 1);
  assert.equal(res.exceptions[0].exception_id, 'EXCEPTION-TWO');
});

test('renewException extends expiration, increments count, and records audit trail', () => {
  const { root } = createFixture();

  // Dry run
  const dry = renewException(root, {
    id: 'EXCEPTION-ONE',
    until: '2026-08-15',
    reviewer: 'REVIEWER-APPROVER',
    evidence: 'EV-RENEWAL-1',
    note: 'Extended for staged rollout',
    write: false,
    refDate: '2026-07-25',
  });

  assert.equal(dry.written, false);
  assert.equal(dry.renewal_count, 1);
  assert.match(dry.expires_at, /^2026-08-15/);

  // Unchanged in storage
  const { registries: rBefore } = loadRegistries(root);
  assert.equal(rBefore.exceptions.entries[0].renewal_count, 0);

  // Written run
  const written = renewException(root, {
    id: 'EXCEPTION-ONE',
    until: '2026-08-15',
    reviewer: 'REVIEWER-APPROVER',
    evidence: 'EV-RENEWAL-1',
    note: 'Extended for staged rollout',
    write: true,
    refDate: '2026-07-25',
  });

  assert.equal(written.written, true);
  const { registries: rAfter } = loadRegistries(root);
  const saved = rAfter.exceptions.entries[0];
  assert.equal(saved.renewal_count, 1);
  assert.match(saved.expires_at, /^2026-08-15/);
  assert.ok(saved.evidence_ids.includes('EV-RENEWAL-1'));
  assert.ok(saved.evidence_hashes['EV-RENEWAL-1']);
  const audit = saved.audit_history[saved.audit_history.length - 1];
  assert.equal(audit.action, 'renewed');
  assert.equal(audit.actor_reviewer_id, 'REVIEWER-APPROVER');
  assert.equal(audit.note, 'Extended for staged rollout');
});

test('renewException rejects illegal renewals and inactive reviewers', () => {
  const { root } = createFixture();

  // Inactive reviewer
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-08-15',
      reviewer: 'REVIEWER-INACTIVE',
      refDate: '2026-07-25',
    });
  }, /reviewer not found or inactive/);

  // Unknown reviewer
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-08-15',
      reviewer: 'REVIEWER-UNKNOWN',
      refDate: '2026-07-25',
    });
  }, /reviewer not found or inactive/);

  // Renewal date not in future relative to ref date
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-07-20',
      reviewer: 'REVIEWER-APPROVER',
      refDate: '2026-07-25',
    });
  }, /must be in the future relative to the reference date/);

  // Renewal date before current expiry
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-07-28',
      reviewer: 'REVIEWER-APPROVER',
      refDate: '2026-07-25',
    });
  }, /must extend past current expiration date/);

  // Max renewals reached
  renewException(root, { id: 'EXCEPTION-ONE', until: '2026-08-15', reviewer: 'REVIEWER-APPROVER', write: true, refDate: '2026-07-25' });
  renewException(root, { id: 'EXCEPTION-ONE', until: '2026-08-25', reviewer: 'REVIEWER-APPROVER', write: true, refDate: '2026-07-25' });
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-08-30',
      reviewer: 'REVIEWER-APPROVER',
      refDate: '2026-07-25',
    });
  }, /reached its renewal limit/);
});

test('invalidateException revokes exception and appends audit log with reason', () => {
  const { root } = createFixture();

  // Inactive reviewer fails
  assert.throws(() => {
    invalidateException(root, {
      id: 'EXCEPTION-ONE',
      reason: 'Issue fixed in PR #42',
      reviewer: 'REVIEWER-INACTIVE',
    });
  }, /reviewer not found or inactive/);

  // Successful revocation
  const res = invalidateException(root, {
    id: 'EXCEPTION-ONE',
    reason: 'Issue fixed in PR #42',
    reviewer: 'REVIEWER-APPROVER',
    write: true,
  });

  assert.equal(res.status, 'revoked');
  assert.equal(res.written, true);

  const { registries } = loadRegistries(root);
  const revoked = registries.exceptions.entries[0];
  assert.equal(revoked.status, 'revoked');
  const lastAudit = revoked.audit_history[revoked.audit_history.length - 1];
  assert.equal(lastAudit.action, 'revoked');
  assert.equal(lastAudit.actor_reviewer_id, 'REVIEWER-APPROVER');
  assert.equal(lastAudit.note, 'Issue fixed in PR #42');

  // Second revocation fails
  assert.throws(() => {
    invalidateException(root, {
      id: 'EXCEPTION-ONE',
      reason: 'Already revoked',
      reviewer: 'REVIEWER-APPROVER',
    });
  }, /already revoked/);

  // Cannot renew revoked exception
  assert.throws(() => {
    renewException(root, {
      id: 'EXCEPTION-ONE',
      until: '2026-08-15',
      reviewer: 'REVIEWER-APPROVER',
    });
  }, /cannot renew revoked exception/);
});
