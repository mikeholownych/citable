import { sha256 } from "../shared/io.js";

/**
 * Normalizes query string for deterministic comparison.
 */
export function normalizeQuery(query) {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Creates a validated SERP observation context envelope (B-050).
 * Unique address by query x engine x surface x location x language x device x timestamp.
 */
export function createSerpContext(options = {}) {
  const queryText = String(options.query_text || options.query || "").trim();
  if (!queryText) {
    throw new Error("SERP context requires non-empty query_text");
  }

  const queryNormalized = normalizeQuery(queryText);
  const engine = String(options.engine || "google").toLowerCase();
  const searchSurface = String(options.search_surface || options.surface || "organic").toLowerCase();
  const device = String(options.device || "desktop").toLowerCase();
  const language = String(options.language || "en").toLowerCase();

  const validDevices = ["desktop", "mobile", "tablet"];
  if (!validDevices.includes(device)) {
    throw new Error(`invalid device "${device}"; must be one of: ${validDevices.join(", ")}`);
  }

  const rawLoc = options.location || {};
  const country = String(rawLoc.country || options.country || "US").toUpperCase();
  const region = rawLoc.region || options.region || null;
  const city = rawLoc.city || options.city || null;
  const coordinates = rawLoc.coordinates || options.coordinates || null;
  const uule = rawLoc.uule || options.uule || null;

  const location = {
    country,
    region: region ? String(region) : null,
    city: city ? String(city) : null,
    coordinates: coordinates && typeof coordinates.latitude === "number" && typeof coordinates.longitude === "number"
      ? {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radius_km: typeof coordinates.radius_km === "number" ? coordinates.radius_km : 0,
        }
      : null,
    uule: uule ? String(uule) : null,
  };

  const queryId = options.query_id || `qry_${sha256(queryNormalized).slice(0, 16)}`;

  return {
    query_id: queryId,
    query_text: queryText,
    query_normalized: queryNormalized,
    engine,
    search_surface: searchSurface,
    location,
    language,
    device,
    os: options.os ? String(options.os) : null,
    search_domain: options.search_domain ? String(options.search_domain) : null,
    personalization_mode: options.personalization_mode || null,
  };
}

/**
 * Builds deterministic addressing key for SERP observation context.
 */
export function buildSerpObservationKey(ctx) {
  const parts = [
    ctx.query_normalized,
    ctx.engine,
    ctx.search_surface,
    ctx.location.country,
    ctx.location.region || "",
    ctx.location.city || "",
    ctx.language,
    ctx.device,
  ];
  return sha256(parts.join("|"));
}

/**
 * B-050 Comparability Guard:
 * Determines whether two SERP observations are strictly comparable.
 * Fails closed if query, engine, surface, device, language, or location granularity differs.
 * Invariant: A desktop observation is never silently compared with mobile, nor a city with a country.
 */
export function areSerpContextsComparable(ctxA, ctxB) {
  if (!ctxA || !ctxB) {
    return {
      comparable: false,
      reasons: ["one or both contexts are missing or null"],
      reason: "one or both contexts are missing or null",
    };
  }

  const reasons = [];

  // 1. Query matching
  if (ctxA.query_normalized !== ctxB.query_normalized) {
    reasons.push(`query mismatch ("${ctxA.query_text}" vs "${ctxB.query_text}")`);
  }

  // 2. Engine matching
  if (ctxA.engine !== ctxB.engine) {
    reasons.push(`engine mismatch ("${ctxA.engine}" vs "${ctxB.engine}")`);
  }

  // 3. Search surface matching
  if (ctxA.search_surface !== ctxB.search_surface) {
    reasons.push(`search surface mismatch ("${ctxA.search_surface}" vs "${ctxB.search_surface}")`);
  }

  // 4. Device matching (desktop vs mobile vs tablet)
  if (ctxA.device !== ctxB.device) {
    reasons.push(`device mismatch ("${ctxA.device}" vs "${ctxB.device}")`);
  }

  // 5. Language matching
  if (ctxA.language !== ctxB.language) {
    reasons.push(`language mismatch ("${ctxA.language}" vs "${ctxB.language}")`);
  }

  // 6. Location granularity matching
  const locA = ctxA.location || {};
  const locB = ctxB.location || {};

  if (locA.country !== locB.country) {
    reasons.push(`country mismatch ("${locA.country}" vs "${locB.country}")`);
  } else {
    const hasCityA = Boolean(locA.city);
    const hasCityB = Boolean(locB.city);

    if (hasCityA !== hasCityB) {
      const cityDesc = hasCityA ? `city "${locA.city}"` : `city "${locB.city}"`;
      reasons.push(`location granularity mismatch (${cityDesc} vs country-only "${locA.country}")`);
    } else if (hasCityA && hasCityB && locA.city.toLowerCase() !== locB.city.toLowerCase()) {
      reasons.push(`city mismatch ("${locA.city}" vs "${locB.city}")`);
    }

    // Check region if both or one specified
    if (locA.region && locB.region && locA.region.toLowerCase() !== locB.region.toLowerCase()) {
      reasons.push(`region mismatch ("${locA.region}" vs "${locB.region}")`);
    }
  }

  return {
    comparable: reasons.length === 0,
    reasons,
    reason: reasons.length > 0 ? reasons.join("; ") : null,
  };
}
