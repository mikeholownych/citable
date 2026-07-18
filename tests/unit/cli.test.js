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
});
