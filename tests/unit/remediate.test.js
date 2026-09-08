import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  remediateFinding,
  applyAstPatch,
  remediateCommand,
  applyPatchDetailed,
  detectFramework,
  validatePatchedSource,
  unifiedDiff,
  computeConfidence,
} from '../../src/commands/remediate.js';
import { listComponents, getComponent } from '../../src/components/index.js';

test('listComponents returns available conversion design system components', () => {
  const comps = listComponents();
  assert.ok(comps.length >= 5);
  assert.ok(comps.some((c) => c.id === 'hero-cta'));
  assert.ok(comps.some((c) => c.id === 'frictionless-form'));
  assert.ok(comps.some((c) => c.id === 'sticky-dock'));
  assert.ok(comps.some((c) => c.id === 'scent-beacon'));
  assert.ok(comps.some((c) => c.id === 'touch-target'));
});

test('getComponent returns valid code in react, vue, and html formats', () => {
  const reactComp = getComponent('hero-cta', 'react');
  assert.equal(reactComp.format, 'react');
  assert.ok(reactComp.code.includes('export function NebulaHeroCTA'));

  const vueComp = getComponent('hero-cta', 'vue');
  assert.equal(vueComp.format, 'vue');
  assert.ok(vueComp.code.includes('<template>'));

  const htmlComp = getComponent('hero-cta', 'html');
  assert.equal(htmlComp.format, 'html');
  assert.ok(htmlComp.code.includes('min-h-[48px]'));
});

test('remediateFinding maps CRO and COMP findings to Nebula components and scaffolding', () => {
  const formRem = remediateFinding('CRO-007');
  assert.equal(formRem.ok, true);
  assert.equal(formRem.component_id, 'frictionless-form');
  assert.ok(formRem.scaffold_command.includes('npx nebulacomponents add frictionless-form'));

  const touchRem = remediateFinding('CRO-015');
  assert.equal(touchRem.ok, true);
  assert.equal(touchRem.component_id, 'touch-target');

  const heroRem = remediateFinding('CRO-010');
  assert.equal(heroRem.ok, true);
  assert.equal(heroRem.component_id, 'hero-cta');

  const scentRem = remediateFinding('CRO-019');
  assert.equal(scentRem.ok, true);
  assert.equal(scentRem.component_id, 'scent-beacon');

  const unk = remediateFinding('UNKNOWN-999');
  assert.equal(unk.ok, false);
});

test('applyAstPatch injects autocomplete and touch target dimensions', () => {
  const rawInput = '<input type="email" name="user_email" />';
  const patchedInput = applyAstPatch(rawInput, 'CRO-007');
  assert.ok(patchedInput.includes('autoComplete="email"'));

  const rawBtn = '<button className="px-4 py-2 bg-blue-600">Submit</button>';
  const patchedBtn = applyAstPatch(rawBtn, 'CRO-015');
  assert.ok(patchedBtn.includes('min-h-[48px] min-w-[48px]'));

  const rawText = '<button>Submit</button>';
  const patchedText = applyAstPatch(rawText, 'CRO-012');
  assert.ok(patchedText.includes('Get Started Free'));
});

test('remediateCommand handles finding and component queries', async () => {
  const resFinding = await remediateCommand(process.cwd(), { finding: 'CRO-011' });
  assert.equal(resFinding.ok, true);
  assert.equal(resFinding.recommended_component, 'NebulaStickyMobileDock');

  const resComp = await remediateCommand(process.cwd(), { component: 'scent-beacon' });
  assert.equal(resComp.ok, true);
  assert.equal(resComp.component, 'NebulaScentBeacon');
});

test('detectFramework identifies jsx, vue, html, and fails closed on unknown', () => {
  assert.equal(detectFramework('src/Hero.jsx', 'export default () => <div className="x" />;').framework, 'jsx');
  assert.equal(detectFramework('src/Page.vue', '<template><div /></template>\n<script setup></script>').framework, 'vue');
  assert.equal(detectFramework('public/index.html', '<!DOCTYPE html><html><body><input /></body></html>').framework, 'html');
  assert.equal(detectFramework('Makefile', 'all: build').framework, 'unknown');
  const unknown = detectFramework('data.bin', 'random');
  assert.equal(unknown.framework, 'unknown');
  assert.ok(unknown.confidence < 0.4);
});

test('applyPatchDetailed is idempotent: second application is a fixed point', () => {
  const src = '<input type="email" name="user_email" />';
  const first = applyPatchDetailed(src, 'CRO-007');
  assert.equal(first.changed, true);
  assert.equal(first.idempotent, true);
  assert.ok(first.matchCount >= 1);
  const second = applyPatchDetailed(first.patched, 'CRO-007');
  assert.equal(second.changed, false);
  assert.equal(second.patched, first.patched);
});

test('validatePatchedSource fails when patch breaks structure, passes pre-existing quirks unchanged', () => {
  const introduced = validatePatchedSource('<div><span>unclosed</div>', 'html', '<div></div>');
  assert.equal(introduced.ok, false);
  assert.ok(introduced.checks.some((c) => c.check_id === 'tag-structure-preserved' && !c.passed));

  const quirk = validatePatchedSource('<div><span>unclosed</div>', 'html', '<div><span>unclosed</div>');
  assert.equal(quirk.ok, true);
  assert.ok(quirk.checks.some((c) => c.check_id === 'tag-structure-preserved' && c.passed && /pre-existing/.test(c.detail)));

  const disturbed = validatePatchedSource('<div>}(</div>', 'html', '<div></div>');
  assert.equal(disturbed.ok, false);
  assert.ok(disturbed.checks.some((c) => c.check_id === 'balanced-braces' && !c.passed));

  const good = validatePatchedSource('<div><input type="email" autoComplete="email" /></div>', 'html', '<div><input type="email" /></div>');
  assert.equal(good.ok, true);

  const unknown = validatePatchedSource('anything', 'unknown');
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /unknown framework/);
});

test('unifiedDiff produces standard hunks and null for identical input', () => {
  assert.equal(unifiedDiff('same\n', 'same\n', 'x.html'), null);
  const d = unifiedDiff('<button>Submit</button>\n', '<button>Get Started Free</button>\n', 'page.html');
  assert.ok(d.startsWith('--- a/page.html'));
  assert.ok(d.includes('+++ b/page.html'));
  assert.ok(d.includes('@@'));
  assert.ok(d.includes('-<button>Submit</button>'));
  assert.ok(d.includes('+<button>Get Started Free</button>'));
});

test('computeConfidence records factors and caps semantic copy below write threshold', () => {
  const fw = { framework: 'jsx', confidence: 0.7, signals: ['extension:.jsx'] };
  const mechanical = computeConfidence({ frameworkInfo: fw, patch: { matchCount: 1, idempotent: true, patcherClass: 'mechanical-attribute' }, validation: { ok: true, reason: null } });
  assert.ok(mechanical.score >= 0.7);
  assert.equal(mechanical.factors.length, 4);

  const semantic = computeConfidence({ frameworkInfo: fw, patch: { matchCount: 1, idempotent: true, patcherClass: 'semantic-copy' }, validation: { ok: true, reason: null } });
  assert.ok(semantic.score < 0.7);
  assert.ok(semantic.cap_reason.includes('human editorial decision'));
});

test('remediateCommand dry run reports diff, validation, confidence, and refuses no-match writes', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'citable-remediate-'));
  t.after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });
  const file = path.join(tmp, 'Form.jsx');
  await fs.writeFile(file, 'export const Form = () => (\n  <form>\n    <input type="email" name="email" />\n  </form>\n);\n');

  const dry = await remediateCommand(tmp, { finding: 'CRO-007', target: 'Form.jsx' });
  assert.equal(dry.written, false);
  assert.equal(dry.write_refused, false);
  assert.equal(dry.framework.framework, 'jsx');
  assert.ok(dry.diff.includes('+    <input type="email" name="email" autoComplete="email" />'));
  assert.equal(dry.validation.ok, true);
  assert.ok(dry.confidence.score >= 0.7);

  await remediateCommand(tmp, { finding: 'CRO-007', target: 'Form.jsx', write: true });
  const already = await remediateCommand(tmp, { finding: 'CRO-007', target: 'Form.jsx', write: true });
  assert.equal(already.written, false);
  assert.equal(already.write_refused, true);
  assert.match(already.refusal_reason, /no patch match/);
});

test('remediateCommand --write is gated: writes valid patch with rollback snapshot, refuses semantic and invalid targets', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'citable-remediate-'));
  t.after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });
  const file = path.join(tmp, 'Form.jsx');
  const original = 'export const Form = () => (\n  <form>\n    <input type="email" name="email" />\n  </form>\n);\n';
  await fs.writeFile(file, original);

  const ok = await remediateCommand(tmp, { finding: 'CRO-007', target: 'Form.jsx', write: true });
  assert.equal(ok.written, true);
  const written = await fs.readFile(file, 'utf8');
  assert.ok(written.includes('autoComplete="email"'));
  assert.ok(ok.rollback.snapshot_file.includes('.citable/remediation/snapshots/'));
  const snap = await fs.readFile(path.join(tmp, ok.rollback.snapshot_file), 'utf8');
  assert.equal(snap, original);
  const manifest = JSON.parse(await fs.readFile(path.join(tmp, ok.rollback.manifest_file), 'utf8'));
  assert.equal(manifest.finding_id, 'CRO-007');
  assert.equal(manifest.original_sha256, crypto.createHash('sha256').update(original).digest('hex'));

  await fs.writeFile(path.join(tmp, 'Hero.jsx'), 'export const Hero = () => <button className="btn">Submit</button>;\n');
  const semantic = await remediateCommand(tmp, { finding: 'CRO-012', target: 'Hero.jsx', write: true });
  assert.equal(semantic.written, false);
  assert.equal(semantic.write_refused, true);
  assert.match(semantic.refusal_reason, /below write threshold/);

  await fs.writeFile(path.join(tmp, 'Widget.txt'), 'export const X = <input type="email" name="email" />;\n');
  const invalid = await remediateCommand(tmp, { finding: 'CRO-007', target: 'Widget.txt', write: true });
  assert.equal(invalid.written, false);
  assert.match(invalid.refusal_reason, /validation failed/);

  const missing = await remediateCommand(tmp, { finding: 'CRO-007', target: 'Nope.jsx', write: true });
  assert.equal(missing.written, false);
  assert.equal(missing.write_refused, true);
});
