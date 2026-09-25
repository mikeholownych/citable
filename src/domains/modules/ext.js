import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/geoReco.js";

export const extDomainModule = defineDomainModule({
  module_id: "ext",
  namespace: "EXT",
  title: "Independent Corroboration",
  description: "External source corroboration and third-party citation verification.",
  conditions: detectors.filter((d) => d.namespace === "EXT"),
  observation_kinds: ["corroboration"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "ext",
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

export default extDomainModule;
