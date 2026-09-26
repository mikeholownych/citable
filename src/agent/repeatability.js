import { sha256 } from "../shared/io.js";

/**
 * Repeatability Testing for Probabilistic Agent Determinations (B-067).
 *
 * Invariant: Unstable probabilistic determinations report BUSINESS_IDENTITY_AMBIGUOUS
 * or equivalent standardized ambiguity codes, rather than silently returning the
 * last run's arbitrary answer.
 */
export function evaluateDeterminationRepeatability(runs = [], taskName = "business_identity", options = {}) {
  if (!Array.isArray(runs) || runs.length < 2) {
    throw new Error("Repeatability evaluation requires at least 2 independent runs");
  }

  const threshold = options.consensus_threshold ?? 0.75;
  const defaultAmbiguityCode = options.ambiguity_code || "BUSINESS_IDENTITY_AMBIGUOUS";
  const nowIso = new Date().toISOString();

  // Normalize conclusions
  const normalizedConclusions = runs.map((r, idx) => {
    const rawAnswer = typeof r === "string" ? r : (r.answer || r.conclusion || r.classification || "UNKNOWN");
    const answer = String(rawAnswer).trim().toLowerCase();
    const confidence = typeof r.confidence === "number" ? r.confidence : null;
    const rawResponse = r.raw_response || (typeof r === "object" ? JSON.stringify(r) : String(r));
    return {
      run_index: idx + 1,
      answer,
      confidence,
      raw_response: rawResponse,
    };
  });

  // Tally answer frequencies
  const freqMap = new Map();
  for (const c of normalizedConclusions) {
    freqMap.set(c.answer, (freqMap.get(c.answer) || 0) + 1);
  }

  // Find dominant conclusion
  let topAnswer = null;
  let maxCount = 0;
  for (const [ans, count] of freqMap.entries()) {
    if (count > maxCount) {
      maxCount = count;
      topAnswer = ans;
    }
  }

  const agreementRatio = Number((maxCount / normalizedConclusions.length).toFixed(4));
  const isStable = agreementRatio >= threshold;

  const consensusAnswer = isStable ? topAnswer : null;
  const ambiguityCode = isStable ? null : defaultAmbiguityCode;

  // Hallucination susceptibility evaluation
  let hallucinationStatus = "NOT_TESTED";
  let groundingNotes = null;

  if (options.grounding_facts || options.site_text) {
    const groundText = String(options.grounding_facts || options.site_text || "").toLowerCase();
    if (consensusAnswer) {
      if (groundText.includes(consensusAnswer)) {
        hallucinationStatus = "SUPPORTED";
        groundingNotes = `Consensus conclusion "${consensusAnswer}" is directly supported by site text`;
      } else if (options.contradicted_terms?.some((term) => consensusAnswer.includes(term.toLowerCase()))) {
        hallucinationStatus = "CONTRADICTED";
        groundingNotes = `Consensus conclusion "${consensusAnswer}" directly contradicts declared site facts`;
      } else {
        hallucinationStatus = "UNSUPPORTED";
        groundingNotes = `Consensus conclusion "${consensusAnswer}" has no supporting mentions in site text`;
      }
    } else {
      hallucinationStatus = "UNSUPPORTED";
      groundingNotes = "Determination fluctuated across runs due to lack of grounding evidence in source text";
    }
  }

  const seed = `${taskName}|${runs.length}|${agreementRatio}|${nowIso}`;
  const evaluationId = `arp_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    evaluation_id: evaluationId,
    task_name: taskName,
    run_count: normalizedConclusions.length,
    conclusions: normalizedConclusions,
    stability: {
      is_stable: isStable,
      agreement_ratio: agreementRatio,
      consensus_answer: consensusAnswer,
      ambiguity_code: ambiguityCode,
    },
    hallucination_susceptibility: {
      tested: hallucinationStatus !== "NOT_TESTED",
      status: hallucinationStatus,
      grounding_notes: groundingNotes,
    },
    evaluated_at: nowIso,
  };
}
