import { DETERMINATION_STATUS } from "./constants.js";

export const SCORE_VERSION = "1.0";

export const DEFAULT_SEVERITY_WEIGHTS = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
});

/**
 * Computes an applicability-scoped score from condition determinations (Wave 1: B-013).
 *
 * Invariants:
 * - Exposes input_conditions, weights, formula, score_version, and applicability_denominator.
 * - NOT_APPLICABLE conditions NEVER contribute to a failure count or a denominator.
 * - When applicability_denominator is 0, score is null (no division by convenient zero).
 */
export function computeApplicabilityScore(determinations = [], {
  siteProfile = "default",
  scoreVersion = SCORE_VERSION,
  weights = DEFAULT_SEVERITY_WEIGHTS,
} = {}) {
  const counts = {
    pass: 0,
    fail: 0,
    warning: 0,
    indeterminate: 0,
    not_applicable: 0,
    not_tested: 0,
    error: 0,
  };

  const inputConditionIds = new Set();
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let applicableCount = 0;

  for (const det of determinations) {
    const status = det.status;
    if (status === DETERMINATION_STATUS.PASS) counts.pass++;
    else if (status === DETERMINATION_STATUS.FAIL) counts.fail++;
    else if (status === DETERMINATION_STATUS.WARNING) counts.warning++;
    else if (status === DETERMINATION_STATUS.INDETERMINATE) counts.indeterminate++;
    else if (status === DETERMINATION_STATUS.NOT_APPLICABLE) counts.not_applicable++;
    else if (status === DETERMINATION_STATUS.NOT_TESTED) counts.not_tested++;
    else if (status === DETERMINATION_STATUS.ERROR) counts.error++;

    // NOT_APPLICABLE, NOT_TESTED, and ERROR are excluded from the applicability denominator
    if (status === DETERMINATION_STATUS.NOT_APPLICABLE ||
        status === DETERMINATION_STATUS.NOT_TESTED ||
        status === DETERMINATION_STATUS.ERROR) {
      continue;
    }

    applicableCount++;
    inputConditionIds.add(det.condition_id || det.detector_id);

    const severity = (det.severity || "medium").toLowerCase();
    const weight = weights[severity] !== undefined ? weights[severity] : 1;
    totalWeight += weight;

    if (status === DETERMINATION_STATUS.PASS) {
      totalWeightedScore += weight * 1.0;
    } else if (status === DETERMINATION_STATUS.WARNING) {
      totalWeightedScore += weight * 0.5;
    } else {
      // FAIL or INDETERMINATE -> 0.0
      totalWeightedScore += 0;
    }
  }

  const score = totalWeight > 0
    ? Math.round((totalWeightedScore / totalWeight) * 100)
    : null;

  return {
    score,
    score_version: scoreVersion,
    formula: "sum(weight * condition_value) / sum(applicable_weights)",
    weights: { ...weights },
    input_conditions: [...inputConditionIds].sort(),
    applicability_denominator: applicableCount,
    site_profile: siteProfile,
    counts,
  };
}

/**
 * Asserts or checks comparability between two scores.
 * Enforces: "profiles with different applicable counts are never compared on a shared denominator"
 */
export function compareScoreEnvelopes(scoreA, scoreB) {
  if (!scoreA || !scoreB) {
    return { comparable: false, reason: "missing_score_envelope" };
  }

  if (scoreA.applicability_denominator !== scoreB.applicability_denominator) {
    return {
      comparable: false,
      reason: "differing_applicability_denominators",
      message: `Profiles with different applicable counts (${scoreA.applicability_denominator} vs ${scoreB.applicability_denominator}) are never compared on a shared denominator`,
      denominatorA: scoreA.applicability_denominator,
      denominatorB: scoreB.applicability_denominator,
    };
  }

  if (scoreA.site_profile !== scoreB.site_profile) {
    return {
      comparable: false,
      reason: "differing_site_profiles",
      message: `Differing profiles (${scoreA.site_profile} vs ${scoreB.site_profile}) are never compared on a shared denominator`,
    };
  }

  return {
    comparable: true,
    score_diff: (scoreB.score !== null && scoreA.score !== null) ? scoreB.score - scoreA.score : null,
    baseline_score: scoreA.score,
    comparison_score: scoreB.score,
    applicability_denominator: scoreA.applicability_denominator,
  };
}
