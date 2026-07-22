import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReleaseManifest } from '../../src/release/governance.js';
import { collectDeploymentReceipts, observationFromResponse } from '../../scripts/collect-deployment-receipts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMIT = 'b'.repeat(40);

function packagedSkillFileCount() {
  const countFiles = (directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .length;
  return countFiles(path.join(ROOT, 'skill'))
    + countFiles(path.join(ROOT, 'schemas'))
    + 2; // Generated VERSION and scripts/README.md; manifest.json is excluded.
}

function releaseFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-receipt-collector-'));
  for (const relative of ['package.json', 'package-lock.json', 'skill/SKILL.md', 'README.md', 'CHANGELOG.md', 'docs/ROADMAP.md', 'release/surfaces.json']) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), target);
  }
  fs.mkdirSync(path.join(root, 'dist', 'universal'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'universal', 'manifest.json'), JSON.stringify({
    providers: { fixture: { files: packagedSkillFileCount() } },
  }));
  return root;
}

const COLLECTOR = {
  identity: 'test-operator',
  version: 'citable/test',
  method: 'node-fetch-direct',
  request_identity: 'publisher',
  region: 'test-local',
};

function fakeFetch(manifest, { corruptLlms = false } = {}) {
  const bySurface = new Map(manifest.controlled_surfaces.map((surface) => [surface.url, surface]));
  const projections = new Map(manifest.projections.map((item) => [item.projection_id, item]));
  return async (url) => {
    const surface = bySurface.get(url);
    assert.ok(surface, `unexpected probe URL: ${url}`);
    const expected = projections.get(surface.projection_id);
    let body = Buffer.from('<html>resource page</html>');
    const headers = new Map([['content-type', 'text/html']]);
    if (surface.verification_method === 'exact_response_body') {
      body = Buffer.from(corruptLlms ? 'tampered body' : `llms body for ${expected.sha256}`);
    } else {
      headers.set(surface.verification_header, expected.sha256);
    }
    return {
      status: 200,
      url,
      headers,
      arrayBuffer: async () => body,
    };
  };
}

test('observationFromResponse captures status, lowercased headers, and body hash', () => {
  const surface = { surface_id: 'S', url: 'https://example.test/x' };
  const response = { status: 200, url: 'https://example.test/x', headers: new Map([['X-Header', 'v']]) };
  const observation = observationFromResponse(surface, response, Buffer.from('abc'), COLLECTOR, '2026-07-22T00:00:00Z');
  assert.equal(observation.http.headers['x-header'], 'v');
  assert.equal(observation.response_hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(observation.http.redirect_chain.length, 0);
});

test('collects schema-valid receipts for every controlled surface', async () => {
  const root = releaseFixtureRoot();
  const { manifest } = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-22T09:00:00Z' });
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-receipts-'));
  const results = await collectDeploymentReceipts(manifest, outputDir, COLLECTOR, fakeFetch(manifest));
  assert.equal(results.length, manifest.controlled_surfaces.length);
  for (const result of results) {
    const receipt = JSON.parse(fs.readFileSync(result.file, 'utf8'));
    assert.equal(receipt.manifest_hash, manifest.manifest_hash);
    assert.equal(receipt.collector.identity, 'test-operator');
  }
  // The header surface matches its projection hash; the body surface hashes a
  // fake body, so it must be contradictory — never silently verified.
  const byId = Object.fromEntries(results.map((item) => [item.surface_id, item.status]));
  assert.equal(byId['nebula-citable-resource'], 'verified');
  assert.equal(byId['nebula-llms-txt'], 'contradictory');
});

test('a body that matches the projection byte-for-byte verifies', async () => {
  const root = releaseFixtureRoot();
  const generated = generateReleaseManifest(root, { commit: COMMIT, generatedAt: '2026-07-22T09:00:00Z' });
  const manifest = generated.manifest;
  const llmsBody = Buffer.from(generated.generated['release/llms.txt']);
  const surface = manifest.controlled_surfaces.find((item) => item.surface_id === 'nebula-llms-txt');
  const exactFetch = async () => ({ status: 200, url: surface.url, headers: new Map(), arrayBuffer: async () => llmsBody });
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-receipts-'));
  const results = await collectDeploymentReceipts({ ...manifest, controlled_surfaces: [surface] }, outputDir, COLLECTOR, exactFetch);
  assert.equal(results[0].status, 'verified');
});
