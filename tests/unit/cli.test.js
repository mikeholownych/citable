import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  assert.match(output, /metrics import/);
  assert.match(output, /objectives init/);
  assert.match(output, /evaluate \[objective-id\]/);
  assert.match(output, /connect status/);
  assert.match(output, /connect read/);
  assert.match(output, /connect apply/);
  assert.match(output, /governance validate/);
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



