import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackJson } from '../../scripts/pack-json.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('parsePackJson normalizes npm array and package-keyed metadata', () => {
  const metadata = { filename: 'pkg-1.0.0.tgz', files: [{ path: 'package.json' }] };
  assert.deepEqual(parsePackJson(JSON.stringify([metadata])), [metadata]);
  assert.deepEqual(parsePackJson(JSON.stringify({ '@scope/pkg': metadata })), [metadata]);
});

test('release workflow uses the shared npm pack parser', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release-gates.yml'), 'utf8');
  assert.match(workflow, /scripts\/pack-json\.js/);
  assert.doesNotMatch(workflow, /JSON\.parse\([^\n]+\)\[0\]/);
});
