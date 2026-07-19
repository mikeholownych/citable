import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.match(output, /metrics import/);
  assert.match(output, /objectives init/);
  assert.match(output, /evaluate \[objective-id\]/);
  assert.match(output, /connect status/);
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
