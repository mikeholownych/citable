import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStaticCwv, CWV_THRESHOLDS, formatSweepOutput } from '../../src/commands/sweep.js';

test('CWV_THRESHOLDS defines standards for LCP, INP, CLS, FCP, TTFB', () => {
  assert.equal(CWV_THRESHOLDS.lcp.good, 2.5);
  assert.equal(CWV_THRESHOLDS.inp.good, 200);
  assert.equal(CWV_THRESHOLDS.cls.good, 0.1);
  assert.equal(CWV_THRESHOLDS.fcp.good, 1.8);
  assert.equal(CWV_THRESHOLDS.ttfb.good, 800);
});

test('evaluateStaticCwv flags render blocking scripts and unsized images', () => {
  const mockPage = {
    html: `<!DOCTYPE html>
<html>
<head>
  <script src="/bundle.js"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter">
</head>
<body>
  <h1>Test Page</h1>
  <img src="/hero.png">
</body>
</html>`,
    domNodeCount: 200,
    maxDomDepth: 5,
  };

  const evalResult = evaluateStaticCwv(mockPage);
  assert.equal(evalResult.fact_status, 'deterministic_readiness_audit');
  assert.equal(evalResult.heuristics.render_blocking_scripts, 1);
  assert.equal(evalResult.heuristics.unsized_images, 1);
  assert.equal(evalResult.heuristics.missing_preconnect, true);
  assert.equal(evalResult.status.lcp, 'needs_improvement');
  assert.equal(evalResult.status.cls, 'needs_improvement');
  assert.ok(evalResult.issues.some((i) => i.vitals === 'LCP'));
  assert.ok(evalResult.issues.some((i) => i.vitals === 'CLS'));
});

test('evaluateStaticCwv recognizes optimized page with good vitals readiness', () => {
  const mockPage = {
    html: `<!DOCTYPE html>
<html>
<head>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <script async src="/bundle.js"></script>
</head>
<body>
  <h1>Clean Page</h1>
  <img src="/hero.webp" width="800" height="400">
</body>
</html>`,
    domNodeCount: 150,
    maxDomDepth: 4,
  };

  const evalResult = evaluateStaticCwv(mockPage);
  assert.equal(evalResult.heuristics.render_blocking_scripts, 0);
  assert.equal(evalResult.heuristics.unsized_images, 0);
  assert.equal(evalResult.status.lcp, 'good');
  assert.equal(evalResult.status.inp, 'good');
  assert.equal(evalResult.status.cls, 'good');
  assert.equal(evalResult.issues.length, 0);
});

test('formatSweepOutput renders clean text report', () => {
  const dummy = {
    target: 'https://example.com',
    total_pages_audited: 5,
    overall_health: 'optimal',
    crawl_and_indexability: {
      status_200_count: 5,
      non_200_count: 0,
      noindex_count: 0,
      canonical_issues_count: 0,
    },
    core_web_vitals: {
      summary: {
        lcp_readiness: 'good',
        inp_readiness: 'good',
        cls_readiness: 'good',
        total_lcp_blockers: 0,
        total_inp_risks: 0,
        unsized_images: 0,
        total_images: 5,
        image_dimension_coverage_pct: 100,
      },
      pages: [],
    },
    findings_summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    findings: [],
  };

  const output = formatSweepOutput(dummy);
  assert.match(output, /Technical SEO Sweep & Core Web Vitals Report/);
  assert.match(output, /HTTP 200 OK: 5\/5/);
  assert.match(output, /LCP Readiness: GOOD/);
});
