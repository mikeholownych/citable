import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadRegistries, checkReferentialIntegrity, saveRegistry, diffRegistries } from '../../src/registries/index.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function tmpProject(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-test-'));
  fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, '.citable', f));
    }
  }
  return dir;
}

test('good registries load without schema problems and pass integrity', () => {
  const root = tmpProject('registries-good');
  const { registries, problems } = loadRegistries(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(checkReferentialIntegrity(registries), []);
  assert.equal(registries.claims.entries.length, 1);
});

test('referential integrity catches dangling references and duplicates', () => {
  const root = tmpProject('registries-good');
  const { registries } = loadRegistries(root);
  registries.claims.entries.push({ claim_id: 'CLAIM-ENFORCE', claim: 'dup', claim_type: 'factual', status: 'candidate' });
  registries.pages.entries[0].published_claims = ['CLAIM-MISSING'];
  const problems = checkReferentialIntegrity(registries);
  assert.ok(problems.some((p) => p.includes('duplicate id CLAIM-ENFORCE')));
  assert.ok(problems.some((p) => p.includes('unknown claims id "CLAIM-MISSING"')));
});

test('schema validation rejects invalid claim entries', () => {
  const bad = { version: 1, kind: 'claims', entries: [{ claim_id: 'X', claim: 'y '.repeat(5), claim_type: 'not_a_type', status: 'verified' }] };
  const { valid, errors } = validateAgainst('claim.schema.json', bad);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('saveRegistry preserves prior content in history and refuses invalid data', () => {
  const root = tmpProject('registries-good');
  const { registries } = loadRegistries(root);
  registries.claims.entries[0].status = 'expired';
  saveRegistry(root, 'claims', registries.claims);
  const hist = path.join(root, '.citable', 'snapshots', 'registry-history');
  assert.ok(fs.existsSync(hist) && fs.readdirSync(hist).length === 1, 'history snapshot written');
  assert.throws(() => saveRegistry(root, 'claims', { version: 1, kind: 'claims', entries: [{ claim_id: 'B A D I D…', claim: 'x', claim_type: 'factual', status: 'candidate' }] }), /refusing to save/);
});

test('diffRegistries reports added, removed, changed', () => {
  const before = { entries: [{ claim_id: 'A', v: 1 }, { claim_id: 'B', v: 1 }] };
  const after = { entries: [{ claim_id: 'A', v: 2 }, { claim_id: 'C', v: 1 }] };
  const d = diffRegistries(before, after, 'claim_id');
  assert.deepEqual(d.added, ['C']);
  assert.deepEqual(d.removed, ['B']);
  assert.deepEqual(d.changed, ['A']);
});

test('finding schema accepts a conforming finding and rejects a non-conforming one', () => {
  const good = {
    finding_id: 'F-abc123', detector_id: 'TECH-001', run_id: 'r', timestamp: 't',
    discipline: ['seo'],
    subject: { type: 'url', identifier: 'https://x.test/' },
    observation: { summary: 's', evidence: ['e'] },
    classification: { finding_type: 'deterministic_observation', severity: 'critical', confidence: 'confirmed', deterministic: true, impact: { retrieval: 'high' } },
    remediation: { preferred: 'fix' },
    verification: { method: 'refetch' },
    status: { state: 'open' },
  };
  assert.equal(validateAgainst('finding.schema.json', good).valid, true);
  const bad = { ...good, classification: { ...good.classification, severity: 'catastrophic' } };
  assert.equal(validateAgainst('finding.schema.json', bad).valid, false);
});
