import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

import {
  createOutreachOpportunity,
  updateOpportunityHypothesis,
  qualifyDomainAndPage,
  isOpportunityFullyQualified,
  AssetInventory,
  evaluateLinkableAssets,
  resolvePublicContact,
  OutreachSuppressionRegistry,
  draftOutreachMessage,
  verifyDraftForFabrication,
  OutreachDeliverabilityMonitor,
  verifyAcquiredLink,
  updateLinkLifecycleObservation,
  calculateAcquisitionEconomics,
  aggregateStrategyPerformance,
  outreachDomainModule,
} from "../../src/outreach/index.js";

import { authorizeOutreachExecution } from "../../src/authorize/index.js";

/* -------------------------------------------------------------------------- */
/* B-080: Opportunity Discovery with Preserved Evidence                       */
/* -------------------------------------------------------------------------- */

test("B-080: opportunity preserves raw observation and derived hypothesis separately", () => {
  const rawObs = {
    source_url: "https://partner-blog.example/top-tools",
    target_domain: "partner-blog.example",
    collector: "ResourcePageCrawler",
    collector_version: "2.1.0",
    observed_at: "2026-09-26T04:00:00.000Z",
    raw_evidence_snippet: "Top Recommended Analytics Tools: CompetitorA, CompetitorB",
  };

  const hypothesis = {
    opportunity_type: "COMPETITOR_LINK_GAP",
    rationale: "Publisher lists competing tools; our benchmark asset provides stronger data",
    suggested_asset_type: "BENCHMARK_REPORT",
    derived_at: "2026-09-26T04:05:00.000Z",
  };

  const opp = createOutreachOpportunity({
    strategy: "COMPETITOR_LINK_GAP",
    raw_observation: rawObs,
    derived_hypothesis: hypothesis,
  });

  assert.ok(opp.opportunity_id.startsWith("opp_"));
  assert.equal(opp.strategy, "COMPETITOR_LINK_GAP");
  assert.equal(opp.raw_observation.source_url, "https://partner-blog.example/top-tools");
  assert.ok(opp.raw_observation.raw_checksum);

  // Invariant: The derived hypothesis never overwrites the raw observation
  const updatedOpp = updateOpportunityHypothesis(opp, {
    opportunity_type: "RESOURCE_PAGE",
    rationale: "Reclassified after content review as curated resource directory",
    suggested_asset_type: "INTERACTIVE_TOOL",
  });

  assert.equal(updatedOpp.derived_hypothesis.opportunity_type, "RESOURCE_PAGE");
  assert.equal(updatedOpp.raw_observation.raw_evidence_snippet, opp.raw_observation.raw_evidence_snippet);
  assert.equal(updatedOpp.raw_observation.raw_checksum, opp.raw_observation.raw_checksum);

  // Validate against schema
  const check = validateAgainst("outreach-opportunity.schema.json", opp);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-081: Separate Domain and Page Qualification                              */
/* -------------------------------------------------------------------------- */

test("B-081: high-authority domain with a low-quality links page is not high-value", () => {
  // Domain has high authority metrics (e.g. DR 85 from Ahrefs, DA 80 from Moz)
  const thirdPartyMetrics = [
    { provider: "Ahrefs", metric_name: "DR", value: 85, retrieved_at: "2026-09-26T03:00:00.000Z" },
    { provider: "Moz", metric_name: "DA", value: 80, retrieved_at: "2026-09-26T03:00:00.000Z" },
  ];

  // Case 1: High authority domain, but the specific target page is a low-quality link farm
  const qualResult = qualifyDomainAndPage({
    domain: "authoritative-hub.example",
    domainData: {
      status: "QUALIFIED",
      editorial_legitimacy: "HIGH",
    },
    pageUrl: "https://authoritative-hub.example/links-directory-blast",
    pageData: {
      contextual_relevance: "IRRELEVANT",
      outbound_link_count: 145, // Excessive link farm!
      is_link_farm: true,
    },
    thirdPartyMetrics,
  });

  assert.equal(qualResult.domain_qualification.status, "QUALIFIED");
  assert.equal(qualResult.page_qualification.status, "DISQUALIFIED");
  assert.match(qualResult.page_qualification.disqualification_reason, /irrelevant/i);
  assert.equal(isOpportunityFullyQualified(qualResult), false);

  // Case 2: Both domain and page are qualified
  const validQual = qualifyDomainAndPage({
    domain: "authoritative-hub.example",
    domainData: { status: "QUALIFIED", editorial_legitimacy: "HIGH" },
    pageUrl: "https://authoritative-hub.example/industry-insights",
    pageData: { contextual_relevance: "HIGH", outbound_link_count: 12 },
    thirdPartyMetrics,
  });

  assert.equal(validQual.domain_qualification.status, "QUALIFIED");
  assert.equal(validQual.page_qualification.status, "QUALIFIED");
  assert.equal(isOpportunityFullyQualified(validQual), true);
  assert.equal(validQual.third_party_metrics.length, 2);
});

/* -------------------------------------------------------------------------- */
/* B-082: Asset Inventory, Linkability, and ASSET_GAP                         */
/* -------------------------------------------------------------------------- */

test("B-082: concludes NO_LINKABLE_ASSET rather than fabricating an outreach angle", () => {
  const inventory = new AssetInventory([
    {
      asset_id: "ast_seo_benchmark_2026",
      canonical_url: "https://mysite.example/research/seo-benchmarks",
      topics: ["seo", "benchmarks", "technical seo"],
      allowed_strategies: ["RESOURCE_PAGE", "EDITORIAL_REFERENCE"],
      evidence_quality: "HIGH",
      originality: "HIGH",
    },
  ]);

  // Case 1: Topic and strategy match owned asset
  const matched = inventory.evaluateLinkableAssetForOpportunity({
    strategy: "RESOURCE_PAGE",
    topic: "technical seo",
  });
  assert.equal(matched.has_linkable_asset, true);
  assert.equal(matched.matched_asset_id, "ast_seo_benchmark_2026");
  assert.equal(matched.asset_gap, false);

  // Case 2: No owned asset matches topic; concludes NO_LINKABLE_ASSET
  const gap = inventory.evaluateLinkableAssetForOpportunity({
    strategy: "RESOURCE_PAGE",
    topic: "veterinary medicine",
  });
  assert.equal(gap.has_linkable_asset, false);
  assert.equal(gap.matched_asset_id, null);
  assert.equal(gap.asset_gap, true);
  assert.match(gap.gap_description, /NO_LINKABLE_ASSET/);
  assert.match(gap.gap_description, /Fabricated angle prohibited/);
});

/* -------------------------------------------------------------------------- */
/* B-083: Public Contact Resolution                                           */
/* -------------------------------------------------------------------------- */

test("B-083: contact evidence retains source, private data not inferred, billing rejected", () => {
  // Case 1: Inferred private data without public source is refused
  const inferred = resolvePublicContact({
    targetDomain: "publisher.example",
    candidateContact: { email: "john@publisher.example", is_inferred: true },
    sourceEvidence: {},
  });
  assert.equal(inferred.resolved, false);
  assert.match(inferred.refusal_reason, /PRIVATE_DATA_INFERRED/);

  // Case 2: Billing address repurposed as editorial contact is refused
  const billing = resolvePublicContact({
    targetDomain: "publisher.example",
    candidateContact: { email: "billing@publisher.example", role: "BILLING" },
    sourceEvidence: {
      source_url: "https://publisher.example/contact",
      evidence_snippet: "For invoices: billing@publisher.example",
    },
  });
  assert.equal(billing.resolved, false);
  assert.match(billing.refusal_reason, /BILLING_ADDRESS_REJECTED/);

  // Case 3: Legitimate public editorial contact with crawl source
  const valid = resolvePublicContact({
    targetDomain: "publisher.example",
    candidateContact: { email: "editor@publisher.example", name: "Jane Editor", role: "EDITORIAL" },
    sourceEvidence: {
      source_url: "https://publisher.example/editorial-team",
      evidence_snippet: "Managing Editor: Jane Editor (editor@publisher.example)",
      retrieved_at: "2026-09-26T04:00:00.000Z",
    },
  });
  assert.equal(valid.resolved, true);
  assert.equal(valid.contact.email, "editor@publisher.example");
  assert.equal(valid.contact.source_evidence.source_url, "https://publisher.example/editorial-team");
});

/* -------------------------------------------------------------------------- */
/* B-084: Suppression Registry, Deduplication, Frequency Control               */
/* -------------------------------------------------------------------------- */

test("B-084: suppression overrides campaign logic and prevents duplicate agent outreach", () => {
  const registry = new OutreachSuppressionRegistry();
  registry.suppressEmail("unsubscribed@publisher.example", "UNSUBSCRIBED");

  // Invariant 1: Suppression overrides campaign logic
  const suppressedAttempt = registry.reserveEngagement({
    agentId: "agent_alpha",
    opportunityId: "opp_100",
    recipientEmail: "unsubscribed@publisher.example",
  });
  assert.equal(suppressedAttempt.allowed, false);
  assert.match(suppressedAttempt.reason, /SUPPRESSED/);

  // Invariant 2: Two agents cannot independently contact the same editor for same opportunity
  const firstAgent = registry.reserveEngagement({
    agentId: "agent_alpha",
    opportunityId: "opp_200",
    recipientEmail: "editor@publisher.example",
  });
  assert.equal(firstAgent.allowed, true);

  const secondAgent = registry.reserveEngagement({
    agentId: "agent_beta",
    opportunityId: "opp_200",
    recipientEmail: "editor@publisher.example",
  });
  assert.equal(secondAgent.allowed, false);
  assert.match(secondAgent.reason, /DEDUPLICATION_CONFLICT/);

  // Frequency capping after contact is sent
  registry.recordContactSent("editor@publisher.example");
  registry.releaseEngagement("opp_200", "editor@publisher.example");

  const recentAttempt = registry.reserveEngagement({
    agentId: "agent_alpha",
    opportunityId: "opp_300",
    recipientEmail: "editor@publisher.example",
    cooldownDays: 30,
  });
  assert.equal(recentAttempt.allowed, false);
  assert.match(recentAttempt.reason, /FREQUENCY_CAP_EXCEEDED/);
});

/* -------------------------------------------------------------------------- */
/* B-085: Outreach Drafting with Full Provenance                               */
/* -------------------------------------------------------------------------- */

test("B-085: rejects fabricated familiarity, unverified statistics, and false relationships", () => {
  // Case 1: Fabricated familiarity
  const draftWithFamiliarity = draftOutreachMessage({
    opportunityId: "opp_123",
    recipientEmail: "editor@publisher.example",
    subject: "Loved your work!",
    bodyText: "I am a long-time reader of your blog and love everything you publish.",
    provenance: { strategy: "RESOURCE_PAGE" },
  });
  assert.equal(draftWithFamiliarity.authorization_status, "REJECTED");
  assert.equal(draftWithFamiliarity.fabrication_verification.passed, false);
  assert.equal(draftWithFamiliarity.fabrication_verification.fabricated_familiarity_detected, true);

  // Case 2: Fabricated relationship
  const draftWithRelationship = draftOutreachMessage({
    opportunityId: "opp_123",
    recipientEmail: "editor@publisher.example",
    subject: "Follow up",
    bodyText: "Per our mutual friend Sarah, I am reaching out to share our dataset.",
    provenance: { strategy: "EDITORIAL_REFERENCE" },
  });
  assert.equal(draftWithRelationship.authorization_status, "REJECTED");
  assert.equal(draftWithRelationship.fabrication_verification.fabricated_relationship_detected, true);

  // Case 3: Unverified statistics without evidence IDs
  const draftWithStats = draftOutreachMessage({
    opportunityId: "opp_123",
    recipientEmail: "editor@publisher.example",
    subject: "Benchmark Data",
    bodyText: "Our benchmark revealed that 87% of websites fail core web vitals.",
    provenance: { strategy: "RESOURCE_PAGE", evidence_ids: [] },
  });
  assert.equal(draftWithStats.authorization_status, "REJECTED");
  assert.equal(draftWithStats.fabrication_verification.unverified_statistics_detected, true);

  // Case 4: Clean draft with evidence IDs
  const cleanDraft = draftOutreachMessage({
    opportunityId: "opp_123",
    recipientEmail: "editor@publisher.example",
    subject: "Technical SEO benchmark dataset for your resource page",
    bodyText: "We reviewed your recent resource list on Core Web Vitals and compiled an open dataset.",
    provenance: {
      strategy: "RESOURCE_PAGE",
      template_id: "tmpl_resource_v2",
      model_id: "model_citable_v1",
      prompt_version: "v2.1.0",
      evidence_ids: ["evd_cwv_study_2026"],
    },
  });
  assert.equal(cleanDraft.authorization_status, "DRAFT_UNAUTHORIZED");
  assert.equal(cleanDraft.fabrication_verification.passed, true);

  const check = validateAgainst("outreach-message.schema.json", cleanDraft);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-086: Execution Boundary and Authorization Guard                          */
/* -------------------------------------------------------------------------- */

test("B-086: recommendation does not authorize sending; budget exhaustion fails closed", () => {
  // Case 1: Draft without human approval fails closed
  const unapproved = authorizeOutreachExecution({
    action_type: "SEND_OUTREACH_MESSAGE",
    target_resource_id: "msg_drf_123",
    explicit_human_approval: false,
  });
  assert.equal(unapproved.status, "REFUSED_NOT_AUTHORIZED");
  assert.match(unapproved.refusal_reason, /requires explicit human authorization/);

  // Case 2: Target is suppressed
  const suppressed = authorizeOutreachExecution(
    {
      action_type: "SEND_OUTREACH_MESSAGE",
      target_resource_id: "msg_drf_123",
      explicit_human_approval: true,
      approved_by: "lead_operator",
    },
    { is_suppressed: true }
  );
  assert.equal(suppressed.status, "REFUSED_SUPPRESSED");

  // Case 3: Circuit breaker is tripped
  const tripped = authorizeOutreachExecution(
    {
      action_type: "SEND_OUTREACH_MESSAGE",
      target_resource_id: "msg_drf_123",
      explicit_human_approval: true,
      approved_by: "lead_operator",
    },
    { circuit_breaker_tripped: true }
  );
  assert.equal(tripped.status, "REFUSED_CIRCUIT_BREAKER_ACTIVE");

  // Case 4: Budget exhaustion fails closed
  const overBudget = authorizeOutreachExecution(
    {
      action_type: "EXECUTE_PAID_PLACEMENT",
      target_resource_id: "opp_placement_456",
      requested_cost_minor_units: 50000,
      explicit_human_approval: true,
      approved_by: "finance_director",
    },
    { remaining_project_budget_minor_units: 20000 }
  );
  assert.equal(overBudget.status, "REFUSED_BUDGET_EXHAUSTED");

  // Case 5: Authorized
  const authorized = authorizeOutreachExecution(
    {
      action_type: "SEND_OUTREACH_MESSAGE",
      target_resource_id: "msg_drf_123",
      explicit_human_approval: true,
      approved_by: "lead_operator",
      requested_cost_minor_units: 500,
    },
    { remaining_project_budget_minor_units: 10000 }
  );
  assert.equal(authorized.status, "AUTHORIZED");
  assert.equal(authorized.budget_enforcement.authorized_minor_units, 500);

  const check = validateAgainst("outreach-authorization.schema.json", authorized);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-087: Sending Controls, Deliverability, Circuit Breaker, Kill Switches    */
/* -------------------------------------------------------------------------- */

test("B-087: deliverability breach trips circuit breaker and 6-level kill switches stop campaign", () => {
  const monitor = new OutreachDeliverabilityMonitor("campaign_alpha", {
    bounceThreshold: 0.05,
    spamComplaintThreshold: 0.001,
  });

  // 1. Deliverability breach trips circuit breaker
  monitor.updateDeliverabilityMetrics({
    spf_valid: true,
    dkim_valid: true,
    dmarc_aligned: true,
    bounce_rate: 0.08, // Breaches 0.05 threshold!
    spam_complaint_rate: 0.0005,
  });

  assert.equal(monitor.circuitBreaker.state, "TRIPPED_HALTED");
  assert.equal(monitor.isExecutionHalted().halted, true);

  // Reauthorization clears circuit breaker
  monitor.reauthorizeCircuitBreaker("compliance_officer_42");
  assert.equal(monitor.circuitBreaker.state, "EXPLICITLY_REAUTHORIZED");
  assert.equal(monitor.isExecutionHalted().halted, false);

  // 2. Kill switches across 6 levels: organization, sender, campaign, strategy, agent, domain
  monitor.setKillSwitch("strategy", true);
  assert.equal(monitor.isExecutionHalted({ strategy: true }).halted, true);
  assert.equal(monitor.isExecutionHalted({ agent: true }).halted, false);

  monitor.setKillSwitch("strategy", false);
  monitor.setKillSwitch("organization", true);
  assert.equal(monitor.isExecutionHalted().halted, true);

  const state = monitor.getState({ total_suppressed_contacts: 14, frequency_cap_contacts: 3 });
  const check = validateAgainst("outreach-campaign-state.schema.json", state);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-088: Independent Link Verification and Lifecycle                         */
/* -------------------------------------------------------------------------- */

test("B-088: publisher claim alone is not verification; follow to nofollow preserves history", () => {
  const sourceUrl = "https://publisher.example/resources";
  const targetUrl = "https://mysite.example/benchmark";

  // Case 1: Publisher claims link is placed, but crawl HTML does not contain it
  const unverified = verifyAcquiredLink({
    opportunityId: "opp_101",
    sourceUrl,
    targetUrl,
    htmlContent: "<html><body><p>Welcome to our resource page. Check back soon!</p></body></html>",
    publisherClaim: { confirmed: true, note: "Link is live!" },
  });
  assert.equal(unverified.current_state, "LOST");
  assert.equal(unverified.independent_verification.publisher_claim_ignored_as_proof, true);

  // Case 2: Link is present in crawl HTML with follow
  const htmlWithFollow = `<html><body><p>See the <a href="${targetUrl}">2026 SEO Benchmark</a> for details.</p></body></html>`;
  const verifiedFollow = verifyAcquiredLink({
    opportunityId: "opp_101",
    sourceUrl,
    targetUrl,
    htmlContent: htmlWithFollow,
  });
  assert.equal(verifiedFollow.current_state, "ACTIVE_FOLLOW");
  assert.equal(verifiedFollow.independent_verification.verified_anchor_text, "2026 SEO Benchmark");

  // Case 3: Transition from follow to nofollow preserves both observations
  const htmlWithNoFollow = `<html><body><p>See the <a href="${targetUrl}" rel="nofollow">2026 SEO Benchmark</a> for details.</p></body></html>`;
  const updatedRecord = updateLinkLifecycleObservation(verifiedFollow, htmlWithNoFollow);

  assert.equal(updatedRecord.current_state, "ACTIVE_NOFOLLOW");
  assert.equal(updatedRecord.lifecycle_history.length, 2);
  assert.equal(updatedRecord.lifecycle_history[0].state, "ACTIVE_FOLLOW");
  assert.equal(updatedRecord.lifecycle_history[1].state, "ACTIVE_NOFOLLOW");

  // Case 4: Link lost on subsequent crawl
  const htmlLost = "<html><body><p>Resource list refreshed.</p></body></html>";
  const lostRecord = updateLinkLifecycleObservation(updatedRecord, htmlLost);
  assert.equal(lostRecord.current_state, "LOST");
  assert.equal(lostRecord.lifecycle_history.length, 3);

  const check = validateAgainst("outreach-link-lifecycle.schema.json", lostRecord);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-089: Strategy Performance and Acquisition Economics                      */
/* -------------------------------------------------------------------------- */

test("B-089: outcomes attribute to strategy with economics; ranking causation is never asserted", () => {
  const economics = calculateAcquisitionEconomics({
    strategy: "RESOURCE_PAGE",
    costItems: {
      research_cost_minor_units: 5000,
      content_cost_minor_units: 15000,
      outreach_cost_minor_units: 10000,
      tooling_cost_minor_units: 2000,
    },
    acquiredLinksCount: 4,
    qualifiedReferralVisits: 800,
  });

  assert.equal(economics.total_acquisition_cost_minor_units, 32000);
  assert.equal(economics.cost_per_acquired_link_minor_units, 8000);
  assert.equal(economics.cost_per_qualified_referral_minor_units, 40);
  assert.equal(economics.ranking_causation_claimed, false);

  // Invariant: ranking causation claim is strictly prohibited
  assert.throws(
    () => {
      calculateAcquisitionEconomics({
        strategy: "RESOURCE_PAGE",
        rankingCausationClaimed: true,
      });
    },
    /RANKING_CAUSATION_PROHIBITED/
  );

  // Aggregate across multiple records
  const aggregated = aggregateStrategyPerformance([
    economics,
    {
      strategy: "RESOURCE_PAGE",
      total_acquisition_cost_minor_units: 18000,
      acquired_links_count: 2,
      qualified_referral_visits: 200,
    },
    {
      strategy: "BROKEN_LINK",
      total_acquisition_cost_minor_units: 10000,
      acquired_links_count: 1,
      qualified_referral_visits: 100,
    },
  ]);

  const resourceAgg = aggregated.find((a) => a.strategy === "RESOURCE_PAGE");
  assert.equal(resourceAgg.total_acquisition_cost_minor_units, 50000);
  assert.equal(resourceAgg.acquired_links_count, 6);
  assert.equal(resourceAgg.qualified_referral_visits, 1000);
  assert.equal(resourceAgg.cost_per_acquired_link_minor_units, Math.round(50000 / 6));
  assert.equal(resourceAgg.ranking_causation_claimed, false);
});

/* -------------------------------------------------------------------------- */
/* Domain Module Integration                                                  */
/* -------------------------------------------------------------------------- */

test("Outreach Domain Module satisfies domain module contract", () => {
  assert.equal(outreachDomainModule.module_id, "domain-outreach");
  assert.equal(outreachDomainModule.namespace, "OUTREACH");
  assert.ok(outreachDomainModule.observation_kinds.includes("outreach_opportunity"));

  const check = validateAgainst("domain-module.schema.json", outreachDomainModule);
  assert.equal(check.valid, true, check.errors?.join("; "));
});
