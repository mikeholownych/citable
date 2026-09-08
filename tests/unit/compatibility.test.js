import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { compatibilityCommand, verifyPage } from '../../src/commands/compatibility.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function project({ withSite = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-compat-'));
  init(dir);
  if (withSite) {
    const siteDir = path.join(dir, 'site');
    fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><html><head><title>Clean</title></head><body><h1>Clean</h1><p>Content.</p></body></html>');
  }
  return dir;
}

test('compatibility reports node engine, optional adapters, and never guesses browser launch success', async () => {
  const dir = project();
  const r = await compatibilityCommand(dir);
  assert.equal(typeof r.ok, 'boolean');
  assert.equal(r.node, process.versions.node);
  assert.equal(r.engines, '>=24.0.0');

  const nodeCheck = r.checks.find((c) => c.check_id === 'NODE-ENGINE');
  assert.ok(nodeCheck);
  assert.equal(nodeCheck.passed, Number.parseInt(process.versions.node, 10) >= 24 || nodeCheck.passed === (Number.parseInt(process.versions.node.split('.')[0], 10) >= 24));

  for (const name of ['playwright', 'lighthouse', 'chrome-launcher', 'tesseract.js']) {
    assert.ok(r.adapters[name], `${name} must be reported`);
    assert.equal(r.adapters[name].declared_optional_peer, true);
  }

  const browserCheck = r.checks.find((c) => c.check_id === 'BROWSER-CHROME');
  if (browserCheck) assert.match(browserCheck.detail, /does not prove a successful launch/);

  assert.match(r.checks.find((c) => c.check_id === 'REGISTRIES-PRESENT').detail, /registry/);
  assert.match(r.note, /cannot prove/);
});

test('compatibility flags edge worker size over the documented 1 MiB platform limit as a blocker', async (t) => {
  const dir = project();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const edgeDir = path.join(dir, '.citable', 'edge');
  fs.mkdirSync(edgeDir, { recursive: true });
  fs.writeFileSync(path.join(edgeDir, 'worker.js'), 'x'.repeat(1024 * 1024 + 100));
  const r = await compatibilityCommand(dir);
  const sizeCheck = r.checks.find((c) => c.check_id === 'EDGE-SIZE-worker.js');
  assert.equal(sizeCheck.passed, false);
  assert.equal(sizeCheck.severity, 'blocker');
  assert.equal(r.ok, false);
  assert.match(sizeCheck.detail, /documented platform limit, not a measurement/);
});

test('verify page scopes the full detector set to one page and refuses unknown pages', async (t) => {
  const dir = project({ withSite: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const siteDir = path.join(dir, 'site');

  const clean = await verifyPage(dir, '/index.html', { target: siteDir, baseUrl: 'https://example.test' });
  assert.ok(['pass', 'attention'].includes(clean.status));
  assert.equal(clean.page, 'https://example.test/');
  assert.ok(clean.provenance.detectors_run.length >= 100, 'full detector set must run');
  assert.match(clean.provenance.definition, /not a guarantee/);
  for (const f of clean.findings) {
    assert.ok(f.provenance, 'page findings must carry provenance');
  }

  await assert.rejects(
    () => verifyPage(dir, '/nope.html', { target: siteDir, baseUrl: 'https://example.test' }),
    /page not found/
  );
  await assert.rejects(
    () => verifyPage(dir, '/index.html', {}),
    /requires a site target/
  );
});
