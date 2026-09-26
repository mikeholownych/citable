import { sha256 } from "../shared/io.js";

/**
 * Validates attribution continuity across journey stages and localizes loss points (B-072).
 * Traces UTMs, referrer, click IDs, cross-domain state, and checkout returns.
 */
export function validateAttributionContinuity(journeySteps = [], options = {}) {
  const journeyId = options.journey_id || `jrn_attr_${Date.now()}`;
  const nowIso = new Date().toISOString();

  if (!Array.isArray(journeySteps) || journeySteps.length === 0) {
    throw new Error("Attribution validation requires at least one journey step");
  }

  // Extract initial acquisition parameters
  const initialStep = journeySteps[0] || {};
  const initialUrlStr = initialStep.url || "https://example.test/";

  let initialUrl;
  try {
    initialUrl = new URL(initialUrlStr);
  } catch {
    initialUrl = new URL("https://example.test/");
  }

  const utmParams = {};
  const clickIds = {};

  for (const [k, v] of initialUrl.searchParams.entries()) {
    if (k.startsWith("utm_")) utmParams[k] = v;
    if (/^(gclid|fbclid|msclkid|ttclid|dclid|twclid)$/i.test(k)) clickIds[k] = v;
  }

  // Also include explicitly provided parameters from options
  if (options.initial_utms) Object.assign(utmParams, options.initial_utms);
  if (options.initial_click_ids) Object.assign(clickIds, options.initial_click_ids);

  const initialReferrer = initialStep.referrer || options.initial_referrer || null;

  const expectedParamKeys = [...Object.keys(utmParams), ...Object.keys(clickIds)];

  const lossPoints = [];
  const traceSteps = [];

  let previousUrl = initialUrlStr;
  let activeParams = new Set(expectedParamKeys);

  for (let i = 0; i < journeySteps.length; i++) {
    const step = journeySteps[i];
    const stepIndex = i + 1;
    const stage = step.stage || "session_navigation";
    const currentUrlStr = step.url || previousUrl;

    let parsedUrl;
    try {
      parsedUrl = new URL(currentUrlStr);
    } catch {
      parsedUrl = new URL("https://example.test/");
    }

    // Parameters currently retained in URL or in attached session/cookie context
    const presentInStep = [];
    const stepParams = step.retained_parameters || step.cookies || [];

    for (const key of expectedParamKeys) {
      if (parsedUrl.searchParams.has(key) || stepParams.includes(key) || step.session_has_attribution) {
        presentInStep.push(key);
      }
    }

    traceSteps.push({
      step_index: stepIndex,
      stage,
      url: currentUrlStr,
      parameters_present: presentInStep,
    });

    // Check for loss compared to activeParams
    const lostInThisStep = [...activeParams].filter((k) => !presentInStep.includes(k));

    if (lostInThisStep.length > 0 && i > 0) {
      let lossType = "LOSS_POINT_INTERNAL_LINK";
      let impact = "Tracking parameters dropped during navigation";

      if (stage === "subdomain_transition") {
        lossType = "LOSS_POINT_SUBDOMAIN";
        impact = `Cross-subdomain navigation to ${parsedUrl.hostname} dropped attribution cookies and click IDs`;
      } else if (stage === "checkout_return") {
        lossType = "LOSS_POINT_GATEWAY_RETURN";
        impact = "Return from external payment gateway omitted original click ID / UTM parameters, causing self-referral attribution overwrite";
      } else if (stage === "checkout_handoff") {
        lossType = "LOSS_POINT_REDIRECT";
        impact = "Handoff redirect stripped inbound marketing query parameters";
      }

      lossPoints.push({
        step_index: stepIndex,
        loss_type: lossType,
        from_url: previousUrl,
        to_url: currentUrlStr,
        lost_parameters: lostInThisStep,
        impact,
      });

      // Update active parameters remaining
      for (const lost of lostInThisStep) {
        activeParams.delete(lost);
      }
    }

    previousUrl = currentUrlStr;
  }

  const attributionIntact = lossPoints.length === 0;
  const reportSeed = `attr|${journeyId}|${attributionIntact}|${lossPoints.length}`;
  const reportId = `attr_rep_${sha256(reportSeed).slice(0, 16)}`;

  return {
    schema_version: 1,
    report_id: reportId,
    journey_id: journeyId,
    attribution_intact: attributionIntact,
    tracked_parameters: {
      utm_parameters: utmParams,
      click_ids: clickIds,
      initial_referrer: initialReferrer,
    },
    loss_points: lossPoints,
    trace_steps: traceSteps,
    evaluated_at: nowIso,
  };
}
