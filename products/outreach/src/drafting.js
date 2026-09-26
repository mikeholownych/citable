import { sha256 } from "./utils.js";

const FAMILIARITY_PATTERNS = [
  /long[- ]time reader/i,
  /huge fan of your (blog|work|writing|site|content)/i,
  /been following (you|your work) for (years|months)/i,
  /love everything you (post|write|publish)/i,
  /always enjoy reading your (posts|column|articles)/i,
  /avid follower of your/i,
  /huge admirer of your/i,
];

const FABRICATED_RELATIONSHIP_PATTERNS = [
  /our mutual (friend|connection|colleague)/i,
  /as we discussed (last week|yesterday|earlier)/i,
  /as agreed (during|on) our (call|meeting)/i,
  /since our teams partner/i,
  /remember me from/i,
];

const UNVERIFIED_STATISTICS_PATTERNS = [
  /\b\d+(?:\.\d+)?%\s*(?:of\s+[a-z]+|increase|growth|boost|drop|decrease|improvement)/i,
  /\bstudy of [\d,]+ (?:companies|sites|users|people)\b/i,
  /\bproven to (?:double|triple|quadruple)\b/i,
];

/**
 * Verifies draft text for fabricated claims, fake familiarity, or false relationships (B-085).
 */
export function verifyDraftForFabrication({ subject = "", bodyText = "", evidenceIds = [] }) {
  const combined = `${subject}\n${bodyText}`;
  const rejectionReasons = [];

  let familiarityDetected = false;
  for (const pattern of FAMILIARITY_PATTERNS) {
    if (pattern.test(combined)) {
      familiarityDetected = true;
      rejectionReasons.push(`Fabricated familiarity detected matching pattern: ${pattern}`);
      break;
    }
  }

  let relationshipDetected = false;
  for (const pattern of FABRICATED_RELATIONSHIP_PATTERNS) {
    if (pattern.test(combined)) {
      relationshipDetected = true;
      rejectionReasons.push(`Fabricated relationship detected matching pattern: ${pattern}`);
      break;
    }
  }

  let statisticsDetected = false;
  // If statistics patterns are present and no evidence IDs are cited, reject
  for (const pattern of UNVERIFIED_STATISTICS_PATTERNS) {
    if (pattern.test(combined)) {
      if (!evidenceIds || evidenceIds.length === 0) {
        statisticsDetected = true;
        rejectionReasons.push(`Unverified statistic cited in draft without supporting evidence IDs: ${pattern}`);
        break;
      }
    }
  }

  const passed = !familiarityDetected && !relationshipDetected && !statisticsDetected;

  return {
    passed,
    fabricated_familiarity_detected: familiarityDetected,
    unverified_statistics_detected: statisticsDetected,
    fabricated_relationship_detected: relationshipDetected,
    rejection_reasons: rejectionReasons,
  };
}

/**
 * Outreach Drafting with Full Provenance (B-085).
 *
 * Invariants:
 * 1. Every message retains strategy, template, model, prompt version, and evidence IDs.
 * 2. Fabricated familiarity, unverified statistics, and false relationships are rejected before review.
 * 3. Initial authorization status is DRAFT_UNAUTHORIZED (generating a message does not authorize sending it).
 */
export function draftOutreachMessage({
  opportunityId,
  recipientEmail,
  subject,
  bodyText,
  provenance = {},
}) {
  if (!opportunityId) {
    throw new Error("opportunityId is required");
  }
  if (!recipientEmail || typeof recipientEmail !== "string") {
    throw new Error("recipientEmail is required and must be a valid email");
  }
  if (!subject || !bodyText) {
    throw new Error("subject and bodyText are required");
  }

  const {
    strategy = "RESOURCE_PAGE",
    template_id = "tmpl_default_v1",
    model_id = "model_llm_v1",
    prompt_version = "v1.0.0",
    evidence_ids = [],
  } = provenance;

  const fabricationCheck = verifyDraftForFabrication({
    subject,
    bodyText,
    evidenceIds: evidence_ids,
  });

  const nowIso = new Date().toISOString();
  const seed = `${opportunityId}|${recipientEmail}|${strategy}|${template_id}|${nowIso}`;
  const messageId = `msg_drf_${sha256(seed).slice(0, 16)}`;

  // If fabrication check fails, message is REJECTED before review
  const authorizationStatus = fabricationCheck.passed
    ? "DRAFT_UNAUTHORIZED"
    : "REJECTED";

  return {
    schema_version: 1,
    message_id: messageId,
    opportunity_id: opportunityId,
    recipient_email: recipientEmail.toLowerCase().trim(),
    subject,
    body_text: bodyText,
    provenance: {
      strategy,
      template_id,
      model_id,
      prompt_version,
      evidence_ids: Array.isArray(evidence_ids) ? evidence_ids : [],
    },
    fabrication_verification: fabricationCheck,
    authorization_status: authorizationStatus,
    drafted_at: nowIso,
  };
}
