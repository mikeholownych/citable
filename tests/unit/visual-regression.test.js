import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { visualContractChecks, runVisualRegression, VIEWPORT_CLASSES, VARIANT_CLASSES } from '../../src/commands/visualRegression.js';
import { generateCroPreviewHtml } from '../../src/commands/previewCro.js';

test('preview HTML satisfies the full visual layout contract', () => {
  const html = generateCroPreviewHtml({});
  const r = visualContractChecks(html);
  assert.equal(r.ok, true, `failing checks: ${r.checks.filter((c) => !c.passed).map((c) => c.check_id).join(', ')}`);
  assert.ok(r.checks.length >= 9);
});

test('contract checks fail when a contract property is removed (non-detection proof)', () => {
  const html = generateCroPreviewHtml({});
  const stripped = html.replace(/@media \(prefers-reduced-motion[^{]*\{[\s\S]*?\}\s*\}/, '');
  const r = visualContractChecks(stripped);
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => c.check_id === 'reduced-motion' && !c.passed));

  const noFocus = html.replace(/:focus-visible[^}]*\}/g, '');
  assert.ok(!visualContractChecks(noFocus).checks.find((c) => c.check_id === 'keyboard-focus-visible').passed);

  const noViewports = html.replace(/375px/g, 'tiny').replace(/768px/g, 'small');
  assert.ok(!visualContractChecks(noViewports).checks.find((c) => c.check_id === 'three-viewport-classes').passed);
});

test('screenshot matrix covers three viewport classes and all accessibility variants', () => {
  assert.deepEqual(VIEWPORT_CLASSES.map((v) => v.id), ['mobile', 'tablet', 'desktop']);
  const ids = VARIANT_CLASSES.map((v) => v.id);
  for (const required of ['default', 'keyboard-focus', 'reduced-motion', 'text-zoom-200', 'long-translation', 'narrow-mobile', 'dark', 'light']) {
    assert.ok(ids.includes(required), `${required} variant must exist`);
  }
  const narrow = VARIANT_CLASSES.find((v) => v.id === 'narrow-mobile');
  assert.equal(narrow.viewport, 'mobile', 'narrow-mobile only applies to the mobile viewport class');
});

test('runVisualRegression records skipped screenshots with required_input when no browser exists', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-visual-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = await runVisualRegression(dir, {
    previewHtml: '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"></head></html>',
  });
  assert.ok(['skipped', 'captured'].includes(r.screenshots.status));
  if (r.screenshots.status === 'skipped') {
    assert.ok(r.screenshots.required_input, 'skip state must record the exact required input');
    assert.ok(!r.screenshots.captured.length);
  }
  assert.equal(r.matrix_cells.length, 22, '3 viewports x 8 variants, minus narrow-mobile on tablet and desktop');
  assert.ok(r.limitations.some((l) => /never implies the matrix passed/.test(l)));
});
