import { createExternalObservation, verifyExternalObservation } from '../evidence/external.js';
import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { verifyPromptSet, promptReference } from './prompts.js';

const REPRESENTATION_SCHEMA = 'representation-data.schema.json';
const COLLECTOR = { id: 'citable-representation-observations', version: '1.0.0' };
const PARSER = { id: 'provider-neutral-representation-parser', version: '1.0.0' };

function responseHash(rawResponse, response) {
  return sha256(typeof rawResponse === 'string' ? rawResponse : canonicalEvidenceJson(response ?? null));
}

function modelIdentity(model) {
  if (model && typeof model === 'string') return { value: model, status: 'known' };
  if (model && typeof model === 'object' && ['known', 'UNKNOWN', 'UNAVAILABLE', 'NOT_DISCLOSED'].includes(model.status)) return { value: model.value ?? null, status: model.status };
  return { value: null, status: 'UNKNOWN' };
}

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

function normalizeUrls(value) {
  if (!Array.isArray(value)) throw new TypeError('provider citations must be an array');
  return [...new Set(value.map((item) => typeof item === 'string' ? item : item?.url).filter((item) => typeof item === 'string'))].filter((item) => Boolean(hostOf(item)));
}

const SENSITIVE_KEY = /(^|[-_])(authorization|cookie|set-cookie|access[-_]?token|refresh[-_]?token|api[-_]?key|password|secret)($|[-_])/i;

function safeMetadata(value, depth = 0) {
  if (depth > 4 || value == null) return value == null ? null : '[bounded]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeMetadata(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 500) : value;
  return Object.fromEntries(Object.entries(value).slice(0, 50).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, item]) => [key, safeMetadata(item, depth + 1)]));
}

function executionStatusFor(status) {
  if (status === 'succeeded') return { observation_status: 'observed', retrieval_status: 'retrieved' };
  if (status === 'malformed' || status === 'parser_failed') return { observation_status: 'indeterminate', retrieval_status: 'indeterminate' };
  return { observation_status: 'failed', retrieval_status: 'failed' };
}

function parserErrorObservation({ provider, product, surface, prompt, promptSet, executionConfiguration, model, evidenceOrigin, executedAt, rawResponse, status, errorMessage }) {
  const hash = responseHash(rawResponse, null);
  const execution = executionConfiguration || { id: 'default', version: '1.0.0' };
  const state = executionStatusFor(status);
  return createRepresentationObservation({
    provider, product, surface, prompt, promptSet, executionConfiguration: execution, model, evidenceOrigin, executedAt,
    response: { status, response_hash: hash, parser: PARSER, raw_response_retained: false, provider_metadata: {} },
    representation: { brand_mentioned: null, domain_mentioned: null, domain_cited: null, cited_urls: [], mentioned_entities: [], cited_domains: [] },
    observationStatus: state.observation_status, retrievalStatus: state.retrieval_status,
    limitations: [`Representation response could not be normalized: ${String(errorMessage || status).slice(0, 240)}`, 'Raw provider response is not retained; response_hash is retained for identity.'],
  });
}

export function createRepresentationObservation({ provider, product, surface, prompt, promptSet, executionConfiguration, model, evidenceOrigin, executedAt = nowIso(), response, representation, observationStatus = 'observed', retrievalStatus = 'retrieved', limitations = [] }) {
  if (!provider || !product || !surface) throw new TypeError('provider, product, and surface are required');
  if (!prompt || !prompt.prompt_id || !prompt.prompt_text) throw new TypeError('prompt identity and text are required');
  if (!promptSet || !verifyPromptSet(promptSet).valid) throw new TypeError('prompt set is missing or unverifiable');
  if (!promptSet.included_prompts.some((item) => item.prompt_id === prompt.prompt_id)) throw new Error(`prompt ${prompt.prompt_id} is not included in the prompt set`);
  if (!['LIVE_PROVIDER', 'RECORDED_FIXTURE', 'SYNTHETIC_TEST'].includes(evidenceOrigin)) throw new TypeError('evidenceOrigin is invalid');
  const config = executionConfiguration || { id: 'default', version: '1.0.0' };
  const normalizedModel = modelIdentity(model);
  const data = {
    provider,
    product,
    surface,
    model: normalizedModel,
    prompt: { prompt_id: prompt.prompt_id, prompt_version: promptSet.prompt_set_version, prompt_text: prompt.prompt_text },
    prompt_set: { prompt_set_id: promptSet.prompt_set_id, prompt_set_version: promptSet.prompt_set_version },
    execution: { executed_at: executedAt, configuration: config },
    response,
    representation,
    evidence_origin: evidenceOrigin,
    limitations: [...new Set(limitations)],
  };
  const check = validateAgainst(REPRESENTATION_SCHEMA, data);
  if (!check.valid) throw new TypeError(`representation data violates contract: ${check.errors.join('; ')}`);
  const state = executionStatusFor(response.status);
  const observation = createExternalObservation({
    observation_id: `REP-${sha256(canonicalEvidenceJson({ provider, product, surface, prompt, promptSet: promptSet.prompt_set_hash, executedAt, response })).slice(0, 24)}`,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'prompt_execution', id: promptReference(promptSet, prompt.prompt_id) },
    source: { provider, method: 'representation_adapter', authority: 'external_provider' },
    collector: COLLECTOR,
    parser: PARSER,
    configuration: config,
    observed_at: executedAt,
    retrieved_at: executedAt,
    executed_at: executedAt,
    population: { declared: { id: `${promptSet.prompt_set_id}@${promptSet.prompt_set_version}`, size: promptSet.population_size }, observed: 1, retrieved: response.status === 'succeeded' ? 1 : 0, evaluated: response.status === 'succeeded' ? 1 : 0, unavailable: response.status === 'unavailable' ? 1 : 0, failed: response.status === 'succeeded' ? 0 : 1 },
    observation_status: observationStatus || state.observation_status,
    retrieval_status: retrievalStatus || state.retrieval_status,
    data,
    lineage: { source_evidence: response.response_hash ? [response.response_hash] : [] },
    limitations: data.limitations,
  });
  return observation;
}

export function normalizeRepresentationResponse({ provider, product, surface, prompt, promptSet, executionConfiguration, model, response, rawResponse = null, evidenceOrigin = 'RECORDED_FIXTURE', executedAt = nowIso(), brand = null, firstPartyDomains = [], retainRawResponse = false }) {
  const base = { provider, product, surface, prompt, promptSet, executionConfiguration, model, evidenceOrigin, executedAt };
  const rawHash = responseHash(rawResponse, response);
  try {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new TypeError('provider response must be an object');
    const answerText = response.answer_text ?? response.answer ?? response.text;
    if (typeof answerText !== 'string') throw new TypeError('provider response requires answer_text');
    const citations = normalizeUrls(response.citations || []);
    const mentionedEntities = Array.isArray(response.mentions) ? response.mentions.filter((item) => typeof item === 'string') : [];
    const firstParty = new Set(firstPartyDomains.map((item) => String(item).toLowerCase()));
    const citedDomains = [...new Set(citations.map(hostOf).filter(Boolean))];
    const domainMentioned = firstParty.size ? [...firstParty].some((domain) => answerText.toLowerCase().includes(domain)) : null;
    const domainCited = firstParty.size ? citedDomains.some((domain) => firstParty.has(domain)) : null;
    const brandMentioned = typeof brand === 'string' ? answerText.toLowerCase().includes(brand.toLowerCase()) : null;
    return createRepresentationObservation({
      ...base,
      response: { status: 'succeeded', response_hash: rawHash, parser: PARSER, raw_response_retained: retainRawResponse, provider_metadata: { ...safeMetadata(response.provider_metadata || {}), ...(retainRawResponse ? { raw_response: rawResponse ?? response } : {}) } },
      representation: { brand_mentioned: brandMentioned, domain_mentioned: domainMentioned, domain_cited: domainCited, cited_urls: citations, mentioned_entities: mentionedEntities, cited_domains: citedDomains },
      limitations: retainRawResponse ? [] : ['Raw provider response is not retained; response_hash is retained for identity.'],
    });
  } catch (error) {
    return parserErrorObservation({ ...base, rawResponse, status: 'parser_failed', errorMessage: error.message });
  }
}

export async function collectRepresentationObservations({ promptSet, adapter, provider, product = 'unknown', surface = 'unknown', model = null, executionConfiguration = { id: 'default', version: '1.0.0' }, evidenceOrigin = 'LIVE_PROVIDER', brand = null, firstPartyDomains = [] } = {}) {
  if (!promptSet || !verifyPromptSet(promptSet).valid) throw new TypeError('prompt set is missing or unverifiable');
  if (typeof adapter !== 'function') throw new TypeError('representation adapter is required');
  const observations = [];
  for (const prompt of promptSet.included_prompts) {
    const executedAt = nowIso();
    try {
      const result = await adapter(prompt, { provider, product, surface, model, promptSet, executionConfiguration });
      if (!result || typeof result !== 'object') throw new Error('adapter returned an invalid result');
      const status = result.status || 'succeeded';
      if (status !== 'succeeded') {
        observations.push(parserErrorObservation({ provider, product, surface, prompt, promptSet, executionConfiguration, model, evidenceOrigin, executedAt, rawResponse: result.raw ?? result.body ?? null, status, errorMessage: result.error || status }));
      } else {
        observations.push(normalizeRepresentationResponse({ provider, product, surface, prompt, promptSet, executionConfiguration, model, response: result.body ?? result.response ?? result, rawResponse: result.raw ?? null, evidenceOrigin, executedAt, brand, firstPartyDomains }));
      }
    } catch (error) {
      observations.push(parserErrorObservation({ provider, product, surface, prompt, promptSet, executionConfiguration, model, evidenceOrigin, executedAt, rawResponse: null, status: error.connectorState === 'quota_limited' ? 'rate_limited' : error.name === 'AbortError' ? 'timeout' : 'error', errorMessage: error.message }));
    }
  }
  return { observations, coverage: { declared: promptSet.population_size, executed: observations.filter((item) => item.data.response.status === 'succeeded').length, failed: observations.filter((item) => item.data.response.status !== 'succeeded').length, coverage_status: observations.every((item) => item.data.response.status === 'succeeded') ? 'complete_for_declared_prompt_set' : 'incomplete' }, prompt_set_reference: `${promptSet.prompt_set_id}@${promptSet.prompt_set_version}` };
}

export function createHttpRepresentationAdapter({ endpoint, fetchImpl = globalThis.fetch, accessToken = null } = {}) {
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) throw new TypeError('representation adapter endpoint must use HTTPS');
  return async (prompt) => {
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', headers: { accept: 'application/json', 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ prompt_id: prompt.prompt_id, prompt_text: prompt.prompt_text }) });
    const raw = await response.text();
    if (!response.ok) {
      const status = response.status === 429 ? 'rate_limited' : response.status === 408 ? 'timeout' : response.status >= 500 ? 'unavailable' : 'refused';
      return { status, raw, error: `provider returned ${response.status}` };
    }
    let body;
    try { body = JSON.parse(raw); } catch { return { status: 'malformed', raw, error: 'provider response was not valid JSON' }; }
    return { status: 'succeeded', body, raw };
  };
}

export function verifyRepresentationObservation(item) {
  return verifyExternalObservation(item);
}

export function compareRepresentationObservations(left, right) {
  if (!verifyExternalObservation(left).valid || !verifyExternalObservation(right).valid) return { status: 'INDETERMINATE', dimensions: {}, limitations: ['Representation observation integrity could not be verified.'] };
  const dimensions = {
    provider: left.data.provider === right.data.provider ? 'match' : 'mismatch',
    product: left.data.product === right.data.product ? 'match' : 'mismatch',
    surface: left.data.surface === right.data.surface ? 'match' : 'mismatch',
    model: left.data.model.status !== 'known' || right.data.model.status !== 'known' ? 'missing' : left.data.model.value === right.data.model.value ? 'match' : 'mismatch',
    prompt: left.data.prompt.prompt_id === right.data.prompt.prompt_id && left.data.prompt.prompt_text === right.data.prompt.prompt_text ? 'match' : 'mismatch',
    prompt_set: left.data.prompt_set.prompt_set_id === right.data.prompt_set.prompt_set_id && left.data.prompt_set.prompt_set_version === right.data.prompt_set.prompt_set_version ? 'match' : 'mismatch',
    configuration: left.data.execution.configuration.id === right.data.execution.configuration.id && left.data.execution.configuration.version === right.data.execution.configuration.version ? 'match' : 'mismatch',
    parser: left.data.response.parser.id === right.data.response.parser.id && left.data.response.parser.version === right.data.response.parser.version ? 'match' : 'mismatch',
  };
  const hardMismatch = ['provider', 'product', 'surface', 'prompt', 'prompt_set', 'configuration', 'parser'].some((key) => dimensions[key] === 'mismatch');
  const status = hardMismatch ? 'NOT_COMPARABLE' : dimensions.model === 'mismatch' ? 'NOT_COMPARABLE' : dimensions.model === 'missing' ? 'PARTIALLY_COMPARABLE' : 'COMPARABLE';
  return { comparison_id: `REP-CMP-${sha256(canonicalEvidenceJson({ left: left.observation_id, right: right.observation_id, dimensions })).slice(0, 16)}`, left_reference: left.observation_id, right_reference: right.observation_id, status, dimensions, limitations: status === 'COMPARABLE' ? [] : ['Provider, model, prompt, execution, and parser identity remain explicit; no visibility delta is inferred from non-comparable observations.'] };
}
