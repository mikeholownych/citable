import { validateAgainst } from '../shared/schemaValidator.js';

export const COLLECTION_SCHEMA_VERSION = 1;
export const COLLECTION_COVERAGE_STATUSES = new Set([
  'complete',
  'truncated',
  'indeterminate',
  'provider_bounded',
]);

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}

function stringList(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new TypeError(`${name} must be an array of strings`);
  return [...new Set(value)];
}

/**
 * Build the provider-neutral collection envelope. `items` are the items
 * actually observed, never a provider-reported total or an inferred census.
 */
export function collectionResult({
  items = [],
  paginationState = {},
  providerReportedTotal = null,
  continuationState = null,
  limitations = [],
  errors = [],
  providerCompleteness = 'declared',
} = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!paginationState || typeof paginationState !== 'object' || Array.isArray(paginationState)) throw new TypeError('paginationState must be an object');
  if (providerReportedTotal !== null) nonNegativeInteger(providerReportedTotal, 'providerReportedTotal');
  stringList(limitations, 'limitations');
  stringList(errors, 'errors');
  if (continuationState !== null && (typeof continuationState !== 'object' || Array.isArray(continuationState))) throw new TypeError('continuationState must be an object or null');
  if (!['declared', 'unknown'].includes(providerCompleteness)) throw new TypeError('providerCompleteness must be declared or unknown');

  const cleanErrors = [...new Set(errors)];
  const status = cleanErrors.length
    ? 'indeterminate'
    : continuationState
      ? 'truncated'
      : providerCompleteness === 'unknown'
        ? 'provider_bounded'
        : 'complete';
  const result = {
    schema_version: COLLECTION_SCHEMA_VERSION,
    items,
    pagination_state: paginationState,
    provider_reported_total: providerReportedTotal,
    retrieved_total: items.length,
    coverage_status: status,
    continuation_state: continuationState,
    limitations: [...new Set(limitations)],
    errors: cleanErrors,
  };
  const check = validateAgainst('collection-result.schema.json', result);
  if (!check.valid) throw new TypeError(`invalid collection result: ${check.errors.join('; ')}`);
  return result;
}

export function paginationBoundary(context = {}) {
  const value = context.collectionMaxPages ?? context.maxPages ?? 1000;
  if (!Number.isInteger(value) || value < 1 || value > 10000) throw new RangeError('collection max pages must be an integer from 1 to 10000');
  return value;
}

export function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300);
}
