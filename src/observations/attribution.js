/**
 * Citation Attribution and Claim Entailment Verification.
 *
 * Evaluates whether generative engine answers accurately reflect registered
 * claim assertions or attribute distorted, negated, or contradicted claims to
 * an entity or brand.
 *
 * Governed Invariants:
 * - Does not guess or extrapolate; evaluates strictly against registered claims.
 * - Distinguishes between supported claims, distorted claims, and unsupported claims.
 * - Emits schema-validated attribution observation envelopes.
 */

import { envelope, observationRun, readInput } from "./common.js";
import { matchClaim } from "./claimDiff.js";
import { substantiate } from "../commands/substantiate.js";
import { loadRegistries } from "../registries/index.js";

const NEGATION_PATTERNS = [
  /\b(?:does\s+not|doesn't|cannot|can't|fails\s+to|lacks|missing|no\s+longer|unable\s+to|without|refuses\s+to|not\s+supported)\b/i,
];

function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/([.?!])\s+/g, "$1|§|")
    .split("|§|")
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

function hasNegation(text) {
  return NEGATION_PATTERNS.some((p) => p.test(text));
}

export function evaluateAnswerAttribution(answerText, entity, {
  claims = [],
  citationUrl = null,
  assessmentByClaimId = new Map(),
  reviewer = null,
} = {}) {
  const names = [entity.canonical_name, ...(entity.aliases || [])].map((n) => n.toLowerCase());
  const lowerAnswer = String(answerText || "").toLowerCase();
  const mentioned = names.some((n) => lowerAnswer.includes(n));

  if (!mentioned) {
    return {
      mentioned: false,
      entity_id: entity.entity_id,
      evaluations: [],
      has_distorted_claims: false,
      supported_count: 0,
      distorted_count: 0,
      unsupported_count: 0,
    };
  }

  const sentences = splitSentences(answerText);
  const evaluations = [];
  const relevantClaims = claims.filter((c) => !c.entity || c.entity === entity.entity_id);

  for (const sentence of sentences) {
    const sentenceMentionsEntity = names.some((n) => sentence.toLowerCase().includes(n));
    if (!sentenceMentionsEntity && sentences.length > 1) continue;

    const matched = matchClaim(sentence, relevantClaims, citationUrl);
    if (!matched) continue;

    const assessment = assessmentByClaimId.get(matched.claim_id);
    const claimContradicted = matched.status === "contradicted" ||
      assessment?.outcome === "contradicted" ||
      (matched.contradictory_sources && matched.contradictory_sources.length > 0);
    const claimExpired = matched.status === "expired" || (matched.expires && new Date(matched.expires) < new Date());
    const sentenceNegated = hasNegation(sentence);

    let attributionStatus;
    const reasons = [];

    if (claimContradicted) {
      attributionStatus = "distorted";
      reasons.push(`Answer cites claim "${matched.claim_id}" which is contradicted in registry.`);
    } else if (sentenceNegated) {
      attributionStatus = "distorted";
      reasons.push(`Answer negates registered capability declared in claim "${matched.claim_id}".`);
    } else if (claimExpired) {
      attributionStatus = "distorted";
      reasons.push(`Answer asserts claim "${matched.claim_id}" which has expired (${matched.expires}).`);
    } else if (matched.status === "unverified" || assessment?.outcome === "unsupported") {
      attributionStatus = "unsupported";
      reasons.push(`Answer attributes unverified claim "${matched.claim_id}".`);
    } else {
      attributionStatus = "supported";
      reasons.push(`Answer accurately attributes verified claim "${matched.claim_id}".`);
    }

    // Check exclusion violations
    if (matched.exclusions && matched.exclusions.length > 0) {
      for (const exclusion of matched.exclusions) {
        if (sentence.toLowerCase().includes(exclusion.toLowerCase())) {
          attributionStatus = "distorted";
          reasons.push(`Answer asserts feature listed under exclusions: "${exclusion}".`);
        }
      }
    }

    evaluations.push({
      claim_id: matched.claim_id,
      claim_text: matched.claim,
      assertion_excerpt: sentence,
      attribution_status: attributionStatus,
      reasons,
    });
  }

  const supportedCount = evaluations.filter((e) => e.attribution_status === "supported").length;
  const distortedCount = evaluations.filter((e) => e.attribution_status === "distorted").length;
  const unsupportedCount = evaluations.filter((e) => e.attribution_status === "unsupported").length;

  return {
    mentioned: true,
    entity_id: entity.entity_id,
    canonical_name: entity.canonical_name,
    evaluations,
    has_distorted_claims: distortedCount > 0,
    supported_count: supportedCount,
    distorted_count: distortedCount,
    unsupported_count: unsupportedCount,
  };
}

export async function observeAttribution(root, options = {}) {
  const input = readInput(options.input);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join("; ")}`);

  const entities = (registries.entities?.entries || []).filter((e) => e.status !== "retired");
  if (!entities.length) throw new Error("no active entities found in entity registry");

  const claims = registries.claims?.entries || [];

  // Build claim assessments
  const assessmentMap = new Map();
  try {
    const subRes = substantiate(root);
    for (const item of subRes.assessments || []) {
      assessmentMap.set(item.claim_id, item);
    }
  } catch {}

  const targetEntities = options.entity
    ? entities.filter((e) => e.entity_id === options.entity || e.canonical_name.toLowerCase() === options.entity.toLowerCase())
    : entities;

  if (options.entity && !targetEntities.length) {
    throw new Error(`entity not found: ${options.entity}`);
  }

  const doc = input.value;
  const items = Array.isArray(doc)
    ? doc
    : doc.observations || doc.items || doc.answers || doc.prompts || [doc];

  const observations = [];
  for (const item of items) {
    const answerText = item.answer_text || item.answer || item.text || item.data?.answer_text || "";
    if (!answerText) continue;

    const promptId = item.prompt_id || item.data?.prompt_id || "unknown";
    const promptText = item.prompt_text || item.data?.prompt_text || null;
    const engine = item.provider || item.engine || item.data?.provider || item.data?.engine || "unknown";
    const citationUrl = item.citations?.[0]?.url || item.url || null;
    const reviewer = options.reviewer || item.reviewer || item.evaluator || null;

    for (const entity of targetEntities) {
      const evaluation = evaluateAnswerAttribution(answerText, entity, {
        claims,
        citationUrl,
        assessmentByClaimId: assessmentMap,
        reviewer,
      });

      if (!evaluation.mentioned) continue;

      const data = {
        prompt_id: promptId,
        prompt_text: promptText,
        engine,
        entity_id: entity.entity_id,
        canonical_name: entity.canonical_name,
        citation_url: citationUrl,
        evaluations: evaluation.evaluations,
        has_distorted_claims: evaluation.has_distorted_claims,
        supported_count: evaluation.supported_count,
        distorted_count: evaluation.distorted_count,
        unsupported_count: evaluation.unsupported_count,
        reviewer,
      };

      const raw = JSON.stringify({ item, evaluation });
      observations.push(envelope("attribution", data, {
        method: reviewer ? "human_review" : "static_analysis",
        source: input.file,
        state: evaluation.has_distorted_claims ? "review_required" : "observed",
        confidence: reviewer ? "confirmed" : "medium",
        raw,
        limitations: [
          "Claim attribution evaluation maps extracted generative assertions against registered claims.",
          "Attribution findings require human review for authoritative legal or compliance determination.",
        ],
      }));
    }
  }

  return observationRun(root, "observe attribution", input.file, observations, {
    rawInputs: { attribution_input: input.raw },
  });
}
