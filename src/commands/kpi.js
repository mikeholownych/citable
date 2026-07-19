/**
 * kpi command — KPI Architecture registry management
 *
 * Usage:
 *   citable kpi list     List all governed metrics
 *   citable kpi show <id> Show a single KPI
 *   citable kpi validate  Validate all KPI records
 */
import { loadRegistries, contextDir } from '../registries/index.js';
import { readYaml, writeYaml, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';
import fs from 'node:fs';

const REQUIRED_COMPARISON = true; // every KPI must have a comparison basis

export async function kpiCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const dir = contextDir(root);
  const file = path.join(dir, 'kpis.yaml');

  switch (subcommand) {
    case 'list': return kpiList(file);
    case 'show': return kpiShow(file, rest[0]);
    case 'validate': return kpiValidate(file);
    case 'add': return { error: '`citable kpi add` is not yet implemented; edit kpis.yaml directly and run `citable kpi validate`' };
    default:
      return kpiList(file);
  }
}

function loadKpis(file) {
  if (!fs.existsSync(file)) return { version: 1, kind: 'kpis', entries: [] };
  return readYaml(file) ?? { version: 1, kind: 'kpis', entries: [] };
}

function kpiList(file) {
  const data = loadKpis(file);
  if (!data.entries.length) return { kpis: [], message: 'No KPIs registered. Edit .citable/kpis.yaml, then run `citable kpi validate`.' };
  return {
    kpis: data.entries.map(k => ({
      metric_id: k.metric_id,
      name: k.name,
      owner: k.owner,
      cadence: k.reporting_cadence,
      target: k.target ?? 'NOT SET',
      comparison_required: k.comparison_required ?? REQUIRED_COMPARISON,
      limitations: (k.known_limitations ?? []).length,
    })),
    total: data.entries.length,
  };
}

function kpiShow(file, id) {
  if (!id) return { error: 'metric_id required' };
  const data = loadKpis(file);
  const kpi = data.entries.find(k => k.metric_id === id);
  if (!kpi) return { error: `KPI not found: ${id}` };
  return { kpi };
}

function kpiValidate(file) {
  const data = loadKpis(file);
  const problems = [];
  const { valid, errors } = validateAgainst('kpi.schema.json', data);
  if (!valid) problems.push(...errors);
  // Citable-specific checks
  for (const k of data.entries) {
    if (!k.known_limitations || k.known_limitations.length === 0)
      problems.push(`${k.metric_id}: known_limitations is empty — every metric must document its measurement constraints`);
    if (k.comparison_required !== false && !k.comparison_basis)
      problems.push(`${k.metric_id}: comparison_basis required when comparison_required is true`);
    if (!k.restatement_policy)
      problems.push(`${k.metric_id}: restatement_policy missing — how will historical data be corrected?`);
    // Citable metric distinction checks
    if (/installs?/i.test(k.name) && !/active/i.test(k.name))
      problems.push(`${k.metric_id}: "installs" vs "active_installations" must be distinct metrics`);
    if (/audit/i.test(k.name) && !/valid|complete/i.test(k.executive_definition ?? ''))
      problems.push(`${k.metric_id}: audits_run vs completed_valid_audits must be distinguished in executive_definition`);
  }
  return {
    valid: problems.length === 0,
    problems,
    checked: data.entries.length,
  };
}
