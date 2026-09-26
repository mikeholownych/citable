import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/claim.js";

export const claimDomainModule = defineDomainModule({
  module_id: "claim",
  namespace: "CLAIM",
  title: "Claim Governance & Substantiation",
  description: "Material claim identification, grounding, and verification.",
  conditions: detectors.filter((d) => d.namespace === "CLAIM"),
  observation_kinds: ["citation","attribution"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "claim",
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

export default claimDomainModule;
