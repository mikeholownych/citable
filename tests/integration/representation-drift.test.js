import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observe } from '../../src/commands/observe.js';
import { generateReleaseManifest } from '../../src/release/governance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('representation drift records direct and cache-busted evidence without gate authority', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-representation-'));
  const { manifest, generated } = generateReleaseManifest(ROOT, { commit: 'a'.repeat(40), generatedAt: '2026-07-19T09:00:00Z' });
  const manifestFile = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const surface = manifest.controlled_surfaces.find((item) => item.projection_id === 'llms-txt');
  const expectedBody = generated['release/llms.txt'];
  const result = await observe(root, 'representation', {
    input: manifestFile,
    target: surface.url,
    region: 'test-region',
    fetchUrl: async (url) => ({ url, status: 200, headers: { 'content-type': 'text/plain' }, body: url.includes('citable_manifest=') ? 'stale representation' : expectedBody, redirectChain: [] }),
  });
  assert.equal(result.observations.length, 2);
  assert.equal(result.observations[0].data.representation_state, 'consistent');
  assert.equal(result.observations[1].data.representation_state, 'divergent');
  for (const item of result.observations) {
    assert.equal(item.data.authority_label, 'external_unverified');
    assert.equal(item.data.gates_release_finalization, false);
    assert.equal(item.authority.authenticity_status, 'unverified');
  }
  assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
});

test('transformed surfaces require declared projection-hash evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-representation-header-'));
  const { manifest } = generateReleaseManifest(ROOT, { commit: 'a'.repeat(40), generatedAt: '2026-07-19T09:00:00Z' });
  const manifestFile = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const surface = manifest.controlled_surfaces.find((item) => item.verification_method === 'response_header');
  const expected = manifest.projections.find((item) => item.projection_id === surface.projection_id);
  let call = 0;
  const result = await observe(root, 'representation', {
    input: manifestFile,
    target: surface.url,
    fetchUrl: async (url) => ({
      url,
      status: 200,
      headers: call++ === 0 ? {} : { [surface.verification_header]: expected.sha256 },
      body: '<html>Rendered projection</html>',
      redirectChain: [],
    }),
  });
  assert.equal(result.observations[0].data.representation_state, 'insufficient_evidence');
  assert.equal(result.observations[0].data.observed_projection_hash, null);
  assert.equal(result.observations[1].data.representation_state, 'consistent');
  assert.equal(result.observations[1].data.observed_projection_hash, expected.sha256);
  assert.notEqual(result.observations[1].data.observed_response_hash, expected.sha256);
});
