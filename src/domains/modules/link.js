import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/link.js";

export const linkDomainModule = defineDomainModule({
  module_id: "link",
  namespace: "LINK",
  title: "Internal Links & Navigation",
  description: "Internal anchor text, navigation pathways, and redirect chains.",
  conditions: detectors.filter((d) => d.namespace === "LINK"),
  observation_kinds: ["index","crawler_probe"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "link",
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

export default linkDomainModule;
