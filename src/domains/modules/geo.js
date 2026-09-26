import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/geoReco.js";

export const geoDomainModule = defineDomainModule({
  module_id: "geo",
  namespace: "GEO",
  title: "Generative Engine Optimization",
  description: "AI engine answer stances, citation stability, and RAG chunkability.",
  conditions: detectors.filter((d) => d.namespace === "GEO"),
  observation_kinds: ["citation","representation_drift","stance"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "geo",
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

export default geoDomainModule;
