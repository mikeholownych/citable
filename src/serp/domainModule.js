import { defineDomainModule } from "../domains/interface.js";

/**
 * SERP Domain Module definition (B-040, B-050..B-056).
 * Demonstrates pluggable domain extension into the domain registry.
 */
export const serpDomainModule = defineDomainModule({
  module_id: "domain-serp",
  namespace: "SERP",
  title: "SERP & AI Search Intelligence Domain",
  description: "Continuous observation, normalization, change detection, and cross-provider reliability validation of search engine result surfaces (B-050..B-056).",
  conditions: [],
  observation_kinds: [
    "serp_observation",
    "serp_change",
    "serp_cross_provider_divergence",
  ],
  collectors: {
    dataforseo: {
      adapter: "DataForSeoSerpAdapter",
      supported_engines: ["google", "bing", "yahoo"],
    },
    brightdata: {
      adapter: "BrightDataSerpAdapter",
      supported_engines: ["google", "bing"],
    },
  },
  report_projections: {
    change_summary: (report) => ({
      report_id: report.report_id,
      status: report.status,
      change_count: report.changes?.length ?? 0,
    }),
    reliability: (div) => ({
      validation_id: div.validation_id,
      divergence_score: div.metrics?.divergence_score,
      correlation: div.metrics?.spearman_rank_correlation,
    }),
  },
  gating: {
    requires_profile: null,
    disallowed_profiles: [],
  },
});
