import { sha256 } from "../shared/io.js";

/**
 * Calculates Spearman Rank Correlation between two sets of ranked items.
 */
function calculateSpearmanRank(ranksA, ranksB) {
  const n = ranksA.length;
  if (n < 2) return null;

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const diff = ranksA[i] - ranksB[i];
    sumD2 += diff * diff;
  }

  const denominator = n * (n * n - 1);
  if (denominator === 0) return 1;

  const rho = 1 - (6 * sumD2) / denominator;
  return Number(Math.max(-1, Math.min(1, rho)).toFixed(4));
}

/**
 * Measures empirical divergence between duplicate SERP observations from
 * independent providers for the same query context (B-056).
 */
export function measureProviderDisagreement(obsA, obsB) {
  if (!obsA || !obsB) {
    throw new Error("measureProviderDisagreement requires two observation records");
  }

  const providerA = obsA.provider?.name || "provider_a";
  const providerB = obsB.provider?.name || "provider_b";
  const queryId = obsA.context?.query_id || obsB.context?.query_id || "unknown_query";

  const elemsA = obsA.elements || [];
  const elemsB = obsB.elements || [];

  const organicA = elemsA.filter((e) => e.feature_type === "ORGANIC" && e.url);
  const organicB = elemsB.filter((e) => e.feature_type === "ORGANIC" && e.url);

  // Map URLs to rank
  const mapA = new Map();
  organicA.forEach((e) => mapA.set(e.url, e.rank_absolute));

  const mapB = new Map();
  organicB.forEach((e) => mapB.set(e.url, e.rank_absolute));

  // Find overlapping URLs
  const commonUrls = [];
  const ranksA = [];
  const ranksB = [];

  for (const [url, rA] of mapA.entries()) {
    if (mapB.has(url)) {
      commonUrls.push(url);
      ranksA.push(rA);
      ranksB.push(mapB.get(url));
    }
  }

  const spearman = calculateSpearmanRank(ranksA, ranksB);

  // Top 10 Jaccard
  const top10A = new Set(organicA.slice(0, 10).map((e) => e.url));
  const top10B = new Set(organicB.slice(0, 10).map((e) => e.url));

  const top10Union = new Set([...top10A, ...top10B]);
  let top10Inter = 0;
  for (const url of top10A) {
    if (top10B.has(url)) top10Inter += 1;
  }
  const jaccard = top10Union.size > 0 ? Number((top10Inter / top10Union.size).toFixed(4)) : 1.0;

  // Domain overlap
  const domsA = new Set(organicA.map((e) => e.domain).filter(Boolean));
  const domsB = new Set(organicB.map((e) => e.domain).filter(Boolean));
  const domUnion = new Set([...domsA, ...domsB]);
  let domInter = 0;
  for (const d of domsA) {
    if (domsB.has(d)) domInter += 1;
  }
  const domOverlap = domUnion.size > 0 ? Number((domInter / domUnion.size).toFixed(4)) : 1.0;

  // Feature Agreement
  const hasFeature = (elems, type) => elems.some((e) => e.feature_type === type);
  const featureAgreement = {
    ai_overview: Boolean(obsA.ai_overview?.response_present || hasFeature(elemsA, "AI_OVERVIEW")) ===
                 Boolean(obsB.ai_overview?.response_present || hasFeature(elemsB, "AI_OVERVIEW")),
    featured_snippet: hasFeature(elemsA, "FEATURED_SNIPPET") === hasFeature(elemsB, "FEATURED_SNIPPET"),
    people_also_ask: hasFeature(elemsA, "PEOPLE_ALSO_ASK") === hasFeature(elemsB, "PEOPLE_ALSO_ASK"),
    local_pack: hasFeature(elemsA, "LOCAL_PACK") === hasFeature(elemsB, "LOCAL_PACK"),
  };

  // Divergent Elements
  const divergentElements = [];
  for (const e of organicA) {
    if (!mapB.has(e.url)) {
      divergentElements.push({
        url: e.url,
        observed_in_provider: providerA,
        missing_in_provider: providerB,
        feature_type: e.feature_type,
        rank: e.rank_absolute,
      });
    }
  }
  for (const e of organicB) {
    if (!mapA.has(e.url)) {
      divergentElements.push({
        url: e.url,
        observed_in_provider: providerB,
        missing_in_provider: providerA,
        feature_type: e.feature_type,
        rank: e.rank_absolute,
      });
    }
  }

  // Composite divergence score: 0 = perfect identity, 1 = total disagreement
  const safeCorr = spearman !== null ? Math.max(0, spearman) : 0.5;
  const agreementComposite = 0.4 * jaccard + 0.3 * domOverlap + 0.3 * safeCorr;
  const divergenceScore = Number((1 - agreementComposite).toFixed(4));

  const nowIso = new Date().toISOString();
  const seed = `div|${obsA.observation_id}|${obsB.observation_id}|${divergenceScore}`;
  const validationId = `serp_div_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    validation_id: validationId,
    query_id: queryId,
    providers: [
      {
        provider_name: providerA,
        observation_id: obsA.observation_id,
        total_elements: elemsA.length,
        organic_count: organicA.length,
      },
      {
        provider_name: providerB,
        observation_id: obsB.observation_id,
        total_elements: elemsB.length,
        organic_count: organicB.length,
      },
    ],
    metrics: {
      spearman_rank_correlation: spearman,
      top_10_jaccard_similarity: jaccard,
      domain_overlap_ratio: domOverlap,
      divergence_score: divergenceScore,
    },
    feature_agreement: featureAgreement,
    divergent_elements: divergentElements,
    evaluated_at: nowIso,
  };
}
