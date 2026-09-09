import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';

/**
 * Generate a prioritized A/B experiment backlog from CRO audit findings.
 */
export function generateExperimentBacklog(findings = [], { dailyVisitors = 500, baselineRate = 0.02, defaultMde = 0.12 } = {}) {
  const croFindings = findings.filter((f) => (f.detector_id || '').startsWith('CRO-') || f.discipline?.includes('cro'));

  const backlog = [];

  for (let i = 0; i < croFindings.length; i++) {
    const f = croFindings[i];
    const ns = f.detector_id;
    const pageUrl = f.subject?.identifier || f.subject?.url || '/';

    let title = '';
    let change = '';
    let rationale = f.observation?.summary || 'Friction detected on conversion pathway';
    let expectedMde = defaultMde;
    let primaryMetric = 'conversion_rate';
    let secondaryMetrics = ['bounce_rate', 'form_completion_rate'];

    switch (ns) {
      case 'CRO-001':
        title = 'Prominent Interactive Hero CTA Deployment';
        change = 'Deploy prominent, high-contrast primary CTA button matching declared conversion intent';
        expectedMde = 0.15;
        break;
      case 'CRO-002':
        title = 'Form Friction Reduction & Progressive Profiling';
        change = 'Condense lead capture form from >6 fields to 3 essential fields with progressive disclosure';
        expectedMde = 0.20;
        primaryMetric = 'lead_submission_rate';
        break;
      case 'CRO-005':
        title = 'Ad-to-Landing Scent Match Alignment';
        change = 'Align above-the-fold H1 headline and value proposition directly with title and ad intent';
        expectedMde = 0.12;
        break;
      case 'CRO-006':
        title = 'Proximate Trust Proof & Security Badges';
        change = 'Position verified customer logo bar and security certification badges immediately below primary CTA';
        expectedMde = 0.10;
        break;
      case 'CRO-007':
        title = 'HTML5 Autocomplete Form Optimization';
        change = 'Inject standard HTML5 autocomplete attributes on all identity, email, and telephone fields';
        expectedMde = 0.08;
        primaryMetric = 'form_completion_speed';
        break;
      case 'CRO-010':
        title = 'Hero Choice Overload Elimination';
        change = 'Consolidate competing hero buttons into exactly ONE dominant primary action and one text link';
        expectedMde = 0.14;
        break;
      case 'CRO-012':
        title = 'High-Intent Value CTA Microcopy';
        change = 'Replace generic "Submit" or "Learn More" with action-oriented value copy ("Get My Free Analysis")';
        expectedMde = 0.10;
        break;
      case 'CRO-013':
        title = 'Enclosed Distraction-Free Checkout Funnel';
        change = 'Remove global header navigation and external outbound links on checkout/pricing steps';
        expectedMde = 0.15;
        break;
      case 'CRO-021':
        title = 'Express Payment Wallet Integration';
        change = 'Implement 1-click Apple Pay, Google Pay, and PayPal express wallet buttons';
        expectedMde = 0.18;
        primaryMetric = 'checkout_conversion_rate';
        break;
      default:
        title = `Remediation for ${f.name || ns}`;
        change = f.remediation?.preferred || 'Implement recommended conversion design system component';
        expectedMde = defaultMde;
    }

    // Falsifiable hypothesis formulation
    const hypothesis = `If we ${change} on ${pageUrl}, then ${primaryMetric} will increase by at least ${Math.round(expectedMde * 100)}%, because ${rationale.toLowerCase()}.`;

    // Sample size calculation (two-tailed alpha=0.05, power=0.80)
    const p1 = baselineRate;
    const p2 = p1 * (1 + expectedMde);
    const pBar = (p1 + p2) / 2;
    const zAlpha = 1.96;
    const zBeta = 0.8416;
    const num = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
    const den = Math.pow(p2 - p1, 2);
    const nPerVariant = Math.ceil(num / den);
    const totalSample = nPerVariant * 2;
    const estDays = Math.max(7, Math.ceil(totalSample / dailyVisitors));

    // Impact, Effort, Confidence (ICE)
    const impact = Math.min(10, Math.max(4, Math.round(expectedMde * 50)));
    const effort = ['CRO-007', 'CRO-012', 'CRO-005'].includes(ns) ? 2 : ['CRO-001', 'CRO-006', 'CRO-010'].includes(ns) ? 4 : 6;
    const confidence = f.classification?.deterministic ? 9 : 7;
    const iceScore = Math.round(((impact * confidence) / effort) * 10) / 10;

    backlog.push({
      experiment_id: `EXP-CRO-${String(i + 1).padStart(3, '0')}`,
      title,
      detector_id: ns,
      target_page: pageUrl,
      hypothesis,
      discipline: ['cro'],
      primary_metric: primaryMetric,
      secondary_metrics: secondaryMetrics,
      statistical_setup: {
        baseline_rate_pct: Math.round(baselineRate * 1000) / 10,
        expected_mde_pct: Math.round(expectedMde * 100),
        confidence_level_pct: 95,
        power_pct: 80,
        sample_size_per_variant: nPerVariant,
        total_sample_required: totalSample,
        estimated_duration_days: estDays,
        daily_visitors: dailyVisitors,
      },
      guardrails: [
        'SEO Retention: Variant must preserve all canonical tags, JSON-LD structured data, and meta robots tags',
        'Performance Guardrail: Mobile LCP must not degrade by > 250ms; CLS must remain <= 0.10',
        'Secondary Safety Metric: Bounce rate must not increase by > 5% relative to control',
      ],
      stopping_criteria: [
        'Minimum Duration Lock: Run for at least 7 full days to account for day-of-week seasonality, regardless of early p-values',
        'Sample Ratio Mismatch (SRM): Terminate immediately if traffic allocation deviates significantly (chi-square p < 0.001)',
        'Maximum Duration Cap: Stop and conclude as inconclusive if required sample size is not reached within 45 days',
      ],
      ice_prioritization: {
        impact,
        effort,
        confidence,
        ice_score: iceScore,
        quadrant: impact >= 6 && effort <= 4 ? 'quick_wins' : impact >= 6 ? 'strategic_bets' : 'low_hanging_fruit',
      },
      status: 'draft',
    });
  }

  // Sort by ICE score descending
  backlog.sort((a, b) => b.ice_prioritization.ice_score - a.ice_prioritization.ice_score);

  return {
    fact_status: 'experiment_backlog_projection',
    total_experiments: backlog.length,
    summary: {
      quick_wins: backlog.filter((e) => e.ice_prioritization.quadrant === 'quick_wins').length,
      strategic_bets: backlog.filter((e) => e.ice_prioritization.quadrant === 'strategic_bets').length,
      low_hanging_fruit: backlog.filter((e) => e.ice_prioritization.quadrant === 'low_hanging_fruit').length,
    },
    experiments: backlog,
  };
}

/**
 * Format Experiment Backlog as Markdown
 */
export function formatBacklogMarkdown(backlog) {
  const lines = [
    `# Conversion Experimentation Backlog & Hypothesis Register`,
    `=========================================================`,
    `Total Hypotheses: ${backlog.total_experiments} | Quick Wins: ${backlog.summary.quick_wins} | Strategic Bets: ${backlog.summary.strategic_bets}`,
    ``,
    `Methodology: Every experiment requires a falsifiable hypothesis, statistical power calculations, SEO guardrails, and stopping criteria.`,
    ``,
  ];

  for (const exp of backlog.experiments) {
    lines.push(`## [${exp.ice_prioritization.quadrant.toUpperCase()}] ${exp.experiment_id}: ${exp.title}`);
    lines.push(`- **Target Surface**: \`${exp.target_page}\` (Trigger: \`${exp.detector_id}\`)`);
    lines.push(`- **Falsifiable Hypothesis**: "${exp.hypothesis}"`);
    lines.push(`- **Primary Metric**: \`${exp.primary_metric}\` | **Expected MDE**: +${exp.statistical_setup.expected_mde_pct}%`);
    lines.push(`- **Statistical Blueprint**: ${exp.statistical_setup.sample_size_per_variant.toLocaleString()} visitors/variant (~${exp.statistical_setup.estimated_duration_days} days at ${exp.statistical_setup.daily_visitors} visitors/day, 80% power @ 95% conf)`);
    lines.push(`- **ICE Score**: **${exp.ice_prioritization.ice_score}** (Impact: ${exp.ice_prioritization.impact}/10, Effort: ${exp.ice_prioritization.effort}/10, Conf: ${exp.ice_prioritization.confidence}/10)`);
    lines.push(`- **Guardrails**: ${exp.guardrails.join('; ')}`);
    lines.push(`- **Stopping Criteria**: ${exp.stopping_criteria.join('; ')}`);
    lines.push(``);
  }

  return lines.join('\n');
}
