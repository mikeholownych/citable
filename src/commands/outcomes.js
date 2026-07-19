/**
 * outcomes command — Customer Outcomes registry
 *
 * Enforces the finding_produced → causal_relationship_established
 * progression and refuses to conflate activity with validated impact.
 *
 * Usage:
 *   citable outcomes list [--stage <stage>]
 *   citable outcomes show <outcome_id>
 *   citable outcomes validate
 *   citable outcomes summary   — stage distribution summary
 */
import { contextDir, loadRegistryFile, registryLoadProblems } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';


export const OUTCOME_STAGES = [
  'finding_produced',
  'finding_accepted',
  'finding_remediated',
  'remediation_validated',
  'search_result_changed',
  'answer_engine_changed',
  'commercial_outcome_changed',
  'causal_relationship_established',
];

export async function outcomesCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'customer-outcomes.yaml');

  switch (subcommand) {
    case 'show':     return outcomeShow(file, rest[0]);
    case 'validate': return outcomeValidate(file);
    case 'summary':  return outcomeSummary(file);
    default:         return outcomeList(file, rest);
  }
}

function load(file) {
  return loadRegistryFile(file, 'customer-outcomes');
}

function outcomeList(file, args) {
  const data = load(file);
  const stageFilter = args.find((_, i, a) => a[i-1] === '--stage');
  let entries = stageFilter
    ? data.entries.filter(e => e.outcome_stage === stageFilter)
    : data.entries;
  return {
    outcomes: entries.map(e => ({
      outcome_id:          e.outcome_id,
      customer:            e.customer,
      property:            e.property,
      outcome_stage:       e.outcome_stage,
      causal_confidence:   e.causal_confidence,
      customer_confirmed:  e.customer_confirmed,
      independently_verified: e.independently_verified ?? false,
    })),
    total: entries.length,
  };
}

function outcomeShow(file, id) {
  if (!id) return { error: 'outcome_id required' };
  const data = load(file);
  const o = data.entries.find(e => e.outcome_id === id);
  if (!o) return { error: `Outcome not found: ${id}` };
  return { outcome: o };
}

function outcomeSummary(file) {
  const data = load(file);
  const dist = {};
  for (const s of OUTCOME_STAGES) dist[s] = 0;
  for (const e of data.entries) dist[e.outcome_stage] = (dist[e.outcome_stage] ?? 0) + 1;
  const verified = data.entries.filter(e => e.independently_verified).length;
  const confirmed = data.entries.filter(e => e.customer_confirmed).length;
  return {
    stage_distribution: dist,
    customer_confirmed: confirmed,
    independently_verified: verified,
    total: data.entries.length,
    warning: dist.finding_produced > 0 && dist.causal_relationship_established === 0
      ? 'All outcomes at finding_produced stage — no causal relationships established yet'
      : null,
  };
}

function outcomeValidate(file) {
  const data = load(file);
  const problems = [...registryLoadProblems(data)];
  const { valid, errors } = validateAgainst('customer-outcome.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const o of data.entries) {
    // Cannot claim causal confidence without evidence
    if (['strong','verified'].includes(o.causal_confidence) && (!o.evidence_package || o.evidence_package.length === 0))
      problems.push(`${o.outcome_id}: causal_confidence "${o.causal_confidence}" requires evidence_package`);
    // Cannot mark independently_verified without customer_confirmed first
    if (o.independently_verified && !o.customer_confirmed)
      problems.push(`${o.outcome_id}: independently_verified=true but customer_confirmed=false`);
    // Commercial value requires validated stage
    if (o.commercial_value && !['commercial_outcome_changed','causal_relationship_established'].includes(o.outcome_stage))
      problems.push(`${o.outcome_id}: commercial_value set but outcome_stage is "${o.outcome_stage}" — commercial value requires commercial_outcome_changed or causal_relationship_established`);
    // Publication requires confirmation
    if (o.publication_permission && !o.customer_confirmed)
      problems.push(`${o.outcome_id}: publication_permission=true but customer_confirmed=false`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}
