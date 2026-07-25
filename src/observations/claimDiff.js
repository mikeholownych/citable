import { substantiate } from '../commands/substantiate.js';
import { loadRegistries } from '../registries/index.js';

function keyTerms(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).slice(0, 8);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function overlapScore(assertionText, claimText) {
  const terms = keyTerms(assertionText);
  if (terms.length < 3) return 0;
  const target = String(claimText || '').toLowerCase();
  // Whole-word boundaries only — a raw substring test would match "test" inside
  // "greatest" and misassign a substantiation status to the wrong claim.
  const present = terms.filter((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`).test(target)).length;
  return present / terms.length;
}

function surfaceMatches(citationUrl, surface) {
  try {
    const url = new URL(citationUrl);
    // Path-boundary comparison, not raw substring — a query string or fragment
    // containing the surface text must not count as a match.
    return url.pathname === surface || url.pathname.startsWith(surface.endsWith('/') ? surface : `${surface}/`);
  } catch {
    return false;
  }
}

/** Find the best-matching registry claim for one AI answer assertion (token-overlap heuristic, adapted from CLAIM-008). */
export function matchClaim(assertionText, claims, citationUrl) {
  let best = null;
  let bestScore = 0;
  for (const c of claims.filter((c) => c.status !== 'retired')) {
    let score = overlapScore(assertionText, c.claim);
    if (citationUrl && (c.publication_surfaces || []).some((s) => surfaceMatches(citationUrl, s))) score += 0.1;
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

/**
 * Precompute the shared claim/evidence lookups once per `observe citations` run.
 * `problems` surfaces registry schema-validation issues (malformed but parseable
 * YAML) so the caller can report them as warnings rather than silently diffing
 * against data that failed its own contract.
 */
export function buildClaimDiffContext(root, refDate) {
  const { registries, problems } = loadRegistries(root);
  const claims = Array.isArray(registries.claims?.entries) ? registries.claims.entries : [];
  const { assessments } = substantiate(root, { write: false, refDate });
  const assessmentByClaimId = new Map(assessments.map((a) => [a.claim_id, a]));
  return { claims, assessmentByClaimId, problems };
}
