import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun } from '../../src/evidence/run.js';
import { exportArtifactPackage, importArtifactPackage, verifyArtifactPackage } from '../../src/artifacts/interchange.js';
import { readJson, sha256File, writeJson } from '../../src/shared/io.js';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-artifacts-'));
  fs.mkdirSync(path.join(root, '.citable', 'runs'), { recursive: true });
  return root;
}

function sealedRun(root) {
  const run = createRun(root, { command: 'artifact fixture', target: { kind: 'fixture', location: 'local' } });
  run.writeArtifact('nested/evidence.json', { observed: true });
  run.finalize('completed');
  return run;
}

test('artifact interchange exports, independently verifies, and imports canonical run bytes', () => {
  const sourceRoot = project();
  const run = sealedRun(sourceRoot);
  const exported = exportArtifactPackage(sourceRoot, { runId: run.runId, output: 'portable' });
  const verified = verifyArtifactPackage(exported.output);
  assert.equal(verified.valid, true);
  assert.equal(verified.manifest.run_id, run.runId);
  assert.deepEqual(verified.artifacts.map((item) => item.path), ['checksums.json', 'manifest.json', 'nested/evidence.json']);

  const targetRoot = project();
  const imported = importArtifactPackage(targetRoot, { input: exported.output });
  assert.equal(imported.status, 'imported');
  assert.equal(importArtifactPackage(targetRoot, { input: exported.output }).status, 'already_present');
  assert.deepEqual(
    fs.readFileSync(path.join(targetRoot, '.citable', 'runs', run.runId, 'manifest.json')),
    fs.readFileSync(path.join(run.dir, 'manifest.json')),
  );
  assert.equal(fs.existsSync(path.join(targetRoot, '.citable', 'runs', run.runId, 'citable-artifact.json')), false);
});

test('artifact interchange fails closed on tampering, unsealed files, unsafe paths, and collisions', () => {
  const root = project();
  const run = sealedRun(root);
  const output = exportArtifactPackage(root, { runId: run.runId, output: 'portable' }).output;
  fs.writeFileSync(path.join(output, 'nested', 'evidence.json'), '{"observed":false}\n');
  assert.throws(() => verifyArtifactPackage(output), /checksum mismatch/);

  const clean = exportArtifactPackage(root, { runId: run.runId, output: 'portable-clean' }).output;
  fs.writeFileSync(path.join(clean, 'unsealed.txt'), 'not declared');
  assert.throws(() => verifyArtifactPackage(clean), /unsealed/);
  fs.rmSync(path.join(clean, 'unsealed.txt'));

  const checksums = readJson(path.join(clean, 'checksums.json'));
  checksums['../escape'] = 'a'.repeat(64);
  writeJson(path.join(clean, 'checksums.json'), checksums);
  assert.throws(() => verifyArtifactPackage(clean), /unsafe checksum path|checksums hash mismatch/);

  const collisionSource = project();
  const collidingDir = path.join(collisionSource, '.citable', 'runs', run.runId);
  fs.mkdirSync(collidingDir, { recursive: true });
  fs.writeFileSync(path.join(collidingDir, 'manifest.json'), '{}\n');
  assert.throws(() => importArtifactPackage(collisionSource, { input: exportArtifactPackage(root, { runId: run.runId, output: 'portable-collision' }).output }), /run collision/);

  const unsafeRun = exportArtifactPackage(root, { runId: run.runId, output: 'portable-unsafe-run' }).output;
  const envelopeFile = path.join(unsafeRun, 'citable-artifact.json');
  const envelope = readJson(envelopeFile);
  envelope.run.run_id = '../outside';
  writeJson(envelopeFile, envelope);
  assert.throws(() => importArtifactPackage(project(), { input: unsafeRun }), /envelope invalid/);
});

test('artifact export refuses incomplete source packages and destinations inside the source run', () => {
  const root = project();
  const run = sealedRun(root);
  fs.writeFileSync(path.join(run.dir, 'unsealed.txt'), 'extra');
  assert.throws(() => exportArtifactPackage(root, { runId: run.runId, output: 'bad' }), /completeness failure/);
  fs.rmSync(path.join(run.dir, 'unsealed.txt'));
  assert.throws(() => exportArtifactPackage(root, { runId: run.runId, output: path.join('.citable', 'runs', run.runId, 'export') }), /inside the source/);
  assert.throws(() => exportArtifactPackage(root, { runId: '../outside', output: 'outside' }), /safe run id/);
});

test('artifact interchange distinguishes exporter version from historical run versions', () => {
  const root = project();
  const run = sealedRun(root);
  const manifestFile = path.join(run.dir, 'manifest.json');
  const manifest = readJson(manifestFile);
  manifest.tool_version = '1.11.0';
  manifest.skill_version = '1.11.0';
  writeJson(manifestFile, manifest);
  const checksumsFile = path.join(run.dir, 'checksums.json');
  const checksums = readJson(checksumsFile);
  checksums['manifest.json'] = sha256File(manifestFile);
  writeJson(checksumsFile, checksums);

  const exported = exportArtifactPackage(root, { runId: run.runId, output: 'historical' });
  assert.equal(exported.envelope.run.tool_version, '1.11.0');
  assert.notEqual(exported.envelope.producer.tool_version, exported.envelope.run.tool_version);
  assert.equal(verifyArtifactPackage(exported.output).valid, true);
});
