import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/lifeMeas.js";

export const measDomainModule = defineDomainModule({
  module_id: "meas",
  namespace: "MEAS",
  title: "Measurement & Benchmarking",
  description: "Search performance metrics, objective guardrails, and variance tracking.",
  conditions: detectors.filter((d) => d.namespace === "MEAS"),
  observation_kinds: ["metric","performance"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "meas",
      total: determinations.length,
      passed: determinations.filter((d) => d.status === "PASS").length,
      failed: determinations.filter((d) => d.status === "FAIL").length,
      warning: determinations.filter((d) => d.status === "WARNING").length,
      not_tested: determinations.filter((d) => d.status === "NOT_TESTED").length,
    }),
  },
  gating: {
    default_enabled: true,
  },
});

export default measDomainModule;
