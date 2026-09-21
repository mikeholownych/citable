import { createExternalObservation, verifyExternalObservation } from '../evidence/external.js';
import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { providerRequest } from '../connectors/http.js';
import { collectionResult, errorMessage } from '../connectors/collectionResult.js';

const SEARCH_DATA_SCHEMA = 'search-discovery-data.schema.json';
const BASE = 'https://www.googleapis.com/webmasters/v3';
const DIMENSIONS = new Set(['date', 'query', 'page', 'country', 'device', 'searchAppearance']);
const COLLECTOR = { id: 'citable-search-console-observations', version: '1.0.0' };
const PARSER = { id: 'google-search-analytics-response', version: '1.0.0' };

function assertDate(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new TypeError(`${name} must be an ISO date (YYYY-MM-DD)`);
  }
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('Search Console request is required');
  if (typeof request.property_id !== 'string' || !request.property_id) throw new TypeError('property_id is required');
  assertDate(request.start_date, 'start_date');
  assertDate(request.end_date, 'end_date');
  if (request.start_date > request.end_date) throw new RangeError('start_date must not be after end_date');
  const dimensions = request.dimensions ?? ['query', 'page'];
  if (!Array.isArray(dimensions) || dimensions.length === 0 || dimensions.some((item) => !DIMENSIONS.has(item))) throw new TypeError('dimensions contain an unsupported Search Console dimension');
  const filters = request.filters ?? {};
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new TypeError('filters must be an object');
  const rowLimit = request.row_limit ?? 25000;
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 25000) throw new RangeError('row_limit must be an integer from 1 to 25000');
  return { property_id: request.property_id, start_date: request.start_date, end_date: request.end_date, dimensions: [...new Set(dimensions)], filters, row_limit: rowLimit };
}

function configurationFor(request) {
  const configuration = { property_id: request.property_id, dimensions: request.dimensions, filters: request.filters, row_limit: request.row_limit };
  return { id: `gsc-${sha256(canonicalEvidenceJson(configuration)).slice(0, 16)}`, version: '1.0.0' };
}

function numberOrNull(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}

function requestBody(request, startRow) {
  const body = { startDate: request.start_date, endDate: request.end_date, dimensions: request.dimensions, rowLimit: request.row_limit, startRow, dataState: 'final' };
  if (Object.keys(request.filters).length) body.dimensionFilterGroups = [{ groupType: 'and', filters: Object.entries(request.filters).map(([dimension, expression]) => ({ dimension, operator: 'equals', expression: String(expression) })) }];
  return body;
}

function normalizeRow(row, request, dimensions, pageStart, coverageStatus, providerTotal, responseHash, origin) {
  if (!row || !Array.isArray(row.keys)) throw new TypeError('Search Console row is malformed');
  const values = Object.fromEntries(dimensions.map((name, index) => [name, row.keys[index] ?? null]));
  const data = {
    query: values.query ?? null,
    page: values.page ?? null,
    interval: { start_date: request.start_date, end_date: request.end_date },
    metrics: { impressions: numberOrNull(row.impressions), clicks: numberOrNull(row.clicks), ctr: numberOrNull(row.ctr), average_position: numberOrNull(row.position) },
    dimensions: { country: values.country ?? null, device: values.device ?? null, search_appearance: values.searchAppearance ?? null, date: values.date ?? null },
    request: { property_id: request.property_id, dimensions: request.dimensions, filters: request.filters, row_limit: request.row_limit },
    provider_reported: { row_count: providerTotal, page_start: pageStart },
    coverage_status: coverageStatus,
    response_hash: responseHash,
    evidence_origin: origin,
  };
  const check = validateAgainst(SEARCH_DATA_SCHEMA, data);
  if (!check.valid) throw new TypeError(`search discovery data violates contract: ${check.errors.join('; ')}`);
  const subjectId = `query:${data.query ?? ''}|page:${data.page ?? ''}`;
  return createExternalObservation({
    observation_id: `GSC-${sha256(canonicalEvidenceJson({ request, values, row })).slice(0, 24)}`,
    observation_type: 'EXTERNAL_OBSERVATION',
    subject: { type: 'search_query_page', id: subjectId || `row:${pageStart}` },
    source: { provider: 'google_search_console', method: 'search_analytics_api', authority: 'external_provider', account_or_property: request.property_id },
    collector: COLLECTOR,
    parser: PARSER,
    configuration: configurationFor(request),
    observed_at: nowIso(),
    retrieved_at: nowIso(),
    population: { declared: { id: `GSC-${sha256(canonicalEvidenceJson(request)).slice(0, 16)}`, size: providerTotal }, observed: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    observation_status: coverageStatus === 'complete' ? 'observed' : 'incomplete',
    retrieval_status: coverageStatus === 'complete' ? 'retrieved' : coverageStatus === 'indeterminate' ? 'indeterminate' : 'partial',
    data,
    lineage: { source_evidence: [responseHash] },
    limitations: ['Search Console reports provider-returned search analytics rows, not universal search demand.', 'Provider privacy filtering, aggregation, and reporting revisions may limit representativeness.'],
  });
}

/**
 * Collect normalized Search Console search-analytics observations. This is a
 * provider adapter: credentials are supplied only to the transport and are
 * never written into observations or continuation state.
 */
export async function collectSearchConsoleObservations({ connection, request, token, fetchImpl = globalThis.fetch, maxPages = 1000, evidenceOrigin = 'LIVE_PROVIDER' } = {}) {
  const normalized = validateRequest(request);
  if (!['LIVE_PROVIDER', 'RECORDED_FIXTURE', 'SYNTHETIC_TEST'].includes(evidenceOrigin)) throw new TypeError('evidenceOrigin is invalid');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10000) throw new RangeError('maxPages must be an integer from 1 to 10000');
  if (connection?.property_id && connection.property_id !== normalized.property_id) throw new Error('connection property_id does not match request property_id');
  const dimensions = normalized.dimensions;
  const rows = [];
  const observations = [];
  const errors = [];
  let startRow = 0;
  let providerTotal = null;
  let continuationState = null;
  let pagesRequested = 0;
  let pagesRetrieved = 0;
  let lastResponseHash = null;
  let response;
  do {
    pagesRequested += 1;
    try {
      response = await providerRequest(`${BASE}/sites/${encodeURIComponent(normalized.property_id)}/searchAnalytics/query`, {
        token, fetchImpl, method: 'POST', body: requestBody(normalized, startRow),
      });
      if (!response || !Array.isArray(response.rows)) throw new Error('Search Console response rows must be an array');
    } catch (error) {
      errors.push(`start row ${startRow}: ${errorMessage(error)}`);
      continuationState = { start_row: startRow };
      break;
    }
    pagesRetrieved += 1;
    lastResponseHash = sha256(canonicalEvidenceJson(response));
    if (Number.isInteger(response.rowCount) && response.rowCount >= 0) providerTotal = response.rowCount;
    rows.push(...response.rows.map((row) => ({ row, pageStart: startRow, responseHash: lastResponseHash })));
    const moreRows = providerTotal !== null && rows.length < providerTotal;
    if (providerTotal !== null && !moreRows) break;
    if (providerTotal === null && response.rows.length < normalized.row_limit) break;
    startRow += normalized.row_limit;
    if (pagesRequested >= maxPages) {
      continuationState = { start_row: startRow };
      break;
    }
  } while (true);

  const collection = collectionResult({
    items: rows,
    paginationState: { pages_requested: pagesRequested, pages_retrieved: pagesRetrieved, boundary: { max_pages: maxPages, row_limit: normalized.row_limit } },
    providerReportedTotal: providerTotal,
    continuationState,
    providerCompleteness: providerTotal !== null ? 'declared' : 'unknown',
    limitations: ['Search Console privacy filtering and aggregation apply.', 'A complete result is complete only for the declared API request; it is not a census of all search behavior.'],
    errors,
  });
  const normalizedRows = rows.map(({ row, pageStart, responseHash }) => normalizeRow(row, normalized, dimensions, pageStart, collection.coverage_status, providerTotal, responseHash || sha256(canonicalEvidenceJson({ request: normalized, rows: [] })), evidenceOrigin));
  observations.push(...normalizedRows);
  return { observations, collection, request: normalized, provider: 'google_search_console', response_hash: lastResponseHash, errors };
}

export function compareSearchDiscoveryObservations(left, right) {
  if (!verifyExternalObservation(left).valid || !verifyExternalObservation(right).valid) return { status: 'INDETERMINATE', dimensions: {}, limitations: ['Observation integrity could not be verified.'] };
  const dimensions = {
    provider: left.source.provider === right.source.provider ? 'match' : 'mismatch',
    property: left.source.account_or_property === right.source.account_or_property ? 'match' : 'mismatch',
    query: left.data.query === right.data.query ? 'match' : 'mismatch',
    page: left.data.page === right.data.page ? 'match' : 'mismatch',
    configuration: left.configuration?.id === right.configuration?.id ? 'match' : 'mismatch',
    interval: JSON.stringify(left.data.interval) === JSON.stringify(right.data.interval) ? 'match' : 'mismatch',
    coverage: left.data.coverage_status === right.data.coverage_status ? 'match' : 'mismatch',
  };
  const hardMismatch = ['provider', 'property', 'query', 'page', 'configuration'].some((key) => dimensions[key] === 'mismatch');
  const incomplete = [left.data.coverage_status, right.data.coverage_status].some((status) => !['complete'].includes(status));
  const status = hardMismatch ? 'NOT_COMPARABLE' : incomplete ? 'INDETERMINATE' : dimensions.interval === 'mismatch' ? 'PARTIALLY_COMPARABLE' : 'COMPARABLE';
  return {
    comparison_id: `GSC-CMP-${sha256(canonicalEvidenceJson({ left: left.observation_id, right: right.observation_id, dimensions })).slice(0, 16)}`,
    left_reference: left.observation_id,
    right_reference: right.observation_id,
    status,
    dimensions,
    limitations: status === 'COMPARABLE' ? [] : ['Search Console interval, configuration, and coverage limitations remain attached; no business opportunity or ranking conclusion is inferred.'],
  };
}

function validSearchObservations(observations) {
  return (Array.isArray(observations) ? observations : []).filter((item) => verifyExternalObservation(item).valid && item.source?.provider === 'google_search_console');
}

export function pagesForQuery(observations, query) {
  return validSearchObservations(observations).filter((item) => item.data.query === query && item.data.page).map((item) => item);
}

export function queriesForPage(observations, page) {
  return validSearchObservations(observations).filter((item) => item.data.page === page && item.data.query).map((item) => item);
}

export function relationshipObservations(observations, { query = null, page = null } = {}) {
  return validSearchObservations(observations).filter((item) => (query == null || item.data.query === query) && (page == null || item.data.page === page));
}
