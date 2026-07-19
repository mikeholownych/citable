import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  createDeploymentReceipt,
  generateReleaseManifest,
  initializeReleaseState,
  releaseDwellStatus,
  transitionRelease,
  validateReleaseManifest,
  verifyDeploymentReceipt,
  verifyRepositoryBinding,
} from '../../src/release/governance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMIT = 'a'.repeat(40);

function releaseFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-release-governance-'));
  for (const relative of ['package.json', 'package-lock.json', 'skill/SKILL.md', 'README.md', 'CHANGELOG.md', 'docs/ROADMAP.md', 'release/surfaces.json']) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), target);
  }
  fs.mkdirSync(path.join(root, 'dist', 'universal'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'universal', 'manifest.json'), JSON.stringify({ providers: { fixture: { files: 85 } } }));
  return root;
}

test('canonical release manifest is deterministic for fixed inputs and binds generated projections', () => {
  const root = releaseFixtureRoot();
  const first = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  const second = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  assert.deepEqual(first, second);
  assert.equal(first.manifest.commit, COMMIT);
  assert.equal(first.manifest.facts.detectors, 123);
  assert.equal(first.manifest.facts.distribution_files_per_provider, 85);
  assert.ok(first.manifest.projections.some((item) => item.projection_id === 'llms-txt'));
  assert.match(first.generated['release/llms.txt'], /Release commit: a{40}/);
});

test('release validation fails closed on projection tampering and documentation fact drift', () => {
  const root = releaseFixtureRoot();
  fs.writeFileSync(path.join(root, 'docs', 'ROADMAP.md'), fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8').replace('| Registries | 27 schema-validated |', '| Registries | 19 schema-validated |'));
  const generated = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  assert.equal(validateReleaseManifest(root, generated.manifest).ok, false, 'roadmap registry count drift must be exposed');
  fs.writeFileSync(path.join(root, 'docs', 'ROADMAP.md'), fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8').replace('| Registries | 19 schema-validated |', `| Registries | ${generated.manifest.facts.registries} schema-validated |`));
  const current = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  assert.equal(validateReleaseManifest(root, current.manifest).ok, true);
  fs.appendFileSync(path.join(root, 'README.md'), '\nunauthorized projection edit\n');
  const result = validateReleaseManifest(root, current.manifest);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('npm-readme')));
});

function validReceipt(manifest, surface, at = '2026-07-19T10:00:00Z') {
  const expected = manifest.projections.find((item) => item.projection_id === surface.projection_id);
  const headers = { 'content-type': 'text/plain' };
  if (surface.verification_method === 'response_header') headers[surface.verification_header] = expected.sha256;
  return createDeploymentReceipt(manifest, {
    surface_id: surface.surface_id,
    url: surface.url,
    observed_projection_hash: expected.sha256,
    response_hash: surface.verification_method === 'exact_response_body' ? expected.sha256 : 'b'.repeat(64),
    http: { status: 200, final_url: surface.url, redirect_chain: [], headers },
    collector: { identity: 'nebula-release-probe', version: '1.0.0', method: 'https_fetch', request_identity: 'CitableReleaseProbe/1.0', region: 'us-east' },
    collected_at: at,
    expires_at: '2026-07-20T10:00:00Z',
  });
}

test('finalization requires one valid unexpired owner-controlled receipt per required surface', () => {
  const { manifest } = generateReleaseManifest(releaseFixtureRoot(), { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  let state = initializeReleaseState(manifest, { actor: 'maintainer', at: '2026-07-19T09:00:00Z' });
  assert.throws(() => transitionRelease(state, 'published_unfinalized', { actor: 'maintainer', reason: 'publish' }), /phase-one/);
  state = transitionRelease(state, 'published_unfinalized', { actor: 'maintainer', reason: 'artifacts published', phaseOne: { ok: true, manifest_hash: manifest.manifest_hash }, at: '2026-07-19T09:30:00Z' });
  const receipts = manifest.controlled_surfaces.map((surface) => validReceipt(manifest, surface));
  assert.throws(() => transitionRelease(state, 'finalized', { actor: 'maintainer', reason: 'finalize', manifest, receipts: receipts.slice(0, 1), at: '2026-07-19T11:00:00Z' }), /exactly one/);
  const finalized = transitionRelease(state, 'finalized', { actor: 'maintainer', reason: 'controlled surfaces verified', manifest, receipts, at: '2026-07-19T11:00:00Z' });
  assert.equal(finalized.state, 'finalized');
  assert.equal(finalized.receipt_refs.length, 2);
  assert.throws(() => transitionRelease(finalized, 'withdrawn', { actor: 'maintainer', reason: 'later drift' }), /terminal/);
});

test('contradictory, tampered, and expired receipts fail closed', () => {
  const { manifest } = generateReleaseManifest(releaseFixtureRoot(), { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  const receipt = validReceipt(manifest, manifest.controlled_surfaces[0]);
  assert.equal(receipt.verification_method, manifest.controlled_surfaces[0].verification_method);
  assert.equal(verifyDeploymentReceipt(manifest, receipt, { at: new Date('2026-07-19T11:00:00Z') }).ok, true);
  assert.equal(verifyDeploymentReceipt(manifest, receipt, { at: new Date('2026-07-21T00:00:00Z') }).ok, false);
  const tampered = { ...receipt, observed_projection_hash: 'c'.repeat(64) };
  assert.equal(verifyDeploymentReceipt(manifest, tampered).ok, false);
  const authorityEscalated = structuredClone(receipt);
  authorityEscalated.authority.source_authority = 'independently_controlled';
  authorityEscalated.receipt_hash = 'e'.repeat(64);
  assert.equal(verifyDeploymentReceipt(manifest, authorityEscalated).ok, false);
  const contradictoryInput = { ...receipt, surface_id: receipt.surface_id, url: receipt.url, observed_projection_hash: null, http: structuredClone(receipt.http) };
  contradictoryInput.http.headers[receipt.verification_header] = 'd'.repeat(64);
  const contradictory = createDeploymentReceipt(manifest, contradictoryInput);
  assert.equal(contradictory.verification_status, 'contradictory');
});

test('published_unfinalized has bounded dwell and explicit terminal resolution', () => {
  const { manifest } = generateReleaseManifest(releaseFixtureRoot(), { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  let state = initializeReleaseState(manifest, { actor: 'maintainer', at: '2026-07-19T09:00:00Z', maxDwellHours: 2 });
  state = transitionRelease(state, 'published_unfinalized', { actor: 'maintainer', reason: 'artifacts published', phaseOne: { ok: true, manifest_hash: manifest.manifest_hash }, at: '2026-07-19T10:00:00Z' });
  assert.equal(releaseDwellStatus(state, new Date('2026-07-19T11:59:59Z')).expired, false);
  assert.throws(() => transitionRelease(state, 'withdrawn', { actor: 'maintainer', reason: 'deployment failed', at: '2026-07-19T11:00:00Z' }), /deadline/);
  const withdrawn = transitionRelease(state, 'withdrawn', { actor: 'maintainer', reason: 'deployment remained contradictory', evidenceRefs: ['RECEIPT-FAILED'], at: '2026-07-19T12:00:00Z' });
  assert.equal(withdrawn.state, 'withdrawn');
  assert.equal(withdrawn.resolution_reason, 'deployment remained contradictory');
});

test('release state is hash-bound and cannot finalize after dwell expiry', () => {
  const { manifest } = generateReleaseManifest(releaseFixtureRoot(), { commit: COMMIT, generatedAt: '2026-07-19T09:00:00Z' });
  let state = initializeReleaseState(manifest, { actor: 'maintainer', at: '2026-07-19T09:00:00Z', maxDwellHours: 1 });
  const tampered = { ...state, max_dwell_hours: 48 };
  assert.throws(() => transitionRelease(tampered, 'published_unfinalized', { actor: 'maintainer', reason: 'publish', phaseOne: { ok: true, manifest_hash: manifest.manifest_hash } }), /state hash/);
  state = transitionRelease(state, 'published_unfinalized', { actor: 'maintainer', reason: 'publish', phaseOne: { ok: true, manifest_hash: manifest.manifest_hash }, at: '2026-07-19T10:00:00Z' });
  const receipts = manifest.controlled_surfaces.map((surface) => validReceipt(manifest, surface));
  assert.throws(() => transitionRelease(state, 'finalized', { actor: 'maintainer', reason: 'late finalize', manifest, receipts, at: '2026-07-19T11:00:00Z' }), /deadline expired/);
});

test('release repository binding refuses mismatched commits and tracked drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-release-binding-'));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'canonical\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(verifyRepositoryBinding(root, commit).ok, true);
  assert.equal(verifyRepositoryBinding(root, 'b'.repeat(40)).ok, false);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'drift\n');
  assert.deepEqual(verifyRepositoryBinding(root, commit).failures, ['tracked working tree is not clean']);
});
