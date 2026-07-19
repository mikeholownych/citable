/**
 * assumption-audit command — Assumption Registry
 *
 * Tracks which commercial and product assumptions remain valid.
 * Feeds both board reporting and roadmap prioritization.
 *
 * Usage:
 *   citable assumption-audit list [--status <status>]
 *   citable assumption-audit show <assumption_id>
 *   citable assumption-audit validate
 *   citable assumption-audit expired   — assumptions past expiry date
 *   citable assumption-audit critical  — critical importance assumptions
 */
import { contextDir } from '../registries/index.js';
import { readYaml } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';
import fs from 'node:fs';

export async function assumptionAuditCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'assumptions.yaml');

  switch (subcommand) {
    case 'show':     return assumptionShow(file, rest[0]);
    case 'validate': return assumptionValidate(file);
    case 'expired':  return assumptionExpired(file);
    case 'critical': return assumptionList(file, { importance: 'critical' });
    case 'list':
    default: {
      const statusFilter = rest[rest.indexOf('--status') + 1] ?? null;
      return assumptionList(file, { statusFilter });
    }
  }
}

function load(file) {
  if (!fs.existsSync(file)) return { version: 1, kind: 'assumptions', entries: [] };
  return readYaml(file) ?? { version: 1, kind: 'assumptions', entries: [] };
}

function assumptionList(file, { statusFilter = null, importance = null } = {}) {
  const data = load(file);
  let entries = data.entries;
  if (statusFilter) entries = entries.filter(a => a.current_status === statusFilter);
  if (importance)   entries = entries.filter(a => a.importance === importance);
  return {
    assumptions: entries.map(a => ({
      assumption_id:  a.assumption_id,
      statement:      a.statement,
      category:       a.category,
      importance:     a.importance,
      current_status: a.current_status,
      confidence:     a.confidence,
      owner:          a.owner,
      expiry:         a.expiry ?? 'none',
    })),
    total: entries.length,
    by_status: statusDist(data.entries),
  };
}

function assumptionShow(file, id) {
  if (!id) return { error: 'assumption_id required' };
  const data = load(file);
  const a = data.entries.find(e => e.assumption_id === id);
  if (!a) return { error: `Assumption not found: ${id}` };
  return { assumption: a };
}

function assumptionExpired(file) {
  const data = load(file);
  const now = new Date();
  const expired = data.entries.filter(a => a.expiry && new Date(a.expiry) < now);
  return {
    expired: expired.map(a => ({
      assumption_id: a.assumption_id, statement: a.statement,
      expiry: a.expiry, current_status: a.current_status, owner: a.owner,
    })),
    total: expired.length,
  };
}

function assumptionValidate(file) {
  const data = load(file);
  const problems = [];
  const { valid, errors } = validateAgainst('assumption.schema.json', data);
  if (!valid) problems.push(...errors);

  for (const a of data.entries) {
    // Validated assumptions need supporting evidence
    if (['validated_within_scope','partially_validated'].includes(a.current_status) && (!a.evidence_for || a.evidence_for.length === 0))
      problems.push(`${a.assumption_id}: status "${a.current_status}" requires evidence_for`);
    // Contradicted/invalidated need counter-evidence
    if (['contradicted','invalidated'].includes(a.current_status) && (!a.evidence_against || a.evidence_against.length === 0))
      problems.push(`${a.assumption_id}: status "${a.current_status}" requires evidence_against`);
    // Critical assumptions need a next_test date
    if (a.importance === 'critical' && !a.next_test)
      problems.push(`${a.assumption_id}: critical importance requires next_test date`);
    // Contradicted critical assumptions must have decision dependencies flagged
    if (a.importance === 'critical' && a.current_status === 'contradicted' && (!a.decision_dependency || a.decision_dependency.length === 0))
      problems.push(`${a.assumption_id}: critical contradicted assumption has no decision_dependency — escalate to decision-memo`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}

function statusDist(entries) {
  const dist = {};
  for (const a of entries) dist[a.current_status] = (dist[a.current_status] ?? 0) + 1;
  return dist;
}
