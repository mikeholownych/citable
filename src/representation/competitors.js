import { createExternalObservation, verifyExternalObservation, compareExternalObservations } from '../evidence/external.js';
import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { createResponseSpan } from './provenance.js';

const SCHEMA = 'competitor-representation.schema.json';
const COLLECTOR = { id: 'citable-competitor-representation', version: '1.0.0' };
const PARSER = { id: 'provider-neutral-competitor-parser', version: '1.0.0' };
const TYPES = new Set(['MENTION', 'COMPARISON', 'ALTERNATIVE', 'RECOMMENDATION', 'CITED_SOURCE', 'CATEGORY_PEER']);

function validate(value) {
  const result = validateAgainst(SCHEMA, value);
  if (!result.valid) throw new TypeError(`competitor representation violates contract: ${result.errors.join('; ')}`);
  return value;
}

function requireExecution(execution) {
  if (!execution?.observation_id || !verifyExternalObservation(execution).valid) throw new TypeError('competitor representation requires a verified execution');
  if (execution.data?.response?.status !== 'succeeded') throw new Error('competitor representation requires a substantive provider response');
}

/** Preserve observed entity identity; no name-only resolution is performed. */
export function resolveObservedEntity({ observedName, domain = null, entityId = null, resolutionMethod = 'not_resolved' } = {}) {
  if (typeof observedName !== 'string' || !observedName.trim()) throw new TypeError('observedName is required');
  const resolved = Boolean(entityId);
  return {
    entity_id: entityId || null,
    observed_name: observedName,
    domain: domain || null,
    resolution_status: resolved ? 'RESOLVED' : 'AMBIGUOUS',
    resolution_method: resolutionMethod,
  };
}

export function createCompetitorRepresentationObservation({ execution, span, entity, representation, citationReference = null, propositionReference = null, evidenceOrigin = 'RECORDED_FIXTURE', observedAt = nowIso(), limitations = [] } = {}) {
  requireExecution(execution);
  const responseSpan = span?.span_id ? span : createResponseSpan({ execution, ...(span || {}) });
  if (responseSpan.execution_reference !== execution.observation_id) throw new Error('competitor span does not belong to execution');
  if (!entity?.observed_name) throw new TypeError('competitor entity observation is required');
  if (!representation?.type || !TYPES.has(representation.type) || !representation.observed_text) throw new TypeError('competitor representation type and observed_text are required');
  if (!['LIVE_PROVIDER', 'RECORDED_FIXTURE', 'SYNTHETIC_TEST'].includes(evidenceOrigin)) throw new TypeError('evidenceOrigin is invalid');
  const data = validate({
    execution_reference: execution.observation_id,
    provider: execution.data.provider,
    prompt_reference: `${execution.data.prompt_set.prompt_set_id}@${execution.data.prompt_set.prompt_set_version}:${execution.data.prompt.prompt_id}`,
    prompt_set_reference: `${execution.data.prompt_set.prompt_set_id}@${execution.data.prompt_set.prompt_set_version}`,
    span: responseSpan,
    entity: {
      entity_id: entity.entity_id || null,
      observed_name: entity.observed_name,
      domain: entity.domain || null,
      resolution_status: entity.resolution_status || (entity.entity_id ? 'RESOLVED' : 'AMBIGUOUS'),
      resolution_method: entity.resolution_method || 'not_resolved',
    },
    representation: { type: representation.type, observed_text: representation.observed_text },
    citation_reference: citationReference,
    proposition_reference: propositionReference,
  });
  const identity = data.entity.entity_id || `AMBIGUOUS-${sha256(canonicalEvidenceJson({ execution: execution.observation_id, span: responseSpan.span_id, name: data.entity.observed_name, domain: data.entity.domain })).slice(0, 24)}`;
  return createExternalObservation({
    observation_id: `ENT-${sha256(canonicalEvidenceJson({ execution: execution.observation_id, data })).slice(0, 24)}`,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'competitor_representation', id: identity },
    source: { provider: execution.data.provider, method: 'competitor_representation_observation', authority: 'external_provider' },
    collector: COLLECTOR,
    parser: PARSER,
    configuration: execution.data.execution.configuration,
    observed_at: observedAt,
    retrieved_at: observedAt,
    executed_at: execution.data.execution.executed_at,
    population: { declared: execution.population?.declared || null, observed: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    observation_status: 'observed',
    retrieval_status: 'retrieved',
    data: { ...data, evidence_origin: evidenceOrigin },
    lineage: { source_evidence: [execution.observation_id], predecessor_references: [execution.observation_id], package_reference: null },
    limitations: [...new Set(limitations)],
  });
}

export function verifyCompetitorRepresentationObservation(item) {
  return verifyExternalObservation(item);
}

export function representationsForEntity(observations, entityId) {
  return (observations || []).filter((item) => item.data?.entity?.entity_id === entityId);
}

export function representationsForExecution(observations, executionId) {
  return (observations || []).filter((item) => item.data?.execution_reference === executionId);
}

/** Comparability is inherited from the common external evidence contract. */
export function compareCompetitorRepresentations(left, right) {
  const base = compareExternalObservations(left, right);
  if (!verifyCompetitorRepresentationObservation(left).valid || !verifyCompetitorRepresentationObservation(right).valid) return base;
  const dimensions = {
    ...base.dimensions,
    prompt: left.data.prompt_reference === right.data.prompt_reference ? 'match' : 'mismatch',
    prompt_set: left.data.prompt_set_reference === right.data.prompt_set_reference ? 'match' : 'mismatch',
    representation_type: left.data.representation.type === right.data.representation.type ? 'match' : 'mismatch',
    entity_resolution: left.data.entity.resolution_method === right.data.entity.resolution_method && left.data.entity.resolution_status === right.data.entity.resolution_status ? 'match' : 'mismatch',
  };
  const mismatched = Object.values(dimensions).some((value) => value === 'mismatch');
  const missing = Object.values(dimensions).some((value) => value === 'missing');
  return {
    ...base,
    comparison_id: `CMP-${sha256(canonicalEvidenceJson({ left: left.observation_id, right: right.observation_id, dimensions })).slice(0, 16)}`,
    status: mismatched ? 'NOT_COMPARABLE' : missing ? 'PARTIALLY_COMPARABLE' : 'COMPARABLE',
    dimensions,
    limitations: mismatched || missing ? ['Representation type, entity resolution, prompt identity, and population must align before a delta is interpreted.'] : [],
  };
}
