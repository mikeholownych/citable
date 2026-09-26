import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/schemaData.js";

export const schemaDomainModule = defineDomainModule({
  module_id: "schema",
  namespace: "SCHEMA",
  title: "Structured Data & Schema.org",
  description: "JSON-LD graph validity, Schema.org conformance, and rich result readiness.",
  conditions: detectors.filter((d) => d.namespace === "SCHEMA"),
  observation_kinds: ["canonical_freshness","passage"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "schema",
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

export default schemaDomainModule;
