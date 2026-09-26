import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/geoReco.js";

export const recoDomainModule = defineDomainModule({
  module_id: "reco",
  namespace: "RECO",
  title: "Recommendation & Citations",
  description: "Model recommendation posture, comparison mentions, and entity alignment.",
  conditions: detectors.filter((d) => d.namespace === "RECO"),
  observation_kinds: ["citation","stance"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "reco",
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

export default recoDomainModule;
