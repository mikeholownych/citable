import path from 'node:path';
import fs from 'node:fs';
import { parse as parseHtml } from 'node-html-parser';
import { buildContext } from './context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, indexTargets, pageSubject, safePath } from '../detectors/framework.js';

/**
 * CWV standard thresholds per Google / web.dev guidance
 */
export const CWV_THRESHOLDS = {
  lcp: { unit: 's', good: 2.5, needs_improvement: 4.0, description: 'Largest Contentful Paint' },
  inp: { unit: 'ms', good: 200, needs_improvement: 500, description: 'Interaction to Next Paint' },
  cls: { unit: 'score', good: 0.1, needs_improvement: 0.25, description: 'Cumulative Layout Shift' },
  fcp: { unit: 's', good: 1.8, needs_improvement: 3.0, description: 'First Contentful Paint' },
  ttfb: { unit: 'ms', good: 800, needs_improvement: 1800, description: 'Time to First Byte' },
};

/**
 * Evaluate static DOM heuristics for Core Web Vitals readiness
 */
export function evaluateStaticCwv(page) {
  const issues = [];
  const heuristics = {
    lcp_blockers: 0,
    inp_risks: 0,
    cls_risks: 0,
    unsized_images: 0,
    total_images: 0,
    render_blocking_scripts: 0,
    head_stylesheets: 0,
    lazy_above_fold: 0,
    missing_preconnect: false,
    dom_nodes: page.domNodeCount || 0,
    max_dom_depth: page.maxDomDepth || 0,
  };

  const html = page.html || '';
  const root = parseHtml(html);
  const head = root.querySelector('head');

  // 1. LCP checks
  if (head) {
    const scripts = head.querySelectorAll('script:not([async]):not([defer])');
    for (const s of scripts) {
      const src = s.getAttribute('src');
      if (src && !src.includes('analytics') && !src.includes('tracking')) {
        heuristics.render_blocking_scripts++;
      }
    }
    const stylesheets = head.querySelectorAll('link[rel="stylesheet"]');
    heuristics.head_stylesheets = stylesheets.length;

    const preconnects = head.querySelectorAll('link[rel="preconnect"]');
    const fontLinks = head.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[href*="typekit.net"]');
    if (fontLinks.length > 0 && preconnects.length === 0) {
      heuristics.missing_preconnect = true;
      issues.push({
        vitals: 'FCP/LCP',
        severity: 'low',
        issue: 'External font origin without preconnect link hint',
        remediation: 'Add <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      });
    }
  }

  if (heuristics.render_blocking_scripts > 0) {
    heuristics.lcp_blockers += heuristics.render_blocking_scripts;
    issues.push({
      vitals: 'LCP',
      severity: 'high',
      issue: `${heuristics.render_blocking_scripts} render-blocking script(s) in <head>`,
      remediation: 'Add async or defer attributes, or move scripts to end of <body>',
    });
  }

  if (heuristics.head_stylesheets > 5) {
    heuristics.lcp_blockers++;
    issues.push({
      vitals: 'LCP',
      severity: 'medium',
      issue: `${heuristics.head_stylesheets} stylesheets in <head> may delay first paint`,
      remediation: 'Inline critical CSS and defer non-critical stylesheets',
    });
  }

  // Hero image / lazy loading
  const imgs = root.querySelectorAll('img');
  heuristics.total_images = imgs.length;

  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    const loading = (img.getAttribute('loading') || '').toLowerCase();

    if (!width || !height) {
      heuristics.unsized_images++;
    }

    const numWidth = parseInt(width || '0', 10);
    if (numWidth > 400 && loading === 'lazy') {
      heuristics.lazy_above_fold++;
      heuristics.lcp_blockers++;
      issues.push({
        vitals: 'LCP',
        severity: 'high',
        issue: `Large hero image (${src || '<img>'}) uses loading="lazy", delaying LCP`,
        remediation: 'Remove loading="lazy" and add fetchpriority="high" to above-fold hero images',
      });
    }
  }

  // 2. CLS checks
  if (heuristics.unsized_images > 0) {
    heuristics.cls_risks += heuristics.unsized_images;
    issues.push({
      vitals: 'CLS',
      severity: 'medium',
      issue: `${heuristics.unsized_images} of ${heuristics.total_images} image(s) lack explicit width/height dimensions`,
      remediation: 'Set explicit width and height attributes or CSS aspect-ratio on all image elements',
    });
  }

  // 3. INP checks
  if (heuristics.dom_nodes > 1500) {
    heuristics.inp_risks++;
    issues.push({
      vitals: 'INP',
      severity: heuristics.dom_nodes > 3000 ? 'high' : 'medium',
      issue: `Excessive DOM size: ${heuristics.dom_nodes} nodes (Google recommends <= 1,500)`,
      remediation: 'Simplify DOM hierarchy, virtualize large lists, and defer non-critical components',
    });
  }

  if (heuristics.max_dom_depth > 32) {
    heuristics.inp_risks++;
    issues.push({
      vitals: 'INP',
      severity: 'medium',
      issue: `Deep DOM nesting: maximum depth ${heuristics.max_dom_depth} (Google recommends <= 32)`,
      remediation: 'Flatten nested layout wrapper containers',
    });
  }

  // Determine readiness status per vital
  const lcpStatus = heuristics.lcp_blockers === 0 ? 'good' : heuristics.lcp_blockers <= 2 ? 'needs_improvement' : 'poor';
  const inpStatus = heuristics.inp_risks === 0 ? 'good' : heuristics.inp_risks <= 1 ? 'needs_improvement' : 'poor';
  const clsStatus = heuristics.cls_risks === 0 ? 'good' : heuristics.cls_risks <= 2 ? 'needs_improvement' : 'poor';

  return {
    fact_status: 'deterministic_readiness_audit',
    status: {
      lcp: lcpStatus,
      inp: inpStatus,
      cls: clsStatus,
      fcp: heuristics.missing_preconnect || heuristics.render_blocking_scripts > 0 ? 'needs_improvement' : 'good',
      ttfb: 'unassessed_without_server_telemetry',
    },
    heuristics,
    issues,
  };
}

/**
 * Search recent audit runs for observed performance telemetry
 */
function findObservedPerformance(root, targetUrl) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) return null;

  try {
    const runs = fs.readdirSync(runsDir).sort().reverse();
    for (const run of runs) {
      const obsDir = path.join(runsDir, run, 'observations');
      if (!fs.existsSync(obsDir)) continue;
      const obsFiles = fs.readdirSync(obsDir).filter((f) => f.includes('performance') && f.endsWith('.json'));
      for (const file of obsFiles) {
        const obs = JSON.parse(fs.readFileSync(path.join(obsDir, file), 'utf8'));
        if (obs.kind === 'performance' && obs.state === 'observed') {
          return {
            source_run: run,
            provider: obs.data?.provider || 'Lighthouse',
            evidence_type: obs.data?.evidence_type || 'lab',
            metrics: {
              lcp_ms: obs.data?.largest_contentful_paint_ms ?? null,
              fcp_ms: obs.data?.first_contentful_paint_ms ?? null,
              cls: obs.data?.cumulative_layout_shift ?? null,
              tbt_ms: obs.data?.total_blocking_time_ms ?? null,
              score: obs.data?.performance_score ?? null,
            },
            collected_at: obs.collected_at,
          };
        }
      }
    }
  } catch {
    // Ignore non-blocking read errors
  }
  return null;
}

/**
 * `citable sweep technical` — execute a technical SEO sweep with Core Web Vitals metrics.
 */
export async function sweepTechnical(root, { target, baseUrl, refDate, page: pageFilter } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) {
    throw new Error('technical sweep requires a site target (built output directory or URL)');
  }

  // 1. Run technical detectors: TECH, CRAWL, CWV, ARCH, STATUS, LINK
  const technicalDetectors = selectDetectors({
    namespaces: ['TECH', 'CRAWL', 'CWV', 'ARCH', 'STATUS', 'LINK'],
  });
  const { findings } = runDetectors(technicalDetectors, ctx);

  // 2. Select target pages
  let pages = indexTargets(ctx);
  if (pageFilter) {
    const wanted = safePath(pageFilter, ctx.site.baseUrl);
    pages = pages.filter((p) => safePath(p.url) === wanted || p.sourceFile === pageFilter);
    if (!pages.length) throw new Error(`page not found in audited output: ${pageFilter}`);
  }

  // 3. Aggregate Core Web Vitals across audited pages
  const pageVitals = [];
  let totalLcpBlockers = 0;
  let totalInpRisks = 0;
  let totalClsRisks = 0;
  let totalUnsizedImages = 0;
  let totalImagesCount = 0;

  for (const page of pages) {
    const staticCwv = evaluateStaticCwv(page);
    totalLcpBlockers += staticCwv.heuristics.lcp_blockers;
    totalInpRisks += staticCwv.heuristics.inp_risks;
    totalClsRisks += staticCwv.heuristics.cls_risks;
    totalUnsizedImages += staticCwv.heuristics.unsized_images;
    totalImagesCount += staticCwv.heuristics.total_images;

    const observed = findObservedPerformance(root, page.url);

    pageVitals.push({
      url: page.url,
      status: page.status,
      cwv_readiness: staticCwv.status,
      heuristics: staticCwv.heuristics,
      issues: staticCwv.issues,
      observed_telemetry: observed,
    });
  }

  // 4. Crawl and indexability health summary
  const non200Pages = pages.filter((p) => p.status !== 200);
  const noindexPages = pages.filter((p) => p.noindex);
  const canonicalMismatches = pages.filter((p) => p.canonicals.length === 0 || p.canonicals.length > 1);

  // 5. Findings categorization
  const criticalFindings = findings.filter((f) => f.classification.severity === 'critical');
  const highFindings = findings.filter((f) => f.classification.severity === 'high');
  const mediumFindings = findings.filter((f) => f.classification.severity === 'medium');
  const lowFindings = findings.filter((f) => f.classification.severity === 'low' || f.classification.severity === 'informational');

  // Overall posture
  let overallHealth = 'optimal';
  if (criticalFindings.length > 0 || non200Pages.length > 0) {
    overallHealth = 'critical_blockers';
  } else if (highFindings.length > 0 || totalLcpBlockers > 3 || totalClsRisks > 5) {
    overallHealth = 'needs_attention';
  }

  const result = {
    target: ctx.site.baseUrl || target,
    total_pages_audited: pages.length,
    overall_health: overallHealth,
    crawl_and_indexability: {
      status_200_count: pages.length - non200Pages.length,
      non_200_count: non200Pages.length,
      noindex_count: noindexPages.length,
      canonical_issues_count: canonicalMismatches.length,
      details: non200Pages.map((p) => ({ url: p.url, status: p.status })),
    },
    core_web_vitals: {
      thresholds: CWV_THRESHOLDS,
      summary: {
        lcp_readiness: totalLcpBlockers === 0 ? 'good' : totalLcpBlockers <= 2 ? 'needs_improvement' : 'poor',
        inp_readiness: totalInpRisks === 0 ? 'good' : 'needs_improvement',
        cls_readiness: totalClsRisks === 0 ? 'good' : 'needs_improvement',
        total_lcp_blockers: totalLcpBlockers,
        total_inp_risks: totalInpRisks,
        unsized_images: totalUnsizedImages,
        total_images: totalImagesCount,
        image_dimension_coverage_pct: totalImagesCount > 0 ? Math.round(((totalImagesCount - totalUnsizedImages) / totalImagesCount) * 100) : 100,
      },
      pages: pageVitals,
    },
    findings_summary: {
      total: findings.length,
      critical: criticalFindings.length,
      high: highFindings.length,
      medium: mediumFindings.length,
      low: lowFindings.length,
    },
    findings: findings.map((f) => ({
      detector_id: f.detector_id,
      name: f.name,
      severity: f.classification.severity,
      subject: f.subject.identifier || f.subject.url,
      summary: f.observation.summary,
      remediation: f.remediation?.preferred,
    })),
  };

  return result;
}

/**
 * Format terminal output for `citable sweep technical`
 */
export function formatSweepOutput(r) {
  const lines = [
    `Technical SEO Sweep & Core Web Vitals Report`,
    `===========================================`,
    `Target: ${r.target}`,
    `Pages Audited: ${r.total_pages_audited}`,
    `Overall Health: ${r.overall_health.toUpperCase()}`,
    ``,
    `CRAWL & INDEXABILITY:`,
    `  HTTP 200 OK: ${r.crawl_and_indexability.status_200_count}/${r.total_pages_audited}`,
    `  Non-200 Statuses: ${r.crawl_and_indexability.non_200_count}`,
    `  Noindex Pages: ${r.crawl_and_indexability.noindex_count}`,
    `  Canonical Issues: ${r.crawl_and_indexability.canonical_issues_count}`,
    ``,
    `CORE WEB VITALS READINESS (Deterministic Static Audit):`,
    `  LCP Readiness: ${r.core_web_vitals.summary.lcp_readiness.toUpperCase()} (${r.core_web_vitals.summary.total_lcp_blockers} potential render blocker(s))`,
    `  INP Readiness: ${r.core_web_vitals.summary.inp_readiness.toUpperCase()} (${r.core_web_vitals.summary.total_inp_risks} DOM complexity risk(s))`,
    `  CLS Readiness: ${r.core_web_vitals.summary.cls_readiness.toUpperCase()} (${r.core_web_vitals.summary.unsized_images}/${r.core_web_vitals.summary.total_images} images lack dimensions; ${r.core_web_vitals.summary.image_dimension_coverage_pct}% coverage)`,
    ``,
    `CWV Threshold Standards:`,
    `  - LCP: <= ${CWV_THRESHOLDS.lcp.good}s (Good), <= ${CWV_THRESHOLDS.lcp.needs_improvement}s (Needs Improvement)`,
    `  - INP: <= ${CWV_THRESHOLDS.inp.good}ms (Good), <= ${CWV_THRESHOLDS.inp.needs_improvement}ms (Needs Improvement)`,
    `  - CLS: <= ${CWV_THRESHOLDS.cls.good} (Good), <= ${CWV_THRESHOLDS.cls.needs_improvement} (Needs Improvement)`,
    ``,
    `FINDINGS: ${r.findings_summary.total} total (critical:${r.findings_summary.critical} high:${r.findings_summary.high} medium:${r.findings_summary.medium} low:${r.findings_summary.low})`,
  ];

  if (r.findings.length) {
    lines.push(``, `Key Remediation Priorities:`);
    for (const f of r.findings.slice(0, 10)) {
      lines.push(`  [${f.detector_id}] (${f.severity}) ${f.summary}`);
      if (f.remediation) lines.push(`    Fix: ${f.remediation}`);
    }
  }

  return lines.join('\n');
}
