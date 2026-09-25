import { areSerpContextsComparable } from "./envelope.js";
import { classifyDomainAiRelationship } from "./aiOverview.js";
import { sha256 } from "../shared/io.js";

/**
 * Detects SERP changes between two observations with strict comparability
 * and collection validity guards (B-054).
 *
 * Invariants:
 * 1. A failed collection NEVER reads as a ranking loss or exit.
 * 2. Incomparable observations (e.g. mobile vs desktop, city vs country)
 *    refuse change detection rather than emitting misleading deltas.
 */
export function detectSerpChanges(baselineObs, currentObs, options = {}) {
  const nowIso = new Date().toISOString();
  const targetScope = options.target_scope || {
    scope_type: options.domain ? "domain" : (options.url ? "url" : "serp_wide"),
    identifier: options.domain || options.url || "*",
  };

  const baselineId = baselineObs?.observation_id || "unknown_baseline";
  const currentId = currentObs?.observation_id || "unknown_current";
  const reportSeed = `chg|${baselineId}|${currentId}|${targetScope.scope_type}:${targetScope.identifier}`;
  const reportId = `serp_chg_${sha256(reportSeed).slice(0, 16)}`;

  // 1. Comparability Guard
  const compCheck = areSerpContextsComparable(baselineObs?.context, currentObs?.context);

  const compDetails = {
    query_matched: baselineObs?.context?.query_normalized === currentObs?.context?.query_normalized,
    engine_matched: baselineObs?.context?.engine === currentObs?.context?.engine,
    surface_matched: baselineObs?.context?.search_surface === currentObs?.context?.search_surface,
    location_matched: Boolean(
      baselineObs?.context?.location?.country === currentObs?.context?.location?.country &&
      baselineObs?.context?.location?.city === currentObs?.context?.location?.city
    ),
    language_matched: baselineObs?.context?.language === currentObs?.context?.language,
    device_matched: baselineObs?.context?.device === currentObs?.context?.device,
    mismatch_reasons: compCheck.reasons || [],
  };

  if (!compCheck.comparable) {
    return {
      schema_version: 1,
      report_id: reportId,
      baseline_observation_id: baselineId,
      current_observation_id: currentId,
      comparability_verified: false,
      comparability_details: compDetails,
      status: "REFUSED_INCOMPARABLE",
      refusal_reason: `Observations are not comparable: ${compCheck.reason}`,
      target_scope: targetScope,
      changes: [],
      generated_at: nowIso,
    };
  }

  // 2. Collection Failure Guard
  // A failed collection NEVER reads as a ranking loss or exit.
  if (currentObs?.collection_status !== "SUCCESS" || baselineObs?.collection_status !== "SUCCESS") {
    const failedObs = currentObs?.collection_status !== "SUCCESS" ? "Current" : "Baseline";
    const status = currentObs?.collection_status !== "SUCCESS" ? currentObs.collection_status : baselineObs.collection_status;
    return {
      schema_version: 1,
      report_id: reportId,
      baseline_observation_id: baselineId,
      current_observation_id: currentId,
      comparability_verified: true,
      comparability_details: compDetails,
      status: "REFUSED_COLLECTION_FAILED",
      refusal_reason: `${failedObs} collection status was ${status}; a failed or non-success collection never reads as a ranking loss`,
      target_scope: targetScope,
      changes: [],
      generated_at: nowIso,
    };
  }

  // 3. Perform Change Derivation
  const changes = [];
  const baselineElements = baselineObs.elements || [];
  const currentElements = currentObs.elements || [];

  // Filter elements by target scope if specified
  const matchesScope = (elem) => {
    if (targetScope.scope_type === "serp_wide") return true;
    if (targetScope.scope_type === "domain") {
      const targetDom = targetScope.identifier.toLowerCase().replace(/^www\./, "");
      const elemDom = (elem.domain || "").toLowerCase().replace(/^www\./, "");
      return elemDom === targetDom || elemDom.endsWith(`.${targetDom}`);
    }
    if (targetScope.scope_type === "url") {
      return elem.url === targetScope.identifier;
    }
    return true;
  };

  const filteredBaseline = baselineElements.filter(matchesScope);
  const filteredCurrent = currentElements.filter(matchesScope);

  // Map elements by identity key (url or feature_type + title)
  const elementKey = (e) => e.url || `${e.feature_type}|${e.title || ""}`;

  const baselineMap = new Map();
  for (const b of filteredBaseline) {
    baselineMap.set(elementKey(b), b);
  }

  const currentMap = new Map();
  for (const c of filteredCurrent) {
    currentMap.set(elementKey(c), c);
  }

  // Check current elements against baseline (ENTRY, RANK_GAIN, RANK_LOSS, VISIBILITY_CHANGE)
  for (const [key, curr] of currentMap.entries()) {
    const base = baselineMap.get(key);
    if (!base) {
      // Newly entered
      changes.push({
        event_type: "ENTRY",
        feature_type: curr.feature_type,
        url: curr.url,
        domain: curr.domain,
        baseline_rank: null,
        current_rank: curr.rank_absolute,
        rank_delta: null,
        summary: `${curr.domain || curr.url || curr.feature_type} entered results at position ${curr.rank_absolute}`,
      });
    } else {
      // Existed before -> compare ranks
      const delta = base.rank_absolute - curr.rank_absolute; // positive = gain, negative = loss
      if (delta > 0) {
        changes.push({
          event_type: "RANK_GAIN",
          feature_type: curr.feature_type,
          url: curr.url,
          domain: curr.domain,
          baseline_rank: base.rank_absolute,
          current_rank: curr.rank_absolute,
          rank_delta: delta,
          summary: `${curr.domain || curr.url} gained ${delta} positions (${base.rank_absolute} -> ${curr.rank_absolute})`,
        });
      } else if (delta < 0) {
        changes.push({
          event_type: "RANK_LOSS",
          feature_type: curr.feature_type,
          url: curr.url,
          domain: curr.domain,
          baseline_rank: base.rank_absolute,
          current_rank: curr.rank_absolute,
          rank_delta: delta,
          summary: `${curr.domain || curr.url} lost ${Math.abs(delta)} positions (${base.rank_absolute} -> ${curr.rank_absolute})`,
        });
      }

      // Check visibility fold change
      const baseFold = base.pixel_metrics?.is_above_fold;
      const currFold = curr.pixel_metrics?.is_above_fold;
      if (typeof baseFold === "boolean" && typeof currFold === "boolean" && baseFold !== currFold) {
        changes.push({
          event_type: "VISIBILITY_CHANGE",
          feature_type: curr.feature_type,
          url: curr.url,
          domain: curr.domain,
          baseline_rank: base.rank_absolute,
          current_rank: curr.rank_absolute,
          rank_delta: delta || 0,
          summary: `${curr.domain || curr.url} moved ${currFold ? "above the fold" : "below the fold"}`,
        });
      }
    }
  }

  // Check baseline elements missing in current (EXIT)
  for (const [key, base] of baselineMap.entries()) {
    if (!currentMap.has(key)) {
      changes.push({
        event_type: "EXIT",
        feature_type: base.feature_type,
        url: base.url,
        domain: base.domain,
        baseline_rank: base.rank_absolute,
        current_rank: null,
        rank_delta: null,
        summary: `${base.domain || base.url || base.feature_type} exited results (was position ${base.rank_absolute})`,
      });
    }
  }

  // 4. Feature-level changes (AI Overview presence, local pack presence)
  const baseAiPresent = Boolean(baselineObs.ai_overview?.response_present || baselineElements.some((e) => e.feature_type === "AI_OVERVIEW"));
  const currAiPresent = Boolean(currentObs.ai_overview?.response_present || currentElements.some((e) => e.feature_type === "AI_OVERVIEW"));

  if (!baseAiPresent && currAiPresent) {
    changes.push({
      event_type: "FEATURE_APPEARED",
      feature_type: "AI_OVERVIEW",
      url: null,
      domain: null,
      baseline_rank: null,
      current_rank: 1,
      rank_delta: null,
      summary: "AI Overview feature appeared on the search surface",
    });
  } else if (baseAiPresent && !currAiPresent) {
    changes.push({
      event_type: "FEATURE_DISAPPEARED",
      feature_type: "AI_OVERVIEW",
      url: null,
      domain: null,
      baseline_rank: 1,
      current_rank: null,
      rank_delta: null,
      summary: "AI Overview feature disappeared from the search surface",
    });
  }

  // 5. AI Citation Gain/Loss for target domain
  if (targetScope.scope_type === "domain" && (baseAiPresent || currAiPresent)) {
    const baseRel = classifyDomainAiRelationship(baselineObs.ai_overview, targetScope.identifier);
    const currRel = classifyDomainAiRelationship(currentObs.ai_overview, targetScope.identifier);

    if (!baseRel.is_cited && currRel.is_cited) {
      changes.push({
        event_type: "CITATION_GAIN",
        feature_type: "AI_OVERVIEW",
        url: null,
        domain: targetScope.identifier,
        baseline_rank: null,
        current_rank: currRel.citation_position,
        rank_delta: null,
        summary: `${targetScope.identifier} gained citation in AI Overview at position ${currRel.citation_position}`,
      });
    } else if (baseRel.is_cited && !currRel.is_cited) {
      changes.push({
        event_type: "CITATION_LOSS",
        feature_type: "AI_OVERVIEW",
        url: null,
        domain: targetScope.identifier,
        baseline_rank: baseRel.citation_position,
        current_rank: null,
        rank_delta: null,
        summary: `${targetScope.identifier} lost citation in AI Overview (was citation #${baseRel.citation_position})`,
      });
    }
  }

  return {
    schema_version: 1,
    report_id: reportId,
    baseline_observation_id: baselineId,
    current_observation_id: currentId,
    comparability_verified: true,
    comparability_details: compDetails,
    status: "SUCCESS",
    refusal_reason: null,
    target_scope: targetScope,
    changes,
    generated_at: nowIso,
  };
}
