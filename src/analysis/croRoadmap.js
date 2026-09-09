import { nowIso } from '../shared/io.js';
import { generateExperimentBacklog } from '../commands/croBacklog.js';

/**
 * Generate a 30 / 90 / 180-Day CRO Roadmap tied to measurable conversion outcomes.
 */
export function buildCroRoadmap({ findings = [], targetDomain = 'example.com', dailyVisitors = 500, baselineRate = 0.02 } = {}) {
  const backlog = generateExperimentBacklog(findings, { dailyVisitors, baselineRate });

  const horizon30 = {
    horizon: '30_days',
    label: 'Days 1 - 30: Immediate Mechanical Friction Removal (Quick Wins)',
    objective: 'Eradicate mechanical conversion leaks, keystroke friction, and title-to-H1 scent divergence.',
    focus_areas: [
      'Funnel Continuity: Fix broken conversion progression links and attribution parameter loss (CRO-017, CRO-018)',
      'Keystroke Friction: Inject HTML5 autocomplete attributes on all form fields (CRO-007) to reduce manual typing by up to 70%',
      'Information Scent: Align above-the-fold H1 headlines directly with title and ad intent to close scent gaps (CRO-005)',
      'Mobile Tap Sizing: Expand diminutive mobile CTA touch targets to >= 48px standard (CRO-015)',
    ],
    target_outcomes: [
      '100% conversion funnel continuity intact across all declared paths',
      'Keystroke Effort Index: Form completion friction reduced by >= 40%',
      'Above-the-fold information scent match verified across all primary landing pages',
      'Zero mobile touch target defects under 48px',
    ],
    measurable_conversion_kpi: 'Form Completion Rate (+8% to +15% expected relative lift)',
    experiments: backlog.experiments.filter((e) => ['CRO-007', 'CRO-005', 'CRO-015', 'CRO-017', 'CRO-018'].includes(e.detector_id) || e.ice_prioritization.effort <= 3),
  };

  const horizon90 = {
    horizon: '90_days',
    label: 'Days 31 - 90: Offer Architecture, Credibility & Governed A/B Testing',
    objective: 'Overhaul value proposition hierarchy, deploy proximate social proof and risk-reversals, and run governed A/B experiments.',
    focus_areas: [
      'Choice Overload: Consolidate competing hero buttons into exactly ONE dominant primary action and one secondary link (CRO-010)',
      'Microcopy Elevation: Replace generic "Submit" / "Click Here" with high-intent benefit microcopy (CRO-012)',
      'Credibility & Proof: Position enterprise client logos and security badges immediately adjacent to conversion buttons (CRO-006)',
      'Objection Reversal: Deploy pre-purchase FAQ accordions directly addressing pricing, security, and contract terms',
      'Governed Experimentation: Launch first wave of A/B tests with statistical power and SRM sample-ratio mismatch guardrails',
    ],
    target_outcomes: [
      'Primary CTA Conspicuity Index (PCI) >= 70% with zero choice overload',
      'Trust & Credibility score >= 75/100 across commercial surfaces',
      'Statistically validated A/B experiment win with zero SRM violations (p >= 0.001)',
      'At least 2 high-confidence Nebula Component remediations verified in production',
    ],
    measurable_conversion_kpi: 'Lead Capture / Trial Signup Rate (+12% to +20% expected relative lift)',
    experiments: backlog.experiments.filter((e) => ['CRO-001', 'CRO-006', 'CRO-010', 'CRO-012', 'CRO-002'].includes(e.detector_id)),
  };

  const horizon180 = {
    horizon: '180_days',
    label: 'Days 91 - 180: Payment Acceleration, Funnel Enclosure & Continuous Optimization',
    objective: 'Accelerate checkout velocity with express payment wallets, enclose high-intent funnels, and automate regression monitoring.',
    focus_areas: [
      'Express Checkout: Integrate 1-click Apple Pay, Google Pay, and PayPal express wallet buttons on purchase steps (CRO-021)',
      'Distraction-Free Funnels: Enclose checkout steps by stripping non-essential navigation and external outbound links (CRO-013)',
      'AI-Scent Landing Personalization: Ground landing pages cited by AI answer engines with immediate claim corroboration (CRO-019)',
      'Automated Governance: Schedule weekly continuous CRO audits with automated webhook regression alerts',
    ],
    target_outcomes: [
      'Checkout completion rate lift of +15% to +25%',
      'Zero distraction leaks on checkout and demo request steps',
      'AI answer engine referral conversion parity with organic search',
      'Fully automated, version-pinned continuous conversion governance active',
    ],
    measurable_conversion_kpi: 'Checkout / Revenue Conversion Rate (+15% to +25% expected relative lift)',
    experiments: backlog.experiments.filter((e) => ['CRO-021', 'CRO-013', 'CRO-019', 'CRO-014', 'CRO-020'].includes(e.detector_id)),
  };

  return {
    fact_status: 'cro_roadmap_projection',
    target_domain: targetDomain,
    generated_at: nowIso(),
    total_planned_experiments: backlog.total_experiments,
    methodology: 'Horizon Phasing: 30-Day (Mechanical Friction) -> 90-Day (Offer & Trust) -> 180-Day (Payment & Scale)',
    horizons: [horizon30, horizon90, horizon180],
  };
}

/**
 * Format CRO Roadmap as GitHub-flavored Markdown
 */
export function formatCroRoadmapMarkdown(roadmap) {
  const lines = [
    `# 30 / 90 / 180-Day Conversion Rate Optimization (CRO) Roadmap`,
    `=============================================================`,
    `- Target: \`${roadmap.target_domain}\``,
    `- Generated: ${roadmap.generated_at}`,
    `- Planned Experiments: ${roadmap.total_planned_experiments}`,
    `- Strategic Framework: ${roadmap.methodology}`,
    ``,
    `> **Operating Premise Reminder**: This roadmap sequences verified conversion design remediations and A/B experiments. It eliminates friction and elevates decision clarity, but never guarantees conversion or revenue outcomes without empirical testing.`,
    ``,
  ];

  for (const h of roadmap.horizons) {
    lines.push(`## ${h.label}`);
    lines.push(``);
    lines.push(`**Core Objective**: ${h.objective}`);
    lines.push(`**Measurable Target KPI**: **${h.measurable_conversion_kpi}**`);
    lines.push(``);
    lines.push(`### Strategic Focus Areas:`);
    for (const f of h.focus_areas) lines.push(`- ${f}`);
    lines.push(``);
    lines.push(`### Target Outcomes & Success Milestones:`);
    for (const o of h.target_outcomes) lines.push(`- [ ] ${o}`);
    lines.push(``);
    if (h.experiments.length) {
      lines.push(`### Sequenced A/B Experiments (${h.experiments.length}):`);
      lines.push(`| Experiment ID | Title | Expected Lift | Sample Size | Est. Days | ICE Score |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);
      for (const e of h.experiments) {
        lines.push(`| **${e.experiment_id}** | ${e.title.slice(0, 35)} | +${e.statistical_setup.expected_mde_pct}% | ${e.statistical_setup.sample_size_per_variant.toLocaleString()}/var | ~${e.statistical_setup.estimated_duration_days}d | **${e.ice_prioritization.ice_score}** |`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}
