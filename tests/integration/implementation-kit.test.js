import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { exportImplementationKit } from '../../src/commands/implementationKit.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function projectWithFinding() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-kit-'));
  init(dir);
  for (const f of fs.readdirSync(path.join(FIX, 'registries-good'))) {
    fs.copyFileSync(path.join(FIX, 'registries-good', f), path.join(dir, '.citable', f));
  }
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
  return { dir, siteDir };
}

test('kit export produces a customer-ready implementation kit from a real run', async (t) => {
  const { dir, siteDir } = projectWithFinding();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  assert.ok(run.findings.some((f) => f.detector_id === 'CRO-007'), 'fixture must produce CRO-007');

  const kit = await exportImplementationKit(dir, {
    run: run.runId,
    finding: 'CRO-007',
    target: 'site/index.html',
  });

  assert.equal(kit.ok, true);
  assert.equal(kit.detector_id, 'CRO-007');
  assert.equal(kit.has_patch_diff, true);

  const kitDir = path.join(dir, kit.kit_dir);
  for (const name of ['README.md', 'finding.json', 'patch.diff', 'patch-metadata.json', 'acceptance-tests.md', 'deployment.md', 're-audit.sh', 'limitations.md', 'evidence/MANIFEST.md']) {
    assert.ok(fs.existsSync(path.join(kitDir, name)), `${name} must exist`);
  }
  assert.ok(fs.readdirSync(path.join(kitDir)).some((n) => n.startsWith('component-')));

  const readme = fs.readFileSync(path.join(kitDir, 'README.md'), 'utf8');
  assert.match(readme, /CRO-007/);
  assert.match(readme, /does not guarantee/i);
  assert.ok(!/\d+% (lift|increase|uplift)/i.test(readme), 'kit must not contain modeled lift estimates');

  const diff = fs.readFileSync(path.join(kitDir, 'patch.diff'), 'utf8');
  assert.match(diff, /^--- a\//);
  assert.match(diff, /autoComplete="email"/);

  const acceptance = fs.readFileSync(path.join(kitDir, 'acceptance-tests.md'), 'utf8');
  assert.match(acceptance, /citable verify remediation/);
  assert.match(acceptance, /not an outcome guarantee/);

  const deployment = fs.readFileSync(path.join(kitDir, 'deployment.md'), 'utf8');
  assert.match(deployment, /Detected framework: \*\*html\*\*/);
  assert.match(deployment, /Rollback/);

  const reaudit = fs.readFileSync(path.join(kitDir, 're-audit.sh'), 'utf8');
  assert.match(reaudit, /citable audit --scope cro/);
  assert.match(reaudit, new RegExp(run.runId));

  const limits = fs.readFileSync(path.join(kitDir, 'limitations.md'), 'utf8');
  assert.match(limits, /## Limitations/);
  assert.match(limits, /## Assumptions/);
  assert.match(limits, /no modeled revenue/i);

  const evidence = fs.readFileSync(path.join(kitDir, 'evidence', 'MANIFEST.md'), 'utf8');
  assert.match(evidence, /No rendering evidence|Rendering evidence files/);
  assert.equal(kit.rendering_evidence_count, 0, 'no screenshots exist in run, none may be fabricated');
});

test('kit export refuses unknown runs and absent findings', async (t) => {
  const { dir } = projectWithFinding();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  await assert.rejects(
    () => exportImplementationKit(dir, { run: 'missing-run', finding: 'CRO-007' }),
    /source run not found/
  );

  const siteDir = path.join(dir, 'site');
  const run = await audit(dir, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  await assert.rejects(
    () => exportImplementationKit(dir, { run: run.runId, finding: 'CRO-013' }),
    /not present in run/
  );
});
