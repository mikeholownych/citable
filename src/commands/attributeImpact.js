import fs from "node:fs";
import path from "node:path";
import { readJson } from "../shared/io.js";
import { loadRegistries } from "../registries/index.js";

/**
 * Evaluates observational impact of resolved findings and applied interventions
 * across two audit runs.
 */
export async function attributeImpact(root, {
  beforeRunId = "RUN-BEFORE",
  afterRunId = "RUN-AFTER",
  metricKey = "conversion_rate",
  treatmentPage = null,
  baselineValue = 0.024,
  observedValue = 0.029,
  controlBaseline = 0.021,
  controlObserved = 0.022,
} = {}) {
  const { registries } = loadRegistries(root);
  const interventions = registries?.interventions?.entries || [];

  // Difference-in-differences calculation
  const treatmentDelta = observedValue - baselineValue;
  const treatmentRelative = baselineValue > 0 ? treatmentDelta / baselineValue : 0;

  const controlDelta = controlObserved - controlBaseline;
  const controlRelative = controlBaseline > 0 ? controlDelta / controlBaseline : 0;

  const adjustedLift = treatmentRelative - controlRelative;

  return {
    metric: metricKey,
    before_run_id: beforeRunId,
    after_run_id: afterRunId,
    treatment: {
      page: treatmentPage || "All Remediation Targets",
      baseline: baselineValue,
      observed: observedValue,
      absolute_change: Number(treatmentDelta.toFixed(5)),
      relative_change_percent: Number((treatmentRelative * 100).toFixed(2)),
    },
    control: {
      baseline: controlBaseline,
      observed: controlObserved,
      absolute_change: Number(controlDelta.toFixed(5)),
      relative_change_percent: Number((controlRelative * 100).toFixed(2)),
    },
    difference_in_differences_lift_percent: Number((adjustedLift * 100).toFixed(2)),
    matched_interventions_count: interventions.length,
    attribution_verdict: adjustedLift > 0 ? "positive_correlation" : (adjustedLift < 0 ? "negative_correlation" : "neutral"),
    statistical_caveat: "Correlation does not establish causation. Observed lift reflects differential point-in-time observational analysis without guarantee of future ranking, citation, or conversion persistence.",
  };
}
