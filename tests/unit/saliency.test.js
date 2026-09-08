import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVisualSaliency } from '../../src/analysis/saliency.js';

test('calculateVisualSaliency calculates primary CTA conspicuity and gaze path accurately', () => {
  const pageData = {
    headings: [{ text: 'Transform Your Growth Engine', level: 1 }],
    ctas: [
      { text: 'Start Free Trial', isPrimary: true, inHero: true },
      { text: 'Book Demo', isPrimary: false, inHero: true },
    ],
    forms: [{ fieldCount: 2 }],
  };

  const res = calculateVisualSaliency(pageData);
  assert.ok(res.primary_cta_conspicuity_index >= 0.5, 'Primary CTA should have high conspicuity');
  assert.equal(res.pci_assessment, 'optimal');
  assert.ok(['clean', 'moderate'].includes(res.visual_clutter));
  assert.ok(Array.isArray(res.predicted_gaze_path));
  assert.equal(res.predicted_gaze_path.length, 3);
  assert.ok(res.svg_heatmap.includes('<svg'));
  assert.ok(res.svg_heatmap.includes('Visual Attention Saliency Distribution'));
});

test('calculateVisualSaliency flags diluted CTA conspicuity with multiple competing elements', () => {
  const pageData = {
    headings: [
      { text: 'Heading 1', level: 1 },
      { text: 'Heading 2', level: 2 },
      { text: 'Heading 3', level: 2 },
    ],
    ctas: [
      { text: 'Submit', isPrimary: false },
      { text: 'Click Here', isPrimary: false },
      { text: 'Learn More', isPrimary: false },
      { text: 'Buy Now', isPrimary: true },
    ],
  };

  const res = calculateVisualSaliency(pageData);
  assert.ok(res.primary_cta_conspicuity_index < 0.6);
  assert.ok(res.predicted_gaze_path.length > 0);
});

test('saliency output is explicitly labeled as a modeled index, not observed behavior', () => {
  const r = calculateVisualSaliency({ ctas: [{ text: 'Get started', isPrimary: true, inHero: true }], headings: [{ level: 1, text: 'Hero' }], forms: [] });
  assert.equal(r.fact_status, 'modeled_index_not_observed_behavior');
  assert.match(r.interpretation_note, /not observed user attention/);
  assert.match(r.gaze_path_note, /not measured fixations/);
});
