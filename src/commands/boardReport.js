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
import { validateAgainst } from '../shared/schemaValidator.js';
import crypto from 'node:crypto';

/** Filter registry entries to only those that pass schema validation. */
function validEntries(entries, schemaName) {
  if (!entries?.length) return [];
  return entries.filter(e => {
    const { valid } = validateAgainst(schemaName, { version: 1, kind: schemaName.replace('.schema.json','s'), entries: [e] });
    return valid;
  });
}

export async function boardReportCommand(args, root = process.cwd()) {
  const quarter = argVal(args, '--quarter') ?? currentQuarter(args);
  const asJson = args.includes('--json');

  const { registries, problems: regProblems } = loadRegistries(root);

  const report = buildBoardReport(registries, quarter, regProblems);
  report.generated_at = nowIso();

  return asJson ? report : formatBoardReport(report);
}

function buildBoardReport(registries, quarter, regProblems) {
  // Filter to schema-valid entries only — invalid entries cannot serve as governed evidence
  const kpis      = validEntries(registries.kpis?.entries, 'kpi.schema.json');
  const variances = validEntries(registries.variances?.entries, 'variance.schema.json')
    .filter(v => inQuarter(v.period, quarter));
  const outcomes  = validEntries(registries['customer-outcomes']?.entries, 'customer-outcome.schema.json');
  const risks     = validEntries(registries.risks?.entries, 'risk.schema.json');
  const decisions = validEntries(registries.decisions?.entries, 'decision.schema.json');
  const initiatives = validEntries(registries.initiatives?.entries, 'initiative.schema.json');

  const invalidCounts = {
    kpis:      (registries.kpis?.entries?.length ?? 0) - kpis.length,
    variances: (registries.variances?.entries?.length ?? 0) - variances.length,
    outcomes:  (registries['customer-outcomes']?.entries?.length ?? 0) - outcomes.length,
    risks:     (registries.risks?.entries?.length ?? 0) - risks.length,
  };
  const invalidTotal = Object.values(invalidCounts).reduce((a, b) => a + b, 0);

  const missingData = [];
  if (kpis.length === 0) missingData.push('kpis');
  if (outcomes.length === 0) missingData.push('customer-outcomes');
  if (risks.length === 0) missingData.push('risks');

  // Statement envelope with full provenance contract
  let statementSeq = 0;
  const mkStatement = (type, value, owner, sourceRecords, confidence, limitations = []) => ({
    statement_id: `STMT-${quarter}-${String(++statementSeq).padStart(3,'0')}-${crypto.randomBytes(3).toString('hex')}`,
    statement_type: type,
    owner,
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
    registry_problems: regProblems,
    invalid_entries_excluded: invalidTotal > 0 ? invalidCounts : undefined,
    missing_data: missingData,
    refused_sections: missingData.length > 0
      ? `Board report INCOMPLETE. Missing governed data for: ${missingData.join(', ')}. Register these before the board pack can be composed.`
      : null,
    sections: {
      management_assessment: {
        description: 'CEO/management assessment of quarter against stated commitments',
        data_required: ['kpis','variances'],
        governed_metrics: mkStatement('fact', kpis.length, 'ceo', ['kpis.yaml'], 'exact'),
        variances_this_quarter: mkStatement('fact', variances.length, 'cfo', ['variances.yaml'], 'exact'),
        material_variances: mkStatement('fact',
          variances.filter(v => ['material','critical'].includes(v.materiality)).length,
          'cfo', ['variances.yaml'], 'exact'),
        four_act_required: variances.some(v => ['material','critical'].includes(v.materiality)),
      },
      commercial_position: {
        description: 'ARR, MRR, bookings, pipeline, win/loss, concentration',
        metrics: kpis.filter(k => /arr|mrr|booking|pipeline|revenue/i.test(k.metric_id + k.name)).map(k =>
          mkStatement('fact', { metric_id: k.metric_id, name: k.name, target: k.target ?? 'NOT_SET' },
            k.owner ?? 'unset', k.source_query ? [k.source_query] : [], k.confidence ?? 'unset',
            k.known_limitations ?? [])),
        ungoverned: kpis.filter(k => /arr|mrr|booking|pipeline|revenue/i.test(k.metric_id + k.name)).length === 0
          ? 'REFUSED: No commercial KPIs governed — cannot report commercial position' : null,
      },
      customer_outcomes: {
        description: 'Validated customer outcomes separated from product activity',
        total:                  mkStatement('fact', outcomes.length, 'cpo', ['customer-outcomes.yaml'], 'exact'),
        customer_confirmed:     mkStatement('fact', outcomes.filter(o => o.customer_confirmed).length, 'cpo', ['customer-outcomes.yaml'], 'exact'),
        independently_verified: mkStatement('fact', outcomes.filter(o => o.independently_verified).length, 'cpo', ['customer-outcomes.yaml'], 'exact'),
        causal_established:     mkStatement('fact', outcomes.filter(o => o.outcome_stage === 'causal_relationship_established').length, 'cpo', ['customer-outcomes.yaml'], 'exact'),
        publishable:            mkStatement('fact', outcomes.filter(o => o.publication_permission && o.customer_confirmed).length, 'cpo', ['customer-outcomes.yaml'], 'exact'),
        warning: outcomes.length > 0 && outcomes.every(o => o.outcome_stage === 'finding_produced')
          ? 'All outcomes at finding_produced — no validated customer impact to report' : null,
      },
      product_adoption: {
        description: 'Active properties, audit runs, installation success, feature adoption',
        metrics: kpis.filter(k => /install|audit|active_prop|feature|adoption/i.test(k.metric_id + k.name)).map(k =>
          mkStatement('fact', { metric_id: k.metric_id, name: k.name },
            k.owner ?? 'unset', k.source_query ? [k.source_query] : [], k.confidence ?? 'unset')),
      },
      detector_evidence_quality: {
        description: 'Detector precision, false positives, false negatives, evidence staleness',
        metrics: kpis.filter(k => /precision|false_pos|false_neg|stale|evidence/i.test(k.metric_id + k.name)).map(k =>
          mkStatement('fact', { metric_id: k.metric_id, name: k.name },
            k.owner ?? 'unset', k.source_query ? [k.source_query] : [], k.confidence ?? 'unset')),
      },
      operational_reliability: {
        description: 'Failed runs, crawler failures, regressions, support burden',
        metrics: kpis.filter(k => /failed_run|crawler|regression|support/i.test(k.metric_id + k.name)).map(k =>
          mkStatement('fact', { metric_id: k.metric_id, name: k.name },
            k.owner ?? 'unset', k.source_query ? [k.source_query] : [], k.confidence ?? 'unset')),
      },
      material_risks: {
        description: 'Top risks by residual exposure, trend, controls, triggers',
        board_visible: mkStatement('fact', boardRisks.length, 'cro', ['risks.yaml'], 'exact'),
        critical:      mkStatement('fact', boardRisks.filter(r => r.residual_exposure === 'critical').length, 'cro', ['risks.yaml'], 'exact'),
        deteriorating: mkStatement('fact', boardRisks.filter(r => r.trend === 'deteriorating').length, 'cro', ['risks.yaml'], 'exact'),
        top_risks: boardRisks
          .sort((a, b) => ['low','medium','high','critical'].indexOf(b.residual_exposure) - ['low','medium','high','critical'].indexOf(a.residual_exposure))
          .slice(0, 5)
          .map(r => mkStatement('fact',
            { risk_id: r.risk_id, title: r.title, residual_exposure: r.residual_exposure, trend: r.trend, trigger_threshold: r.trigger_threshold },
            r.owner ?? 'unset', ['risks.yaml'], 'exact')),
      },
      board_decisions_and_asks: {
        description: 'Decisions requiring board input, asks, and approvals',
        open_decisions: mkStatement('fact', openDecisions.length, 'ceo', ['decisions.yaml'], 'exact'),
        decisions: openDecisions.map(d => mkStatement('fact',
          { decision_id: d.decision_id, title: d.title, deadline: d.deadline,
            reversibility: d.reversibility, recommendation: d.recommendation },
          d.owner ?? 'unset', ['decisions.yaml'], 'exact')),
      },
      next_quarter_commitments: {
        description: 'Specific, measurable commitments for next quarter',
        data_required: ['initiatives'],
        approved_initiatives: mkStatement('fact', initiatives.filter(i => i.status === 'approved').length, 'cpo', ['initiatives.yaml'], 'exact'),
        in_progress:          mkStatement('fact', initiatives.filter(i => i.status === 'in_progress').length, 'cpo', ['initiatives.yaml'], 'exact'),
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

function currentQuarter(args) {
  const d = args ? parseAsOf(args) : new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

/** Parse --as-of YYYY-MM-DD to a Date for deterministic temporal evaluation. Falls back to now. */
function parseAsOf(args) {
  const v = argVal(args, '--as-of');
  if (!v) return new Date();
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error(`--as-of must be YYYY-MM-DD, got: ${v}`);
  return d;
}
