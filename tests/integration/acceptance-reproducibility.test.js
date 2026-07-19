import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareAcceptanceReceipts, createAcceptanceReceipt, verifyAcceptanceReceipt } from '../../src/acceptance/reproducibility.js';
import { createRun } from '../../src/evidence/run.js';
import { readJson, writeJson } from '../../src/shared/io.js';

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'citable-acceptance-receipt-'));
}

function sealedRun(base, overrides = {}) {
  const run = createRun(base, {
    command: overrides.command || 'audit technical',
    argv: overrides.argv || ['technical', '--target', 'fixture'],
    target: overrides.target || { kind: 'source', location: 'fixture', environment: 'test' },
    configHash: overrides.configHash || 'config-a',
    locale: overrides.locale || 'en-US',
  });
  run.addInput('site', overrides.content || 'stable property');
  run.manifest.detectors_run = overrides.detectors || ['TECH-001'];
  run.manifest.detectors_skipped = overrides.skipped || [];
  if (overrides.toolVersion) run.manifest.tool_version = overrides.toolVersion;
  if (overrides.incomplete) run.manifest.incomplete_checks.push('production log observation unavailable');
  run.writeArtifact('findings.json', overrides.findings || []);
  run.finalize(overrides.incomplete ? 'incomplete' : 'completed');
  return run.runId;
}

test('equivalent repeated runs produce stable canonical fingerprints while retaining execution context', () => {
  const base = root();
  const first = createAcceptanceReceipt(base, {
    runId: sealedRun(base),
    context: { locale: 'en-US', region: 'us-east', collectors: { html: '1.0.0' } },
    createdAt: '2026-07-19T10:00:00Z',
  });
  const second = createAcceptanceReceipt(base, {
    runId: sealedRun(base),
    context: { locale: 'fr-FR', region: 'eu-west', collectors: { html: '1.0.0' } },
    createdAt: '2026-07-19T11:00:00Z',
  });
  assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  assert.equal(first.receipt.reproducibility.fingerprint, second.receipt.reproducibility.fingerprint);
  assert.deepEqual(first.receipt.canonical_artifacts, second.receipt.canonical_artifacts);
  assert.deepEqual(first.receipt.observation_method.arguments, ['technical', '--target', '<excluded-path-or-run>']);
  assert.match(first.receipt.reproducibility.excluded_environment_fields.join(' '), /locale/);
  const comparison = compareAcceptanceReceipts(first.receipt, second.receipt);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.fingerprint_equal, true);
  assert.equal(comparison.partial_runs.length, 0);
});

test('comparison separates all change dimensions and preserves partial observations', () => {
  const base = root();
  const baseline = createAcceptanceReceipt(base, {
    runId: sealedRun(base),
    context: { collectors: { html: '1' }, external_systems: { cdn: 'edge-a' } },
  }).receipt;
  const changed = createAcceptanceReceipt(base, {
    runId: sealedRun(base, {
      target: { kind: 'url', location: 'https://example.test', environment: 'production' },
      content: 'changed property', detectors: ['TECH-002'], configHash: 'config-b',
      command: 'observe render', argv: ['render'], toolVersion: '9.9.9', incomplete: true,
    }),
    context: { collectors: { browser: '2' }, external_systems: { cdn: 'edge-b' }, unavailable_observations: ['origin logs unavailable'] },
  }).receipt;
  const result = compareAcceptanceReceipts(baseline, changed);
  assert.deepEqual(result.change_dimensions, {
    property_changed: true,
    detector_changed: true,
    configuration_changed: true,
    observation_method_changed: true,
    tool_changed: true,
    external_system_changed: true,
  });
  assert.equal(result.comparable, false);
  assert.equal(result.partial_runs.length, 1);
  assert.deepEqual(result.partial_runs[0].unavailable_observations, ['origin logs unavailable', 'production log observation unavailable']);
});

test('receipt creation and comparison fail closed on package or receipt tampering', () => {
  const base = root();
  const runId = sealedRun(base);
  fs.writeFileSync(path.join(base, '.citable', 'runs', runId, 'findings.json'), '[]\n ');
  assert.throws(() => createAcceptanceReceipt(base, { runId }), /integrity failed/);

  const cleanRun = sealedRun(base);
  const receipt = createAcceptanceReceipt(base, { runId: cleanRun }).receipt;
  const tampered = structuredClone(receipt);
  tampered.external_systems.cdn = 'unrecorded-change';
  assert.equal(verifyAcceptanceReceipt(tampered).valid, false);
  assert.throws(() => compareAcceptanceReceipts(receipt, tampered), /receipt integrity failed/);
  assert.throws(() => createAcceptanceReceipt(base, { runId: cleanRun, context: { access_token: 'secret' } }), /context violates contract/);
});

test('receipt creation rejects checksum traversal and run identity mismatch', () => {
  const base = root();
  const runId = sealedRun(base);
  const runDir = path.join(base, '.citable', 'runs', runId);
  const checksums = readJson(path.join(runDir, 'checksums.json'));
  checksums['../../outside.json'] = 'a'.repeat(64);
  writeJson(path.join(runDir, 'checksums.json'), checksums);
  assert.throws(() => createAcceptanceReceipt(base, { runId }), /escapes the run package/);

  const other = sealedRun(base);
  const manifestFile = path.join(base, '.citable', 'runs', other, 'manifest.json');
  const manifest = readJson(manifestFile);
  manifest.run_id = 'DIFFERENT-RUN';
  writeJson(manifestFile, manifest);
  assert.throws(() => createAcceptanceReceipt(base, { runId: other }), /does not match requested run/);
});
