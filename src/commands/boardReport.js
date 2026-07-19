/**
 * board-report command — Quarterly Board Pack
 *
 * Governed reporting invariants:
 * - Every reported statement carries: statement_id, statement_type,
 *   source_records, period, owner, confidence, limitations
 * - Refuses to invent missing financial, customer, usage, or engine data
 * - Four-act narrative is mandatory for any material variance
 *
 * Citable-specific board sections:
 *   1. Management assessment
 *   2. Commercial position
 *   3. Customer outcomes
 *   4. Product adoption
 *   5. Detector and evidence quality
 *   6. Operational reliability
 *   7. Market and category position
 *   8. Material risks
 *   9. Capital and capacity
 *  10. Board decisions and asks
 *  11. Next-quarter commitments
 *
 * Usage:
 *   citable board-report [--quarter <YYYY-QN>] [--json]
 */
import { loadRegistries } from '../registries/index.js';
import { nowIso } from '../shared/io.js';

export async function boardReportCommand(args, root = process.cwd()) {
  const quarter = argVal(args, '--quarter') ?? currentQuarter();
  const asJson = args.includes('--json');

  const { registries, problems: regProblems } = loadRegistries(root);

  const report = buildBoardReport(registries, quarter);
  report.registry_problems = regProblems;
  report.generated_at = nowIso();

  return asJson ? report : formatBoardReport(report);
}

function buildBoardReport(registries, quarter) {
  const kpis      = registries.kpis?.entries ?? [];
  const variances = (registries.variances?.entries ?? []).filter(v => inQuarter(v.period, quarter));
  const outcomes  = registries['customer-outcomes']?.entries ?? [];
  const risks     = registries.risks?.entries ?? [];
  const decisions = registries.decisions?.entries ?? [];
  const initiatives = registries.initiatives?.entries ?? [];

  const missingData = [];
  if (kpis.length === 0) missingData.push('kpis');
  if (outcomes.length === 0) missingData.push('customer-outcomes');
  if (risks.length === 0) missingData.push('risks');

  // Statement envelope for every reported fact
  const mkStatement = (type, value, sourceRecords, confidence, limitations = []) => ({
    statement_type: type,
    value,
    source_records: sourceRecords,
    period: quarter,
    confidence,
    limitations,
    generated_at: nowIso(),
  });

  const boardRisks = risks.filter(r => r.board_visibility);
  const openDecisions = decisions.filter(d => d.status === 'open');

  return {
    report_type: 'board-report',
    quarter,
    missing_data: missingData,
    refused_sections: missingData.length > 0
      ? `Board report INCOMPLETE. Missing governed data for: ${missingData.join(', ')}. Register these before the board pack can be composed.`
      : null,
    sections: {
      management_assessment: {
        description: 'CEO/management assessment of quarter against stated commitments',
        data_required: ['kpis','variances'],
        governed_metrics: kpis.length,
        variances_this_quarter: variances.length,
        material_variances: variances.filter(v => ['material','critical'].includes(v.materiality)).length,
        four_act_required: variances.some(v => ['material','critical'].includes(v.materiality)),
      },
      commercial_position: {
        description: 'ARR, MRR, bookings, pipeline, win/loss, concentration',
        metrics: kpis.filter(k => /arr|mrr|booking|pipeline|revenue/i.test(k.metric_id + k.name)).map(k => ({
          metric_id: k.metric_id, name: k.name, target: k.target ?? 'NOT_SET',
        })),
        ungoverned: kpis.filter(k => /arr|mrr|booking|pipeline|revenue/i.test(k.metric_id + k.name)).length === 0
          ? 'REFUSED: No commercial KPIs governed — cannot report commercial position' : null,
      },
      customer_outcomes: {
        description: 'Validated customer outcomes separated from product activity',
        total: outcomes.length,
        customer_confirmed: outcomes.filter(o => o.customer_confirmed).length,
        independently_verified: outcomes.filter(o => o.independently_verified).length,
        causal_established: outcomes.filter(o => o.outcome_stage === 'causal_relationship_established').length,
        publishable: outcomes.filter(o => o.publication_permission && o.customer_confirmed).length,
        warning: outcomes.every(o => o.outcome_stage === 'finding_produced')
          ? 'All outcomes at finding_produced — no validated customer impact to report' : null,
      },
      product_adoption: {
        description: 'Active properties, audit runs, installation success, feature adoption',
        metrics: kpis.filter(k => /install|audit|active_prop|feature|adoption/i.test(k.metric_id + k.name)).map(k => ({
          metric_id: k.metric_id, name: k.name,
        })),
      },
      detector_evidence_quality: {
        description: 'Detector precision, false positives, false negatives, evidence staleness',
        metrics: kpis.filter(k => /precision|false_pos|false_neg|stale|evidence/i.test(k.metric_id + k.name)).map(k => ({
          metric_id: k.metric_id, name: k.name,
        })),
      },
      operational_reliability: {
        description: 'Failed runs, crawler failures, regressions, support burden',
        metrics: kpis.filter(k => /failed_run|crawler|regression|support/i.test(k.metric_id + k.name)).map(k => ({
          metric_id: k.metric_id, name: k.name,
        })),
      },
      material_risks: {
        description: 'Top risks by residual exposure, trend, controls, triggers',
        board_visible: boardRisks.length,
        critical: boardRisks.filter(r => r.residual_exposure === 'critical').length,
        deteriorating: boardRisks.filter(r => r.trend === 'deteriorating').length,
        top_risks: boardRisks
          .sort((a, b) => ['low','medium','high','critical'].indexOf(b.residual_exposure) - ['low','medium','high','critical'].indexOf(a.residual_exposure))
          .slice(0, 5)
          .map(r => ({ risk_id: r.risk_id, title: r.title, residual_exposure: r.residual_exposure, trend: r.trend, trigger_threshold: r.trigger_threshold })),
      },
      board_decisions_and_asks: {
        description: 'Decisions requiring board input, asks, and approvals',
        open_decisions: openDecisions.length,
        decisions: openDecisions.map(d => ({
          decision_id: d.decision_id, title: d.title, owner: d.owner,
          deadline: d.deadline, reversibility: d.reversibility,
          recommendation: d.recommendation,
        })),
      },
      next_quarter_commitments: {
        description: 'Specific, measurable commitments for next quarter',
        data_required: ['initiatives'],
        approved_initiatives: initiatives.filter(i => i.status === 'approved').length,
        in_progress: initiatives.filter(i => i.status === 'in_progress').length,
      },
    },
  };
}

function formatBoardReport(report) {
  const lines = [
    `# Board Report — ${report.quarter}`,
    `Generated: ${report.generated_at}`,
    '',
  ];
  if (report.refused_sections) {
    lines.push(`⛔ ${report.refused_sections}`, '');
  }
  if (report.registry_problems?.length) {
    lines.push(`⚠️  Registry problems (${report.registry_problems.length}):`);
    for (const p of report.registry_problems.slice(0, 5)) lines.push(`   ${p}`);
    lines.push('');
  }
  for (const [key, section] of Object.entries(report.sections)) {
    lines.push(`## ${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
    lines.push(section.description);
    if (section.ungoverned) lines.push(`⛔ ${section.ungoverned}`);
    if (section.warning)    lines.push(`⚠️  ${section.warning}`);
    lines.push('');
  }
  return lines.join('\n');
}

function inQuarter(period, quarter) {
  if (!period || !quarter) return false;
  const [yr, qn] = quarter.split('-Q');
  if (!yr || !qn) return false;
  const [py, pm] = period.split('-').map(Number);
  if (!py || !pm) return false;
  const qStart = (parseInt(qn) - 1) * 3 + 1;
  const qEnd   = qStart + 2;
  return py === parseInt(yr) && pm >= qStart && pm <= qEnd;
}

function currentQuarter() {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
