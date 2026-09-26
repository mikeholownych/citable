import { sha256, nowIso } from "../shared/io.js";
import { validateAgainst } from "../shared/schemaValidator.js";
import { verifyClaim } from "../evidence/external.js";

const SCHEMA_NAME = "autonomous-content-boundary.schema.json";

/**
 * Autonomous Content Evidence Boundary (ER-13).
 *
 * Invariants:
 * 1. Content systems may submit proposed claims and receive evidence-bounded verification.
 * 2. Citable strictly DOES NOT generate content (citable_content_generated: false).
 * 3. Citable strictly DOES NOT authorize publication unless a downstream authority explicitly does so.
 */
export function verifyContentEvidenceBoundary({
  candidateDocumentId,
  proposedClaims = [],
  evidenceInterface = null,
  evidenceContext = {},
  downstreamAuthority = null,
}) {
  if (!candidateDocumentId || typeof candidateDocumentId !== "string") {
    throw new Error("candidateDocumentId is required");
  }

  const claimEvaluations = [];
  let supportedCount = 0;
  let partiallySupportedCount = 0;
  let unsupportedCount = 0;
  let contradictedCount = 0;
  let indeterminateCount = 0;
  let unobservedCount = 0;

  for (const claim of proposedClaims) {
    let verification;
    if (evidenceInterface?.verifyClaimAgainstEvidence) {
      verification = evidenceInterface.verifyClaimAgainstEvidence(claim, evidenceContext).verification;
    } else {
      verification = verifyClaim(claim, evidenceContext);
    }

    const evaluation = {
      claim_id: verification.claim_id,
      claim_version: verification.claim_version,
      overall: verification.overall,
      proposition_support: verification.proposition_support,
      scope_support: verification.scope_support,
      reasons: verification.reasons || [],
    };

    claimEvaluations.push(evaluation);

    switch (verification.overall) {
      case "SUPPORTED":
        supportedCount++;
        break;
      case "PARTIALLY_SUPPORTED":
        partiallySupportedCount++;
        break;
      case "UNSUPPORTED":
        unsupportedCount++;
        break;
      case "CONTRADICTED":
        contradictedCount++;
        break;
      case "INDETERMINATE":
        indeterminateCount++;
        break;
      case "NOT_OBSERVED":
        unobservedCount++;
        break;
      default:
        indeterminateCount++;
    }
  }

  const totalClaims = proposedClaims.length;
  const allClaimsSupported = totalClaims > 0 && supportedCount === totalClaims;

  let publicationAuthorized = false;
  let authorityScope = "EVIDENCE_VERIFICATION_ONLY";
  let downstreamAuth = {
    authorized_by: null,
    authority_type: null,
    authorized_at: null,
    refusal_reason: "Citable strictly provides evidence verification; does not authorize publication without downstream authority",
  };

  const hasExplicitDownstreamAuthority = Boolean(
    downstreamAuthority?.authorized_by &&
    (downstreamAuthority.authority_type === "DOWNSTREAM_PUBLISHER" || downstreamAuthority.authority_type === "HUMAN_OPERATOR")
  );

  if (hasExplicitDownstreamAuthority) {
    if (allClaimsSupported) {
      publicationAuthorized = true;
      authorityScope = "DOWNSTREAM_AUTHORIZED";
      downstreamAuth = {
        authorized_by: downstreamAuthority.authorized_by,
        authority_type: downstreamAuthority.authority_type,
        authorized_at: nowIso(),
        refusal_reason: null,
      };
    } else {
      publicationAuthorized = false;
      authorityScope = "EVIDENCE_VERIFICATION_ONLY";
      downstreamAuth = {
        authorized_by: null,
        authority_type: null,
        authorized_at: null,
        refusal_reason: "Publication refused: Candidate document contains unverified, unsupported, or contradicted claims",
      };
    }
  }

  const seed = `${candidateDocumentId}|${totalClaims}|${supportedCount}|${publicationAuthorized}|${nowIso()}`;
  const boundaryId = `ACB-${sha256(seed).slice(0, 24)}`;

  const record = {
    schema_version: 1,
    boundary_id: boundaryId,
    candidate_document_id: candidateDocumentId,
    citable_content_generated: false, // Invariant: Citable does NOT generate content
    publication_authorized: publicationAuthorized,
    authority_scope: authorityScope,
    verification_summary: {
      total_claims: totalClaims,
      supported_claims: supportedCount,
      partially_supported_claims: partiallySupportedCount,
      unsupported_claims: unsupportedCount,
      contradicted_claims: contradictedCount,
      indeterminate_claims: indeterminateCount,
      unobserved_claims: unobservedCount,
      all_claims_supported: allClaimsSupported,
    },
    claim_evaluations: claimEvaluations,
    downstream_authorization: downstreamAuth,
    evaluated_at: nowIso(),
  };

  const validation = validateAgainst(SCHEMA_NAME, record);
  if (!validation.valid) {
    throw new Error(`Autonomous content boundary contract violated: ${validation.errors.join("; ")}`);
  }

  return record;
}
