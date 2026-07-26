import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  checkCommand,
  doctorCommand,
  installCommand,
  parseInstallerArgs,
  uninstallCommand,
  updateCommand,
} from '../../src/installer/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tmpProject(prefix = 'citable-install-') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}home-`));
  return { project, home, options: { cwd: project, env: { HOME: home }, packageRoot: ROOT } };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('install into Claude, Codex, and Cursor project locations, then rerun idempotently', async () => {
  const { project, options } = tmpProject();
  const args = parseInstallerArgs(['--providers=claude,codex,cursor', '--project', '--yes']);

  const first = await installCommand(args, options);
  assert.equal(first.ok, true);
  assert.deepEqual(first.results.map((row) => row.status), ['installed', 'installed', 'installed']);
  const claudeManifest = path.join(project, '.claude', 'skills', 'citable', 'manifest.json');
  const codexManifest = path.join(project, '.agents', 'skills', 'citable', 'manifest.json');
  const cursorManifest = path.join(project, '.cursor', 'skills', 'citable', 'manifest.json');
  assert.equal(readJson(claudeManifest).provider, 'claude');
  assert.equal(readJson(codexManifest).provider, 'codex');
  assert.equal(readJson(cursorManifest).provider, 'cursor');
  assert.equal(readJson(codexManifest).scope, 'project');
  const before = fs.statSync(claudeManifest).mtimeMs;

  const second = await installCommand(args, options);
  assert.equal(second.ok, true);
  assert.deepEqual(second.results.map((row) => row.status), ['already current', 'already current', 'already current']);
  assert.equal(fs.statSync(claudeManifest).mtimeMs, before);

  const check = await checkCommand(parseInstallerArgs(['--providers=claude,codex,cursor', '--project']), options);
  assert.deepEqual(check.providers.map((row) => row.state), ['current', 'current', 'current']);
});

test('skills ecosystem flags install each selected managed copy', async () => {
  const { project, home, options } = tmpProject('citable-skills-flags-');
  const args = parseInstallerArgs([
    '--agent', 'claude-code',
    '--agent', 'codex',
    '--skill', '*',
    '--copy',
    '--project',
    '--yes',
  ]);

  const result = await installCommand(args, options);
  assert.deepEqual(result.results.map((row) => row.status), ['installed', 'installed']);
  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'citable', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(project, '.agents', 'skills', 'citable', 'manifest.json')));
  assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'citable')), false);
});

test('dry-run install makes no filesystem changes', async () => {
  const { project, options } = tmpProject('citable-dry-');
  const result = await installCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes', '--dry-run']), options);
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(path.join(project, '.claude', 'skills', 'citable')), false);
});

test('global install uses provider-specific global destination', async () => {
  const { home, options } = tmpProject('citable-global-');
  const result = await installCommand(parseInstallerArgs(['--providers=codex', '--global', '--yes']), options);
  assert.equal(result.ok, true);
  const manifest = readJson(path.join(home, '.agents', 'skills', 'citable', 'manifest.json'));
  assert.equal(manifest.provider, 'codex');
  assert.equal(manifest.scope, 'global');
});

test('unmanaged collisions and local modifications are not silently overwritten', async () => {
  const { project, options } = tmpProject('citable-collision-');
  const unmanaged = path.join(project, '.claude', 'skills', 'citable');
  fs.mkdirSync(unmanaged, { recursive: true });
  fs.writeFileSync(path.join(unmanaged, 'SKILL.md'), '# user skill\n', 'utf8');

  const refused = await installCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes']), options);
  assert.equal(refused.ok, false);
  assert.equal(readJsonOrNull(path.join(unmanaged, 'manifest.json')), null);
  assert.equal(fs.readFileSync(path.join(unmanaged, 'SKILL.md'), 'utf8'), '# user skill\n');

  const forced = await installCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes', '--force']), options);
  assert.equal(forced.ok, true);
  fs.appendFileSync(path.join(unmanaged, 'SKILL.md'), '\nlocal change\n');
  const update = await updateCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes']), options);
  assert.equal(update.ok, false);
  assert.match(update.results[0].message, /locally modified/);
});

test('uninstall removes managed files and preserves unrelated user files', async () => {
  const { project, options } = tmpProject('citable-uninstall-');
  await installCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes']), options);
  const skillDir = path.join(project, '.claude', 'skills', 'citable');
  fs.writeFileSync(path.join(skillDir, 'local-notes.md'), 'keep me\n', 'utf8');

  const removed = await uninstallCommand(parseInstallerArgs(['--providers=claude', '--project', '--yes']), options);
  assert.equal(removed.ok, true);
  assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), false);
  assert.equal(fs.readFileSync(path.join(skillDir, 'local-notes.md'), 'utf8'), 'keep me\n');
});

test('doctor reports optional runtime capabilities independently without exposing credentials', async () => {
  const { options } = tmpProject('citable-doctor-');
  const secret = 'not-for-output';
  const result = await doctorCommand(
    parseInstallerArgs(['--providers=claude', '--project', '--json']),
    {
      ...options,
      env: {
        ...options.env,
        CRUX_API_KEY: secret,
        GSC_ACCESS_TOKEN: secret,
      },
      capabilityResolver: async (name) => ({
        playwright: true,
        lighthouse: true,
        'chrome-launcher': false,
        'tesseract.js': false,
      })[name] ?? false,
    },
  );

  assert.deepEqual(result.capabilities, [
    { id: 'browser_render', state: 'ready', requirements: ['playwright'], limitations: ['dependency presence does not establish browser launch readiness'] },
    { id: 'lighthouse_lab', state: 'missing_dependency', requirements: ['lighthouse', 'chrome-launcher'], limitations: ['optional dependency chrome-launcher is not installed'] },
    { id: 'ocr', state: 'missing_dependency', requirements: ['tesseract.js'], limitations: ['optional dependency tesseract.js is not installed'] },
    { id: 'crux_field', state: 'ready', requirements: ['CRUX_API_KEY'], limitations: ['credential presence does not establish validity, scope, quota, or API availability'] },
    { id: 'gsc_index', state: 'ready', requirements: ['GSC_ACCESS_TOKEN'], limitations: ['credential presence does not establish validity, scope, property access, or API availability'] },
    { id: 'ga4_metrics', state: 'missing_credential', requirements: ['GA4_ACCESS_TOKEN'], limitations: ['GA4_ACCESS_TOKEN is not configured'] },
  ]);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.ok, true, 'missing optional capabilities must not fail installer integrity');
});

function readJsonOrNull(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}
