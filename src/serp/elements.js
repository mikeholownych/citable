import { sha256 } from "../shared/io.js";

export const KNOWN_FEATURE_TYPES = new Set([
  "ORGANIC",
  "AI_OVERVIEW",
  "AI_MODE_RESPONSE",
  "FEATURED_SNIPPET",
  "PEOPLE_ALSO_ASK",
  "LOCAL_PACK",
  "KNOWLEDGE_PANEL",
  "VIDEO",
  "IMAGE",
  "NEWS",
  "SHOPPING",
  "SITELINKS",
  "DIRECT_ANSWER",
  "UNKNOWN_FEATURE",
]);

/**
 * Maps raw provider type string to normalized feature_type enum.
 * B-052 Invariant: Unrecognized features record UNKNOWN_FEATURE and never map to ORGANIC.
 */
export function classifyFeatureType(rawType) {
  if (!rawType || typeof rawType !== "string") {
    return "UNKNOWN_FEATURE";
  }

  const normalized = rawType.trim().toUpperCase().replace(/[-\s]+/g, "_");

  if (KNOWN_FEATURE_TYPES.has(normalized)) {
    return normalized;
  }

  // Common provider aliases
  const aliasMap = {
    ORGANIC_RESULT: "ORGANIC",
    NATURAL: "ORGANIC",
    REGULAR: "ORGANIC",
    AI_ANSWER: "AI_OVERVIEW",
    GENERATIVE_AI: "AI_OVERVIEW",
    AI_SUMMARY: "AI_OVERVIEW",
    SNIPPET: "FEATURED_SNIPPET",
    PAA: "PEOPLE_ALSO_ASK",
    QUESTIONS_AND_ANSWERS: "PEOPLE_ALSO_ASK",
    LOCAL: "LOCAL_PACK",
    MAP: "LOCAL_PACK",
    PLACES: "LOCAL_PACK",
    KG: "KNOWLEDGE_PANEL",
    KNOWLEDGE_GRAPH: "KNOWLEDGE_PANEL",
    VIDEOS: "VIDEO",
    IMAGES: "IMAGE",
    TOP_STORIES: "NEWS",
    PRODUCTS: "SHOPPING",
    PRODUCT_PACK: "SHOPPING",
    SITELINK: "SITELINKS",
    ANSWER_BOX: "DIRECT_ANSWER",
  };

  if (aliasMap[normalized]) {
    return aliasMap[normalized];
  }

  // Fallback: MUST NOT map to ORGANIC!
  return "UNKNOWN_FEATURE";
}

/**
 * Extracts normalized domain from a URL.
 */
export function extractDomainFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Normalizes a list of raw elements into canonical SerpElements (B-052).
 * Tracks rank_absolute (page-wide 1-based order) and rank_group (within-feature rank).
 */
export function normalizeSerpElements(rawItems = [], context = {}) {
  const groupCounters = new Map();
  const normalizedElements = [];

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i] || {};
    const featureType = classifyFeatureType(raw.type || raw.feature_type || raw.item_type);

    const rankAbsolute = typeof raw.rank_absolute === "number" ? raw.rank_absolute : i + 1;

    const currentGroupCount = (groupCounters.get(featureType) || 0) + 1;
    groupCounters.set(featureType, currentGroupCount);
    const rankGroup = typeof raw.rank_group === "number" ? raw.rank_group : currentGroupCount;

    const url = raw.url || raw.link || null;
    const domain = raw.domain || (url ? extractDomainFromUrl(url) : null);
    const title = raw.title || raw.heading || null;
    const snippet = raw.snippet || raw.description || null;
    const displayUrl = raw.display_url || raw.displayed_link || null;

    let pixelMetrics = null;
    if (raw.pixel_metrics && typeof raw.pixel_metrics.top === "number") {
      pixelMetrics = {
        top: raw.pixel_metrics.top,
        left: raw.pixel_metrics.left ?? 0,
        width: raw.pixel_metrics.width ?? 0,
        height: raw.pixel_metrics.height ?? 0,
        is_above_fold: Boolean(raw.pixel_metrics.is_above_fold ?? (raw.pixel_metrics.top < 800)),
      };
    }

    // Preserve raw evidence, strictly required for UNKNOWN_FEATURE
    const rawEvidence = featureType === "UNKNOWN_FEATURE"
      ? (typeof raw.raw_evidence !== "undefined" ? raw.raw_evidence : raw)
      : (raw.raw_evidence || null);

    const idSeed = `${context.query_id || "serp"}|${rankAbsolute}|${featureType}|${url || title || i}`;
    const elementId = raw.element_id || `el_${sha256(idSeed).slice(0, 16)}`;

    normalizedElements.push({
      element_id: elementId,
      feature_type: featureType,
      rank_absolute: rankAbsolute,
      rank_group: rankGroup,
      url,
      domain,
      title,
      snippet,
      display_url: displayUrl,
      pixel_metrics: pixelMetrics,
      raw_evidence: rawEvidence,
    });
  }

  return normalizedElements;
}
