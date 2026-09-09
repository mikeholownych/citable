import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStrategicRoadmap, formatRoadmapMarkdown } from '../../src/analysis/strategicRoadmap.js';

test('buildStrategicRoadmap structures findings into 30, 90, and 180 day horizons', () => {
  const sampleFindings = [
    {
      finding_id: 'F-TECH',
      detector_id: 'TECH-001',
      classification: { severity: 'critical', deterministic: true },
      observation: { summary: 'Non-200 index-target URL' },
    },
    {
      finding_id: 'F-CWV',
      detector_id: 'CWV-001',
      classification: { severity: 'high', deterministic: true },
      observation: { summary: 'Render-blocking scripts delay LCP' },
    },
    {
      finding_id: 'F-SCHEMA',
      detector_id: 'SCHEMA-007',
      classification: { severity: 'medium', deterministic: true },
      observation: { summary: 'FAQPage markup without matching visible questions' },
    },
    {
      finding_id: 'F-GEO',
      detector_id: 'GEO-002',
      classification: { severity: 'low', deterministic: true },
      observation: { summary: 'Section word count exceeds ideal chunk size' },
    },
  ];

  const sampleInitiatives = [
    {
      initiative_id: 'INIT-INDEXNOW',
      title: 'IndexNow Instant Search Sync',
      customer_demand: 'high',
      revenue_potential: 'high',
      strategic_differentiation: 'high',
      engineering_cost: 'low',
      evidence_strength: 'verified',
    },
  ];

  const roadmap = buildStrategicRoadmap({
    findings: sampleFindings,
    initiatives: sampleInitiatives,
    targetDomain: 'example.com',
  });

  assert.equal(roadmap.fact_status, 'strategic_roadmap_projection');
  assert.equal(roadmap.horizons.length, 3);

  const h30 = roadmap.horizons.find((h) => h.horizon === '30_days');
  const h90 = roadmap.horizons.find((h) => h.horizon === '90_days');
  const h180 = roadmap.horizons.find((h) => h.horizon === '180_days');

  assert.ok(h30, '30-day horizon exists');
  assert.ok(h90, '90-day horizon exists');
  assert.ok(h180, '180-day horizon exists');

  // Verify critical tech finding is in 30 days
  assert.ok(h30.actions.some((a) => a.id === 'TECH-001'));
  // Verify CWV is in 30 days
  assert.ok(h30.actions.some((a) => a.id === 'CWV-001'));
  // Verify schema is in 90 days
  assert.ok(h90.actions.some((a) => a.id === 'SCHEMA-007'));
  // Verify GEO is in 180 days
  assert.ok(h180.actions.some((a) => a.id === 'GEO-002'));

  // Verify Markdown rendering
  const md = formatRoadmapMarkdown(roadmap);
  assert.match(md, /# 30 \/ 90 \/ 180-Day Strategic Roadmap/);
  assert.match(md, /Days 1 - 30: Foundation & Unblock/);
  assert.match(md, /Days 31 - 90: Governance, E-E-A-T & Extractability/);
  assert.match(md, /Days 91 - 180: GEO Dominance, Corroboration & Scale/);
  assert.match(md, /NON-200 INDEX-TARGET URL/i);
});
