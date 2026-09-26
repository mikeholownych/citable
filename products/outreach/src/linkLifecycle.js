import { parse } from "node-html-parser";
import { sha256 } from "./utils.js";

function stripTrailingSlashes(urlStr) {
  let s = String(urlStr || "").toLowerCase().trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

function parseLinksFromHtml(html, targetUrl) {
  if (!html || typeof html !== "string") return [];
  const normalizedTarget = stripTrailingSlashes(targetUrl);
  const root = parse(html);
  const anchors = root.querySelectorAll("a");
  const matches = [];

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;

    const normalizedHref = stripTrailingSlashes(href);
    if (normalizedHref === normalizedTarget || normalizedHref.includes(normalizedTarget)) {
      const relString = a.getAttribute("rel") || "";
      const relAttributes = relString
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      matches.push({
        rawTag: a.toString(),
        href,
        relAttributes,
        anchorText: (a.textContent || "").trim(),
      });
    }
  }

  return matches;
}

function determineLinkState(relAttributes) {
  if (relAttributes.includes("sponsored")) return "ACTIVE_SPONSORED";
  if (relAttributes.includes("ugc")) return "ACTIVE_UGC";
  if (relAttributes.includes("nofollow")) return "ACTIVE_NOFOLLOW";
  return "ACTIVE_FOLLOW";
}

/**
 * Independent Link Verification and Lifecycle Management (B-088).
 *
 * Invariants:
 * 1. Publisher confirmation alone is NEVER verification; direct crawl observation is required.
 * 2. Follow to nofollow preserves both observations.
 * 3. Link loss and modification are detected.
 */
export function verifyAcquiredLink({
  opportunityId,
  strategy = "RESOURCE_PAGE",
  sourceUrl,
  targetUrl,
  htmlContent,
  publisherClaim = null,
  economics = {},
}) {
  if (!opportunityId || !sourceUrl || !targetUrl) {
    throw new Error("opportunityId, sourceUrl, and targetUrl are required");
  }

  const nowIso = new Date().toISOString();
  const seed = `${opportunityId}|${sourceUrl}|${targetUrl}`;
  const linkId = `lnk_lfc_${sha256(seed).slice(0, 16)}`;

  // Invariant 1: Publisher confirmation alone is NEVER verification
  // publisherClaim is explicitly ignored as proof
  const linksFound = parseLinksFromHtml(htmlContent, targetUrl);

  let currentState = "LOST";
  let observedElement = "";
  let relAttributes = [];
  let verifiedAnchor = "";

  if (linksFound.length > 0) {
    const found = linksFound[0];
    observedElement = found.rawTag;
    relAttributes = found.relAttributes;
    verifiedAnchor = found.anchorText;
    currentState = determineLinkState(relAttributes);
  }

  const initialHistory = [
    {
      timestamp: nowIso,
      state: currentState,
      observation_details:
        currentState === "LOST"
          ? "Link not observed in crawl HTML (publisher claim alone ignored)"
          : `Observed in HTML: ${currentState} with anchor "${verifiedAnchor}"`,
    },
  ];

  const defaultEconomics = {
    total_acquisition_cost_minor_units: Number(economics.total_acquisition_cost_minor_units ?? 0),
    qualified_referral_visits: Number(economics.qualified_referral_visits ?? 0),
    ranking_causation_claimed: false, // Invariant: ranking causation is never asserted
  };

  return {
    schema_version: 1,
    link_id: linkId,
    opportunity_id: opportunityId,
    strategy,
    source_url: sourceUrl,
    target_url: targetUrl,
    independent_verification: {
      verification_method: "DIRECT_CRAWL_OBSERVATION",
      publisher_claim_ignored_as_proof: true,
      observed_html_element: observedElement,
      rel_attributes: relAttributes,
      verified_anchor_text: verifiedAnchor,
    },
    current_state: currentState,
    lifecycle_history: initialHistory,
    economics: defaultEconomics,
    last_verified_at: nowIso,
  };
}

/**
 * Updates link verification on subsequent crawl, preserving both observations across state transitions (B-088).
 */
export function updateLinkLifecycleObservation(existingRecord, newHtmlContent) {
  if (!existingRecord || !existingRecord.target_url) {
    throw new Error("existingRecord is required");
  }

  const nowIso = new Date().toISOString();
  const linksFound = parseLinksFromHtml(newHtmlContent, existingRecord.target_url);

  let newState = "LOST";
  let observedElement = "";
  let relAttributes = [];
  let verifiedAnchor = "";
  let observationDetails = "";

  if (linksFound.length === 0) {
    newState = "LOST";
    observationDetails = `Link lost: Previously ${existingRecord.current_state}, not observed in current HTML`;
  } else {
    const found = linksFound[0];
    observedElement = found.rawTag;
    relAttributes = found.relAttributes;
    verifiedAnchor = found.anchorText;

    const baseState = determineLinkState(relAttributes);

    // Detect modifications (e.g. anchor change)
    if (verifiedAnchor !== existingRecord.independent_verification.verified_anchor_text) {
      newState = "MODIFIED";
      observationDetails = `Anchor modified from "${existingRecord.independent_verification.verified_anchor_text}" to "${verifiedAnchor}"; rel=${relAttributes.join(",") || "follow"}`;
    } else if (existingRecord.current_state === "ACTIVE_FOLLOW" && baseState === "ACTIVE_NOFOLLOW") {
      // Invariant: follow to nofollow preserves both observations
      newState = "ACTIVE_NOFOLLOW";
      observationDetails = "Rel attribute changed from follow to nofollow; preserved both observations in history";
    } else {
      newState = baseState;
      observationDetails = `Verified link active: state ${newState}`;
    }
  }

  const updatedHistory = [
    ...existingRecord.lifecycle_history,
    {
      timestamp: nowIso,
      state: newState,
      observation_details: observationDetails,
    },
  ];

  return {
    ...existingRecord,
    current_state: newState,
    independent_verification: {
      verification_method: "DIRECT_CRAWL_OBSERVATION",
      publisher_claim_ignored_as_proof: true,
      observed_html_element: observedElement,
      rel_attributes: relAttributes,
      verified_anchor_text: verifiedAnchor,
    },
    lifecycle_history: updatedHistory,
    last_verified_at: nowIso,
  };
}
