import { validateAgainst } from '../shared/schemaValidator.js';

export const COVERAGE_SCHEMA_VERSION = 1;

const STOP_REASONS = new Set([
  'frontier_exhausted',
  'page_budget_exhausted',
  'time_budget_exhausted',
  'fatal_collection_failure',
]);

const DISCOVERY_STATUSES = new Set(['complete', 'truncated', 'indeterminate']);
const TERMINAL_STATES = new Set([
  'evaluated',
  'valid_but_unevaluated',
  'failed',
  'indeterminate',
]);

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertIntegerInRange(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
}

function assertUrl(value, name) {
  assertNonEmptyString(value, name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`${name} must use http or https`);
  }
  return parsed;
}

function normalizedUrl(url) {
  assertUrl(url, 'url');
  const fragmentIndex = url.indexOf('#');
  return fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
}

function canonicalValue(value, path = 'metadata') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, `${path}[${index}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key], `${path}.${key}`)]),
    );
  }
  throw new TypeError(`${path} must contain only JSON-compatible values`);
}

function canonicalMetadata(metadata, name) {
  if (metadata === undefined) return {};
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError(`${name} must be an object`);
  }
  return canonicalValue(metadata, name);
}

function stableString(value) {
  return JSON.stringify(canonicalValue(value));
}

function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortedUniqueStrings(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  for (const value of values) assertNonEmptyString(value, `${name} entry`);
  return [...new Set(values)].sort(compareStrings);
}

function stateOf(resource) {
  if (resource.exclusion) return 'excluded';
  if (resource.evaluation) return 'evaluated';
  if (resource.validButUnevaluated) return 'valid_but_unevaluated';
  if (resource.failure) return 'failed';
  if (resource.indeterminate) return 'indeterminate';
  if (resource.classification?.state === 'valid_resource') return 'valid_resource';
  if (resource.retrieval) return 'retrieved';
  if (resource.attemptHistory.length > 0) return 'attempted';
  return 'eligible';
}

function assertNotTerminal(resource, operation) {
  const state = stateOf(resource);
  if (TERMINAL_STATES.has(state) || state === 'excluded') {
    throw new Error(`cannot ${operation} resource in terminal state ${state}`);
  }
}

function equationError(label, left, right) {
  return `${label} (${left} != ${right})`;
}

export function reconcileCoverage(coverage) {
  const populations = coverage?.populations;
  if (!populations || typeof populations !== 'object') {
    return { valid: false, errors: ['coverage populations are missing'] };
  }

  const errors = [];
  const discoveredParts = populations.excluded + populations.eligible;
  if (populations.discovered !== discoveredParts) {
    errors.push(equationError('discovered = excluded + eligible', populations.discovered, discoveredParts));
  }

  const eligibleParts = populations.evaluated
    + populations.valid_but_unevaluated
    + populations.failed
    + populations.indeterminate
    + populations.unvisited;
  if (populations.eligible !== eligibleParts) {
    errors.push(equationError(
      'eligible = evaluated + valid_but_unevaluated + failed + indeterminate + unvisited',
      populations.eligible,
      eligibleParts,
    ));
  }

  const attemptedParts = populations.retrieved + populations.failed;
  if (populations.attempted !== attemptedParts) {
    errors.push(equationError('attempted = retrieved + failed', populations.attempted, attemptedParts));
  }

  const retrievedParts = populations.valid_resource + populations.indeterminate;
  if (populations.retrieved !== retrievedParts) {
    errors.push(equationError('retrieved = valid_resource + indeterminate', populations.retrieved, retrievedParts));
  }

  const validResourceParts = populations.evaluated + populations.valid_but_unevaluated;
  if (populations.valid_resource !== validResourceParts) {
    errors.push(equationError(
      'valid_resource = evaluated + valid_but_unevaluated',
      populations.valid_resource,
      validResourceParts,
    ));
  }

  return { valid: errors.length === 0, errors };
}

export function coverageStatusFor({ stopReason, discoveryStatus = 'complete', populations }) {
  if (!STOP_REASONS.has(stopReason)) throw new Error(`unknown stop reason: ${stopReason}`);
  if (!DISCOVERY_STATUSES.has(discoveryStatus)) {
    throw new Error(`unknown discovery status: ${discoveryStatus}`);
  }

  if (stopReason === 'page_budget_exhausted' || stopReason === 'time_budget_exhausted') {
    return 'truncated';
  }
  if (stopReason === 'fatal_collection_failure') return 'indeterminate';

  const incomplete = populations.failed
    + populations.indeterminate
    + populations.valid_but_unevaluated
    + populations.unvisited;
  return discoveryStatus === 'complete' && incomplete === 0 ? 'complete' : 'indeterminate';
}

export function createCoverageLedger({
  startUrl,
  maxPages,
  timeBudgetSeconds,
  normalizationVersion = 'url-identity-v1',
}) {
  const parsedStartUrl = assertUrl(startUrl, 'startUrl');
  assertIntegerInRange(maxPages, 'maxPages', 1, 10000);
  assertIntegerInRange(timeBudgetSeconds, 'timeBudgetSeconds', 1, 86400);
  assertNonEmptyString(normalizationVersion, 'normalizationVersion');

  const resources = new Map();
  let finalized = false;

  function assertMutable() {
    if (finalized) throw new Error('coverage ledger is already finalized');
  }

  function requireResource(url) {
    const normalized = normalizedUrl(url);
    const resource = resources.get(normalized);
    if (!resource) throw new Error(`resource must be discovered before transition: ${url}`);
    return resource;
  }

  function discover(url, source, metadata = {}) {
    assertMutable();
    const normalized = normalizedUrl(url);
    assertNonEmptyString(source, 'source');
    const canonical = canonicalMetadata(metadata, 'discovery metadata');
    let resource = resources.get(normalized);
    if (!resource) {
      resource = {
        normalizedUrl: normalized,
        originalUrls: new Set(),
        discoverySources: new Map(),
        exclusion: null,
        attemptHistory: [],
        retrieval: null,
        classification: null,
        evaluation: null,
        failure: null,
        indeterminate: null,
        validButUnevaluated: null,
      };
      resources.set(normalized, resource);
    }
    resource.originalUrls.add(url);
    const discovery = { source, url, ...(Object.keys(canonical).length > 0 ? { metadata: canonical } : {}) };
    resource.discoverySources.set(stableString(discovery), discovery);
    return normalized;
  }

  function exclude(url, reason) {
    assertMutable();
    assertNonEmptyString(reason, 'exclusion reason');
    const resource = requireResource(url);
    if (resource.attemptHistory.length > 0) throw new Error('cannot exclude a resource after an attempt');
    if (resource.exclusion) throw new Error('resource is already excluded');
    resource.exclusion = { reason };
  }

  function attempt(url, attemptMetadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'attempt');
    if (resource.retrieval) throw new Error('cannot attempt a resource after retrieval');
    resource.attemptHistory.push(canonicalMetadata(attemptMetadata, 'attempt metadata'));
  }

  function retrieve(url, responseMetadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'retrieve');
    if (resource.attemptHistory.length === 0) throw new Error('resource must have an attempt before retrieval');
    if (resource.retrieval) throw new Error('resource is already retrieved');
    resource.retrieval = canonicalMetadata(responseMetadata, 'response metadata');
  }

  function classify(url, classification) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'classify');
    if (!resource.retrieval) throw new Error('resource must be retrieved before classification');
    if (resource.classification) throw new Error('resource is already classified');

    const canonical = typeof classification === 'string'
      ? { state: classification }
      : canonicalMetadata(classification, 'classification');
    if (canonical.state !== 'valid_resource' && canonical.state !== 'indeterminate') {
      throw new Error('classification state must be valid_resource or indeterminate');
    }
    if (canonical.state === 'indeterminate') {
      resource.indeterminate = canonical;
    } else {
      resource.classification = canonical;
    }
  }

  function evaluate(url, evaluationMetadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'evaluate');
    if (resource.classification?.state !== 'valid_resource') {
      throw new Error('resource must be classified as a valid resource before evaluation');
    }
    resource.evaluation = canonicalMetadata(evaluationMetadata, 'evaluation metadata');
  }

  function fail(url, failureMetadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'fail');
    if (resource.attemptHistory.length === 0) throw new Error('resource must have an attempt before failure');
    if (resource.retrieval) throw new Error('retrieved resources cannot enter retrieval failure');
    resource.failure = canonicalMetadata(failureMetadata, 'failure metadata');
  }

  function markIndeterminate(url, metadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'mark indeterminate');
    if (!resource.retrieval) throw new Error('resource must be retrieved before it can be indeterminate');
    if (resource.classification?.state === 'valid_resource') {
      throw new Error('a valid resource must be evaluated or marked valid-but-unevaluated');
    }
    resource.indeterminate = { ...canonicalMetadata(metadata, 'indeterminate metadata'), state: 'indeterminate' };
  }

  function markValidButUnevaluated(url, metadata = {}) {
    assertMutable();
    const resource = requireResource(url);
    assertNotTerminal(resource, 'mark valid-but-unevaluated');
    if (resource.classification?.state !== 'valid_resource') {
      throw new Error('resource must be classified as a valid resource before evaluator failure');
    }
    resource.validButUnevaluated = canonicalMetadata(metadata, 'evaluator failure metadata');
  }

  function finalizedState(resource) {
    const state = stateOf(resource);
    if (state === 'eligible') return 'unvisited';
    if (state === 'attempted' || state === 'retrieved' || state === 'valid_resource') {
      throw new Error(`resource ${resource.normalizedUrl} has unresolved state ${state}`);
    }
    return state;
  }

  function resourceOutput(resource) {
    const state = finalizedState(resource);
    const output = {
      normalized_url: resource.normalizedUrl,
      original_urls: [...resource.originalUrls].sort(compareStrings),
      discovery_sources: [...resource.discoverySources.values()].sort((a, b) => (
        compareStrings(a.source, b.source)
        || compareStrings(a.url, b.url)
        || compareStrings(stableString(a), stableString(b))
      )),
      state,
    };
    if (resource.exclusion) output.exclusion = resource.exclusion;
    if (resource.attemptHistory.length > 0) output.attempt_history = resource.attemptHistory;
    if (resource.retrieval) output.retrieval = resource.retrieval;
    if (resource.classification) output.classification = resource.classification;
    if (resource.evaluation) output.evaluation = resource.evaluation;
    if (resource.failure) output.failure = resource.failure;
    if (resource.indeterminate) output.indeterminate = resource.indeterminate;
    if (resource.validButUnevaluated) output.evaluator_failure = resource.validButUnevaluated;
    return output;
  }

  function finalize(stopReason, options = {}) {
    assertMutable();
    if (!STOP_REASONS.has(stopReason)) throw new Error(`unknown stop reason: ${stopReason}`);
    const {
      discoveryStatus = 'complete',
      discoveryMethods,
      discoveryLimitations = [],
      limitations = [],
    } = options;
    if (!DISCOVERY_STATUSES.has(discoveryStatus)) {
      throw new Error(`unknown discovery status: ${discoveryStatus}`);
    }

    const outputResources = [...resources.values()]
      .map(resourceOutput)
      .sort((a, b) => compareStrings(a.normalized_url, b.normalized_url));
    const stateCount = (state) => outputResources.filter((resource) => resource.state === state).length;
    const populations = {
      discovered: outputResources.length,
      eligible: outputResources.length - stateCount('excluded'),
      excluded: stateCount('excluded'),
      attempted: outputResources.filter((resource) => resource.attempt_history).length,
      retrieved: outputResources.filter((resource) => resource.retrieval).length,
      valid_resource: outputResources.filter((resource) => resource.classification?.state === 'valid_resource').length,
      evaluated: stateCount('evaluated'),
      valid_but_unevaluated: stateCount('valid_but_unevaluated'),
      failed: stateCount('failed'),
      indeterminate: stateCount('indeterminate'),
      unvisited: stateCount('unvisited'),
    };
    const methods = discoveryMethods === undefined
      ? [...new Set(outputResources.flatMap((resource) => resource.discovery_sources.map(({ source }) => source)))].sort(compareStrings)
      : sortedUniqueStrings(discoveryMethods, 'discoveryMethods');
    const coverage = {
      schema_version: COVERAGE_SCHEMA_VERSION,
      normalization_version: normalizationVersion,
      requested_scope: {
        start_url: startUrl,
        origin: parsedStartUrl.origin,
        max_pages: maxPages,
        time_budget_seconds: timeBudgetSeconds,
      },
      discovery: {
        status: discoveryStatus,
        methods,
        limitations: sortedUniqueStrings(discoveryLimitations, 'discoveryLimitations'),
      },
      populations,
      resources: outputResources,
      stop_reason: stopReason,
      coverage_status: coverageStatusFor({ stopReason, discoveryStatus, populations }),
      reconciliation: { valid: false, errors: ['not reconciled'] },
      limitations: sortedUniqueStrings(limitations, 'limitations'),
    };
    coverage.reconciliation = reconcileCoverage(coverage);
    if (!coverage.reconciliation.valid) {
      throw new Error(`coverage reconciliation failed: ${coverage.reconciliation.errors.join('; ')}`);
    }
    const schemaValidation = validateAgainst('audit-coverage.schema.json', coverage);
    if (!schemaValidation.valid) {
      throw new Error(`audit coverage invalid: ${schemaValidation.errors.join('; ')}`);
    }
    finalized = true;
    return coverage;
  }

  return {
    discover,
    exclude,
    attempt,
    retrieve,
    classify,
    evaluate,
    fail,
    markIndeterminate,
    markValidButUnevaluated,
    finalize,
  };
}
