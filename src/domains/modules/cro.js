import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/cro.js";

export const croDomainModule = defineDomainModule({
  module_id: "cro",
  namespace: "CRO",
  title: "Conversion Rate Optimization",
  description: "CTA visibility, form friction, funnels, trust badges, and conversion paths.",
  conditions: detectors.filter((d) => d.namespace === "CRO"),
  observation_kinds: ["browser_journey"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "cro",
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

export default croDomainModule;
