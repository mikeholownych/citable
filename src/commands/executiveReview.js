/**
 * executive-review command — Monthly Executive Operating Review
 *
 * Generates an evidence-first operating review. Produces an evidence
 * ledger first, then derives the narrative. Never generates a polished
 * positive summary when data is absent or ungoverned.
 *
 * Four-act invariant (mandatory):
 *   1. Where management said the company would be
 *   2. Where it actually is
 *   3. Why the variance exists
 *   4. What management is doing about it
 *
 * Usage:
 *   citable executive-review [--period <YYYY-MM>] [--json]
 */
import { checkReferentialIntegrity, loadRegistries } from '../registries/index.js';
import { nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { dateOnly, parseAsOf } from '../shared/asOf.js';


/** Filter registry entries to only those that pass schema validation. */
function validEntries(entries, schemaName) {
  if (!entries?.length) return [];
  return entries.filter(e => {
    const { valid } = validateAgainst(schemaName, { version: 1, kind: schemaName.replace('.schema.json','s'), entries: [e] });
    return valid;
  });
}

function validReferences(entries, kind, idField, problems) {
  return entries.filter(entry => !problems.some(problem => problem.startsWith(`${kind}/${entry[idField]}:`)));
}

export async function executiveReviewCommand(args, root = process.cwd()) {
  const asOf  = parseAsOf(args);
  const period = argVal(args, '--period') ?? currentPeriod(asOf);
  const asJson = args.includes('--json');

  const { registries, problems: regProblems } = loadRegistries(root);
  const refProblems = checkReferentialIntegrity(registries);

  const report = buildReview(registries, period, [...regProblems, ...refProblems], refProblems, asOf);
  report.generated_at = nowIso();
  report.as_of = dateOnly(asOf);

  return asJson ? report : formatReview(report);
}

function buildReview(registries, period, regProblems, refProblems, asOf) {
  // Filter to schema-valid and referentially valid governed evidence.
  const kpis = validEntries(registries.kpis?.entries, 'kpi.schema.json');
  const validVariances = validReferences(validEntries(registries.variances?.entries, 'variance.schema.json'), 'variances', 'variance_id', refProblems);
  const variances = validVariances.filter(v => v.period === period);
  const outcomes = validEntries(registries['customer-outcomes']?.entries, 'customer-outcome.schema.json');
  const risks = validEntries(registries.risks?.entries, 'risk.schema.json');
  const decisions = validReferences(validEntries(registries.decisions?.entries, 'decision.schema.json'), 'decisions', 'decision_id', refProblems);

  const invalidTotal =
    ((registries.kpis?.entries?.length ?? 0) - kpis.length) +
    ((registries.variances?.entries?.length ?? 0) - validVariances.length) +
    ((registries['customer-outcomes']?.entries?.length ?? 0) - outcomes.length) +
    ((registries.risks?.entries?.length ?? 0) - risks.length) +
    ((registries.decisions?.entries?.length ?? 0) - decisions.length);


  // Evidence ledger — raw facts before narrative
  const ledger = {
    period,
    governed_metrics: kpis.length,
    variances_this_period: variances.length,
    material_variances: variances.filter(v => ['material','critical'].includes(v.materiality)).length,
    customer_outcomes_total: outcomes.length,
    outcomes_customer_confirmed: outcomes.filter(o => o.customer_confirmed).length,
    outcomes_causal_established: outcomes.filter(o => o.outcome_stage === 'causal_relationship_established').length,
    board_visible_risks: risks.filter(r => r.board_visibility).length,
    critical_risks: risks.filter(r => r.residual_exposure === 'critical').length,
    deteriorating_risks: risks.filter(r => r.trend === 'deteriorating').length,
  };

  // Commercial section
  const commercial = buildSection('commercial', kpis, variances, [
    'ARR','MRR','bookings','pipeline_coverage','win_rate','sales_cycle','customer_concentration',
  ]);

  // Customer section
  const customer = buildSection('customer', kpis, variances, [
    'active_customers','onboarding_time','renewal_risk','findings_acted_upon','unresolved_escalations',
  ]);

  // Product section
  const product = buildSection('product', kpis, variances, [
    'active_properties','audits_run','completed_valid_audits','installation_success','feature_adoption',
  ]);

  // Quality section — Citable-specific
  const quality = buildSection('quality', kpis, variances, [
    'detector_precision','confirmed_false_positives','known_false_negatives','expired_evidence','stale_registries',
  ]);

  // Operations section
  const operations = buildSection('operations', kpis, variances, [
    'failed_runs','incomplete_evidence_packages','crawler_access_failures','release_regressions',
  ]);

  // Management section
  const openDecisions = decisions.filter(d => d.status === 'open');
  const management = {
    open_decisions: openDecisions.length,
    decisions_requiring_action: openDecisions.map(d => ({
      id: d.decision_id, title: d.title, owner: d.owner, deadline: d.deadline,
    })),
  };

  return {
    report_type: 'executive-operating-review',
    period,
    registry_problems: regProblems,
    invalid_entries_excluded: invalidTotal > 0 ? invalidTotal : undefined,
    ledger,
    four_act_required: buildFourActPrompt(variances),
    sections: { commercial, customer, product, quality, operations, management },
    ungoverned_warning: ledger.governed_metrics === 0
      ? 'BLOCKED: No governed KPIs. Register metrics with `citable kpi add` before generating narrative.'
      : null,
  };
}

function buildSection(name, kpis, variances, relevantNames) {
  const sectionKpis = kpis.filter(k =>
    relevantNames.some(n => k.metric_id?.toLowerCase().includes(n.toLowerCase()) || k.name?.toLowerCase().includes(n.toLowerCase()))
  );
  const sectionVariances = variances.filter(v =>
    sectionKpis.some(k => k.metric_id === v.metric_id)
  );
  return {
    section: name,
    governed_metrics: sectionKpis.length,
    variances: sectionVariances.length,
    material_variances: sectionVariances.filter(v => ['material','critical'].includes(v.materiality)).length,
    ungoverned_warning: sectionKpis.length === 0
      ? `No governed KPIs for ${name} — narrative cannot be generated from ungoverned data`
      : null,
  };
}

function buildFourActPrompt(variances) {
  if (variances.length === 0) return { status: 'no_variances_this_period' };
  const material = variances.filter(v => ['material','critical'].includes(v.materiality));
  return {
    status: 'required',
    material_variances: material.length,
    template: {
      act_1: 'Where management said the company would be: [state targets and forecasts from KPI registry]',
      act_2: 'Where it actually is: [state actuals from variance records]',
      act_3: 'Why the variance exists: [state primary_driver from each material variance — vague causes rejected]',
      act_4: 'What management is doing about it: [state management_response from each material variance]',
    },
  };
}

function formatReview(report) {
  const lines = [
    `# Executive Operating Review — ${report.period}`,
    `Generated: ${report.generated_at}`,
    '',
  ];
  if (report.ungoverned_warning) {
    lines.push(`⛔ ${report.ungoverned_warning}`, '');
  }
  if (report.registry_problems?.length) {
    lines.push(`⚠️  Registry problems (${report.registry_problems.length}):`);
    for (const p of report.registry_problems.slice(0, 5)) lines.push(`   ${p}`);
    lines.push('');
  }
  const l = report.ledger;
  lines.push(
    '## Evidence Ledger',
    `- Governed metrics: ${l.governed_metrics}`,
    `- Variances this period: ${l.variances_this_period} (${l.material_variances} material)`,
    `- Customer outcomes: ${l.customer_outcomes_total} (${l.outcomes_customer_confirmed} confirmed, ${l.outcomes_causal_established} causal)`,
    `- Board-visible risks: ${l.board_visible_risks} (${l.critical_risks} critical, ${l.deteriorating_risks} deteriorating)`,
    '',
    '## Four-Act Reporting Requirement',
  );
  const fa = report.four_act_required;
  if (fa.status === 'required') {
    for (const [act, text] of Object.entries(fa.template)) {
      lines.push(`**${act.replace('_',' ').toUpperCase()}:** ${text}`);
    }
  } else {
    lines.push('No variances registered for this period.');
  }
  return lines.join('\n');
}

function currentPeriod(asOf) {
  const d = asOf ?? new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
