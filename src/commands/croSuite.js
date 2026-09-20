import fs from 'node:fs';
import path from 'node:path';
import { buildContext } from './context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, indexTargets, pageSubject, safePath } from '../detectors/framework.js';
import { auditPageCro } from '../analysis/croAudit.js';
import { analyzeConversionFunnel } from '../analysis/funnelAnalysis.js';
import { analyzeBehavioralTelemetry } from '../analysis/behavioral.js';
import { generateExperimentBacklog, formatBacklogMarkdown } from './croBacklog.js';
import { buildIceMatrix, formatIceMatrixOutput } from '../analysis/iceMatrix.js';
import { buildCroRoadmap, formatCroRoadmapMarkdown } from '../analysis/croRoadmap.js';
import { downstreamEnvelope, completeLocalCoverage } from '../evidence/downstream.js';

/**
 * Full End-to-End CRO Intelligence Suite Audit
 */
export async function auditCroSuite(root, { target, baseUrl, refDate, input, funnelId, write = false } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('cro audit requires a site target (built output directory or URL)');

  // 1. Run CRO detectors across all pages
  const croDetectors = selectDetectors({ namespaces: ['CRO'] });
  const { findings } = runDetectors(croDetectors, ctx);

  const pages = indexTargets(ctx);
  const coverage = ctx.coverage || (pages.length > 0 ? completeLocalCoverage(pages, ctx.site.baseUrl) : null);
  const evidence = downstreamEnvelope(coverage);

  // 2. Above-the-fold clarity, trust, cognitive load, offer architecture per page
  const auditedPages = pages.map((page) => auditPageCro(page, ctx));

  // Average scores across commercial pages
  const commercialPages = auditedPages.filter((p) => {
    const u = (p.url || '').toLowerCase();
    return u.includes('pricing') || u.includes('product') || u.includes('feature') || u.includes('checkout') || u.endsWith('/') || u.includes('landing');
  });
  const targetGroup = commercialPages.length > 0 ? commercialPages : auditedPages;

  const avgAtfClarity = targetGroup.length > 0 && evidence.determination_status !== 'indeterminate'
    ? Math.round(targetGroup.reduce((acc, p) => acc + p.atf_clarity.score, 0) / targetGroup.length)
    : null;

  const avgTrustScore = targetGroup.length > 0 && evidence.determination_status !== 'indeterminate'
    ? Math.round(targetGroup.reduce((acc, p) => acc + p.trust_and_credibility.score, 0) / targetGroup.length)
    : null;

  const avgConversionReadiness = targetGroup.length > 0 && evidence.determination_status !== 'indeterminate'
    ? Math.round(targetGroup.reduce((acc, p) => acc + p.conversion_readiness_score, 0) / targetGroup.length)
    : null;

  // 3. End-to-end Funnel and Conversion-Path Analysis
  const declaredFunnel = (ctx.registries?.funnels?.entries || []).find((f) => funnelId ? f.funnel_id === funnelId : true) || null;
  const funnelAnalysis = analyzeConversionFunnel(ctx.site.pages, declaredFunnel);
  const qualify = (value) => evidence.determination_status === 'supported' ? value : null;
  const qualifiedFunnel = {
    ...funnelAnalysis,
    funnel_health_score: qualify(funnelAnalysis.funnel_health_score),
    determination_status: evidence.determination_status,
    coverage_status: evidence.coverage_status,
    limitations: evidence.limitations,
  };

  // 4. Behavioral Evidence Analysis (if telemetry file provided)
  let behavioralAnalysis = null;
  if (input) {
    const filePath = path.resolve(root, input);
    if (fs.existsSync(filePath)) {
      try {
        const rawTelemetry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        behavioralAnalysis = analyzeBehavioralTelemetry(rawTelemetry);
      } catch (err) {
        // Non-blocking parse error
      }
    }
  }

  // 5. Experiment Backlog with Falsifiable Hypotheses
  const experimentBacklog = generateExperimentBacklog(findings);
  const qualifiedExperimentBacklog = {
    ...experimentBacklog,
    total_experiments: qualify(experimentBacklog.total_experiments),
    determination_status: evidence.determination_status,
    coverage_status: evidence.coverage_status,
    limitations: evidence.limitations,
  };

  // 6. Impact / Effort / Confidence (ICE) Prioritization Matrix
  const iceMatrix = buildIceMatrix(findings, { type: 'findings' });
  const qualifiedIceMatrix = {
    ...iceMatrix,
    determination_status: evidence.determination_status,
    coverage_status: evidence.coverage_status,
    limitations: evidence.limitations,
    summary: {
      ...iceMatrix.summary,
      quick_wins_count: qualify(iceMatrix.summary.quick_wins_count),
    },
  };

  // 7. 30 / 90 / 180-Day CRO Strategic Roadmap tied to Measurable Conversion Outcomes
  const targetDomain = ctx.site.baseUrl ? new URL(ctx.site.baseUrl).hostname : 'target-site';
  const croRoadmap = buildCroRoadmap({
    findings,
    targetDomain,
  });
  const qualifiedRoadmap = {
    ...croRoadmap,
    determination_status: evidence.determination_status,
    coverage_status: evidence.coverage_status,
    limitations: evidence.limitations,
  };

  const result = {
    fact_status: 'modeled_cro_evaluation',
    target: ctx.site.baseUrl || target,
    total_pages_audited: pages.length,
    coverage_status: evidence.coverage_status,
    determination_status: evidence.determination_status,
    evidence_scope: evidence.evidence_scope,
    limitations: evidence.limitations,
    summary: {
      conversion_readiness_score: avgConversionReadiness,
      atf_clarity_score: avgAtfClarity,
      trust_credibility_score: avgTrustScore,
      funnel_health_score: qualifiedFunnel.funnel_health_score,
      total_cro_findings: findings.length,
      planned_experiments: qualifiedExperimentBacklog.total_experiments,
      quick_wins_count: qualifiedIceMatrix.summary.quick_wins_count,
    },
    funnel_analysis: qualifiedFunnel,
    pages: auditedPages,
    behavioral_telemetry: behavioralAnalysis,
    experiment_backlog: qualifiedExperimentBacklog,
    ice_matrix: qualifiedIceMatrix,
    strategic_roadmap: qualifiedRoadmap,
    findings: findings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      subject: f.subject.identifier || f.subject.url,
      summary: f.observation.summary,
      remediation: f.remediation?.preferred,
    })),
  };

  return result;
}

/**
 * Format Human-Readable CRO Suite Terminal Report
 */
export function formatCroSuiteOutput(r) {
  const lines = [
    `Conversion Rate Optimization (CRO) & Journey Intelligence Suite`,
    `==============================================================`,
    `Target: ${r.target}`,
    `Audited Pages: ${r.total_pages_audited} | Conversion Readiness Score: ${r.summary.conversion_readiness_score}/100`,
    ``,
    `CORE PILLAR SCORES:`,
    `  Above-The-Fold Clarity & Message Match:  ${r.summary.atf_clarity_score} / 100`,
    `  Trust, Credibility & Risk-Reversal:      ${r.summary.trust_credibility_score} / 100`,
    `  End-to-End Funnel Health:                ${r.summary.funnel_health_score} / 100 (${r.funnel_analysis.status.toUpperCase()})`,
    `  Active CRO Findings:                     ${r.summary.total_cro_findings} defect(s)`,
    ``,
    `END-TO-END CONVERSION PATH ANALYSIS (${r.funnel_analysis.funnel_name}):`,
  ];

  for (const s of r.funnel_analysis.steps) {
    const status = s.continuity_intact ? 'INTACT' : 'BROKEN';
    lines.push(`  Step ${s.step}: [${s.role.toUpperCase()}] ${s.name} (${s.url}) → ${status} (Drop-off risk: ${s.drop_off_risk.toUpperCase()})`);
  }

  if (r.funnel_analysis.leaks.length) {
    lines.push(``, `Identified Conversion Leaks:`);
    for (const leak of r.funnel_analysis.leaks) {
      lines.push(`  - [${leak.severity.toUpperCase()}] (${leak.type}) ${leak.description}`);
    }
  }

  lines.push(``, `EXPERIMENTATION BACKLOG (${r.experiment_backlog.total_experiments} falsifiable hypotheses generated):`);
  for (const exp of r.experiment_backlog.experiments.slice(0, 5)) {
    lines.push(`  [${exp.ice_prioritization.quadrant.toUpperCase()}] ${exp.experiment_id}: ${exp.title} (Expected MDE: +${exp.statistical_setup.expected_mde_pct}%, ICE: ${exp.ice_prioritization.ice_score})`);
    lines.push(`    Hypothesis: "${exp.hypothesis}"`);
  }

  lines.push(``, `30 / 90 / 180-DAY CRO STRATEGIC ROADMAP:`);
  for (const h of r.strategic_roadmap.horizons) {
    lines.push(`  ${h.label}:`);
    lines.push(`    Goal: ${h.objective}`);
    lines.push(`    Target KPI: ${h.measurable_conversion_kpi}`);
    lines.push(`    Sequenced Experiments: ${h.experiments.length} experiment(s)`);
  }

  return lines.join('\n');
}
