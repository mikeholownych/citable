import { substantiate } from '../commands/substantiate.js';
import { loadRegistries } from '../registries/index.js';

function keyTerms(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).slice(0, 8);
}

function overlapScore(assertionText, claimText) {
  const terms = keyTerms(assertionText);
  if (terms.length < 3) return 0;
  const target = String(claimText || '').toLowerCase();
  const present = terms.filter((t) => target.includes(t)).length;
  return present / terms.length;
}

/** Find the best-matching registry claim for one AI answer assertion (token-overlap heuristic, adapted from CLAIM-008). */
export function matchClaim(assertionText, claims, citationUrl) {
  let best = null;
  let bestScore = 0;
  for (const c of claims.filter((c) => c.status !== 'retired')) {
    let score = overlapScore(assertionText, c.claim);
    if (citationUrl && (c.publication_surfaces || []).some((s) => citationUrl.includes(s))) score += 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.4 ? best : null;
}

const OUTCOME_TO_STATUS = {
  verified: 'confirmed',
  verified_narrowed: 'confirmed',
  contradicted: 'contradicted',
  expired: 'stale',
};

/**
 * Diff one answer-engine assertion against the caller's own claim/evidence registry.
 * Never asserts the AI is wrong — only confirmed/contradicted/stale/unsupported relative
 * to the caller's own evidence. Never implies a live query happened.
 */
export function diffAssertion(assertionText, citationUrl, { claims, assessmentByClaimId }) {
  if (!assertionText) return null;
  const matched = matchClaim(assertionText, claims, citationUrl);
  if (!matched) {
    return { status: 'unsupported', matched_claim_id: null, reasons: ['no claim in your registry covers this assertion; it could not be checked'] };
  }
  const assessment = assessmentByClaimId.get(matched.claim_id);
  const status = OUTCOME_TO_STATUS[assessment?.outcome] ?? 'unsupported';
  return { status, matched_claim_id: matched.claim_id, reasons: assessment?.reasons ?? [] };
}

/** Precompute the shared claim/evidence lookups once per `observe citations` run. */
export function buildClaimDiffContext(root, refDate) {
  const { registries } = loadRegistries(root);
  const claims = registries.claims.entries;
  const { assessments } = substantiate(root, { write: false, refDate });
  const assessmentByClaimId = new Map(assessments.map((a) => [a.claim_id, a]));
  return { claims, assessmentByClaimId };
}
