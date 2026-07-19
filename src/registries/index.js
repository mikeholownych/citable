import fs from 'node:fs';
import path from 'node:path';
import { readYaml, writeYaml, nowIso, sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

export const REGISTRY_SPECS = [
  { file: 'queries.yaml', kind: 'queries', schema: 'query.schema.json', idField: 'query_id' },
  { file: 'prompts.yaml', kind: 'prompts', schema: 'prompt.schema.json', idField: 'prompt_id' },
  { file: 'entities.yaml', kind: 'entities', schema: 'entity.schema.json', idField: 'entity_id' },
  { file: 'claims.yaml', kind: 'claims', schema: 'claim.schema.json', idField: 'claim_id' },
  { file: 'evidence.yaml', kind: 'evidence', schema: 'evidence.schema.json', idField: 'evidence_id' },
  { file: 'pages.yaml', kind: 'pages', schema: 'page.schema.json', idField: 'page_id' },
  { file: 'crawlers.yaml', kind: 'crawlers', schema: 'crawler.schema.json', idField: 'crawler_id' },
  { file: 'competitors.yaml', kind: 'competitors', schema: 'competitor.schema.json', idField: 'competitor_id' },
  { file: 'experiments.yaml', kind: 'experiments', schema: 'experiment.schema.json', idField: 'experiment_id' },
  { file: 'metrics.yaml', kind: 'metrics', schema: 'metric.schema.json', idField: 'metric_id' },
  { file: 'objectives.yaml', kind: 'objectives', schema: 'objective.schema.json', idField: 'objective_id' },
  { file: 'interventions.yaml', kind: 'interventions', schema: 'intervention.schema.json', idField: 'intervention_id' },
  { file: 'connections.yaml', kind: 'connections', schema: 'connection.schema.json', idField: 'connection_id' },
  { file: 'reviewers.yaml', kind: 'reviewers', schema: 'reviewer.schema.json', idField: 'reviewer_id' },
  { file: 'review-policies.yaml', kind: 'review_policies', schema: 'review-policy.schema.json', idField: 'policy_id' },
  { file: 'exceptions.yaml', kind: 'exceptions', schema: 'exception.schema.json', idField: 'exception_id' },
  { file: 'review-items.yaml', kind: 'review_items', schema: 'review-item.schema.json', idField: 'review_item_id' },
  { file: 'sampling-plans.yaml', kind: 'sampling_plans', schema: 'sampling-plan.schema.json', idField: 'sampling_plan_id' },
  { file: 'schedules.yaml', kind: 'schedules', schema: 'schedule.schema.json', idField: 'schedule_id' },
];

export function contextDir(root) {
  return path.join(root, '.citable');
}

export function emptyRegistry(kind) {
  return { version: 1, kind, updated: nowIso(), entries: [] };
}

/** Load all registries under <root>/.citable. Missing files load as empty. */
export function loadRegistries(root) {
  const dir = contextDir(root);
  const registries = {};
  const problems = [];
  for (const spec of REGISTRY_SPECS) {
    const file = path.join(dir, spec.file);
    let data;
    if (fs.existsSync(file)) {
      try {
        data = readYaml(file) ?? emptyRegistry(spec.kind);
      } catch (err) {
        problems.push(`${spec.file}: YAML parse failure: ${err.message}`);
        data = emptyRegistry(spec.kind);
      }
    } else {
      data = emptyRegistry(spec.kind);
    }
    const { valid, errors } = validateAgainst(spec.schema, data);
    if (!valid) problems.push(...errors.map((e) => `${spec.file}: ${e}`));
    registries[spec.kind] = data;
  }
  return { registries, problems };
}

/** Referential-integrity check across registries. Returns list of problem strings. */
export function checkReferentialIntegrity(registries) {
  const problems = [];
  const ids = {};
  for (const spec of REGISTRY_SPECS) {
    ids[spec.kind] = new Set((registries[spec.kind]?.entries || []).map((e) => e[spec.idField]));
    const seen = new Set();
    for (const e of registries[spec.kind]?.entries || []) {
      const id = e[spec.idField];
      if (seen.has(id)) problems.push(`${spec.kind}: duplicate id ${id}`);
      seen.add(id);
    }
  }
  const refChecks = [
    ['claims', 'evidence', 'evidence', 'claim_id'],
    ['claims', 'external_corroboration', 'evidence', 'claim_id'],
    ['entities', 'evidence', 'evidence', 'entity_id'],
    ['pages', 'published_claims', 'claims', 'page_id'],
    ['pages', 'evidence_references', 'evidence', 'page_id'],
    ['pages', 'target_queries', 'queries', 'page_id'],
    ['pages', 'target_prompts', 'prompts', 'page_id'],
    ['evidence', 'supports_claims', 'claims', 'evidence_id'],
  ];
  for (const [kind, field, targetKind, idField] of refChecks) {
    for (const e of registries[kind]?.entries || []) {
      for (const ref of e[field] || []) {
        if (typeof ref === 'string' && !ids[targetKind].has(ref)) {
          problems.push(`${kind}/${e[idField]}: ${field} references unknown ${targetKind} id "${ref}"`);
        }
      }
    }
  }
  // entity references from claims / pages
  for (const c of registries.claims?.entries || []) {
    if (c.entity && !ids.entities.has(c.entity)) {
      problems.push(`claims/${c.claim_id}: entity references unknown entity id "${c.entity}"`);
    }
  }
  for (const p of registries.pages?.entries || []) {
    for (const ent of p.primary_entities || []) {
      if (!ids.entities.has(ent)) problems.push(`pages/${p.page_id}: primary_entities references unknown entity id "${ent}"`);
    }
  }
  const metricIds = ids.metrics || new Set();
  const objectiveIds = ids.objectives || new Set();
  for (const objective of registries.objectives?.entries || []) {
    const refs = [...(objective.primary_metrics || []), ...(objective.supporting_metrics || []), ...(objective.guardrails || []).map((item) => item.metric_id)];
    for (const ref of refs) if (!metricIds.has(ref)) problems.push(`objectives/${objective.objective_id}: references unknown metric id "${ref}"`);
  }
  for (const intervention of registries.interventions?.entries || []) {
    for (const ref of intervention.objective_ids || []) if (!objectiveIds.has(ref)) problems.push(`interventions/${intervention.intervention_id}: references unknown objective id "${ref}"`);
  }
  const reviewerIds = ids.reviewers || new Set();
  const policyIds = ids.review_policies || new Set();
  const evidenceIds = ids.evidence || new Set();
  const interventionIds = ids.interventions || new Set();
  const exceptionIds = ids.exceptions || new Set();
  for (const exception of registries.exceptions?.entries || []) {
    const prefix = `exceptions/${exception.exception_id}`;
    if (!policyIds.has(exception.policy_id)) problems.push(`${prefix}: references unknown review policy id "${exception.policy_id}"`);
    const reviewerRefs = [exception.owner_reviewer_id, ...(exception.reviewer_assignments || []).map((item) => item.reviewer_id), ...(exception.audit_history || []).map((item) => item.actor_reviewer_id)];
    for (const ref of reviewerRefs) if (ref && !reviewerIds.has(ref)) problems.push(`${prefix}: references unknown reviewer id "${ref}"`);
    for (const ref of exception.evidence_ids || []) if (!evidenceIds.has(ref)) problems.push(`${prefix}: references unknown evidence id "${ref}"`);
    if (exception.related_intervention_id && !interventionIds.has(exception.related_intervention_id)) problems.push(`${prefix}: references unknown intervention id "${exception.related_intervention_id}"`);
    for (const ref of [exception.supersedes_exception_id, exception.superseded_by_exception_id]) if (ref && !exceptionIds.has(ref)) problems.push(`${prefix}: references unknown exception id "${ref}"`);
  }
  for (const item of registries.review_items?.entries || []) {
    const prefix = `review_items/${item.review_item_id}`;
    if (!policyIds.has(item.policy_id)) problems.push(`${prefix}: references unknown review policy id "${item.policy_id}"`);
    for (const ref of [...(item.assigned_reviewer_ids || []), ...(item.decisions || []).map((decision) => decision.reviewer_id), item.adjudication?.reviewer_id].filter(Boolean)) if (!reviewerIds.has(ref)) problems.push(`${prefix}: references unknown reviewer id "${ref}"`);
  }
  const reviewItemIds = ids.review_items || new Set();
  for (const plan of registries.sampling_plans?.entries || []) for (const ref of plan.selected_item_ids || []) if (!reviewItemIds.has(ref)) problems.push(`sampling_plans/${plan.sampling_plan_id}: references unknown review item id "${ref}"`);
  return problems;
}

/**
 * Persist a registry, preserving prior version in .citable/snapshots/registry-history/.
 * Never overwrites without recording the previous content.
 */
export function saveRegistry(root, kind, data) {
  const spec = REGISTRY_SPECS.find((s) => s.kind === kind);
  if (!spec) throw new Error(`unknown registry kind: ${kind}`);
  const { valid, errors } = validateAgainst(spec.schema, data);
  if (!valid) throw new Error(`refusing to save invalid ${kind} registry:\n${errors.join('\n')}`);
  const file = path.join(contextDir(root), spec.file);
  if (fs.existsSync(file)) {
    const prev = fs.readFileSync(file, 'utf8');
    const histDir = path.join(contextDir(root), 'snapshots', 'registry-history');
    fs.mkdirSync(histDir, { recursive: true });
    const stamp = nowIso().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(histDir, `${spec.kind}-${stamp}-${sha256(prev).slice(0, 8)}.yaml`), prev);
  }
  data.updated = nowIso();
  writeYaml(file, data);
  return file;
}

/** Structural diff of two registry objects (entries keyed by id). */
export function diffRegistries(before, after, idField) {
  const b = new Map((before?.entries || []).map((e) => [e[idField], e]));
  const a = new Map((after?.entries || []).map((e) => [e[idField], e]));
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && JSON.stringify(b.get(k)) !== JSON.stringify(a.get(k)));
  return { added, removed, changed };
}
