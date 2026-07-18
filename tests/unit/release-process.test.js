import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  compareVersions,
  parseVersion,
  prepareRelease,
  releaseNotes,
  validateRelease,
} from '../../scripts/release-process.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-release-'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"citable","version":"1.4.0"}\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"version":"1.4.0","packages":{"":{"version":"1.4.0"}}}\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n### Added\n\n- Managed release process.\n\n## 1.4.0 — 2026-07-18\n');
  fs.writeFileSync(path.join(root, 'docs', 'ROADMAP.md'), '# Roadmap\n\n## Current State (v1.4.0)\n');
  return root;
}

test('stable semantic versions parse and compare numerically', () => {
  assert.deepEqual(parseVersion('2.10.3'), [2, 10, 3]);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.throws(() => parseVersion('v1.2.3'), /invalid stable semantic version/);
  assert.throws(() => parseVersion('1.2.3-beta.1'), /invalid stable semantic version/);
});

test('prepareRelease promotes Unreleased notes and updates version contracts', () => {
  const root = fixture();
  const result = prepareRelease(root, '1.5.0', '2026-07-19');
  assert.equal(result.previousVersion, '1.4.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, '1.5.0');
  assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /## 1\.5\.0 — 2026-07-19/);
  assert.equal(validateRelease(root, '1.5.0'), true);
  assert.match(releaseNotes(root, '1.5.0'), /Managed release process/);
});

test('prepareRelease fails closed for empty notes and non-incrementing versions', () => {
  const root = fixture();
  assert.throws(() => prepareRelease(root, '1.4.0'), /must be greater/);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n## 1.4.0 — 2026-07-18\n');
  assert.throws(() => prepareRelease(root, '1.5.0'), /Unreleased section is empty/);
});

test('prepareRelease validates every contract before writing', () => {
  const root = fixture();
  const packageFile = path.join(root, 'package.json');
  fs.writeFileSync(path.join(root, 'docs', 'ROADMAP.md'), '# Roadmap\n');
  assert.throws(() => prepareRelease(root, '1.5.0'), /ROADMAP\.md.*heading is missing/);
  assert.equal(JSON.parse(fs.readFileSync(packageFile)).version, '1.4.0');
});
