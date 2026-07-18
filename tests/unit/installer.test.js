import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  EXIT_CODES,
  assertArchiveEntrySafe,
  detectProviders,
  parseInstallerArgs,
  resolveTargets,
  selectProviders,
} from '../../src/installer/index.js';
import { parseProviderList, providerDestination, providerSkillsDir } from '../../src/installer/providers.js';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('provider aliases normalize and unknown providers are actionable errors', () => {
  assert.deepEqual(parseProviderList('claude-code,openai-codex,copilot').providers, ['claude', 'codex', 'github']);
  assert.deepEqual(parseProviderList('all').providers.includes('claude'), true);
  assert.deepEqual(parseProviderList('detected').kind, 'detected');
  assert.throws(
    () => parseInstallerArgs(['--providers=claud,codex']),
    (err) => err.exitCode === EXIT_CODES.invalidArguments && err.message.includes('unknown provider'),
  );
});

test('scope flags normalize and conflicting scopes fail closed', () => {
  assert.equal(parseInstallerArgs(['--local']).scope, 'project');
  assert.equal(parseInstallerArgs(['--user']).scope, 'global');
  assert.equal(parseInstallerArgs(['--scope=project']).scope, 'project');
  assert.throws(
    () => parseInstallerArgs(['--project', '--global']),
    (err) => err.exitCode === EXIT_CODES.invalidArguments && err.message.includes('conflicting scope'),
  );
});

test('detection precedence prefers explicit providers over project and home detections', () => {
  const project = tmpDir('citable-providers-');
  const home = tmpDir('citable-home-');
  fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });

  const detection = detectProviders({ cwd: project, env: { HOME: home } });
  assert.deepEqual(selectProviders('install', parseInstallerArgs([]), detection), ['cursor']);
  assert.deepEqual(selectProviders('install', parseInstallerArgs(['--providers=claude,codex']), detection), ['claude', 'codex']);
  assert.deepEqual(selectProviders('install', parseInstallerArgs(['--providers=detected']), detection).sort(), ['claude', 'codex', 'cursor']);
});

test('project and global destinations use provider-specific layouts', () => {
  const project = tmpDir('citable-paths-');
  const home = tmpDir('citable-home-');
  const roots = { projectRoot: project, home };
  assert.equal(providerSkillsDir('claude', 'project', roots), path.join(project, '.claude', 'skills'));
  assert.equal(providerDestination('codex', 'project', roots), path.join(project, '.agents', 'skills', 'citable'));
  assert.equal(providerDestination('codex', 'global', roots), path.join(home, '.agents', 'skills', 'citable'));
  assert.equal(providerDestination('pi', 'global', roots), path.join(home, '.pi', 'agent', 'skills', 'citable'));
});

test('path deduplication marks shared real skill directories', () => {
  const project = tmpDir('citable-dedupe-');
  const home = tmpDir('citable-home-');
  const shared = path.join(project, '.claude', 'skills');
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
  fs.symlinkSync(shared, path.join(project, '.agents', 'skills'), 'dir');

  const args = parseInstallerArgs(['--providers=claude,codex', '--project']);
  const { targets } = resolveTargets('install', args, { cwd: project, env: { HOME: home } });
  assert.equal(targets.length, 2);
  assert.equal(targets.filter((target) => target.duplicateOf).length, 1);
});

test('archive traversal paths are rejected before extraction', () => {
  assert.equal(assertArchiveEntrySafe('skills/citable/SKILL.md'), 'skills/citable/SKILL.md');
  for (const bad of ['../../.ssh/authorized_keys', '/tmp/pwn', 'skills/../../pwn', 'a\0b']) {
    assert.throws(
      () => assertArchiveEntrySafe(bad),
      (err) => err.exitCode === EXIT_CODES.integrityFailure,
      bad,
    );
  }
});
