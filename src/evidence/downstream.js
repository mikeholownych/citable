/**
 * Shared semantics for consumers that summarize or act on an evidence package.
 * A consumer may describe the evaluated subset, but may not widen it to the
 * requested scope when collection was incomplete or empty.
 */
const DETERMINATION_STATUSES = new Set(['supported', 'qualified', 'indeterminate', 'not_applicable']);
import { validateAgainst } from '../shared/schemaValidator.js';

function populations(coverage) {
  return coverage?.populations && typeof coverage.populations === 'object'
    ? coverage.populations : {};
}

function contractStatus(coverage) {
  if (!coverage || typeof coverage !== 'object') return { valid: false, errors: ['coverage artifact unavailable'] };
  const result = validateAgainst('audit-coverage.schema.json', coverage);
  return { valid: result.valid, errors: result.errors || [] };
}

export function coverageDenominator(coverage) {
  const value = populations(coverage).evaluated;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function completeLocalCoverage(pages, baseUrl = 'https://example.test') {
  const origin = new URL(baseUrl).origin;
  const resources = pages.map((page, index) => ({
    resource_id: `LOCAL-${index + 1}`,
    normalized_url: page.url || `${origin}/page-${index + 1}`,
    original_urls: [page.url || `${origin}/page-${index + 1}`],
    state: 'evaluated',
    evaluation: {},
  }));
  const n = resources.length;
  return {
    schema_version: 1,
    normalization_version: 'url-identity-v1',
    requested_scope: { start_url: `${origin}/`, origin, max_pages: 500, time_budget_seconds: 1800 },
    discovery: { status: 'complete', methods: ['built_output'], limitations: [] },
    populations: { discovered: n, eligible: n, excluded: 0, attempted: n, retrieved: n, valid_resource: n, evaluated: n, valid_but_unevaluated: 0, failed: 0, indeterminate: 0, unvisited: 0 },
    resources,
    stop_reason: 'frontier_exhausted',
    coverage_status: 'complete',
    reconciliation: { valid: true, errors: [] },
    limitations: [],
  };
}

export function downstreamStatus(coverage) {
  if (!coverage) return 'indeterminate';
  const contract = contractStatus(coverage);
  const denominator = coverageDenominator(coverage);
  const p = populations(coverage);
  const completePopulation = p.failed === 0 && p.indeterminate === 0 && p.unvisited === 0 && p.valid_but_unevaluated === 0;
  if (coverage.coverage_status === 'complete' && denominator > 0 && completePopulation && contract.valid && coverage.reconciliation?.valid === true) return 'supported';
  if (coverage.coverage_status === 'truncated' && denominator > 0
    && contract.valid && coverage.reconciliation?.valid === true) return 'qualified';
  return 'indeterminate';
}

export function coverageLimitations(coverage) {
  if (!coverage) return ['coverage artifact unavailable; scope is not established'];
  const p = populations(coverage);
  const limitations = Array.isArray(coverage.limitations) ? [...coverage.limitations] : [];
  const contract = contractStatus(coverage);
  if (!contract.valid) limitations.push('coverage artifact does not satisfy the coverage contract');
  if (coverage.coverage_status !== 'complete') {
    limitations.push(`coverage is ${coverage.coverage_status || 'unknown'}; conclusions are limited to evaluated resources`);
  }
  for (const key of ['failed', 'indeterminate', 'unvisited', 'valid_but_unevaluated']) {
    if (Number.isInteger(p[key]) && p[key] > 0) limitations.push(`${p[key]} ${key} resource(s) omitted from determinations`);
  }
  return [...new Set(limitations)];
}

export function downstreamEnvelope(coverage, extra = {}) {
  const p = populations(coverage);
  const denominator = coverageDenominator(coverage);
  const status = downstreamStatus(coverage);
  if (!DETERMINATION_STATUSES.has(status)) throw new Error(`invalid downstream determination status: ${status}`);
  return {
    coverage_status: coverage?.coverage_status || 'indeterminate',
    determination_status: status,
    evidence_scope: {
      requirement: 'evaluated_subset',
      satisfaction: status,
      coverage_ref: coverage ? 'coverage.json' : null,
      resource_ids: Array.isArray(coverage?.resources)
        ? coverage.resources.map((resource) => resource.resource_id).filter(Boolean)
        : [],
      population: denominator > 0 ? 'evaluated_subset' : 'none_observed',
      evaluated: denominator,
      eligible: Number.isInteger(p.eligible) ? p.eligible : null,
      excluded: Number.isInteger(p.excluded) ? p.excluded : null,
      failed: Number.isInteger(p.failed) ? p.failed : null,
      indeterminate: Number.isInteger(p.indeterminate) ? p.indeterminate : null,
      unvisited: Number.isInteger(p.unvisited) ? p.unvisited : null,
      denominator,
    },
    limitations: coverageLimitations(coverage),
    ...extra,
  };
}

/** Return null for empty evidence; never divide by a convenient zero. */
export function scoreFromCoverage(numerator, coverage, { scale = 100 } = {}) {
  const denominator = coverageDenominator(coverage);
  if (!Number.isFinite(numerator) || denominator === 0) return null;
  return Math.round((numerator / denominator) * scale);
}
