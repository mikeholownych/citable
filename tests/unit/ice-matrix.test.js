import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIceMatrix, scoreFinding, scoreInitiative, formatIceMatrixOutput } from '../../src/analysis/iceMatrix.js';

test('scoreFinding calculates transparent ICE score and assigns quadrants', () => {
  const criticalFinding = {
    finding_id: 'F-001',
    detector_id: 'TECH-001',
    classification: { severity: 'critical', deterministic: true },
    observation: { summary: 'Non-200 index-target URL' },
    subject: { identifier: 'https://example.com/product' },
  };

  const scored = scoreFinding(criticalFinding);
  assert.equal(scored.impact, 10);
  assert.equal(scored.confidence, 10);
  assert.equal(scored.effort, 4);
  assert.equal(scored.ice_score, 25); // (10 * 10) / 4 = 25
  assert.equal(scored.quadrant, 'quick_wins');
});

test('scoreInitiative calculates transparent ICE score for business initiatives', () => {
  const initiative = {
    initiative_id: 'INIT-INDEXNOW',
    title: 'Automated IndexNow Connector',
    customer_demand: 'high',
    revenue_potential: 'high',
    strategic_differentiation: 'high',
    engineering_cost: 'low',
    evidence_strength: 'verified',
    status: 'approved',
  };

  const scored = scoreInitiative(initiative);
  assert.ok(scored.impact >= 7);
  assert.ok(scored.effort <= 3);
  assert.equal(scored.confidence, 9);
  assert.equal(scored.quadrant, 'quick_wins');
});

test('buildIceMatrix ranks items by ICE score into four quadrants', () => {
  const items = [
    {
      finding_id: 'F-LOW',
      detector_id: 'PAGE-001',
      classification: { severity: 'low', deterministic: true },
      observation: { summary: 'Title length minor advisory' },
    },
    {
      finding_id: 'F-CRIT',
      detector_id: 'TECH-002',
      classification: { severity: 'critical', deterministic: true },
      observation: { summary: 'Accidental noindex on product page' },
    },
    {
      finding_id: 'F-ARCH',
      detector_id: 'ARCH-001',
      classification: { severity: 'high', deterministic: false },
      observation: { summary: 'Complex multi-level redirect loop' },
    },
  ];

  const matrix = buildIceMatrix(items, { type: 'findings' });
  assert.equal(matrix.total_items, 3);
  assert.equal(matrix.ranked_items[0].id, 'TECH-002'); // Highest ICE score first
  assert.ok(matrix.summary.quick_wins_count >= 1);
  assert.ok(matrix.summary.low_hanging_fruit_count >= 1);

  const formatted = formatIceMatrixOutput(matrix);
  assert.match(formatted, /Impact \/ Effort \/ Confidence \(ICE\) Prioritization Matrix/);
  assert.match(formatted, /Quadrant I {3}\[Quick Wins\]/);
  assert.match(formatted, /Accidental noindex/);
});
