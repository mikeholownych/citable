import { sha256, nowIso } from "../shared/io.js";
import { canonicalEvidenceJson } from "../evidence/hashes.js";
import { validateAgainst } from "../shared/schemaValidator.js";
import { createArtifactProvenance, TRANSPORT_MECHANISMS, ACQUISITION_AUTHORITIES } from "../evidence/artifactProvenance.js";

const BACKLINK_OBS_SCHEMA = "backlink-observation.schema.json";
const BACKLINK_CMP_SCHEMA = "backlink-comparison.schema.json";

function normalizeUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Passive backlink and referring-domain observation (ER-10).
 *
 * Invariants:
 * 1. source URL/domain, target URL, observed link, anchor/rel when observable,
 *    first/last observed, source, timestamp, and retrieval state are preserved.
 * 2. Acquisition, exchange, outreach, purchase, and link-quality conclusions
 *    remain strictly outside Citable.
 */
export function createPassiveBacklinkObservation(input = {}) {
  // Guard against prohibited conclusions (outreach, acquisition, quality rating)
  if (input.acquisition_effort || input.outreach_state || input.purchased_link || input.link_quality_rating) {
    throw new Error(
      "NON_GOAL_VIOLATION: Link acquisition, exchange, outreach, purchase, and link-quality conclusions remain outside Citable"
    );
  }

  const rawSourceUrl = input.source?.raw_url || input.source_url || null;
  const normalizedSourceUrl = normalizeUrl(rawSourceUrl);
  const sourceDomain = input.source?.domain || (normalizedSourceUrl ? extractDomain(normalizedSourceUrl) : null);
  const referringDomain = input.source?.referring_domain || sourceDomain;

  const rawTargetUrl = input.target?.raw_url || input.target_url || null;
  const normalizedTargetUrl = normalizeUrl(rawTargetUrl);
  const targetIdentity = input.target?.identity || normalizedTargetUrl || "target_unspecified";

  const observedAt = input.observed_at || nowIso();
  const observationStatus = input.observation_status || (normalizedSourceUrl && normalizedTargetUrl ? "OBSERVED" : "UNKNOWN");

  // Normalized link details
  let link = null;
  if (input.link) {
    const rawHref = input.link.raw_href || null;
    const anchorText = input.link.anchor_text != null ? String(input.link.anchor_text).trim() : null;
    const rel = input.link.rel || null;
    const relTokens = Array.isArray(input.link.rel_tokens)
      ? [...new Set(input.link.rel_tokens)]
      : rel ? [...new Set(rel.toLowerCase().split(/\s+/).filter(Boolean))] : [];
    
    link = {
      raw_href: rawHref,
      anchor_text: anchorText,
      rel: rel,
      rel_tokens: relTokens,
      nofollow: input.link.nofollow ?? (relTokens.includes("nofollow") ? true : false),
      sponsored: input.link.sponsored ?? (relTokens.includes("sponsored") ? true : false),
      ugc: input.link.ugc ?? (relTokens.includes("ugc") ? true : false),
      surrounding_text: input.link.surrounding_text || null,
      locator: input.link.locator || null,
    };
  }

  // Retrieval state
  const retrieval = {
    status: input.retrieval?.status || "SUCCEEDED",
    method: input.retrieval?.method || "passive_crawl",
    http_status: input.retrieval?.http_status ?? 200,
    artifact_id: input.retrieval?.artifact_id || null,
    artifact_hash: input.retrieval?.artifact_hash || null,
    extraction_version: input.retrieval?.extraction_version || "1.0.0",
    retrieval_version: input.retrieval?.retrieval_version || "1.0.0",
  };

  // Logical link ID: independent of observation time
  const logicalLinkPayload = `${normalizedSourceUrl}|${normalizedTargetUrl}|${link?.anchor_text || ""}|${link?.raw_href || ""}`;
  const logicalLinkId = `BL-LINK-${sha256(logicalLinkPayload).slice(0, 24)}`;

  // Observation ID: binds logical link, observed time, and retrieval state
  const obsPayload = `${logicalLinkId}|${observedAt}|${retrieval.status}|${input.provider?.record_id || ""}`;
  const observationId = `BL-OBS-${sha256(obsPayload).slice(0, 24)}`;

  // Provenance
  const acquisitionProvenance = input.acquisition_provenance || createArtifactProvenance({
    content: `${normalizedSourceUrl}->${normalizedTargetUrl}`,
    explicitAuthority: ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL,
    transport: {
      mechanism: TRANSPORT_MECHANISMS.PROVIDER_API,
      source_location: normalizedSourceUrl,
      received_at: observedAt,
    },
    declared: {
      declarer: input.provider?.identity || "external_crawler",
      source_url: normalizedSourceUrl,
      retrieved_at: observedAt,
    },
    lineage: {
      source_identity: sourceDomain || "unknown_source",
    },
    limitations: [
      "Passive backlink observation only; does not infer indexing, ranking, authority, or acquisition intent",
    ],
  });

  const record = {
    schema_version: 1,
    observation_id: observationId,
    logical_link_id: logicalLinkId,
    observation_status: observationStatus,
    acquisition_provenance: acquisitionProvenance,
    observed_at: observedAt,
    first_observed_at: input.first_observed_at || observedAt,
    last_observed_at: input.last_observed_at || observedAt,
    source: {
      raw_url: rawSourceUrl,
      normalized_url: normalizedSourceUrl,
      effective_url: input.source?.effective_url || normalizedSourceUrl,
      canonical_url: input.source?.canonical_url || null,
      redirect_chain: input.source?.redirect_chain || [],
      domain: sourceDomain,
      referring_domain: referringDomain,
    },
    target: {
      raw_url: rawTargetUrl,
      resolved_url: input.target?.resolved_url || normalizedTargetUrl,
      normalized_url: normalizedTargetUrl,
      identity: targetIdentity,
      redirect_chain: input.target?.redirect_chain || [],
    },
    link: link,
    provider: input.provider ? {
      identity: input.provider.identity || "provider_unspecified",
      record_id: input.provider.record_id || null,
      reported_at: input.provider.reported_at || observedAt,
      is_exhaustive_census: Boolean(input.provider.is_exhaustive_census),
      fields: input.provider.fields || {},
    } : null,
    retrieval: retrieval,
    coverage: input.coverage || {
      status: "COMPLETE",
      bounded_scope: true,
      unscanned_reason: null,
    },
    lineage: {
      source_identity: sourceDomain || "unknown_source",
      evidence_identity: observationId,
      predecessor_observation_ids: input.lineage?.predecessor_observation_ids || [],
      supersedes_observation_id: input.lineage?.supersedes_observation_id || null,
    },
    determination: input.determination || {
      state: "CURRENT",
      version: "1.0.0",
      reason: "Observed link in retrieved content",
    },
    limitations: [
      "Observation does not establish universal truth or business value.",
      "Acquisition, outreach, and link-quality judgments are strictly excluded.",
      ...(input.limitations || []),
    ],
  };

  const validation = validateAgainst(BACKLINK_OBS_SCHEMA, record);
  if (!validation.valid) {
    throw new Error(`Backlink observation contract violated: ${validation.errors.join("; ")}`);
  }

  return record;
}

/**
 * Compares two passive backlink observations across time (ER-10, ER-11).
 */
export function compareBacklinkObservations(left, right) {
  if (!left || !right) {
    throw new Error("Both left and right observations are required for comparison");
  }

  const leftRef = left.observation_id || "left_unspecified";
  const rightRef = right.observation_id || "right_unspecified";

  const sourceMatch = left.source?.normalized_url === right.source?.normalized_url;
  const targetMatch = left.target?.normalized_url === right.target?.normalized_url;

  const leftAnchor = left.link?.anchor_text ?? null;
  const rightAnchor = right.link?.anchor_text ?? null;
  const anchorMatch = leftAnchor === rightAnchor;

  const leftRels = (left.link?.rel_tokens || []).slice().sort().join(",");
  const rightRels = (right.link?.rel_tokens || []).slice().sort().join(",");
  const relMatch = leftRels === rightRels;

  const linkMatch = {
    source_match: Boolean(sourceMatch),
    target_match: Boolean(targetMatch),
    anchor_match: anchorMatch,
    rel_match: relMatch,
  };

  // Determine transition
  let transition = "INDETERMINATE";
  if (left.observation_status === "OBSERVED" && right.observation_status === "OBSERVED") {
    transition = (anchorMatch && relMatch) ? "UNCHANGED" : "CHANGED";
  } else if (left.observation_status === "OBSERVED" && right.observation_status === "NOT_OBSERVED") {
    transition = "NO_LONGER_OBSERVED";
  } else if (left.observation_status === "NOT_OBSERVED" && right.observation_status === "OBSERVED") {
    transition = "NEWLY_OBSERVED";
  }

  // Determine comparability status
  let status = "COMPARABLE";
  if (!sourceMatch || !targetMatch) {
    status = "NOT_COMPARABLE";
  } else if (left.retrieval?.status !== "SUCCEEDED" || right.retrieval?.status !== "SUCCEEDED") {
    status = "INDETERMINATE";
  } else if (left.coverage?.status !== "COMPLETE" || right.coverage?.status !== "COMPLETE") {
    status = "PARTIALLY_COMPARABLE";
  }

  const dimensions = {
    source_url: sourceMatch ? "match" : "mismatch",
    target_url: targetMatch ? "match" : "mismatch",
    anchor_text: anchorMatch ? "match" : "mismatch",
    rel_tokens: relMatch ? "match" : "mismatch",
    retrieval_status: left.retrieval?.status === right.retrieval?.status ? "match" : "mismatch",
  };

  const seed = `${leftRef}|${rightRef}|${status}|${transition}`;
  const comparisonId = `CMP-${sha256(seed).slice(0, 16)}`;

  const comparison = {
    schema_version: 1,
    comparison_id: comparisonId,
    left_reference: leftRef,
    right_reference: rightRef,
    status,
    transition,
    link_match: linkMatch,
    dimensions,
    limitations: [
      "Temporal comparison is not causal proof of indexing, ranking, or referral effect.",
      status === "COMPARABLE" ? null : "Non-comparable dimensions cannot be generalized.",
    ].filter(Boolean),
  };

  const validation = validateAgainst(BACKLINK_CMP_SCHEMA, comparison);
  if (!validation.valid) {
    throw new Error(`Backlink comparison contract violated: ${validation.errors.join("; ")}`);
  }

  return comparison;
}

/**
 * Returns all backlink observations for a given target URL.
 */
export function backlinksForTarget(observations = [], targetUrl) {
  const normalizedTarget = normalizeUrl(targetUrl);
  return (observations || []).filter((obs) => {
    return obs.target?.normalized_url === normalizedTarget;
  });
}

/**
 * Returns distinct referring domains for a target URL.
 */
export function referringDomainsForTarget(observations = [], targetUrl) {
  const forTarget = backlinksForTarget(observations, targetUrl);
  const domains = new Set();
  for (const obs of forTarget) {
    if (obs.source?.referring_domain) {
      domains.add(obs.source.referring_domain);
    } else if (obs.source?.domain) {
      domains.add(obs.source.domain);
    }
  }
  return [...domains].sort();
}
