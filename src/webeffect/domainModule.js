import { defineDomainModule } from "../domains/interface.js";

/**
 * WebEffect Domain Module definition (B-040, B-070..B-075).
 * Connects website effectiveness validation domains into the central registry.
 */
export const webeffectDomainModule = defineDomainModule({
  module_id: "domain-webeffect",
  namespace: "WEBEFFECT",
  title: "Website Effectiveness & Conversion Integrity Domain",
  description: "Continuous observation, semantic event validation, duplicate fire detection, attribution continuity, consent state differential observation, commerce fact consistency, and third-party dependency analysis (B-070..B-075).",
  conditions: [],
  observation_kinds: [
    "canonical_event_validation",
    "attribution_continuity",
    "consent_state_differential",
    "commerce_fact_consistency",
    "third_party_dependency_graph",
  ],
  collectors: {
    browser_telemetry: {
      type: "network_observer",
      supported_events: ["purchase", "lead_capture", "add_to_cart", "page_view"],
    },
    consent_observer: {
      type: "state_differential",
      states: ["before_consent", "after_reject", "after_accept", "after_withdrawal"],
    },
  },
  report_projections: {
    event_integrity: (report) => ({
      registry_id: report.registry_id,
      violations_count: report.validation_summary?.semantic_violations?.length ?? 0,
      duplicates_count: report.validation_summary?.duplicates_detected?.length ?? 0,
    }),
    attribution_health: (attr) => ({
      report_id: attr.report_id,
      attribution_intact: attr.attribution_intact,
      loss_points_count: attr.loss_points?.length ?? 0,
    }),
    commerce_consistency: (cmm) => ({
      evaluation_id: cmm.evaluation_id,
      is_consistent: cmm.is_consistent,
      contradictions_count: cmm.contradictions?.length ?? 0,
    }),
  },
  gating: {
    requires_profile: null,
    disallowed_profiles: [],
  },
});
