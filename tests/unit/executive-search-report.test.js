import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutiveSearchReport, renderSearchReportMarkdown, renderSearchReportHtml, exportExecutiveSearchReport } from '../../src/reporting/executiveSearchReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('buildExecutiveSearchReport constructs all 19 enterprise pillars with evidence traceability', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const report = await buildExecutiveSearchReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    clientName: 'Acme Enterprise',
  });

  assert.equal(report.fact_status, 'enterprise_search_executive_report');
  assert.equal(report.client_name, 'Acme Enterprise');
  assert.equal(report.target_domain, 'example.test');
  assert.ok(typeof report.overall_readiness_score === 'number');

  // Verify all 19 pillars exist
  for (let i = 1; i <= 19; i++) {
    assert.ok(report.pillars[i], `Pillar ${i} must exist in report`);
    assert.ok(report.pillars[i].name, `Pillar ${i} must have a name`);
    assert.ok(report.pillars[i].data, `Pillar ${i} must have data`);
  }

  // Verify Evidence Register (Pillar 15)
  assert.ok(Array.isArray(report.evidence_register));
  assert.ok(report.evidence_register.length >= 8);
  for (const ev of report.evidence_register) {
    assert.ok(ev.evidence_id.startsWith('EVD-SRCH-'));
    assert.ok(ev.source);
    assert.ok(ev.methodology);
    assert.ok(ev.confidence_level);
  }

  // Verify Executive Decision Summary (Pillar 19)
  const ds = report.decision_summary;
  assert.ok(Array.isArray(ds.confirmed_findings));
  assert.ok(Array.isArray(ds.inferred_opportunities));
  assert.ok(Array.isArray(ds.unresolved_unknowns));
  assert.ok(Array.isArray(ds.strategic_risks));
  assert.ok(Array.isArray(ds.actions_requiring_leadership_approval));

  // Markdown rendering
  const md = renderSearchReportMarkdown(report);
  assert.ok(md.includes('# Enterprise Search Intelligence & Discovery Governance Briefing'));
  assert.ok(md.includes('Acme Enterprise'));
  assert.ok(md.includes('Executive Decision Summary (Traceable Conclusions)'));
  assert.ok(md.includes('Verified Evidence Register (Traceability Engine)'));
  assert.ok(md.includes('EVD-SRCH-'));

  // HTML rendering
  const html = renderSearchReportHtml(report);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Enterprise Search Intelligence & Discovery Governance Briefing'));
  assert.ok(html.includes('Acme Enterprise'));
  assert.ok(html.includes('EVD-SRCH-'));
});

test('exportExecutiveSearchReport handles markdown, html, and json formats', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const resMd = await exportExecutiveSearchReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    format: 'markdown',
  });
  assert.equal(resMd.format, 'markdown');
  assert.ok(resMd.content.includes('# Enterprise Search Intelligence'));

  const resJson = await exportExecutiveSearchReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    format: 'json',
  });
  assert.equal(resJson.format, 'json');
  assert.ok(resJson.data.pillars);
});
