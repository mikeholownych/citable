/**
 * scenario command — Scenario War Room
 *
 * Models compound risks with cascade analysis and early-warning triggers.
 * Maximum 3 variables per scenario. Requires explicit hedges with cost,
 * impact, owner, and deadline — not just worst-case narratives.
 *
 * Usage:
 *   citable scenario list
 *   citable scenario show <scenario_id>
 *   citable scenario validate
 *   citable scenario triggers   — early-warning trigger summary
 */
import { contextDir } from '../registries/index.js';
import { readYaml } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';
import fs from 'node:fs';

export async function scenarioCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'scenarios.yaml');

  switch (subcommand) {
    case 'show':     return scenarioShow(file, rest[0]);
    case 'validate': return scenarioValidate(file);
    case 'triggers': return scenarioTriggers(file);
    default:         return scenarioList(file);
  }
}

function load(file) {
  if (!fs.existsSync(file)) return { version: 1, kind: 'scenarios', entries: [] };
  return readYaml(file) ?? { version: 1, kind: 'scenarios', entries: [] };
}

function scenarioList(file) {
  const data = load(file);
  return {
    scenarios: data.entries.map(s => ({
      scenario_id: s.scenario_id,
      title: s.title,
      variables: (s.variables ?? []).length,
      cascade_steps: (s.cascade_analysis ?? []).length,
      hedges: (s.hedges ?? []).length,
      early_warnings: (s.early_warning_triggers ?? []).length,
      owner: s.owner,
    })),
    total: data.entries.length,
  };
}

function scenarioShow(file, id) {
  if (!id) return { error: 'scenario_id required' };
  const data = load(file);
  const s = data.entries.find(e => e.scenario_id === id);
  if (!s) return { error: `Scenario not found: ${id}` };
  return { scenario: s };
}

function scenarioTriggers(file) {
  const data = load(file);
  return {
    triggers: data.entries.flatMap(s =>
      (s.early_warning_triggers ?? []).map(t => ({
        scenario_id: s.scenario_id, title: s.title, trigger: t,
      }))
    ),
    total_scenarios: data.entries.length,
  };
}

function scenarioValidate(file) {
  const data = load(file);
  const problems = [];
  const { valid, errors } = validateAgainst('scenario.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const s of data.entries) {
    // Variables capped at 3
    if ((s.variables ?? []).length > 3)
      problems.push(`${s.scenario_id}: maximum 3 variables per scenario — combine compound drivers into a single variable`);
    // Cascade analysis required (not just isolated risk statements)
    if (!s.cascade_analysis || s.cascade_analysis.length === 0)
      problems.push(`${s.scenario_id}: cascade_analysis required — scenarios must show cascading effects, not isolated risks`);
    // All three states required
    if (!s.states?.base || !s.states?.stress || !s.states?.severe)
      problems.push(`${s.scenario_id}: all three states (base, stress, severe) required`);
    // Hedges must have all required fields
    for (const h of s.hedges ?? []) {
      if (!h.cost || !h.impact || !h.owner || !h.deadline)
        problems.push(`${s.scenario_id} hedge "${h.action}": cost, impact, owner, and deadline all required`);
    }
    // Early-warning triggers required
    if (!s.early_warning_triggers || s.early_warning_triggers.length === 0)
      problems.push(`${s.scenario_id}: early_warning_triggers required — scenario without triggers is a narrative, not a management tool`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}
