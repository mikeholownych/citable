/**
 * Epistemic Status & Provenance Envelope
 *
 * Core Operating Doctrine:
 *   OBSERVED stays OBSERVED
 *   DERIVED stays DERIVED
 *   MODELED stays MODELED
 *   HUMAN_REVIEWED stays HUMAN_REVIEWED
 *   NOT_OBSERVED stays NOT_OBSERVED
 *   NOT_APPLICABLE stays NOT_APPLICABLE
 *   UNRESOLVED stays UNRESOLVED
 *   SYNTHETIC stays SAMPLE-ONLY
 */

export const EPISTEMIC_STATUS = Object.freeze({
  OBSERVED: 'OBSERVED',
  DERIVED: 'DERIVED',
  MODELED: 'MODELED',
  HUMAN_REVIEWED: 'HUMAN_REVIEWED',
  NOT_OBSERVED: 'NOT_OBSERVED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNRESOLVED: 'UNRESOLVED',
  SYNTHETIC_SAMPLE: 'SYNTHETIC_SAMPLE',
});

export const DECISION_CATEGORY = Object.freeze({
  CONFIRMED_OBSERVATION: 'CONFIRMED_OBSERVATION',
  DERIVED_FINDING: 'DERIVED_FINDING',
  MODELED_HYPOTHESIS: 'MODELED_HYPOTHESIS',
  CONTROLLED_CAUSAL_EVIDENCE: 'CONTROLLED_CAUSAL_EVIDENCE',
  UNRESOLVED: 'UNRESOLVED',
  REQUIRES_HUMAN_REVIEW: 'REQUIRES_HUMAN_REVIEW',
  REQUIRES_EXTERNAL_DATA: 'REQUIRES_EXTERNAL_DATA',
});

export function wrapValue(value, status, options = {}) {
  if (!Object.values(EPISTEMIC_STATUS).includes(status)) {
    throw new Error(`Invalid epistemic status: ${status}`);
  }
  return {
    value,
    status,
    evidence_refs: options.evidence_refs ? [].concat(options.evidence_refs) : [],
    method: options.method || null,
    confidence: options.confidence || null,
    derivation_id: options.derivation_id || null,
    model_id: options.model_id || null,
    required_input: options.required_input || null,
    note: options.note || null,
  };
}

export function observed(value, evidenceRefs = [], method = null, confidence = 'empirical_observation') {
  return wrapValue(value, EPISTEMIC_STATUS.OBSERVED, {
    evidence_refs: evidenceRefs,
    method,
    confidence,
  });
}

export function derived(value, evidenceRefs = [], method = null, derivationId = null) {
  return wrapValue(value, EPISTEMIC_STATUS.DERIVED, {
    evidence_refs: evidenceRefs,
    method,
    derivation_id: derivationId,
    confidence: 'reproducible_derivation',
  });
}

export function modeled(value, method, modelId = null, confidence = 'modeled_heuristic') {
  return wrapValue(value, EPISTEMIC_STATUS.MODELED, {
    method,
    model_id: modelId,
    confidence,
  });
}

export function humanReviewed(value, reviewerId, reviewTimestamp, note = null) {
  return wrapValue(value, EPISTEMIC_STATUS.HUMAN_REVIEWED, {
    method: `human_review:${reviewerId}`,
    note,
    confidence: 'attested_human_review',
  });
}

export function notObserved(requiredInput, note = null) {
  return wrapValue(null, EPISTEMIC_STATUS.NOT_OBSERVED, {
    required_input: requiredInput,
    note: note || `Metric unavailable: required input "${requiredInput}" was not provided or not observed.`,
  });
}

export function notApplicable(reason) {
  return wrapValue(null, EPISTEMIC_STATUS.NOT_APPLICABLE, {
    note: reason,
  });
}

export function unresolved(reason, requiredInput = null) {
  return wrapValue(null, EPISTEMIC_STATUS.UNRESOLVED, {
    required_input: requiredInput,
    note: reason,
  });
}

export function syntheticSample(value, rationale = 'Non-contractual synthetic demonstration sample') {
  return wrapValue(value, EPISTEMIC_STATUS.SYNTHETIC_SAMPLE, {
    note: rationale,
    confidence: 'synthetic_sample_only',
  });
}
