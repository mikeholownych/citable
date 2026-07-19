import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_COMMUNITY_FILES, validateCommunity } from '../../scripts/validate-community.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('community files and forms satisfy the repository contract', () => {
  assert.deepEqual(validateCommunity(ROOT), []);
});

test('community validation fails closed for missing files and unsafe security routing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-community-'));
  for (const relative of REQUIRED_COMMUNITY_FILES) {
    const source = path.join(ROOT, relative), destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.writeFileSync(path.join(root, 'SECURITY.md'), 'Open a confidential issue.');
  const errors = validateCommunity(root);
  assert.ok(errors.some((error) => /private vulnerability reporting/.test(error)));
  assert.ok(errors.some((error) => /must not claim public issues are confidential/.test(error)));
});
