/**
 * risk command — Risk Register
 *
 * Usage:
 *   citable risk list [--board]        List all risks (--board: board-visible only)
 *   citable risk show <risk_id>
 *   citable risk validate
 *   citable risk top                   Top risks by residual_exposure
 */
import { contextDir, loadRegistryFile, registryLoadProblems } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';

import { dateOnly, parseAsOf } from '../shared/asOf.js';

const EXPOSURE_ORDER = ['low','medium','high','critical'];

export async function riskCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'risks.yaml');

  switch (subcommand) {
    case 'show':     return riskShow(file, rest[0]);
    case 'validate': return riskValidate(file, parseAsOf(args));
    case 'top':      return riskTop(file);
    case 'list':
    default:
      return riskList(file, { boardOnly: rest.includes('--board') });
  }
}

function load(file) {
  return loadRegistryFile(file, 'risks');
}

function riskList(file, { boardOnly = false } = {}) {
  const data = load(file);
  let entries = boardOnly ? data.entries.filter(r => r.board_visibility) : data.entries;
  return {
    risks: entries.map(r => ({
      risk_id:          r.risk_id,
      title:            r.title,
      category:         r.category,
      gross_exposure:   r.gross_exposure,
      residual_exposure:r.residual_exposure,
      trend:            r.trend,
      review_date:      r.review_date,
      board_visibility: r.board_visibility,
    })),
    total: entries.length,
  };
}

function riskShow(file, id) {
  if (!id) return { error: 'risk_id required' };
  const data = load(file);
  const r = data.entries.find(e => e.risk_id === id);
  if (!r) return { error: `Risk not found: ${id}` };
  return { risk: r };
}

function riskTop(file) {
  const data = load(file);
  const sorted = [...data.entries].sort((a, b) =>
    EXPOSURE_ORDER.indexOf(b.residual_exposure) - EXPOSURE_ORDER.indexOf(a.residual_exposure)
  );
  return {
    top_risks: sorted.slice(0, 10).map(r => ({
      risk_id:           r.risk_id,
      title:             r.title,
      category:          r.category,
      residual_exposure: r.residual_exposure,
      trend:             r.trend,
      control_effectiveness: r.control_effectiveness,
      trigger_threshold: r.trigger_threshold,
      response_owner:    r.response_owner,
    })),
  };
}

function riskValidate(file, asOf) {
  const data = load(file);
  const problems = [...registryLoadProblems(data)];
  const { valid, errors } = validateAgainst('risk.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const r of data.entries) {
    // KRIs required for critical/high risks
    if (['high','critical'].includes(r.residual_exposure) && (!r.key_risk_indicators || r.key_risk_indicators.length === 0))
      problems.push(`${r.risk_id}: high/critical residual_exposure requires key_risk_indicators`);
    // Trigger threshold required for board-visible risks
    if (r.board_visibility && !r.trigger_threshold)
      problems.push(`${r.risk_id}: board_visibility=true requires trigger_threshold`);
    // Stale review dates
    const reviewDate = r.review_date ? new Date(r.review_date) : null;
    if (reviewDate && reviewDate < asOf)
      problems.push(`${r.risk_id}: review_date ${r.review_date} is in the past — risk review overdue`);
    // Controls effectiveness vs gross/residual mismatch
    if (r.gross_exposure === 'critical' && r.control_effectiveness === 'none' && r.residual_exposure !== 'critical')
      problems.push(`${r.risk_id}: control_effectiveness=none but residual_exposure < gross_exposure — inconsistent`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length, as_of: dateOnly(asOf) };
}
