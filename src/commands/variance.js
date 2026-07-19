/**
 * variance command — Variance analysis registry
 *
 * Rejects non-causes (market conditions, timing, customer behaviour)
 * unless decomposed into specific observed mechanisms.
 *
 * Usage:
 *   citable variance list [--period <period>]
 *   citable variance show <variance_id>
 *   citable variance validate
 *   citable variance material   — list material/critical variances only
 */
import { contextDir } from '../registries/index.js';
import { readYaml } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';
import fs from 'node:fs';

// Vague causes that must be decomposed before acceptance
const REJECTED_CAUSE_PATTERNS = [
  /^market conditions?$/i,
  /^timing$/i,
  /^customer behaviour?$/i,
  /^execution issues?$/i,
  /^macro(economic)?$/i,
  /^seasonality$/i,
];

export async function varianceCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'variances.yaml');

  switch (subcommand) {
    case 'show':     return varianceShow(file, rest[0]);
    case 'validate': return varianceValidate(file);
    case 'material': return varianceList(file, { materialOnly: true });
    default:         return varianceList(file, {});
  }
}

function load(file) {
  if (!fs.existsSync(file)) return { version: 1, kind: 'variances', entries: [] };
  return readYaml(file) ?? { version: 1, kind: 'variances', entries: [] };
}

function varianceList(file, { materialOnly = false, period = null } = {}) {
  const data = load(file);
  let entries = data.entries;
  if (materialOnly) entries = entries.filter(v => ['material','critical'].includes(v.materiality));
  if (period) entries = entries.filter(v => v.period === period);
  return {
    variances: entries.map(v => ({
      variance_id:    v.variance_id,
      metric_id:      v.metric_id,
      period:         v.period,
      variance_pct:   v.variance_pct,
      materiality:    v.materiality,
      primary_driver: v.primary_driver,
      controllable:   v.controllable,
      confidence:     v.confidence,
    })),
    total: entries.length,
  };
}

function varianceShow(file, id) {
  if (!id) return { error: 'variance_id required' };
  const data = load(file);
  const v = data.entries.find(e => e.variance_id === id);
  if (!v) return { error: `Variance not found: ${id}` };
  return { variance: v };
}

function varianceValidate(file) {
  const data = load(file);
  const problems = [];
  const { valid, errors } = validateAgainst('variance.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const v of data.entries) {
    // Reject vague causes
    for (const pattern of REJECTED_CAUSE_PATTERNS) {
      if (pattern.test((v.primary_driver ?? '').trim())) {
        problems.push(`${v.variance_id}: primary_driver "${v.primary_driver}" is a non-cause — decompose into a specific observed mechanism`);
      }
      for (const d of v.secondary_drivers ?? []) {
        if (pattern.test(d.trim())) {
          problems.push(`${v.variance_id}: secondary_driver "${d}" is a non-cause — decompose into a specific observed mechanism`);
        }
      }
    }
    // Material variances need management response
    if (['material','critical'].includes(v.materiality) && !v.management_response)
      problems.push(`${v.variance_id}: material variance requires management_response`);
    // Evidence required
    if (!v.evidence || v.evidence.length === 0)
      problems.push(`${v.variance_id}: evidence array must not be empty`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}
