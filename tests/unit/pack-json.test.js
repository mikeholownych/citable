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

test('ship workflow creates a draft release and explicitly dispatches trusted npm publishing', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ship-release.yml'), 'utf8');
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /gh workflow run npm-publish\.yml/);
  assert.match(workflow, /--ref "v\$\{RELEASE_VERSION\}"/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /release-governance\.js manifest/);
});

test('finalization workflow requires deployment receipts before publishing latest', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'finalize-release.yml'), 'utf8');
  assert.match(workflow, /deployment-receipt-\*\.json/);
  assert.match(workflow, /state-finalize/);
  assert.match(workflow, /--draft=false --latest/);
});

test('npm publishing cannot bypass governed dispatch and records state in a retryable job', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'npm-publish.yml'), 'utf8');
  assert.doesNotMatch(workflow, /push:\s*\n\s*tags:/);
  assert.match(workflow, /test "\$\{GITHUB_REF_TYPE\}" = "tag"/);
  assert.match(workflow, /record-state:/);
  assert.match(workflow, /needs: publish/);
  assert.match(workflow, /state-publish/);
});

test('unfinalized release resolution is protected, terminal, and non-latest', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'resolve-release.yml'), 'utf8');
  assert.match(workflow, /environment: release/);
  assert.match(workflow, /state-resolve/);
  assert.match(workflow, /--prerelease/);
  assert.match(workflow, /--latest=false/);
});
