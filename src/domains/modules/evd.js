import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/evd.js";

export const evdDomainModule = defineDomainModule({
  module_id: "evd",
  namespace: "EVD",
  title: "Evidence Parity & Media Grounding",
  description: "PDF, transcript, image, and media evidence parity.",
  conditions: detectors.filter((d) => d.namespace === "EVD"),
  observation_kinds: ["media_pdf","media_transcript","media_image"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "evd",
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

export default evdDomainModule;
