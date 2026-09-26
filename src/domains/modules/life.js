import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/lifeMeas.js";

export const lifeDomainModule = defineDomainModule({
  module_id: "life",
  namespace: "LIFE",
  title: "Lifecycle Cadence & Freshness",
  description: "Content review cadences, freshness signals, and deprecation governance.",
  conditions: detectors.filter((d) => d.namespace === "LIFE"),
  observation_kinds: ["canonical_freshness"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "life",
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

export default lifeDomainModule;
