import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/tech.js";

export const techDomainModule = defineDomainModule({
  module_id: "tech",
  namespace: "TECH",
  title: "Technical Foundation & Rendering",
  description: "Core technical SEO, HTTP status, rendering, and indexing hygiene.",
  conditions: detectors.filter((d) => d.namespace === "TECH"),
  observation_kinds: ["render","canonical_freshness"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "tech",
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

export default techDomainModule;
