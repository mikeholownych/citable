import { sha256 } from "../shared/io.js";

export const JOURNEY_OUTCOMES = {
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
  INDETERMINATE: "INDETERMINATE",
  BLOCKED: "BLOCKED",
};

export const EVIDENCE_TYPES = {
  DIRECT_EVIDENCE: "DIRECT_EVIDENCE",
  DERIVED_INTERPRETATION: "DERIVED_INTERPRETATION",
  MODEL_INFERENCE: "MODEL_INFERENCE",
};

/**
 * Executes or evaluates a bounded, task-oriented agent journey (B-065).
 * Resolves to SUCCESS | PARTIAL | FAILED | INDETERMINATE | BLOCKED.
 * Every extracted answer cites source URL and element, strictly distinguishing
 * direct evidence from model inference.
 */
export function executeGroundedJourney(journeyDefinition = {}, siteContext = {}) {
  const goal = journeyDefinition.goal || "Complete agent interaction task";
  const journeyType = journeyDefinition.journey_type || "custom";
  const stepsDef = Array.isArray(journeyDefinition.steps) ? journeyDefinition.steps : [];

  if (stepsDef.length === 0) {
    throw new Error("Grounded journey requires at least one step definition");
  }

  const pages = Array.isArray(siteContext.pages) ? siteContext.pages : (siteContext.site?.pages || []);
  const nowIso = new Date().toISOString();

  let directCount = 0;
  let derivedCount = 0;
  let modelCount = 0;

  const evaluatedSteps = [];

  for (let i = 0; i < stepsDef.length; i++) {
    const stepDef = stepsDef[i];
    const stepIndex = i + 1;
    const desc = stepDef.description || `Step ${stepIndex}`;

    // 1. Check for access block
    if (stepDef.blocked || siteContext.is_blocked || siteContext.access_denied) {
      evaluatedSteps.push({
        step_index: stepIndex,
        description: desc,
        status: JOURNEY_OUTCOMES.BLOCKED,
        extracted_answers: [],
        error_or_refusal: stepDef.error_or_refusal || "Execution blocked by access control, challenge, or wall",
      });
      continue;
    }

    // 2. Perform step execution / evaluation
    const targetUrl = stepDef.target_url;
    const targetProperty = stepDef.property || stepDef.claim_or_property;

    let stepAnswers = [];
    let stepStatus = JOURNEY_OUTCOMES.FAILED;
    let stepError = null;

    if (Array.isArray(stepDef.extracted_answers) && stepDef.extracted_answers.length > 0) {
      // Pre-supplied answers in validation context
      stepAnswers = stepDef.extracted_answers;
      stepStatus = stepDef.status || JOURNEY_OUTCOMES.SUCCESS;
    } else if (targetProperty) {
      // Search pages for matching targetProperty
      const candidatePages = targetUrl
        ? pages.filter((p) => p.url === targetUrl)
        : pages;

      const directMatches = [];
      const derivedMatches = [];
      const inferences = [];

      for (const p of candidatePages) {
        // Direct meta tag / schema check
        if (targetProperty === "author") {
          const schemaAuthor = p.jsonLd?.flatMap((j) => j.author || j.creator).filter(Boolean)[0];
          if (schemaAuthor) {
            directMatches.push({
              claim_or_property: "author",
              extracted_value: typeof schemaAuthor === "object" ? schemaAuthor.name : schemaAuthor,
              source_url: p.url,
              source_element: 'script[type="application/ld+json"]',
              source_text: JSON.stringify(schemaAuthor),
              evidence_type: EVIDENCE_TYPES.DIRECT_EVIDENCE,
              confidence: "confirmed",
            });
          }
        }

        if (targetProperty === "pricing" || targetProperty === "plan") {
          // Look for pricing in text or ctas
          const priceHeading = p.headings?.find((h) => /\$\d+|\bfree\b|\bmonth\b|\byear\b/i.test(h));
          const priceParagraph = p.paragraphs?.find((para) => /\$\d+|\bpricing\b|\bper user\b/i.test(para));
          if (priceHeading || priceParagraph) {
            directMatches.push({
              claim_or_property: "pricing",
              extracted_value: priceHeading || priceParagraph,
              source_url: p.url,
              source_element: priceHeading ? "h2,h3" : "p",
              source_text: priceHeading || priceParagraph,
              evidence_type: EVIDENCE_TYPES.DIRECT_EVIDENCE,
              confidence: "confirmed",
            });
          }
        }

        // Generic text search
        if (p.text && p.text.toLowerCase().includes(targetProperty.toLowerCase())) {
          derivedMatches.push({
            claim_or_property: targetProperty,
            extracted_value: `Mentioned in ${p.title || p.url}`,
            source_url: p.url,
            source_element: "body",
            source_text: p.text.slice(0, 160),
            evidence_type: EVIDENCE_TYPES.DERIVED_INTERPRETATION,
            confidence: "medium",
          });
        }
      }

      if (directMatches.length > 0) {
        stepAnswers = directMatches;
        stepStatus = JOURNEY_OUTCOMES.SUCCESS;
      } else if (derivedMatches.length > 0) {
        stepAnswers = derivedMatches;
        stepStatus = JOURNEY_OUTCOMES.PARTIAL;
      } else if (stepDef.model_inference_fallback) {
        stepAnswers = [{
          claim_or_property: targetProperty,
          extracted_value: stepDef.model_inference_fallback,
          source_url: candidatePages[0]?.url || "unknown",
          source_element: "model_completion",
          source_text: stepDef.model_inference_fallback,
          evidence_type: EVIDENCE_TYPES.MODEL_INFERENCE,
          confidence: "low",
        }];
        stepStatus = JOURNEY_OUTCOMES.PARTIAL;
      } else {
        stepStatus = JOURNEY_OUTCOMES.FAILED;
        stepError = `Could not ground property "${targetProperty}" across ${candidatePages.length} candidate pages`;
      }
    } else {
      stepStatus = stepDef.status || JOURNEY_OUTCOMES.FAILED;
      stepError = stepDef.error_or_refusal || "Step missing extraction rule or property target";
    }

    // Tally evidence counts
    for (const ans of stepAnswers) {
      if (ans.evidence_type === EVIDENCE_TYPES.DIRECT_EVIDENCE) directCount += 1;
      else if (ans.evidence_type === EVIDENCE_TYPES.DERIVED_INTERPRETATION) derivedCount += 1;
      else if (ans.evidence_type === EVIDENCE_TYPES.MODEL_INFERENCE) modelCount += 1;
    }

    evaluatedSteps.push({
      step_index: stepIndex,
      description: desc,
      status: stepStatus,
      extracted_answers: stepAnswers,
      error_or_refusal: stepError,
    });
  }

  // 3. Resolve overall journey outcome
  let overallOutcome = JOURNEY_OUTCOMES.SUCCESS;
  let outcomeReason = null;

  const stepStatuses = evaluatedSteps.map((s) => s.status);

  if (stepStatuses.includes(JOURNEY_OUTCOMES.BLOCKED)) {
    overallOutcome = JOURNEY_OUTCOMES.BLOCKED;
    outcomeReason = "One or more essential journey steps were blocked by access restrictions";
  } else if (stepStatuses.every((s) => s === JOURNEY_OUTCOMES.FAILED)) {
    overallOutcome = JOURNEY_OUTCOMES.FAILED;
    outcomeReason = "All journey steps failed to discover grounded answers";
  } else if (stepStatuses.includes(JOURNEY_OUTCOMES.INDETERMINATE)) {
    overallOutcome = JOURNEY_OUTCOMES.INDETERMINATE;
    outcomeReason = "Contradictory or ambiguous evidence encountered during journey steps";
  } else if (stepStatuses.some((s) => s === JOURNEY_OUTCOMES.FAILED || s === JOURNEY_OUTCOMES.PARTIAL)) {
    overallOutcome = JOURNEY_OUTCOMES.PARTIAL;
    outcomeReason = "Some journey steps succeeded, but others were incomplete, failed, or relied on model inference";
  } else {
    overallOutcome = JOURNEY_OUTCOMES.SUCCESS;
    outcomeReason = "All journey steps successfully completed with grounded direct evidence";
  }

  const idSeed = `${goal}|${journeyType}|${evaluatedSteps.length}|${nowIso}`;
  const journeyId = `jrn_${sha256(idSeed).slice(0, 16)}`;

  return {
    schema_version: 1,
    journey_id: journeyId,
    journey_type: journeyType,
    goal,
    outcome: overallOutcome,
    outcome_reason: outcomeReason,
    steps: evaluatedSteps,
    evidence_summary: {
      direct_evidence_count: directCount,
      derived_interpretation_count: derivedCount,
      model_inference_count: modelCount,
    },
    executed_at: nowIso,
  };
}
