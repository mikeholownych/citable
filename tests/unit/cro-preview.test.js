import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCroPreviewHtml, previewCroCommand } from '../../src/commands/previewCro.js';

test('generateCroPreviewHtml constructs valid interactive split-screen HTML preview', () => {
  const html = generateCroPreviewHtml({
    url: 'https://nebulacomponents.com/pricing',
    fsaBefore: 45,
    fsaAfter: 0,
    findings: [
      { detector_id: 'CRO-010', summary: 'Choice overload in hero', severity: 'high' },
      { detector_id: 'CRO-007', summary: 'Missing autocomplete', severity: 'medium' },
    ],
  });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Nebula CRO Interactive Preview'));
  assert.ok(html.includes('Friction Surface Area (Before)'));
  assert.ok(html.includes('NebulaHeroCTA'));
  assert.ok(html.includes('NebulaFrictionlessForm'));
  assert.ok(html.includes('CRO-010'));
  assert.ok(html.includes('375px'));
  assert.ok(html.includes('768px'));
});

test('previewCroCommand returns structured metadata and renders HTML', async () => {
  const res = await previewCroCommand(process.cwd(), 'pricing', {});
  assert.equal(res.ok, true);
  assert.equal(typeof res.fsa_before, 'number');
  assert.equal(res.fsa_after, 0);
  assert.equal(res.fsa_eliminated_pct, null);
  assert.match(res.fsa_note, /modeled heuristic index/);
  assert.ok(res.html.includes('Nebula Components'));
});
