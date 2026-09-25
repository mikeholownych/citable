import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/entity.js";

export const entityDomainModule = defineDomainModule({
  module_id: "entity",
  namespace: "ENTITY",
  title: "Entity Resolution & Grounding",
  description: "Knowledge graph entities, disambiguation, and identity resolution.",
  conditions: detectors.filter((d) => d.namespace === "ENTITY"),
  observation_kinds: ["citation","corroboration"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "entity",
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

export default entityDomainModule;
