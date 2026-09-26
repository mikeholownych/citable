import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/arch.js";

export const archDomainModule = defineDomainModule({
  module_id: "arch",
  namespace: "ARCH",
  title: "Information Architecture",
  description: "URL structure, hierarchy, depth, and canonical coherence.",
  conditions: detectors.filter((d) => d.namespace === "ARCH"),
  observation_kinds: ["canonical_freshness","index"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "arch",
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

export default archDomainModule;
