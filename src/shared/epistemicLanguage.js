/**
 * Helpers for keeping presentation language within the scope of its evidence.
 *
 * These checks intentionally target assurance phrases, rather than individual
 * words such as `complete` or `verified` which are also legitimate schema and
 * lifecycle states.  A report may say that a package is checksum-verified or
 * that a collection completed; it may not turn that fact into an unsupported
 * corpus-wide assurance.
 */

const UNSUPPORTED_ASSURANCE_PATTERNS = Object.freeze([
  /\ball\s+(?:conversion\s+pathways|pages?|resources?|checks?|findings?).{0,40}\b(?:verified|clean|passed|complete)\b/i,
  /\b(?:verified[- ]clean|clean\s+and\s+verified|no\s+issues)\b/i,
  /\b100%\s+(?:clean|verified|complete|pass(?:ed)?|coverage|conversion|funnel)/i,
  /\b(?:site[- ]wide|entire\s+(?:site|corpus|population))\s+(?:clean|verified|complete|resolved|no\s+issues)/i,
  /\b(?:all|entire)\s+(?:site|corpus|population)\s+(?:passed|verified|clean|complete)\b/i,
  /(?:^|\n)\s*(?:verified|clean|resolved|optimal|complete|site[- ]wide|entire|none|all|passed)\b/im,
  /<(?:h[1-6]|span|strong|div)[^>]*>\s*(?:verified|clean|resolved|optimal|complete|site[- ]wide|entire|none|all|passed)\b/i,
]);

function normaliseContext(context = {}) {
  const coverage = context.coverage_status || context.coverageStatus || 'indeterminate';
  const determination = context.determination_status || context.determinationStatus || 'indeterminate';
  const evaluated = Number.isInteger(context.evaluated) ? context.evaluated : null;
  const eligible = Number.isInteger(context.eligible) ? context.eligible : null;
  const packageVerified = context.package_verified ?? context.packageVerified ?? false;
  const legacy = context.legacy === true || context.integrity_mode === 'legacy_unverified';
  return { coverage, determination, evaluated, eligible, packageVerified, legacy };
}

export function hasVerifiedEvidenceScope(context = {}) {
  const state = normaliseContext(context);
  return state.packageVerified === true
    && context.integrity_mode === 'sealed'
    && !state.legacy
    && state.coverage === 'complete'
    && state.determination === 'supported'
    && Number.isInteger(state.evaluated)
    && Number.isInteger(state.eligible)
    && state.evaluated > 0
    && state.eligible > 0
    && state.evaluated === state.eligible;
}

/**
 * Find assurance phrases that are unsafe for a presentation context.
 * Complete, supported, verified packages may use the phrases when the caller
 * supplies an explicit population; incomplete/legacy/empty evidence may not.
 */
export function findEpistemicLanguageViolations(text, context = {}) {
  const value = String(text ?? '');
  const state = normaliseContext(context);
  const cannotClaimCorpus = !hasVerifiedEvidenceScope(context);
  if (!cannotClaimCorpus) return [];
  return UNSUPPORTED_ASSURANCE_PATTERNS
    .map((pattern) => {
      const match = value.match(pattern);
      return match ? { phrase: match[0], index: match.index ?? 0, pattern: pattern.source } : null;
    })
    .filter(Boolean);
}

export function assertEpistemicLanguage(text, context = {}) {
  const violations = findEpistemicLanguageViolations(text, context);
  if (violations.length) {
    throw new Error(`unsupported assurance language: ${violations.map((item) => item.phrase).join('; ')}`);
  }
  return text;
}

/** A short, reusable disclosure for reports and machine-readable exports. */
export function evidenceScopeStatement(context = {}) {
  const state = normaliseContext(context);
  if (state.evaluated === 0 || state.eligible === 0) {
    return 'No determination is available because no eligible resource was evaluated.';
  }
  if (state.coverage !== 'complete' || state.determination !== 'supported' || state.legacy || !state.packageVerified) {
    const population = state.evaluated == null ? 'the evaluated subset' : `${state.evaluated} evaluated resource(s)`;
    const denominator = state.eligible == null ? '' : ` of ${state.eligible} eligible`;
    return `Coverage is ${state.coverage}; this statement applies only to ${population}${denominator}. Corpus-wide absence or cleanliness is not established.`;
  }
  const population = state.evaluated == null ? 'the evaluated population' : `${state.evaluated} evaluated resource(s)`;
  return `This statement applies to ${population} under the supported evidence contract.`;
}

export const EPISTEMIC_LANGUAGE_PATTERNS = UNSUPPORTED_ASSURANCE_PATTERNS;
