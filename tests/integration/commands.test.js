import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { validate } from '../../src/commands/validate.js';
import { mapClaims } from '../../src/commands/mapClaims.js';
import { substantiate } from '../../src/commands/substantiate.js';
import { inspect } from '../../src/commands/inspect.js';
import { schemaCommand } from '../../src/commands/schemaCmd.js';
import { compareSnapshots } from '../../src/commands/compareSnapshots.js';
import { readJson } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function project(registryFixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-int-'));
  init(dir);
  if (registryFixture) {
    for (const f of fs.readdirSync(path.join(FIX, registryFixture))) {
      fs.copyFileSync(path.join(FIX, registryFixture, f), path.join(dir, '.citable', f));
    }
  }
  return dir;
}

test('init creates valid registries and does not overwrite on rerun', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-init-'));
  const r1 = init(dir);
  assert.ok(r1.created.includes('config.yaml'));
  assert.ok(r1.created.includes('crawlers.yaml'));
  // registries validate
  const v = validate(dir, { mode: 'registries' });
  return v.then((res) => {
    assert.equal(res.ok, true, res.problems.join('; '));
    const r2 = init(dir);
    assert.deepEqual(r2.created, []);
    assert.ok(r2.skipped.length >= 10);
  });
});

test('audit on clean fixture produces evidence package with manifest, findings, report, checksums', async () => {
  const dir = project('registries-good');
  const r = await audit(dir, { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test', refDate: '2026-07-18' });
  assert.ok(fs.existsSync(path.join(r.dir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(r.dir, 'findings.json')));
  assert.ok(fs.existsSync(path.join(r.dir, 'summary.json')));
  assert.ok(fs.existsSync(path.join(r.dir, 'report.md')));
  assert.ok(fs.existsSync(path.join(r.dir, 'checksums.json')));
  assert.ok(fs.existsSync(path.join(r.dir, 'robots', 'robots.txt')));
  const manifest = readJson(path.join(r.dir, 'manifest.json'));
  assert.ok(manifest.detectors_run.length > 30);
  assert.ok(['completed', 'completed_with_warnings', 'incomplete'].includes(manifest.status));
  const report = fs.readFileSync(path.join(r.dir, 'report.md'), 'utf8');
  assert.ok(report.includes('Nothing in this report guarantees'), 'no-guarantee language present');
  // no critical findings on clean fixture
  assert.ok(!r.findings.some((f) => f.classification.severity === 'critical'));
});

test('audit on broken fixture surfaces criticals and separates deterministic from heuristic', async () => {
  const dir = project(null);
  const r = await audit(dir, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test', refDate: '2026-07-18' });
  assert.ok(r.summary.by_severity.critical >= 1, 'criticals found');
  assert.ok(r.summary.deterministic_observations > 0);
  assert.ok(r.summary.semantic_or_heuristic > 0);
  for (const f of r.findings) {
    assert.ok(f.observation.evidence.length >= 1, `finding ${f.finding_id} lacks evidence`);
    assert.ok(f.remediation.preferred, 'remediation present');
    assert.ok(f.verification.method, 'verification present');
  }
});

test('registry-only audit reports incomplete site coverage instead of claiming success', async () => {
  const dir = project('registries-bad');
  const r = await audit(dir, { refDate: '2026-07-18' });
  assert.ok(r.manifest.incomplete_checks.length >= 1);
  assert.equal(r.manifest.status, 'incomplete');
  assert.ok(r.findings.some((f) => f.detector_id === 'CLAIM-001'));
});

test('map-claims extracts material candidates, requires review for regulated types, writes only with --write', async () => {
  const dir = project(null);
  const dry = await mapClaims(dir, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test' });
  assert.ok(dry.candidates.length >= 3, `found ${dry.candidates.length}`);
  assert.equal(dry.written, 0);
  assert.ok(dry.candidates.some((c) => c.review_required), 'regulated claim flagged for review');
  const wet = await mapClaims(dir, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test', write: true });
  assert.ok(wet.written > 0);
  const { registries } = await import('../../src/registries/index.js').then((m) => m.loadRegistries(dir));
  assert.ok(registries.claims.entries.length === wet.written);
  assert.ok(registries.claims.entries.every((c) => ['candidate', 'review_required'].includes(c.status)), 'no auto-verified claims');
});

test('substantiate: expired evidence invalidates, no silent upgrades, fail-closed outcomes', () => {
  const dir = project('registries-bad');
  const r = substantiate(dir, { refDate: '2026-07-18' });
  const byId = Object.fromEntries(r.assessments.map((a) => [a.claim_id, a]));
  assert.equal(byId['CLAIM-NOEV'].outcome, 'insufficient_evidence');
  assert.ok(byId['CLAIM-NOEV'].required_input.length >= 3, 'required inputs listed');
  assert.equal(byId['CLAIM-EXPIRED-EV'].outcome, 'insufficient_evidence');
  assert.equal(byId['CLAIM-PAST-EXPIRY'].outcome, 'expired');
  assert.equal(byId['CLAIM-CONTRADICTED'].outcome, 'contradicted');
  assert.equal(byId['CLAIM-SEC-NOREVIEW'].outcome, 'review_required');
  assert.ok(['unverified', 'candidate'].includes(byId['CLAIM-OPINION-VERIFIED'].outcome));
  // write applies downgrades but never upgrades
  const w = substantiate(dir, { refDate: '2026-07-18', write: true });
  assert.ok(w.registryDiff.changed.includes('CLAIM-PAST-EXPIRY'));
});

test('substantiate preserves legitimately verified claims (good fixture)', () => {
  const dir = project('registries-good');
  const r = substantiate(dir, { refDate: '2026-07-18' });
  const a = r.assessments.find((x) => x.claim_id === 'CLAIM-ENFORCE');
  assert.equal(a.outcome, 'verified');
});

test('inspect profiles a single page with intent, entities, claims, ambiguity', async () => {
  const dir = project('registries-good');
  const r = await inspect(dir, '/products/gatekeeper/', { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test', refDate: '2026-07-18' });
  assert.equal(r.status, 200);
  assert.ok(r.entities.some((e) => e.name === 'Gatekeeper'));
  assert.ok(r.claims.some((c) => c.claim_id === 'CLAIM-ENFORCE'));
  assert.equal(r.primary_intent, 'vendor evaluation of runtime authorization');
  assert.ok(Array.isArray(r.unresolved_ambiguity));
});

test('schema command proposes registry-derived JSON-LD and blocks incomplete entities', async () => {
  const dir = project('registries-good');
  const r = await schemaCommand(dir, { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test', refDate: '2026-07-18' });
  const gk = r.proposals.find((p) => p.entity_id === 'ENT-GATEKEEPER');
  assert.ok(gk, 'Gatekeeper proposal exists');
  assert.equal(gk.jsonld['@id'], 'https://example.test/products/gatekeeper/#product'.replace('#product', '#product')); // stable id present
  assert.ok(gk.jsonld['@id'].startsWith('https://example.test/products/gatekeeper/#'));
  assert.equal(gk.jsonld.name, 'Gatekeeper');
  assert.ok(!('aggregateRating' in gk.jsonld), 'no fabricated ratings');
  // incomplete entity → blocked, not invented
  const { loadRegistries, saveRegistry } = await import('../../src/registries/index.js');
  const { registries } = loadRegistries(dir);
  registries.entities.entries.push({ entity_id: 'ENT-VAGUE', canonical_name: 'Vague Concept', entity_type: 'proprietary_concept', status: 'active' });
  saveRegistry(dir, 'entities', registries.entities);
  const r2 = await schemaCommand(dir, { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test', refDate: '2026-07-18' });
  const blocked = r2.blocked.find((b) => b.entity_id === 'ENT-VAGUE');
  assert.ok(blocked);
  assert.ok(blocked.required_input.includes('canonical_url'));
});

test('compare-snapshots detects regression and resolution between runs', async () => {
  const dir = project(null);
  await audit(dir, { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test', refDate: '2026-07-18' });
  await new Promise((r) => setTimeout(r, 2000)); // distinct run ids (second precision; 2s for macOS CI)
  await audit(dir, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test', refDate: '2026-07-18' });
  const cmp = compareSnapshots(dir, {});
  assert.ok(cmp.summary.new_findings > 0, 'regressions detected');
  assert.ok(cmp.summary.regression_critical_or_high > 0);
});

test('validate registries fails on bad structural data', async () => {
  const dir = project(null);
  fs.writeFileSync(path.join(dir, '.citable', 'claims.yaml'), 'version: 1\nkind: claims\nentries:\n  - claim_id: X\n    claim: too short claim\n    claim_type: nonsense_type\n    status: verified\n');
  const r = await validate(dir, { mode: 'registries' });
  assert.equal(r.ok, false);
  assert.ok(r.problems.length > 0);
});

test('CLAIM-009 + substantiate entailment gate: verified requires semantic support assessment', async () => {
  const dir = project('registries-good');
  // good fixture: assessment present → no CLAIM-009, verified preserved
  let r = substantiate(dir, { refDate: '2026-07-18' });
  assert.equal(r.assessments.find((a) => a.claim_id === 'CLAIM-ENFORCE').outcome, 'verified');
  const { loadRegistries, saveRegistry } = await import('../../src/registries/index.js');
  const { registries } = loadRegistries(dir);
  // strip the assessment → substantiate demands entailment review, no silent verified
  delete registries.claims.entries[0].support_assessment;
  saveRegistry(dir, 'claims', registries.claims);
  r = substantiate(dir, { refDate: '2026-07-18' });
  const a = r.assessments.find((x) => x.claim_id === 'CLAIM-ENFORCE');
  assert.equal(a.outcome, 'review_required');
  assert.ok(a.required_input.includes('support_assessment with named assessor'));
  // contradicted assessment → contradicted outcome regardless of evidence linkage
  const { registries: reg2 } = loadRegistries(dir);
  reg2.claims.entries[0].support_assessment = { status: 'contradicted', assessor: 'SME Reviewer' };
  saveRegistry(dir, 'claims', reg2.claims);
  r = substantiate(dir, { refDate: '2026-07-18' });
  assert.equal(r.assessments.find((x) => x.claim_id === 'CLAIM-ENFORCE').outcome, 'contradicted');
});
