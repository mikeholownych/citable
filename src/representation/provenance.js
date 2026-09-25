import { createExternalObservation, createDerivation, verifyExternalObservation, verifyClaim } from '../evidence/external.js';
import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const SPAN_SCHEMA = 'response-span.schema.json';
const CITATION_SCHEMA = 'citation-provenance.schema.json';
const SOURCE_SCHEMA = 'source-retrieval.schema.json';
const COLLECTOR = { id: 'citable-citation-provenance', version: '1.0.0' };
const PARSER = { id: 'provider-neutral-citation-parser', version: '1.0.0' };

function validate(schema, value, label) {
  const result = validateAgainst(schema, value);
  if (!result.valid) throw new TypeError(`${label} violates contract: ${result.errors.join('; ')}`);
  return value;
}

function validUrl(value) {
  try { return new URL(value).toString(); } catch { return null; }
}

function executionReference(execution) {
  if (!execution?.observation_id || !verifyExternalObservation(execution).valid) {
    throw new TypeError('citation execution must be a verified external observation');
  }
  if (execution.data?.response?.status !== 'succeeded') throw new Error('citation requires a substantive provider response');
  return execution.observation_id;
}

/** Create a stable, exact text span without normalizing provider prose. */
export function createResponseSpan({ execution, start, end, text, spanId = null } = {}) {
  const executionId = execution?.observation_id || execution;
  if (typeof executionId !== 'string' || !executionId) throw new TypeError('execution reference is required');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) throw new TypeError('span offsets are invalid');
  if (typeof text !== 'string') throw new TypeError('span text is required');
  if (end - start !== text.length) throw new TypeError('span offsets must bound the exact response text');
  const item = {
    span_id: spanId || `SPAN-${sha256(canonicalEvidenceJson({ execution_reference: executionId, start, end, text })).slice(0, 24)}`,
    execution_reference: executionId,
    start,
    end,
    text,
    text_hash: sha256(text),
  };
  return validate(SPAN_SCHEMA, item, 'response span');
}

function sourceShape(citation, source = {}) {
  const displayed = citation.displayed_url ?? citation.url ?? null;
  const resolved = validUrl(source.resolved_url ?? citation.resolved_url);
  const status = source.identity_status || (resolved ? 'IDENTIFIED' : displayed ? 'AMBIGUOUS' : 'NOT_IDENTIFIED');
  return {
    identity_status: status,
    resolved_url: resolved,
    redirect_chain: (source.redirect_chain || []).map(validUrl).filter(Boolean),
    canonical_url: validUrl(source.canonical_url) || null,
  };
}

function citationData({ execution, span, citation, proposition, source, retrieval, support }) {
  const data = {
    execution_reference: execution.observation_id,
    response_reference: execution.data.response.response_hash,
    provider: execution.data.provider,
    span,
    citation: {
      citation_id: citation.citation_id || `CIT-${sha256(canonicalEvidenceJson({ execution: execution.observation_id, span: span.span_id, ordinal: citation.ordinal || 1, marker: citation.raw_marker || null })).slice(0, 24)}`,
      ordinal: citation.ordinal || 1,
      raw_marker: citation.raw_marker ?? null,
      placement: citation.placement || 'unknown',
      displayed_title: citation.displayed_title ?? citation.title ?? null,
      displayed_domain: citation.displayed_domain ?? citation.domain ?? null,
      displayed_url: citation.displayed_url ?? citation.url ?? null,
    },
    source: sourceShape(citation, source),
    retrieval: { status: retrieval?.status || 'NOT_ATTEMPTED', observation_reference: retrieval?.observation_reference || null },
    proposition: { proposition_id: proposition?.proposition_id || `PROP-${sha256(proposition?.text || span.text).slice(0, 24)}`, text: proposition?.text || span.text },
    support: {
      relevance_status: support?.relevance_status || 'NOT_ASSESSED',
      support_status: support?.support_status || 'NOT_ASSESSED',
      evidence_references: [...new Set(support?.evidence_references || [])],
    },
  };
  return validate(CITATION_SCHEMA, data, 'citation provenance');
}

/** Create an immutable citation linked to one exact response span. */
export function createCitationObservation({ execution, span, citation, proposition, source = {}, retrieval = null, support = null, evidenceOrigin = 'RECORDED_FIXTURE', observedAt = nowIso(), limitations = [] } = {}) {
  executionReference(execution);
  const responseSpan = span?.span_id ? validate(SPAN_SCHEMA, span, 'response span') : createResponseSpan({ execution, ...(span || {}) });
  if (responseSpan.execution_reference !== execution.observation_id) throw new Error('span does not belong to execution');
  const data = citationData({ execution, span: responseSpan, citation: citation || {}, proposition, source, retrieval, support });
  if (!['LIVE_PROVIDER', 'RECORDED_FIXTURE', 'SYNTHETIC_TEST'].includes(evidenceOrigin)) throw new TypeError('evidenceOrigin is invalid');
  return createExternalObservation({
    observation_id: `CIT-${sha256(canonicalEvidenceJson({ execution: execution.observation_id, data })).slice(0, 24)}`,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'citation', id: data.citation.citation_id },
    source: { provider: execution.data.provider, method: 'citation_provenance', authority: 'external_provider' },
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

/** Build a set while refusing duplicate citation ordinals or identifiers. */
export function createCitationObservations(input = {}) {
  const citations = input.citations || [];
  const ids = new Set(), ordinals = new Set();
  return citations.map((citation) => {
    const item = createCitationObservation({ ...input, citation });
    const id = item.data.citation.citation_id;
    const ordinal = item.data.citation.ordinal;
    if (ids.has(id)) throw new Error(`duplicate citation_id: ${id}`);
    if (ordinals.has(ordinal)) throw new Error(`duplicate citation ordinal: ${ordinal}`);
    ids.add(id); ordinals.add(ordinal);
    return item;
  });
}

export function verifyCitationObservation(item) {
  return verifyExternalObservation(item);
}

/** Preserve source retrieval as a separate observation; failed retrieval is never support failure. */
export function createSourceRetrievalObservation({ citation, url, status = 'SUCCEEDED', body = null, finalUrl = null, redirectChain = [], httpStatus = null, attemptedAt = nowIso(), relevanceStatus = 'NOT_ASSESSED', supportStatus = 'NOT_ASSESSED', evidenceReferences = [], rawRetained = false, evidenceOrigin = 'RECORDED_FIXTURE', limitations = [] } = {}) {
  if (!citation?.observation_id || !verifyCitationObservation(citation).valid) throw new TypeError('citation must be a verified citation observation');
  const sourceUrl = validUrl(url || citation.data.source.resolved_url);
  if (!sourceUrl) throw new TypeError('retrieval URL must be a valid URL');
  const contentHash = body == null ? null : sha256(body);
  const data = validate(SOURCE_SCHEMA, {
    citation_reference: citation.observation_id,
    url: sourceUrl,
    retrieval: { status, attempted_at: attemptedAt, final_url: validUrl(finalUrl) || (status === 'SUCCEEDED' ? sourceUrl : null), redirect_chain: redirectChain.map(validUrl).filter(Boolean), http_status: status === 'SUCCEEDED' ? (httpStatus || 200) : httpStatus },
    content: { observed: status === 'SUCCEEDED' && body != null, content_hash: contentHash, raw_retained: Boolean(rawRetained) },
    relevance: { status: relevanceStatus, support_status: supportStatus, evidence_references: [...new Set(evidenceReferences)] },
  }, 'source retrieval');
  return createExternalObservation({
    observation_id: `SRC-${sha256(canonicalEvidenceJson({ citation: citation.observation_id, data })).slice(0, 24)}`,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'citation_source', id: sourceUrl },
    source: { provider: citation.data.provider, method: 'citation_source_retrieval', authority: 'third_party' },
    collector: COLLECTOR,
    parser: PARSER,
    configuration: null,
    observed_at: attemptedAt,
    retrieved_at: attemptedAt,
    executed_at: null,
    population: { declared: null, observed: status === 'SUCCEEDED' ? 1 : 0, retrieved: status === 'SUCCEEDED' ? 1 : 0, evaluated: status === 'SUCCEEDED' ? 1 : 0, unavailable: 0, failed: status === 'FAILED' ? 1 : 0 },
    observation_status: status === 'SUCCEEDED' ? 'observed' : status === 'FAILED' ? 'failed' : 'indeterminate',
    retrieval_status: status === 'SUCCEEDED' ? 'retrieved' : status === 'FAILED' ? 'failed' : 'indeterminate',
    data: { ...data, evidence_origin: evidenceOrigin },
    lineage: { source_evidence: [citation.observation_id], predecessor_references: [citation.observation_id], package_reference: null },
    limitations: [...new Set([...(status === 'FAILED' ? ['Source retrieval failed; proposition support is indeterminate.'] : []), ...limitations])],
  });
}

export function verifySourceRetrievalObservation(item) {
  return verifyExternalObservation(item);
}

export function assessPropositionSupport({ retrieval, relevanceStatus, supportStatus, evidenceReferences = [] } = {}) {
  if (!retrieval || !verifySourceRetrievalObservation(retrieval).valid) return { status: 'INDETERMINATE', reasons: ['source retrieval evidence is missing or unverifiable'], evidence_references: [] };
  if (retrieval.data.retrieval.status !== 'SUCCEEDED') return { status: 'INDETERMINATE', reasons: ['source retrieval did not succeed'], evidence_references: [retrieval.observation_id] };
  if (relevanceStatus === 'IRRELEVANT') return { status: 'UNSUPPORTED', reasons: ['retrieved source was assessed as irrelevant to the proposition'], evidence_references: [retrieval.observation_id, ...evidenceReferences] };
  const supportedStates = new Set(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED', 'INDETERMINATE', 'NOT_OBSERVED']);
  if (relevanceStatus !== 'RELEVANT' || !supportStatus || supportStatus === 'NOT_ASSESSED' || !supportedStates.has(supportStatus)) return { status: 'INDETERMINATE', reasons: ['source relevance or proposition support was not established'], evidence_references: [retrieval.observation_id, ...evidenceReferences] };
  return { status: supportStatus, reasons: [], evidence_references: [retrieval.observation_id, ...evidenceReferences] };
}

/** Derive prevalence over successful/evaluable executions only, retaining exclusions. */
export function deriveRepresentationPrevalence(observations, { predicatePath = 'data.representation.brand_mentioned', expected = true, derivationId = 'REPRESENTATION-PREVALENCE', derivationVersion = 1 } = {}) {
  if (!Array.isArray(observations) || !observations.length) throw new TypeError('observations are required');
  const valid = observations.filter((item) => verifyExternalObservation(item).valid);
  const evaluable = valid.filter((item) => item.data?.response?.status === 'succeeded');
  const excluded = observations.filter((item) => !verifyExternalObservation(item).valid || item.data?.response?.status !== 'succeeded');
  const valueAt = (item) => predicatePath.split('.').reduce((v, key) => v == null ? undefined : v[key], item);
  const numerator = evaluable.filter((item) => valueAt(item) === expected).length;
  return createDerivation({
    derivation_id: derivationId,
    derivation_version: derivationVersion,
    operation: 'representation_prevalence',
    input_observation_references: observations.map((item) => item.observation_id),
    predicate: { path: predicatePath, operator: 'equals', value: expected },
    result: {
      numerator,
      denominator: evaluable.length,
      rate: evaluable.length ? numerator / evaluable.length : null,
      evaluable_observation_references: evaluable.map((item) => item.observation_id),
      excluded_observation_references: excluded.map((item) => item.observation_id),
      exclusions: excluded.map((item) => ({ observation_reference: item.observation_id, reason: verifyExternalObservation(item).valid ? (item.data?.response?.status || 'not_evaluable') : 'integrity_unverifiable' })),
      population_scope: 'successful_representation_executions_in_supplied_observations',
    },
    implementation: { id: 'citable-representation-prevalence', version: '1.0.0' },
    lineage: {
      collector_ids: [...new Set(observations.map((item) => item.collector?.id || item.collector_id).filter(Boolean))].sort(),
      collector_versions: [...new Set(observations.map((item) => item.collector?.version || item.collector_version).filter(Boolean))].sort(),
      parser_versions: [...new Set(observations.map((item) => item.parser?.version || item.parser_version).filter(Boolean))].sort(),
      configuration_versions: [...new Set(observations.map((item) => item.configuration?.version || item.configuration_version).filter(Boolean))].sort(),
      observation_references: observations.map((item) => item.observation_id),
    },
  });
}

export function citationsForExecution(citations, executionId) { return (citations || []).filter((item) => item.data?.execution_reference === executionId); }
export function citationsForProposition(citations, propositionId) { return (citations || []).filter((item) => item.data?.proposition?.proposition_id === propositionId); }
export function sourceForCitation(retrievals, citationId) { return (retrievals || []).find((item) => item.data?.citation_reference === citationId) || null; }
export function evidenceForProposition(retrievals, propositionId, citations = []) {
  const citationIds = new Set(citationsForProposition(citations, propositionId).map((item) => item.observation_id));
  return (retrievals || []).filter((item) => citationIds.has(item.data?.citation_reference));
}

export { verifyClaim };
