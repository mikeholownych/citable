import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function runJson(argv) {
  const stdout = execFileSync(process.execPath, ['cli/bin/citable.js', ...argv, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return JSON.parse(stdout);
}

test('every --json payload is wrapped in the stable citable_output_schema 1.0 envelope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-envelope-'));
  try {
    const envelope = runJson(['remediate', '--finding', 'CRO-007']);
    assert.equal(envelope.citable_output_schema, '1.0');
    assert.match(envelope.tool_version, /^\d+\.\d+\.\d+/);
    assert.equal(envelope.command, 'remediate');
    assert.ok(!Number.isNaN(Date.parse(envelope.generated_at)));
    assert.equal(envelope.result.finding_id, 'CRO-007');
    assert.equal(envelope.result.ok, true);

    const { valid, errors } = validateAgainst('cli-output-envelope.schema.json', envelope);
    assert.equal(valid, true, errors.join('; '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compatibility output under --json validates against the envelope and reports adapters', () => {
  const envelope = runJson(['compatibility']);
  assert.equal(envelope.command, 'compatibility');
  assert.ok(Array.isArray(envelope.result.checks));
  assert.equal(typeof envelope.result.ok, 'boolean');
  const { valid } = validateAgainst('cli-output-envelope.schema.json', envelope);
  assert.equal(valid, true);
});
