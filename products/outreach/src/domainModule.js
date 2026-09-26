import { defineDomainModule } from "../../../src/domains/interface.js";

/**
 * Outreach Domain Module definition (B-040, B-080..B-089).
 * Connects outreach, backlink qualification, and authorization domains into the central registry.
 */
export const outreachDomainModule = defineDomainModule({
  module_id: "domain-outreach",
  namespace: "OUTREACH",
  title: "Outreach & Backlink Acquisition Domain",
  description: "Evidence-backed backlink opportunity discovery, separate domain/page qualification, asset inventory linkability, public contact resolution, suppression & cross-agent deduplication, drafting provenance, sending controls with reputation circuit breakers, independent HTML crawl verification, and non-causal strategy economics (B-080..B-089).",
  conditions: [],
  observation_kinds: [
    "outreach_opportunity",
    "outreach_message",
    "outreach_authorization",
    "outreach_campaign_state",
    "outreach_link_lifecycle",
  ],
  collectors: {
    opportunity_crawler: {
      adapter: "HtmlOpportunityCollector",
      supported_strategies: [
        "RESOURCE_PAGE",
        "BROKEN_LINK",
        "UNLINKED_MENTION",
        "COMPETITOR_LINK_GAP",
        "EDITORIAL_REFERENCE",
        "PARTNERSHIP",
      ],
    },
    link_verifier: {
      adapter: "DirectCrawlLinkVerifier",
      observation_modes: ["DIRECT_CRAWL_OBSERVATION", "CONTROLLED_HTML_PARSER"],
    },
  },
  report_projections: {
    opportunity_summary: (opp) => ({
      opportunity_id: opp.opportunity_id,
      strategy: opp.strategy,
      is_qualified:
        opp.qualification?.domain_qualification?.status === "QUALIFIED" &&
        opp.qualification?.page_qualification?.status === "QUALIFIED",
      has_asset: Boolean(opp.asset_evaluation?.has_linkable_asset),
    }),
    link_health: (link) => ({
      link_id: link.link_id,
      current_state: link.current_state,
      verified_anchor: link.independent_verification?.verified_anchor_text,
    }),
    campaign_health: (state) => ({
      campaign_id: state.campaign_id,
      circuit_breaker: state.circuit_breaker?.state,
      is_halted: Object.values(state.kill_switches || {}).some(Boolean),
    }),
  },
  gating: {
    requires_profile: null,
    disallowed_profiles: [],
  },
});
