import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCroRoadmap, formatCroRoadmapMarkdown } from '../../src/analysis/croRoadmap.js';

test('buildCroRoadmap structures 30/90/180-day horizons with measurable conversion outcomes', () => {
  const findings = [
    {
      detector_id: 'CRO-007',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/checkout' },
      observation: { summary: 'Missing autocomplete attributes' },
      classification: { severity: 'medium', deterministic: true },
    },
    {
      detector_id: 'CRO-006',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/pricing' },
      observation: { summary: 'Missing security and customer proof' },
      classification: { severity: 'high', deterministic: true },
    },
    {
      detector_id: 'CRO-021',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/checkout' },
      observation: { summary: 'Missing express digital wallets' },
      classification: { severity: 'high', deterministic: true },
    },
  ];

  const roadmap = buildCroRoadmap({
    findings,
    targetDomain: 'nebulacomponents.com',
  });

  assert.equal(roadmap.fact_status, 'cro_roadmap_projection');
  assert.equal(roadmap.target_domain, 'nebulacomponents.com');
  assert.equal(roadmap.horizons.length, 3);

  const [h30, h90, h180] = roadmap.horizons;
  assert.equal(h30.horizon, '30_days');
  assert.ok(h30.measurable_conversion_kpi.includes('Form Completion Rate'));
  assert.ok(h30.experiments.some((e) => e.detector_id === 'CRO-007'));

  assert.equal(h90.horizon, '90_days');
  assert.ok(h90.measurable_conversion_kpi.includes('Lead Capture / Trial Signup Rate'));
  assert.ok(h90.experiments.some((e) => e.detector_id === 'CRO-006'));

  assert.equal(h180.horizon, '180_days');
  assert.ok(h180.measurable_conversion_kpi.includes('Checkout / Revenue Conversion Rate'));
  assert.ok(h180.experiments.some((e) => e.detector_id === 'CRO-021'));

  const markdown = formatCroRoadmapMarkdown(roadmap);
  assert.ok(markdown.includes('# 30 / 90 / 180-Day Conversion Rate Optimization (CRO) Roadmap'));
  assert.ok(markdown.includes('nebulacomponents.com'));
  assert.ok(markdown.includes('Days 1 - 30: Immediate Mechanical Friction Removal'));
  assert.ok(markdown.includes('Days 31 - 90: Offer Architecture'));
  assert.ok(markdown.includes('Days 91 - 180: Payment Acceleration'));
});
