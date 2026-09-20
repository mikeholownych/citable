import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun } from '../../src/evidence/run.js';
import { loadVerifiedRun } from '../../src/shared/verifiedRunLoader.js';
import { readJson, sha256File, writeJson } from '../../src/shared/io.js';

function root() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sealed-run-'));
  fs.mkdirSync(path.join(dir, '.citable', 'runs'), { recursive: true });
  return dir;
}

function finding(runId, invalid = false) {
  if (invalid) return { finding_id: 'broken' };
  return {
    finding_id: 'F-SEALED-1', detector_id: 'TECH-001', run_id: runId,
    timestamp: '2026-09-20T00:00:00Z', discipline: ['seo'],
    subject: { type: 'site', identifier: 'fixture' },
    observation: { summary: 'Observed fixture condition', evidence: ['fixture'] },
    classification: { finding_type: 'deterministic_observation', severity: 'low', confidence: 'high', deterministic: true, impact: { citation: 'low' } },
    remediation: { preferred: 'Review', review_required: false },
    verification: { method: 'fixture' }, status: { state: 'open' },
  };
}

function makeRun(options = {}) {
  const project = root();
  const run = createRun(project, { command: 'sealed fixture', target: { kind: 'fixture', location: 'local' } });
  run.writeArtifact('findings.json', [finding(run.runId, options.invalidFinding)]);
  if (options.coverage !== false) {
    run.writeArtifact('coverage.json', {
      schema_version: 1, normalization_version: 'url-identity-v1',
      requested_scope: { start_url: 'https://fixture.test/', origin: 'https://fixture.test/', max_pages: 500, time_budget_seconds: 1800 },
      discovery: { status: 'complete', methods: ['fixture'], limitations: [] },
      populations: { discovered: 1, eligible: 1, excluded: 0, attempted: 1, retrieved: 1, valid_resource: 1, evaluated: 1, valid_but_unevaluated: 0, failed: 0, indeterminate: 0, unvisited: 0 },
      resources: [{ resource_id: 'R-1', normalized_url: 'https://fixture.test/', original_urls: ['https://fixture.test/'], state: 'evaluated', evaluation: {} }],
      stop_reason: 'frontier_exhausted', coverage_status: 'complete', reconciliation: { valid: true, errors: [] }, limitations: [],
    });
  }
  if (!options.noFinalize) run.finalize('completed');
  return { project, run };
}

test('verified loader accepts a sealed run and validates findings and coverage', () => {
  const { run } = makeRun();
  const loaded = loadVerifiedRun(run.dir);
  assert.equal(loaded.verified, true);
  assert.equal(loaded.integrity_mode, 'sealed');
  assert.equal(loaded.findings.length, 1);
  assert.equal(loaded.coverage.coverage_status, 'complete');
});

test('unexpected, missing, modified, and symlink artifacts invalidate a sealed package', () => {
  const extra = makeRun().run;
  fs.writeFileSync(path.join(extra.dir, 'extra.json'), '{}');
  assert.throws(() => loadVerifiedRun(extra.dir), /unexpected files/i);

  const missing = makeRun().run;
  fs.rmSync(path.join(missing.dir, 'coverage.json'));
  assert.throws(() => loadVerifiedRun(missing.dir), /missing files|checksum/i);

  const modified = makeRun().run;
  fs.appendFileSync(path.join(modified.dir, 'findings.json'), '\n');
  assert.throws(() => loadVerifiedRun(modified.dir), /tampered|checksum/i);

  const linked = makeRun().run;
  fs.symlinkSync(path.join(linked.dir, 'findings.json'), path.join(linked.dir, 'alias.json'));
  assert.throws(() => loadVerifiedRun(linked.dir), /symbolic link/i);
});

test('invalid finding schema and unsupported coverage schema fail closed', () => {
  const badFinding = makeRun({ invalidFinding: true }).run;
  assert.throws(() => loadVerifiedRun(badFinding.dir), /finding.*schema/i);

  const badCoverage = makeRun().run;
  const coveragePath = path.join(badCoverage.dir, 'coverage.json');
  const coverage = readJson(coveragePath);
  coverage.schema_version = 99;
  writeJson(coveragePath, coverage);
  const checksumsPath = path.join(badCoverage.dir, 'checksums.json');
  const checksums = readJson(checksumsPath);
  checksums['coverage.json'] = sha256File(coveragePath);
  writeJson(checksumsPath, checksums);
  assert.throws(() => loadVerifiedRun(badCoverage.dir), /coverage\.json.*schema/i);
});

test('legacy packages require explicit mode and remain indeterminate', () => {
  const { run } = makeRun({ coverage: false });
  assert.throws(() => loadVerifiedRun(run.dir), /coverage\.json|legacy/i);
  const loaded = loadVerifiedRun(run.dir, { allowLegacy: true, requireCoverage: false });
  assert.equal(loaded.legacy, true);
  assert.equal(loaded.coverage, null);
  assert.equal(loaded.coverage_status, 'indeterminate');
});

test('completed package without durable checksum seal is not consumable', () => {
  const { project, run } = makeRun({ noFinalize: true });
  writeJson(path.join(run.dir, 'manifest.json'), { status: 'completed' });
  assert.throws(() => loadVerifiedRun(run.dir), /checksums|manifest|missing/i);
  assert.ok(project);
});

test('unknown manifest schema versions are rejected before legacy fallback', () => {
  const { run } = makeRun({ noFinalize: true });
  const manifest = run.manifest;
  writeJson(path.join(run.dir, 'manifest.json'), { ...manifest, schema_version: 99 });
  assert.throws(
    () => loadVerifiedRun(run.dir, { allowLegacy: true, requireCoverage: false }),
    (error) => error.code === 'MANIFEST_SCHEMA_UNSUPPORTED' && /schema_version/.test(error.message),
  );
});
