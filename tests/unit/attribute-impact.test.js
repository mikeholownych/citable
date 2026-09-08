import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attributeImpact } from "../../src/commands/attributeImpact.js";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

test("attributeImpact calculates difference-in-differences lift and includes caveat", async () => {
  const root = path.join(FIX, "site-clean");
  const res = await attributeImpact(root, {
    beforeRunId: "RUN-PRE",
    afterRunId: "RUN-POST",
    metricKey: "conversion_rate",
    treatmentPage: "/products/gatekeeper/",
    baselineValue: 0.02,
    observedValue: 0.03, // +50%
    controlBaseline: 0.02,
    controlObserved: 0.022, // +10%
  });

  assert.equal(res.treatment.relative_change_percent, 50);
  assert.equal(res.control.relative_change_percent, 10);
  assert.equal(res.difference_in_differences_lift_percent, 40);
  assert.equal(res.attribution_verdict, "positive_correlation");
  assert.ok(res.statistical_caveat.includes("Correlation does not establish causation"));
});
