import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { applySeed } from '../../src/registries/seed.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';

const FIXTURES_SEEDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/seeds');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'citable-seed-'));
}

test('init --seed populates entries as unverified with seededFrom provenance', () => {
  const root = tmpRoot();
  init(root, { seed: 'saas-pricing' });
  const { registries } = loadRegistries(root);
  assert.ok(registries.claims.entries.length > 0);
  assert.ok(registries.entities.entries.length > 0);
  for (const c of registries.claims.entries) {
    assert.equal(c.status, 'unverified');
    assert.equal(c.provenance.seededFrom.seedName, 'saas-pricing');
    assert.equal(c.provenance.seededFrom.seedVersion, '1.0.0');
    assert.ok(c.provenance.seededFrom.importedAt);
  }
  for (const e of registries.entities.entries) {
    assert.equal(e.status, 'unverified');
    assert.equal(e.provenance.seededFrom.seedName, 'saas-pricing');
  }
});

test('re-applying the same seed does not duplicate or clobber a user-edited entry, even with force', () => {
  const root = tmpRoot();
  init(root, { seed: 'saas-pricing' });
  const { registries } = loadRegistries(root);
  const before = registries.claims.entries.length;
  registries.claims.entries[0].status = 'verified'; // simulate the user's own edit
  delete registries.claims.entries[0].provenance; // no longer carries seededFrom
  saveRegistry(root, 'claims', registries.claims);

  const r2 = applySeed(root, 'saas-pricing', { force: true });
  const { registries: after } = loadRegistries(root);
  assert.equal(after.claims.entries.length, before); // no duplicates
  assert.equal(after.claims.entries[0].status, 'verified'); // untouched
  assert.ok(r2.registriesTouched.claims.skipped >= 1);
});

test('unknown seed name fails closed without touching any registry file', () => {
  const root = tmpRoot();
  init(root);
  const claimsFile = path.join(root, '.citable', 'claims.yaml');
  const before = fs.readFileSync(claimsFile, 'utf8');
  assert.throws(() => applySeed(root, 'does-not-exist'), /unknown seed/);
  assert.equal(fs.readFileSync(claimsFile, 'utf8'), before);
});

test('a seed entry that tries to ship pre-verified is forced back to unverified, with a warning', () => {
  const root = tmpRoot();
  init(root);
  const r = applySeed(root, 'bad-verified-seed', { seedsDir: FIXTURES_SEEDS_DIR });
  const { registries } = loadRegistries(root);
  const seeded = registries.claims.entries.find((c) => c.claim_id === 'CLAIM-SEED-BAD');
  assert.equal(seeded.status, 'unverified');
  assert.ok(r.warnings.some((w) => /forced to "unverified"/.test(w)));
});
