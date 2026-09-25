import { defineDomainModule } from "../interface.js";
import { hreflangDetectors as detectors } from "../../detectors/hreflang.js";

export const hreflangDomainModule = defineDomainModule({
  module_id: "hreflang",
  namespace: "HREFLANG",
  title: "Internationalization & Hreflang",
  description: "Multilingual clusters, language annotations, and regional targeting.",
  conditions: detectors.filter((d) => d.namespace === "HREFLANG"),
  observation_kinds: ["canonical_freshness","regional_network"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "hreflang",
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

export default hreflangDomainModule;
