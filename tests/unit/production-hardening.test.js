import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { buildExecutiveSearchReport } from '../../src/reporting/executiveSearchReport.js';
import { buildExecutiveCroReport } from '../../src/reporting/executiveCroReport.js';
import { generateSow, renderSowHtml, renderSowMarkdown } from '../../src/sow/generateSow.js';
import { evaluateScopeAdmissibility } from '../../src/sow/admissibilityGate.js';
import { extractRegistrableDomain, isAuthoritativeDomain, extractPublicSuffix } from '../../src/shared/domainUtils.js';
import { verifyRunPackage, RunVerificationError } from '../../src/shared/runPackageVerifier.js';
import { escapeHtml, sanitizeForMarkdown, escapeMarkdownTableCell } from '../../src/shared/htmlEscape.js';
import { evaluateAnswerEngineReadiness } from '../../src/analysis/readiness.js';
import { auditBacklinkProfile } from '../../src/analysis/offpage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('adversarial: missing GSC telemetry produces NOT_OBSERVED status envelopes without fabricated percentages', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const report = await buildExecutiveSearchReport(repoRoot, {
    clientName: 'Target Enterprise',
    baseUrl: 'https://example.test',
    target: fixtureSite,
    sample: false, // Production mode: telemetry absent
  });

  const p3 = report.pillars[3].data; // Organic Performance Analysis
  assert.equal(p3.branded_demand_share_pct.status, 'NOT_OBSERVED');
  assert.equal(p3.branded_demand_share_pct.value, null);
  assert.equal(p3.non_branded_demand_share_pct.status, 'NOT_OBSERVED');
  assert.equal(p3.non_branded_demand_share_pct.value, null);

  const p4 = report.pillars[4].data; // SERP Landscape Analysis
  assert.equal(p4.featured_snippet_ownership_pct.status, 'NOT_OBSERVED');
  assert.equal(p4.featured_snippet_ownership_pct.value, null);

  const p14 = report.pillars[14].data; // Measurement Integrity
  assert.equal(p14.consent_mode_v2_loss_pct.status, 'NOT_OBSERVED');
  assert.equal(p14.consent_mode_v2_loss_pct.value, null);
});

test('adversarial: empty anchor in backlinks is not categorized as branded anchor', () => {
  const backlinkData = [
    { source_url: 'https://referrer.test/post', target_url: 'https://example.test/', anchor_text: '', rel: 'noopener' },
    { source_url: 'https://referrer2.test/post', target_url: 'https://example.test/about', anchor_text: '   ', rel: '' },
    { source_url: 'https://referrer3.test/post', target_url: 'https://example.test/', anchor_text: 'example', rel: 'nofollow' },
  ];

  const result = auditBacklinkProfile(backlinkData, { targetDomain: 'example.test' });
  // 1 branded out of 3 total -> 33% branded
  assert.equal(result.anchor_profile.branded_pct, 33);
});

test('adversarial: multi-part public suffix domain resolution resists spoofing', () => {
  // Valid multi-part TLDs
  assert.equal(extractRegistrableDomain('https://shop.example.co.uk/checkout'), 'example.co.uk');
  assert.equal(extractRegistrableDomain('https://deep.sub.portal.gov.uk/data'), 'portal.gov.uk');
  assert.equal(extractRegistrableDomain('https://corp.example.com.au/'), 'example.com.au');
  assert.equal(extractPublicSuffix('https://shop.example.co.uk'), 'co.uk');

  // Authority domain check prevents substring matching spoof
  assert.equal(isAuthoritativeDomain('https://attacker-gov.uk.badsite.com'), false);
  assert.equal(isAuthoritativeDomain('https://nationalarchives.gov.uk/records'), true);
  assert.equal(isAuthoritativeDomain('https://cdc.gov/data'), true);
  assert.equal(isAuthoritativeDomain('https://cdc.gov.attacker.com'), false);
});

test('adversarial: tampered run package checksums fail closed with RunVerificationError', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-tamper-test-'));
  const manifest = {
    run_id: 'RUN-TAMPER-001',
    created_at: new Date().toISOString(),
    status: 'completed',
    tool_version: '1.19.0',
  };
  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(tmpDir, 'findings.json'), JSON.stringify([{ id: 'F-1' }]));
  // Checksum with incorrect sha256
  fs.writeFileSync(path.join(tmpDir, 'checksums.json'), JSON.stringify({
    'manifest.json': '0'.repeat(64),
    'findings.json': '0'.repeat(64),
  }));

  assert.throws(
    () => verifyRunPackage(tmpDir, { requireChecksums: true }),
    RunVerificationError
  );
});

test('adversarial: contractual SOW rejects built_in_template_default owner at admissibility gate', async () => {
  const templateFindings = [
    {
      finding_id: 'F-TECH-001',
      detector_id: 'TECH-001',
      discipline: ['technical'],
      classification: { severity: 'high', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/', url: 'https://example.test/' },
      observation: { summary: 'Missing meta description', evidence: ['EVD-001'] },
      remediation: { preferred: 'Add description tag' }, // No explicit owner provided
      verification: { detector_to_rerun: 'TECH-001' },
      ice_score: 12.0,
    },
  ];

  // In contractual mode without roleMapping, owner falls back to built-in template default
  const res = evaluateScopeAdmissibility(templateFindings, {
    inScopeProperties: ['https://example.test'],
    rejectTemplateDefaultOwner: true,
  });

  assert.equal(res.summary.admitted_count, 0);
  assert.equal(res.summary.refused_count, 1);
  assert.equal(res.refusal_log[0].refusal_code, 'REFUSE-TEMPLATE-DEFAULT-OWNER');
});

test('adversarial: XSS and HTML injection payloads are safely escaped in SOW exports', async () => {
  const xssFinding = {
    finding_id: 'F-XSS-001',
    detector_id: 'TECH-001',
    discipline: ['technical'],
    classification: { severity: 'critical', confidence: 'deterministic' },
    subject: { identifier: 'https://example.test/<script>alert("xss")</script>' },
    observation: { summary: '<img src=x onerror=alert(1)> in image tag', evidence: ['EVD-001'] },
    remediation: { preferred: '"><svg/onload=alert("injected")>', owner: 'Security Lead' },
    verification: { detector_to_rerun: 'TECH-001', method: 'Safe AST verification' },
    ice_score: 15.0,
  };

  const sow = await generateSow(repoRoot, {
    findings: [xssFinding],
    client: '"><script>alert("client")</script>',
    budget: 20000,
    termDays: 45,
    inScopeProperties: ['https://example.test'],
  });

  const html = renderSowHtml(sow);
  // Verify that raw injection tokens are completely escaped
  assert.ok(!html.includes('<script>alert("client")</script>'));
  assert.ok(!html.includes('"><svg/onload=alert("injected")>'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;client&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('&quot;&gt;&lt;svg/onload=alert(&quot;injected&quot;)&gt;'));
});

test('adversarial: readiness scoring prevents NaN drift on empty or degraded inputs', () => {
  const emptyRes = evaluateAnswerEngineReadiness([]);
  assert.ok(!Number.isNaN(emptyRes.readiness_score));
  assert.ok(!Number.isNaN(emptyRes.score));
  assert.equal(emptyRes.epistemic_status, 'MODELED');
  assert.equal(emptyRes.fact_status, 'modeled_extraction_readiness');
  assert.ok(emptyRes.score >= 0 && emptyRes.score <= 100);
});
