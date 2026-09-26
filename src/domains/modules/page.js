import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/page.js";

export const pageDomainModule = defineDomainModule({
  module_id: "page",
  namespace: "PAGE",
  title: "Page Content & Structure",
  description: "Headings, titles, content density, and visible layout integrity.",
  conditions: detectors.filter((d) => d.namespace === "PAGE"),
  observation_kinds: ["passage","canonical_freshness"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "page",
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

export default pageDomainModule;
