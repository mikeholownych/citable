import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { recheckComparability, verifyRemediation } from '../../src/commands/verifyRemediation.js';
import { readJson } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-verify-'));
  init(dir);
  for (const f of fs.readdirSync(path.join(FIX, 'registries-good'))) {
    fs.copyFileSync(path.join(FIX, 'registries-good', f), path.join(dir, '.citable', f));
  }
  return dir;
}

function site(dir) {
  const siteDir = path.join(dir, 'site');
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), `<!doctype html><html><head><title>Acme Contact</title></head><body>
<h1>Contact Acme</h1>
<form action="/lead" method="post">
  <label for="email">Email</label>
  <input id="email" type="email" name="email" />
  <button type="submit">Request demo</button>
</form>
</body></html>`);
  fs.writeFileSync(path.join(siteDir, 'pricing.html'), `<!doctype html><html><head><title>Acme Pricing</title></head><body>
<h1>Acme Pricing</h1>
<p>Simple, transparent plans for every team size.</p>
<button>Submit</button>
</body></html>`);
  return siteDir;
}

test('verify remediation closes the loop: finding -> applied patch -> detector re-run -> verified bundle', async (t) => {
  const dir = project();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const siteDir = site(dir);

  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  const beforeFinding = run.findings.find((f) => f.detector_id === 'CRO-007');
  assert.ok(beforeFinding, 'fixture must trigger CRO-007 before the patch');

  const res = await verifyRemediation(dir, {
    run: run.runId,
    finding: 'CRO-007',
    target: 'site/index.html',
    apply: true,
    baseUrl: 'https://example.test',
    refDate: '2026-09-08',
  });

  assert.equal(res.status, 'verified');
  assert.equal(res.verdict.resolved, true);
  assert.equal(res.patch.applied, true);
  assert.equal(res.patch.validation_passed, true);
  assert.ok(res.patch.before_sha256);
  assert.ok(res.patch.after_sha256);
  assert.notEqual(res.patch.before_sha256, res.patch.after_sha256);
  assert.ok(res.patch.rollback_snapshot, 'rollback snapshot must exist');
  assert.ok(res.verdict.before_finding_ids.length >= 1);
  assert.equal(res.verdict.after_finding_ids.length, 0);
  assert.deepEqual(res.verdict.new_regressions, []);
  assert.ok(fs.existsSync(path.join(dir, res.patch.rollback_snapshot)), 'snapshot file must be on disk');

  const bundle = path.join(dir, res.bundle_dir);
  assert.ok(fs.existsSync(path.join(bundle, 'verification.json')));
  assert.ok(fs.existsSync(path.join(bundle, 'checksums.json')));
  const record = readJson(path.join(bundle, 'verification.json'));
  assert.equal(record.status, 'verified');
  assert.equal(record.detector_id, 'CRO-007');
  assert.match(record.limitations.join(' '), /not a guarantee/);
  assert.ok(record.provenance.detectors_run.includes('CRO-007'));

  const html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  assert.match(html, /autoComplete="email"/);
});

test('verify remediation fails closed: missing run, unknown finding, refused patch, non-resolved finding', async (t) => {
  const dir = project();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const siteDir = site(dir);

  const missing = await verifyRemediation(dir, { run: 'nope', finding: 'CRO-007' });
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.provenance.recheck_errors.some((e) => /source run not found/.test(e)));
  assert.ok(missing.limitations.some((l) => /required_input/.test(l)));

  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });

  const absent = await verifyRemediation(dir, { run: run.runId, finding: 'CRO-013' });
  assert.equal(absent.status, 'blocked');
  assert.ok(absent.provenance.recheck_errors.some((e) => /not present in source run/.test(e)));

  fs.writeFileSync(path.join(dir, 'notes.txt'), 'meeting notes: <input type="email" name="email" />');
  const refused = await verifyRemediation(dir, { run: run.runId, finding: 'CRO-007', target: 'notes.txt', apply: true });
  assert.equal(refused.status, 'patch_refused');
  assert.match(refused.patch.refusal_reason, /unknown framework|validation failed/);
  assert.equal(refused.verdict.resolved, false);

  const persisted = await verifyRemediation(dir, { run: run.runId, finding: 'CRO-007', target: 'site/index.html', apply: false, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  assert.equal(persisted.status, 'not_resolved');
  assert.equal(persisted.verdict.resolved, false);
  assert.equal(persisted.verdict.after_finding_ids.length, 1, 'unpatched finding must persist');
});

test('verify remediation never calls a missing recheck resource resolved', async (t) => {
  const dir = project();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const siteDir = site(dir);
  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  assert.ok(run.findings.some((f) => f.detector_id === 'CRO-007'));
  const missingTarget = path.join(dir, 'missing-recheck');
  fs.mkdirSync(missingTarget);
  const result = await verifyRemediation(dir, {
    run: run.runId, finding: 'CRO-007', recheckTarget: missingTarget,
    baseUrl: 'https://example.test', refDate: '2026-09-08',
  });
  assert.equal(result.status, 'not_reobserved');
  assert.equal(result.verdict.resolved, false);
  assert.equal(result.verdict.comparison_state, 'not_reobserved');
  assert.equal(result.comparison.coverage_status, 'not_available');
});

test('verify remediation refuses a resolution from a non-comparable source envelope', async (t) => {
  const dir = project();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const siteDir = site(dir);
  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  const manifestPath = path.join(run.dir, 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.tool_version = '0.0.0-uncomparable';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyRemediation(dir, {
    run: run.runId, finding: 'CRO-007', recheckTarget: siteDir,
    baseUrl: 'https://example.test', refDate: '2026-09-08',
  }), /checksum mismatch|integrity failed/i);
});

test('equal viewport configurations remain comparable despite distinct object instances', async (t) => {
  const viewport = { width: 390, height: 844, deviceScaleFactor: 2 };
  const config = { site: { base_url: 'https://example.test' } };
  const hash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
  const result = recheckComparability(
    { tool_version: PACKAGE_VERSION, target: { kind: 'built_output' }, configuration_hash: hash(JSON.stringify(config)) },
    { provenance: { detector_version: 1, viewport: { ...viewport } } },
    { provenance: { detector_version: 1, viewport: { ...viewport } } },
    { site: { mode: 'built_output' }, viewport: { ...viewport }, config },
    { version: 1 },
  );
  assert.equal(result.comparable, true);
  assert.equal(result.dimensions.observation_method_changed, false);
});
