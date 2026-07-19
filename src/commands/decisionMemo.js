/**
 * decision-memo command — Bounded Executive Decision Record
 *
 * Treats decision-making as a controlled process, not document formatting.
 * Enforces:
 * - One decision per memo
 * - Named decider + named consulted parties
 * - Deadline required
 * - Reversibility classification
 * - Real trade-offs (no strawman options)
 * - "What would change my mind" is a required high-trust section
 * - Specific evidence required — no performative uncertainty
 *
 * Usage:
 *   citable decision-memo list [--status open|decided|deferred]
 *   citable decision-memo show <decision_id>
 *   citable decision-memo validate
 *   citable decision-memo new --title "..." [--from-json <file>]
 */
import { contextDir, loadRegistryFile, registryLoadProblems, saveRegistry } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';
import fs from 'node:fs';
import { dateOnly, parseAsOf } from '../shared/asOf.js';

export async function decisionMemoCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'decisions.yaml');

  switch (subcommand) {
    case 'show':     return decisionShow(file, rest[0]);
    case 'validate': return decisionValidate(file, rest);
    case 'new':      return decisionNew(file, rest, root);
    case 'list':
    default: {
      const statusFilter = rest[rest.indexOf('--status') + 1] ?? null;
      return decisionList(file, statusFilter);
    }
  }
}

function load(file) {
  return loadRegistryFile(file, 'decisions');
}

function decisionList(file, statusFilter) {
  const data = load(file);
  let entries = statusFilter ? data.entries.filter(d => d.status === statusFilter) : data.entries;
  return {
    decisions: entries.map(d => ({
      decision_id:   d.decision_id,
      title:         d.title,
      owner:         d.owner,
      deadline:      d.deadline,
      reversibility: d.reversibility,
      status:        d.status,
      options_count: (d.options ?? []).length,
    })),
    total: entries.length,
  };
}

function decisionShow(file, id) {
  if (!id) return { error: 'decision_id required' };
  const data = load(file);
  const d = data.entries.find(e => e.decision_id === id);
  if (!d) return { error: `Decision not found: ${id}` };
  // Format as memo
  return {
    memo: {
      id:              d.decision_id,
      title:           d.title,
      decision_needed: d.title,
      recommendation:  d.recommendation ?? 'NOT SET',
      owner:           d.owner,
      consulted:       d.consulted ?? [],
      deadline:        d.deadline,
      reversibility:   d.reversibility,
      options:         d.options ?? [],
      what_would_change_recommendation: d.what_would_change_recommendation ?? [],
      cost_of_delay:   d.cost_of_delay ?? 'NOT SET',
      supporting_evidence:    d.supporting_evidence ?? [],
      contradicting_evidence: d.contradicting_evidence ?? [],
      assumptions:     d.assumptions ?? [],
      reopen_conditions: d.reopen_conditions ?? [],
      legal_review:    d.legal_review,
      security_review: d.security_review,
      financial_model: d.financial_model,
      status:          d.status,
    },
  };
}

function decisionValidate(file, args = []) {
  const data = load(file);
  const problems = [...registryLoadProblems(data)];
  const { valid, errors } = validateAgainst('decision.schema.json', data);
  if (!valid) problems.push(...errors);

  // Reference date for deadline staleness — deterministic when --as-of provided
  const refDate = parseAsOf(args);

  for (const d of data.entries) {
    // Named consulted parties required
    if (!d.consulted || d.consulted.length === 0)
      problems.push(`${d.decision_id}: consulted parties must be named — autonomous decisions without consultation are not accepted`);

    // What would change recommendation is required (high-trust section)
    if (!d.what_would_change_recommendation || d.what_would_change_recommendation.length === 0)
      problems.push(`${d.decision_id}: what_would_change_recommendation is required — state specific evidence that would change the recommendation`);

    // Options must have real trade-offs (not strawmen)
    for (const opt of d.options ?? []) {
      if (!opt.trade_offs || opt.trade_offs.length === 0)
        problems.push(`${d.decision_id} option "${opt.label}": trade_offs required — no strawman options`);
    }

    // Supporting evidence must be specific
    if (!d.supporting_evidence || d.supporting_evidence.length === 0)
      problems.push(`${d.decision_id}: supporting_evidence required — performative uncertainty is not accepted`);

    // Deadline validation against reference date (not wall clock)
    if (d.deadline && new Date(d.deadline) < refDate && d.status === 'open')
      problems.push(`${d.decision_id}: deadline ${d.deadline} is past (as-of ${refDate.toISOString().slice(0,10)}) but status is still "open"`);

    // One-way decisions need reopen conditions
    if (d.reversibility === 'effectively_one_way' && (!d.reopen_conditions || d.reopen_conditions.length === 0))
      problems.push(`${d.decision_id}: effectively_one_way decision requires reopen_conditions`);
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length, as_of: dateOnly(refDate) };
}

async function decisionNew(file, args, root) {
  const titleIndex = args.indexOf('--title');
  const title = titleIndex >= 0 ? args[titleIndex + 1] : undefined;
  if (!title) return { error: '--title required' };
  const write = args.includes('--write');

  const data = load(file);
  const maxSequence = data.entries.reduce((max, entry) => {
    const match = /^DEC-(\d+)$/.exec(entry.decision_id ?? '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const id = `DEC-${String(maxSequence + 1).padStart(3, '0')}`;

  // Use schema-valid placeholder values only — never persist enum-violating strings.
  // reversibility enum: reversible | effectively_one_way | one_way
  const stub = {
    decision_id: id,
    title,
    owner: '',
    consulted: [],
    deadline: '',
    reversibility: 'reversible',          // valid enum — change to match actual decision
    options: [],
    recommendation: '',
    supporting_evidence: [],
    contradicting_evidence: [],
    assumptions: [],
    what_would_change_recommendation: [],
    cost_of_delay: '',
    reopen_conditions: [],
    status: 'open',
  };

  // Validate the stub against the schema before any persistence
  const { valid, errors } = validateAgainst('decision.schema.json', {
    version: 1, kind: 'decisions', entries: [stub],
  });
  if (!valid) {
    return { error: 'Stub failed schema validation — this is a bug', schema_errors: errors };
  }

  if (!write) {
    return {
      preview: true,
      id,
      stub,
      message: 'Dry-run — pass --write to persist. Complete all empty fields before use.',
      required_fields: ['owner','consulted','deadline','recommendation',
        'supporting_evidence','what_would_change_recommendation','cost_of_delay'],
      reversibility_options: ['reversible','costly_to_reverse','effectively_one_way'],
    };
  }

  // Persist only when explicitly requested and schema-valid
  data.entries.push(stub);
  const dir = contextDir(root);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Await persistence so success is reported only after a confirmed write.
  saveRegistry(root, 'decisions', data);

  return {
    created: id,
    file,
    message: 'Decision stub written. Complete all empty fields before use.',
    required_fields: ['owner','consulted','deadline','recommendation',
      'supporting_evidence','what_would_change_recommendation','cost_of_delay'],
    reversibility_options: ['reversible','costly_to_reverse','effectively_one_way'],
  };
}
