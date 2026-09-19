/**
 * Coverage requirements for determinations.
 *
 * A requirement describes the population a conclusion is allowed to speak
 * about. It is deliberately separate from the crawler's execution status:
 * observing one page can support a page-local positive finding even when a
 * corpus-wide absence claim is not supportable.
 */
export const REQUIREMENTS = Object.freeze({
  PAGE_RESOURCE: 'page_resource',
  EVALUATED_SUBSET: 'evaluated_subset',
  DECLARED_SAMPLE: 'declared_sample',
  EXHAUSTIVE_SCOPE: 'exhaustive_requested_scope',
  RENDERED_RESOURCE: 'rendered_resource',
  PROVIDER_BOUNDED: 'provider_bounded',
});

const VALID_REQUIREMENTS = new Set(Object.values(REQUIREMENTS));

export function isCoverageRequirement(value) {
  return VALID_REQUIREMENTS.has(value);
}

function population(coverage) {
  return coverage?.populations && typeof coverage.populations === 'object'
    ? coverage.populations
    : {};
}

function normalizedUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value.split('#', 1)[0];
  }
}

function resourcesFor(coverage) {
  return Array.isArray(coverage?.resources) ? coverage.resources : [];
}

function resourceForSubject(coverage, subject) {
  const candidates = [subject?.url, subject?.identifier].map(normalizedUrl).filter(Boolean);
  return resourcesFor(coverage).find((resource) => {
    const resourceUrl = normalizedUrl(resource?.url || resource?.normalized_url);
    return resourceUrl && candidates.includes(resourceUrl);
  }) || null;
}

function completeCoverage(coverage) {
  const p = population(coverage);
  return coverage?.coverage_status === 'complete'
    && p.unvisited === 0
    && p.failed === 0
    && p.indeterminate === 0
    && p.valid_but_unevaluated === 0
    && p.evaluated > 0;
}

function result(status, extra = {}) {
  return { status, ...extra };
}

function evaluatePageResource(coverage, subject, rendered = false) {
  const resource = resourceForSubject(coverage, subject);
  if (!resource) return result('indeterminate', { reason: 'resource_not_observed' });
  const state = resource.state || (resource.evaluation ? 'evaluated' : resource.classification?.state);
  if (state !== 'evaluated') {
    return result('indeterminate', { reason: 'resource_not_evaluated', resource_id: resource.resource_id });
  }
  if (rendered && resource.rendered !== true && resource.rendering_status !== 'complete') {
    return result('indeterminate', { reason: 'rendered_observation_unavailable', resource_id: resource.resource_id });
  }
  return result('supported', {
    resource_id: resource.resource_id,
    population: 'evaluated_resource',
  });
}

/**
 * Evaluate whether a coverage envelope satisfies one determination contract.
 * The returned status is intentionally limited to supported, qualified,
 * indeterminate, and not_applicable, matching the finding/run contracts.
 */
export function evaluateRequirement(requirement, coverage, subject = null) {
  if (!VALID_REQUIREMENTS.has(requirement)) throw new TypeError(`unknown coverage requirement: ${requirement}`);

  if (requirement === REQUIREMENTS.PAGE_RESOURCE) return evaluatePageResource(coverage, subject);
  if (requirement === REQUIREMENTS.RENDERED_RESOURCE) return evaluatePageResource(coverage, subject, true);

  if (requirement === REQUIREMENTS.DECLARED_SAMPLE) {
    const sample = coverage?.sample;
    const numerator = sample?.numerator;
    const denominator = sample?.denominator;
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator < 1 || numerator < 0 || numerator > denominator) {
      return result('indeterminate', { reason: 'sample_denominator_unavailable' });
    }
    return { status: 'qualified', population: 'evaluated_subset', numerator, denominator };
  }

  if (requirement === REQUIREMENTS.PROVIDER_BOUNDED) {
    const p = population(coverage);
    if (!Number.isInteger(p.evaluated) || p.evaluated < 1) return result('indeterminate', { reason: 'no_evaluated_resources' });
    return result('qualified', { population: 'provider_bounded', denominator: p.evaluated });
  }

  if (requirement === REQUIREMENTS.EVALUATED_SUBSET) {
    // A subject-bearing determination cannot borrow aggregate subset counts:
    // the named page/URL must itself be an evaluator-completed resource.
    if (subject?.type === 'page' || subject?.type === 'url') {
      return evaluatePageResource(coverage, subject);
    }
    const p = population(coverage);
    if (!Number.isInteger(p.evaluated) || p.evaluated < 1) return result('indeterminate', { reason: 'no_evaluated_resources' });
    return result(coverage?.coverage_status === 'complete' ? 'supported' : 'qualified', {
      population: 'evaluated_subset', denominator: p.evaluated,
    });
  }

  // Exhaustive scope is the only requirement that may support a corpus-wide
  // absence claim. A completed execution with zero resources is not evidence
  // of absence, so require at least one evaluated resource.
  if (completeCoverage(coverage)) {
    return result('supported', { population: 'requested_scope', denominator: population(coverage).evaluated });
  }
  return result('indeterminate', { reason: 'coverage_incomplete' });
}

/**
 * Apply coverage semantics to a determination produced by a detector or
 * downstream consumer. Positive page-local observations are preserved; a
 * negative exhaustive conclusion is downgraded when its corpus is incomplete.
 */
export function propagateDetermination(determination, coverage) {
  if (!determination || typeof determination !== 'object') throw new TypeError('determination must be an object');
  const current = determination.status;
  if (!['supported', 'qualified', 'indeterminate', 'not_applicable'].includes(current)) {
    throw new TypeError(`invalid determination status: ${current}`);
  }
  if (current !== 'supported') return { ...determination };
  if (determination.polarity !== 'negative' || !determination.requirement) return { ...determination };
  const evaluated = evaluateRequirement(determination.requirement, coverage, determination.subject);
  if (evaluated.status === 'supported') return { ...determination };
  return { ...determination, status: evaluated.status, reason: evaluated.reason || 'coverage_requirement_unsatisfied' };
}

export function requirementForDetector(detector, hit = null) {
  if (!detector || !isCoverageRequirement(detector.coverage_requirement)) {
    throw new TypeError(`detector ${detector?.id ?? '?'} must declare a valid coverage_requirement`);
  }
  // The detector declaration is authoritative. Subject shape must never
  // silently weaken an exhaustive or rendered-resource contract.
  return detector.coverage_requirement;
}
