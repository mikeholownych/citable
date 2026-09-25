import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/ans.js";

export const ansDomainModule = defineDomainModule({
  module_id: "ans",
  namespace: "ANS",
  title: "Answer Extraction & Conciseness",
  description: "Answer passage suitability, question density, and direct responses.",
  conditions: detectors.filter((d) => d.namespace === "ANS"),
  observation_kinds: ["passage","citation"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "ans",
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

export default ansDomainModule;
