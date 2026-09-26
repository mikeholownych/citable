import { sha256 } from "./utils.js";

export const ALLOWED_OUTREACH_STRATEGIES = [
  "RESOURCE_PAGE",
  "BROKEN_LINK",
  "UNLINKED_MENTION",
  "COMPETITOR_LINK_GAP",
  "EDITORIAL_REFERENCE",
  "PARTNERSHIP",
];

/**
 * Creates an outreach opportunity object preserving immutable raw observation and derived hypothesis (B-080).
 *
 * Invariant: The derived hypothesis never overwrites the raw observation.
 */
export function createOutreachOpportunity(params = {}) {
  const {
    strategy,
    raw_observation,
    derived_hypothesis,
    qualification = null,
    asset_evaluation = null,
  } = params;

  if (!ALLOWED_OUTREACH_STRATEGIES.includes(strategy)) {
    throw new Error(
      `Invalid outreach strategy: "${strategy}". Allowed strategies: ${ALLOWED_OUTREACH_STRATEGIES.join(", ")}`
    );
  }

  if (!raw_observation || typeof raw_observation !== "object") {
    throw new Error("raw_observation is required and must be an object");
  }

  const {
    source_url,
    target_domain,
    collector,
    collector_version,
    observed_at,
    raw_evidence_snippet,
  } = raw_observation;

  if (!source_url || !target_domain || !collector || !observed_at || !raw_evidence_snippet) {
    throw new Error(
      "raw_observation must include source_url, target_domain, collector, observed_at, and raw_evidence_snippet"
    );
  }

  const rawEvidencePayload = `${source_url}|${target_domain}|${collector}|${observed_at}|${raw_evidence_snippet}`;
  const rawChecksum = raw_observation.raw_checksum || sha256(rawEvidencePayload);

  // Deep clone and freeze raw observation so it cannot be mutated or overwritten
  const immutableRawObservation = Object.freeze({
    source_url,
    target_domain,
    collector,
    ...(collector_version ? { collector_version } : {}),
    observed_at,
    raw_evidence_snippet,
    raw_checksum: rawChecksum,
  });

  if (!derived_hypothesis || typeof derived_hypothesis !== "object") {
    throw new Error("derived_hypothesis is required and must be an object");
  }

  const {
    opportunity_type,
    rationale,
    suggested_asset_type,
    derived_at = new Date().toISOString(),
  } = derived_hypothesis;

  if (!opportunity_type || !rationale || !suggested_asset_type) {
    throw new Error(
      "derived_hypothesis must include opportunity_type, rationale, and suggested_asset_type"
    );
  }

  const frozenHypothesis = Object.freeze({
    opportunity_type,
    rationale,
    suggested_asset_type,
    derived_at,
  });

  const defaultQualification = {
    domain_qualification: {
      domain: target_domain,
      status: "NEEDS_REVIEW",
      editorial_legitimacy: "MEDIUM",
      disqualification_reason: null,
    },
    page_qualification: {
      page_url: source_url,
      status: "NEEDS_REVIEW",
      outbound_link_count: 0,
      contextual_relevance: "MEDIUM",
      disqualification_reason: null,
    },
    third_party_metrics: [],
  };

  const defaultAssetEvaluation = {
    has_linkable_asset: false,
    matched_asset_id: null,
    asset_gap: true,
    gap_description: "NO_LINKABLE_ASSET: Asset evaluation pending",
  };

  const oppSeed = `${strategy}|${target_domain}|${source_url}|${rawChecksum}`;
  const opportunity_id = `opp_${sha256(oppSeed).slice(0, 16)}`;

  return {
    schema_version: 1,
    opportunity_id,
    strategy,
    raw_observation: immutableRawObservation,
    derived_hypothesis: frozenHypothesis,
    qualification: qualification || defaultQualification,
    asset_evaluation: asset_evaluation || defaultAssetEvaluation,
    created_at: new Date().toISOString(),
  };
}

/**
 * Updates the derived hypothesis of an opportunity without modifying or overwriting raw observation (B-080).
 */
export function updateOpportunityHypothesis(opportunity, newHypothesis) {
  if (!opportunity || !opportunity.raw_observation) {
    throw new Error("Invalid opportunity provided for hypothesis update");
  }

  const { opportunity_type, rationale, suggested_asset_type } = newHypothesis;
  if (!opportunity_type || !rationale || !suggested_asset_type) {
    throw new Error("newHypothesis must include opportunity_type, rationale, and suggested_asset_type");
  }

  return {
    ...opportunity,
    raw_observation: opportunity.raw_observation, // preserved unchanged
    derived_hypothesis: Object.freeze({
      opportunity_type,
      rationale,
      suggested_asset_type,
      derived_at: new Date().toISOString(),
    }),
  };
}
