import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('top-level help exposes audit-to-action commands', () => {
  const output = execFileSync(process.execPath, ['cli/bin/citable.js', 'help'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(output, /audit \[scope\]/);
  assert.match(output, /action-plan \[run\]/);
  assert.match(output, /observe <mode>/);
  assert.match(output, /apply\s+Apply a reviewed/);
  assert.match(output, /monitor \[runA runB\]/);
  assert.match(output, /report dashboard \[--last N\] \[--since <run-id>\]/);
  assert.match(output, /report share-of-voice \[--last N\]/);
  assert.match(output, /report consensus/);
  assert.match(output, /metrics import/);
  assert.match(output, /objectives init/);
  assert.match(output, /evaluate \[objective-id\]/);
  assert.match(output, /connect status/);
  assert.match(output, /connect read/);
  assert.match(output, /connect apply/);
  assert.match(output, /connect indexnow/);
  assert.match(output, /connect mcp/);
  assert.match(output, /governance validate/);
  assert.match(output, /exceptions list/);
  assert.match(output, /exceptions renew/);
  assert.match(output, /exceptions invalidate/);
  assert.match(output, /reviews queue/);
  assert.match(output, /schedules run/);
  assert.match(output, /project github/);
  assert.match(output, /media evidence/);
  assert.match(output, /representation evidence/);
  assert.match(output, /corpus evaluate/);
  assert.match(output, /--interactions/);
  assert.match(output, /--resume-run/);
  assert.match(output, /--lighthouse/);
});

test('report dashboard runs via CLI against synthesized runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-cli-dash-'));
  execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'init'], { cwd: dir, encoding: 'utf8' });
  const runsDir = path.join(dir, '.citable', 'runs');
  for (const [id, ts] of [
    ['2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z'],
    ['2026-07-02T00:00:00Z-audit-2', '2026-07-02T00:00:00Z'],
  ]) {
    const runPath = path.join(runsDir, id);
    fs.mkdirSync(runPath, { recursive: true });
    fs.writeFileSync(path.join(runPath, 'manifest.json'), JSON.stringify({ timestamp: ts, command: 'audit' }));
    fs.writeFileSync(path.join(runPath, 'summary.json'), JSON.stringify({
      by_severity: { critical: 1, high: 0, medium: 1 },
      posture: {
        retrieval_eligibility: { result: 'pass' },
        source_extraction_and_support: { result: 'pass' },
        observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.8 },
      },
    }));
  }
  const out = execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'report', 'dashboard'], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /report dashboard: 2 audit run\(s\) included, 0 skipped/);
  assert.ok(fs.existsSync(path.join(dir, '.citable', 'reports', 'dashboard.md')));
  assert.ok(fs.existsSync(path.join(dir, '.citable', 'reports', 'dashboard.html')));
});

test('monitor runs via CLI against observation runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-cli-mon-'));
  execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'init'], { cwd: dir, encoding: 'utf8' });
  const runsDir = path.join(dir, '.citable', 'runs');
  for (const [id, indexed] of [
    ['2026-07-01T00:00:00Z-obs-1', true],
    ['2026-07-02T00:00:00Z-obs-2', false],
  ]) {
    const obsDir = path.join(runsDir, id, 'observations');
    fs.mkdirSync(obsDir, { recursive: true });
    fs.writeFileSync(path.join(obsDir, '0001-index.json'), JSON.stringify({
      kind: 'index',
      state: 'observed',
      data: { url: 'https://example.test', indexed },
    }));
  }
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'monitor'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    assert.fail('should have exited with status 1 on critical/high regression');
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stdout, /monitor 2026-07-01T00:00:00Z-obs-1 → 2026-07-02T00:00:00Z-obs-2/);
    assert.match(err.stdout, /1 alert\(s\), 1 critical\/high/);
  }
  assert.ok(fs.existsSync(path.join(dir, '.citable', 'monitoring', 'latest.json')));
});

test('report share-of-voice runs via CLI against observation runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-cli-sov-'));
  execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'init'], { cwd: dir, encoding: 'utf8' });
  const runsDir = path.join(dir, '.citable', 'runs');
  const obsDir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  fs.mkdirSync(obsDir, { recursive: true });
  fs.writeFileSync(path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'manifest.json'), JSON.stringify({ timestamp: '2026-07-01T00:00:00Z' }));
  fs.writeFileSync(path.join(obsDir, '0001-citation.json'), JSON.stringify({
    kind: 'citation',
    state: 'observed',
    data: {
      prompt_id: 'P1',
      prompt_text: 'test prompt',
      property_cited: true,
      citations: [
        { canonical_url: 'https://example.test', first_party: true },
      ],
    },
  }));
  const out = execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'report', 'share-of-voice'], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /report share-of-voice: 1 citation run\(s\) included/);
  assert.ok(fs.existsSync(path.join(dir, '.citable', 'reports', 'share-of-voice.md')));
  assert.ok(fs.existsSync(path.join(dir, '.citable', 'reports', 'share-of-voice.html')));
});

test('exceptions CLI handles list, renew, and invalidate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-cli-exc-'));
  execFileSync(process.execPath, [path.join(ROOT, 'cli/bin/citable.js'), 'init'], { cwd: dir, encoding: 'utf8' });

  // Add reviewer, policy, and exception
  const { registries } = loadRegistries(dir);
  registries.reviewers.entries = [
    { reviewer_id: 'REVIEWER-TECH', name: 'Technical reviewer', status: 'active', roles: ['technical_reviewer'], authorized_scopes: ['*'], conflicts: [] },
    { reviewer_id: 'REVIEWER-APPROVER', name: 'Approver', status: 'active', roles: ['approver'], authorized_scopes: ['*'], conflicts: [] },
  ];
  registries.review_policies.entries = [
    {
      policy_id: 'POLICY-DEFAULT',
      name: 'Default exception policy',
      status: 'active',
      required_roles: ['technical_reviewer', 'approver'],
      separation_rules: ['author_cannot_verify_own_claim'],
      max_exception_days: 90,
      max_renewals: 2,
    },
  ];
  registries.exceptions.entries = [
    {
      exception_id: 'EXCEPTION-CLI-1',
      policy_id: 'POLICY-DEFAULT',
      policy_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      status: 'approved',
      source_run_id: 'RUN-1',
      finding_ids: ['F-1'],
      finding_hashes: {
        'F-1': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      reason: 'Staged migration.',
      risk_statement: 'Crawler cannot reach path.',
      residual_risk: 'documented',
      compensating_controls: ['Monitor traffic.'],
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
        {
          timestamp: '2026-07-01T00:00:00.000Z',
          actor_reviewer_id: 'REVIEWER-APPROVER',
          action: 'approved',
          note: 'Approved',
        },
      ],
    },
  ];
  for (const kind of ['reviewers', 'review_policies', 'exceptions']) saveRegistry(dir, kind, registries[kind]);

  // CLI list
  const listOut = execFileSync(process.execPath, [
    path.join(ROOT, 'cli/bin/citable.js'), 'exceptions', 'list', '--ref-date', '2026-07-25',
  ], { cwd: dir, encoding: 'utf8' });
  assert.match(listOut, /exceptions list: 1 exception\(s\)/);
  assert.match(listOut, /EXCEPTION-CLI-1 \[expiring_soon\]/);

  // CLI renew
  const renewOut = execFileSync(process.execPath, [
    path.join(ROOT, 'cli/bin/citable.js'), 'exceptions', 'renew',
    '--id', 'EXCEPTION-CLI-1',
    '--until', '2026-08-15',
    '--reviewer', 'REVIEWER-APPROVER',
    '--ref-date', '2026-07-25',
    '--write',
  ], { cwd: dir, encoding: 'utf8' });
  assert.match(renewOut, /exceptions renew: EXCEPTION-CLI-1 extended to 2026-08-15/);
  assert.match(renewOut, /written/);

  // CLI invalidate
  const invalidateOut = execFileSync(process.execPath, [
    path.join(ROOT, 'cli/bin/citable.js'), 'exceptions', 'invalidate',
    '--id', 'EXCEPTION-CLI-1',
    '--reason', 'Migration completed ahead of time',
    '--reviewer', 'REVIEWER-APPROVER',
    '--write',
  ], { cwd: dir, encoding: 'utf8' });
  assert.match(invalidateOut, /exceptions invalidate: EXCEPTION-CLI-1 marked revoked written/);
});
