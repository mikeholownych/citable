/**
 * prioritize command — Initiative Prioritization
 *
 * Ranks roadmap and investment choices. Weights must be visible when
 * weighted scoring is used — no opaque scores.
 *
 * Usage:
 *   citable prioritize [--status proposed|approved]
 *   citable prioritize show <initiative_id>
 *   citable prioritize validate
 *   citable prioritize rank   — ranked list with explicit criteria
 */
import { contextDir, loadRegistryFile, registryLoadProblems } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';


const SCALE = { none: 0, low: 1, medium: 2, high: 3, critical: 4, validated: 4, transformative: 4, trivial: 0, very_high: 4, negligible: 0, 'n/a': 0 };

export async function prioritizeCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'initiatives.yaml');

  switch (subcommand) {
    case 'show':     return initiativeShow(file, rest[0]);
    case 'validate': return initiativeValidate(file);
    case 'rank':     return initiativeRank(file);
    case 'list':
    default: {
      const statusFilter = rest[rest.indexOf('--status') + 1] ?? null;
      return initiativeList(file, statusFilter);
    }
  }
}

function load(file) {
  return loadRegistryFile(file, 'initiatives');
}

function initiativeList(file, statusFilter) {
  const data = load(file);
  let entries = statusFilter ? data.entries.filter(i => i.status === statusFilter) : data.entries;
  return {
    initiatives: entries.map(i => ({
      initiative_id:             i.initiative_id,
      title:                     i.title,
      customer_demand:           i.customer_demand,
      revenue_potential:         i.revenue_potential,
      strategic_differentiation: i.strategic_differentiation,
      evidence_strength:         i.evidence_strength,
      engineering_cost:          i.engineering_cost,
      reversibility:             i.reversibility,
      status:                    i.status,
      owner:                     i.owner,
    })),
    total: entries.length,
  };
}

function initiativeShow(file, id) {
  if (!id) return { error: 'initiative_id required' };
  const data = load(file);
  const i = data.entries.find(e => e.initiative_id === id);
  if (!i) return { error: `Initiative not found: ${id}` };
  return { initiative: i };
}

function initiativeRank(file) {
  const data = load(file);
  const scorable = data.entries.filter(i => ['proposed','approved'].includes(i.status));

  // Transparent scoring: benefit - cost, with evidence strength as multiplier
  const scored = scorable.map(i => {
    const benefit = (SCALE[i.customer_demand] ?? 0) + (SCALE[i.revenue_potential] ?? 0) + (SCALE[i.strategic_differentiation] ?? 0);
    const cost    = (SCALE[i.engineering_cost] ?? 0) + (SCALE[i.operating_cost ?? 'none'] ?? 0) + (SCALE[i.legal_risk ?? 'none'] ?? 0);
    const evidenceMultiplier = { assumption: 0.5, anecdote: 0.6, proxy: 0.7, validated: 0.9, verified: 1.0 }[i.evidence_strength] ?? 0.5;
    const score   = (benefit - cost) * evidenceMultiplier;
    return { initiative_id: i.initiative_id, title: i.title, score: Math.round(score * 10) / 10, benefit, cost, evidence_strength: i.evidence_strength, reversibility: i.reversibility, evidence_multiplier: evidenceMultiplier };
  }).sort((a, b) => b.score - a.score);

  return {
    ranked: scored,
    scoring_method: 'transparent: (customer_demand + revenue_potential + strategic_differentiation - engineering_cost - operating_cost - legal_risk) × evidence_multiplier',
    weights: 'equal weights — override with scoring_weights field per initiative if asymmetric weighting is required',
    total: scored.length,
  };
}

function initiativeValidate(file) {
  const data = load(file);
  const problems = [...registryLoadProblems(data)];
  const { valid, errors } = validateAgainst('initiative.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const i of data.entries) {
    // Evidence strength required
    if (i.evidence_strength === 'assumption' && i.revenue_potential === 'transformative')
      problems.push(`${i.initiative_id}: revenue_potential=transformative with evidence_strength=assumption — requires at least "proxy" evidence`);
    // One-way decisions need justification
    if (i.reversibility === 'effectively_one_way' && !i.opportunity_cost)
      problems.push(`${i.initiative_id}: effectively_one_way initiatives require opportunity_cost`);
    // Platform dependency documented for platform-dependent initiatives
    if (!i.platform_dependency && /search.console|bing|openai|google|cloudflare/i.test(i.title))
      problems.push(`${i.initiative_id}: platform_dependency should be documented for platform-dependent initiatives`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}
