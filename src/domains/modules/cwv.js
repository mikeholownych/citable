import { defineDomainModule } from "../interface.js";
import { cwvDetectors as detectors } from "../../detectors/cwv.js";

export const cwvDomainModule = defineDomainModule({
  module_id: "cwv",
  namespace: "CWV",
  title: "Core Web Vitals & Performance",
  description: "Static speed signals, render blocking assets, and layout stability.",
  conditions: detectors.filter((d) => d.namespace === "CWV"),
  observation_kinds: ["performance"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "cwv",
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

export default cwvDomainModule;
