import { sha256 } from "../shared/io.js";
import { extractDomainFromUrl } from "./elements.js";

export const AI_RELATIONSHIP = {
  CITED: "CITED",
  MENTIONED_ONLY: "MENTIONED_ONLY",
  LINKED_NOT_CITED: "LINKED_NOT_CITED",
  NEITHER: "NEITHER",
};

/**
 * Extracts and models first-class AI Overview data (B-053).
 */
export function extractAiOverviewModel(rawAi = null) {
  if (!rawAi || typeof rawAi !== "object") {
    return null;
  }

  const responsePresent = Boolean(rawAi.present ?? rawAi.response_present ?? true);
  const textBlocks = Array.isArray(rawAi.text_blocks)
    ? rawAi.text_blocks.map(String)
    : (rawAi.text ? [String(rawAi.text)] : (rawAi.markdown ? [String(rawAi.markdown)] : []));

  const textHash = textBlocks.length > 0
    ? sha256(textBlocks.join("\n\n"))
    : (rawAi.response_text_hash || null);

  const rawCitations = Array.isArray(rawAi.citations)
    ? rawAi.citations
    : (Array.isArray(rawAi.references) ? rawAi.references : (Array.isArray(rawAi.sources) ? rawAi.sources : []));

  const citations = rawCitations.map((c, idx) => {
    const url = c.url || c.link || "";
    const domain = c.domain || extractDomainFromUrl(url) || "";
    return {
      index: typeof c.index === "number" ? c.index : idx + 1,
      url,
      domain,
      title: c.title || null,
      snippet: c.snippet || c.text || null,
      position_in_ai_block: typeof c.position_in_ai_block === "number" ? c.position_in_ai_block : idx + 1,
    };
  });

  const rawMentions = Array.isArray(rawAi.mentions)
    ? rawAi.mentions
    : (Array.isArray(rawAi.entities) ? rawAi.entities : []);

  const mentions = rawMentions.map((m) => {
    if (typeof m === "string") {
      return {
        entity: m,
        brand: m,
        url_linked: false,
        url: null,
      };
    }
    return {
      entity: String(m.entity || m.name || ""),
      brand: m.brand ? String(m.brand) : null,
      url_linked: Boolean(m.url_linked || m.url),
      url: m.url || null,
    };
  });

  const followUpQueries = Array.isArray(rawAi.follow_up_queries)
    ? rawAi.follow_up_queries.map(String)
    : (Array.isArray(rawAi.suggested_queries) ? rawAi.suggested_queries.map(String) : []);

  return {
    response_present: responsePresent,
    response_text_hash: textHash,
    text_blocks: textBlocks,
    citations,
    mentions,
    follow_up_queries: followUpQueries,
  };
}

/**
 * Classifies target domain's relationship to an AI Overview result (B-053).
 * Distinctly classifies CITED, MENTIONED_ONLY, LINKED_NOT_CITED, and NEITHER.
 * Invariant: AI citation position is never treated as organic rank.
 */
export function classifyDomainAiRelationship(aiOverview, targetDomainOrBrand) {
  if (!aiOverview || !aiOverview.response_present || !targetDomainOrBrand) {
    return {
      relationship: AI_RELATIONSHIP.NEITHER,
      is_cited: false,
      is_mentioned: false,
      is_linked: false,
      citation_position: null,
      details: "No AI Overview present or target not specified",
    };
  }

  const target = String(targetDomainOrBrand).toLowerCase().replace(/^www\./, "");

  // 1. Check citations
  const citationMatch = aiOverview.citations.find((c) => {
    const cDomain = (c.domain || "").toLowerCase().replace(/^www\./, "");
    return cDomain === target || cDomain.endsWith(`.${target}`) || (c.url && c.url.toLowerCase().includes(target));
  });

  // 2. Check mentions
  const mentionMatch = aiOverview.mentions.find((m) => {
    const e = (m.entity || "").toLowerCase();
    const b = (m.brand || "").toLowerCase();
    return e.includes(target) || b.includes(target);
  });

  // Also check raw text blocks for unparsed brand mentions
  const mentionedInText = !mentionMatch && aiOverview.text_blocks.some((block) => {
    return block.toLowerCase().includes(target);
  });

  const isCited = Boolean(citationMatch);
  const isMentioned = Boolean(mentionMatch || mentionedInText);
  const isLinked = citationMatch ? true : Boolean(mentionMatch?.url_linked);

  let relationship = AI_RELATIONSHIP.NEITHER;
  if (isCited) {
    relationship = AI_RELATIONSHIP.CITED;
  } else if (isLinked && !isCited) {
    relationship = AI_RELATIONSHIP.LINKED_NOT_CITED;
  } else if (isMentioned && !isLinked) {
    relationship = AI_RELATIONSHIP.MENTIONED_ONLY;
  }

  return {
    relationship,
    is_cited: isCited,
    is_mentioned: isMentioned,
    is_linked: isLinked,
    citation_position: citationMatch ? citationMatch.index : null,
    details: isCited
      ? `Domain is cited at reference position ${citationMatch.index}`
      : (isMentioned ? "Domain/brand mentioned in text without citation link" : "Not present in AI Overview"),
  };
}
