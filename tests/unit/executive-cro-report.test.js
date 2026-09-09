import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveCroReport, renderCroReportMarkdown, renderCroReportHtml, exportExecutiveCroReport } from '../../src/reporting/executiveCroReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('buildExecutiveCroReport constructs all 25 enterprise pillars with observation vs hypothesis vs causation separation', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const report = await buildExecutiveCroReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    clientName: 'SaaS Giant Inc',
  });

  assert.equal(report.fact_status, 'enterprise_cro_executive_report');
  assert.equal(report.client_name, 'SaaS Giant Inc');
  assert.equal(report.target_domain, 'example.test');
  assert.ok(typeof report.overall_conversion_readiness === 'number');

  // Verify all 25 pillars exist
  for (let i = 1; i <= 25; i++) {
    assert.ok(report.pillars[i], `Pillar ${i} must exist in report`);
    assert.ok(report.pillars[i].name, `Pillar ${i} must have a name`);
    assert.ok(report.pillars[i].data, `Pillar ${i} must have data`);
  }

  // Verify Epistemological framework separation (Pillar 25)
  const ds = report.decision_summary;
  assert.ok(Array.isArray(ds.observed_conversion_failures));
  assert.ok(ds.observed_conversion_failures.length >= 3);
  assert.ok(ds.observed_conversion_failures.some((f) => f.includes('Mobile session conversion rate')));

  assert.ok(Array.isArray(ds.evidence_supported_hypotheses));
  assert.ok(ds.evidence_supported_hypotheses.length >= 2);
  assert.ok(ds.evidence_supported_hypotheses.some((h) => h.includes('HYP-')));

  assert.ok(Array.isArray(ds.causal_findings));
  assert.ok(ds.causal_findings.length >= 1);

  assert.ok(Array.isArray(ds.unresolved_unknowns));
  assert.ok(ds.unresolved_unknowns.length >= 1);

  assert.ok(Array.isArray(ds.recommended_interventions));
  assert.ok(ds.recommended_interventions.length >= 2);

  // Verify Evidence Register (Pillar 18)
  assert.ok(Array.isArray(report.evidence_register));
  assert.ok(report.evidence_register.length >= 6);
  for (const ev of report.evidence_register) {
    assert.ok(ev.evidence_id.startsWith('EVD-CRO-'));
    assert.ok(ev.source);
    assert.ok(ev.methodology);
    assert.ok(ev.confidence_level);
  }

  // Markdown rendering
  const md = renderCroReportMarkdown(report);
  assert.ok(md.includes('# Enterprise Conversion Rate Optimization (CRO) & Journey Intelligence Briefing'));
  assert.ok(md.includes('SaaS Giant Inc'));
  assert.ok(md.includes('Executive Decision Summary (Observation vs Hypothesis vs Causation)'));
  assert.ok(md.includes('Observed Conversion Failures (Empirical Facts)'));
  assert.ok(md.includes('Evidence-Supported Hypotheses (Proposed Explanations)'));
  assert.ok(md.includes('Causal Findings (Verified Under Controlled Experiments)'));
  assert.ok(md.includes('Verified Conversion Evidence Register'));
  assert.ok(md.includes('EVD-CRO-'));

  // HTML rendering
  const html = renderCroReportHtml(report);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Enterprise Conversion Rate Optimization (CRO) & Journey Intelligence Briefing'));
  assert.ok(html.includes('SaaS Giant Inc'));
  assert.ok(html.includes('Observed Conversion Failures'));
  assert.ok(html.includes('Evidence-Supported Hypotheses'));
  assert.ok(html.includes('Causal Findings'));
});

test('exportExecutiveCroReport handles markdown, html, and json formats', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const resMd = await exportExecutiveCroReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    format: 'markdown',
  });
  assert.equal(resMd.format, 'markdown');
  assert.ok(resMd.content.includes('# Enterprise Conversion Rate Optimization'));

  const resJson = await exportExecutiveCroReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    format: 'json',
  });
  assert.equal(resJson.format, 'json');
  assert.ok(resJson.data.pillars);
});
