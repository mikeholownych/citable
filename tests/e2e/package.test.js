import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parsePackJson(output) {
  for (let start = output.indexOf('['); start !== -1; start = output.indexOf('[', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < output.length; index += 1) {
      const char = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === '[') depth += 1;
      else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          const parsed = JSON.parse(output.slice(start, index + 1));
          if (Array.isArray(parsed)) return parsed;
        }
      }
    }
  }

  assert.fail(`npm pack did not emit a JSON array:\n${output}`);
}

test('packed npm artifact contains runtime files and installs with npx', { timeout: 120_000 }, () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-pack-'));
  const dryOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--pack-destination', packDir], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const dry = parsePackJson(dryOutput)[0];
  const dryFiles = new Set(dry.files.map((file) => file.path));
  assert.ok(dryFiles.has('cli/bin/citable.js'));
  assert.ok(dryFiles.has('dist/universal/.claude/skills/citable/SKILL.md'));
  assert.ok(dryFiles.has('dist/universal/.agents/skills/citable/SKILL.md'));
  assert.ok(dryFiles.has('README.md'));
  assert.ok(dryFiles.has('LICENSE'));

  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const packed = parsePackJson(output)[0];
  const tarball = path.join(packDir, packed.filename);
  assert.equal(fs.existsSync(tarball), true);

  const contents = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' });
  assert.match(contents, /package\/cli\/bin\/citable\.js/);
  assert.match(contents, /package\/dist\/universal\/\.cursor\/skills\/citable\/SKILL\.md/);
  assert.match(contents, /package\/dist\/universal\/\.gemini\/skills\/citable\/schemas\/claim\.schema\.json/);

  const modes = execFileSync('tar', ['-tvf', tarball, 'package/cli/bin/citable.js'], { encoding: 'utf8' });
  assert.match(modes, /^-rwxr-xr-x/, modes);

  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-npx-project-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-npx-home-'));
  fs.copyFileSync(tarball, path.join(project, packed.filename));
  execFileSync('npx', [`./${packed.filename}`, 'install', '--providers=claude,codex', '--project', '--yes'], {
    cwd: project,
    env: { ...process.env, HOME: home, npm_config_yes: 'true' },
    encoding: 'utf8',
  });
  assert.equal(fs.existsSync(path.join(project, '.claude', 'skills', 'citable', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(project, '.agents', 'skills', 'citable', 'manifest.json')), true);
});
