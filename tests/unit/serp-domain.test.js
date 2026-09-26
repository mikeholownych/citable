import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

import {
  createSerpContext,
  buildSerpObservationKey,
  areSerpContextsComparable,
  normalizeQuery,
  classifyFeatureType,
  extractDomainFromUrl,
  normalizeSerpElements,
  KNOWN_FEATURE_TYPES,
  extractAiOverviewModel,
  classifyDomainAiRelationship,
  AI_RELATIONSHIP,
  BaseSerpAdapter,
  DataForSeoSerpAdapter,
  BrightDataSerpAdapter,
  detectSerpChanges,
  measureProviderDisagreement,
  serpDomainModule,
} from "../../src/serp/index.js";

import { SerpBudgetManager } from "../../src/authorize/index.js";

/* -------------------------------------------------------------------------- */
/* B-050: Observation Context Envelope & Comparability Guard                   */
/* -------------------------------------------------------------------------- */

test("B-050: createSerpContext enforces query normalization and addressing envelope", () => {
  const ctx = createSerpContext({
    query_text: "  Best  CRM Software  ",
    engine: "google",
    search_surface: "organic",
    device: "desktop",
    language: "en",
    country: "US",
    city: "San Francisco",
    region: "California",
  });

  assert.equal(ctx.query_text, "Best  CRM Software");
  assert.equal(ctx.query_normalized, "best crm software");
  assert.equal(ctx.engine, "google");
  assert.equal(ctx.device, "desktop");
  assert.equal(ctx.location.country, "US");
  assert.equal(ctx.location.city, "San Francisco");
  assert.ok(ctx.query_id.startsWith("qry_"));

  const key1 = buildSerpObservationKey(ctx);
  const key2 = buildSerpObservationKey(createSerpContext({
    query_text: "best crm software",
    engine: "google",
    device: "desktop",
    country: "US",
    city: "San Francisco",
    region: "California",
  }));
  assert.equal(key1, key2, "identical normalized parameters must yield identical observation addressing key");

  // Invalid device fails closed
  assert.throws(() => createSerpContext({ query_text: "test", device: "smartwatch" }), /invalid device/);
});

test("B-050: areSerpContextsComparable enforces strict comparability guards", () => {
  const desktopUS = createSerpContext({
    query_text: "enterprise cloud security",
    engine: "google",
    device: "desktop",
    country: "US",
  });

  const mobileUS = createSerpContext({
    query_text: "enterprise cloud security",
    engine: "google",
    device: "mobile",
    country: "US",
  });

  const countryOnlyCA = createSerpContext({
    query_text: "enterprise cloud security",
    engine: "google",
    device: "desktop",
    country: "CA",
  });

  const cityTorontoCA = createSerpContext({
    query_text: "enterprise cloud security",
    engine: "google",
    device: "desktop",
    country: "CA",
    city: "Toronto",
  });

  const cityVancouverCA = createSerpContext({
    query_text: "enterprise cloud security",
    engine: "google",
    device: "desktop",
    country: "CA",
    city: "Vancouver",
  });

  // 1. Desktop vs Mobile: MUST NOT be comparable
  const devCheck = areSerpContextsComparable(desktopUS, mobileUS);
  assert.equal(devCheck.comparable, false);
  assert.match(devCheck.reason, /device mismatch/i);

  // 2. City vs Country: MUST NOT be comparable
  const granCheck = areSerpContextsComparable(countryOnlyCA, cityTorontoCA);
  assert.equal(granCheck.comparable, false);
  assert.match(granCheck.reason, /location granularity mismatch/i);

  // 3. Different Cities: MUST NOT be comparable
  const cityCheck = areSerpContextsComparable(cityTorontoCA, cityVancouverCA);
  assert.equal(cityCheck.comparable, false);
  assert.match(cityCheck.reason, /city mismatch/i);

  // 4. Identical parameters: Comparable
  const sameCheck = areSerpContextsComparable(cityTorontoCA, { ...cityTorontoCA });
  assert.equal(sameCheck.comparable, true);
  assert.equal(sameCheck.reason, null);
});

/* -------------------------------------------------------------------------- */
/* B-051: Provider Adapter Interface & Canonical SERP Schema                   */
/* -------------------------------------------------------------------------- */

test("B-051: BaseSerpAdapter enforces abstract contract", () => {
  assert.throws(() => new BaseSerpAdapter("test"), TypeError);
});

test("B-051: DataForSeo and BrightData adapters normalize to canonical schema", () => {
  const dfsAdapter = new DataForSeoSerpAdapter();
  const rawDfsPayload = {
    version: "0.1.20230501",
    status_code: 20000,
    status_message: "Ok.",
    time: "0.4500 sec.",
    tasks: [
      {
        id: "09251833-2849-0216-0000-c9fa49ff411a",
        status_code: 20000,
        time_taken: 0.45,
        cost: 0.002,
        data: {
          keyword: "enterprise crm",
          se: "google",
          device: "desktop",
          language_code: "en",
        },
        datetime: "2026-09-25T14:30:00.000Z",
        result: [
          {
            keyword: "enterprise crm",
            items: [
              {
                type: "organic",
                rank_group: 1,
                rank_absolute: 1,
                domain: "salesforce.com",
                title: "What is CRM? - Salesforce",
                url: "https://www.salesforce.com/crm/",
                snippet: "Learn all about CRM systems...",
              },
              {
                type: "organic",
                rank_group: 2,
                rank_absolute: 2,
                domain: "hubspot.com",
                title: "HubSpot CRM Software",
                url: "https://www.hubspot.com/products/crm",
                snippet: "Free CRM tool for modern teams...",
              },
            ],
          },
        ],
      },
    ],
  };

  const dfsObs = dfsAdapter.normalize(rawDfsPayload, { country: "US" });
  assert.equal(dfsObs.provider.name, "dataforseo");
  assert.equal(dfsObs.collection_status, "SUCCESS");
  assert.equal(dfsObs.elements.length, 2);
  assert.equal(dfsObs.elements[0].rank_absolute, 1);
  assert.equal(dfsObs.elements[0].domain, "salesforce.com");

  const checkDfs = validateAgainst("serp-observation.schema.json", dfsObs);
  assert.equal(checkDfs.valid, true, checkDfs.errors?.join("; "));

  // BrightData Adapter
  const bdAdapter = new BrightDataSerpAdapter();
  const rawBdPayload = {
    general: {
      search_engine: "google",
      query: "enterprise crm",
      results_cnt: 2,
      timestamp: "2026-09-25T14:30:00.000Z",
    },
    request_id: "req_bd_7739",
    cost_usd: 0.003,
    organic: [
      {
        pos: 1,
        link: "https://www.salesforce.com/crm/",
        title: "What is CRM? - Salesforce",
        description: "Learn all about CRM systems...",
      },
      {
        pos: 2,
        link: "https://www.microsoft.com/dynamics-365",
        title: "Microsoft Dynamics 365 CRM",
        description: "Enterprise intelligent CRM...",
      },
    ],
    ai_overview: {
      present: true,
      text_blocks: ["CRM software helps manage relationships and interactions with customers."],
      citations: [
        {
          index: 1,
          url: "https://www.salesforce.com/crm/",
          domain: "salesforce.com",
          title: "Salesforce CRM Guide",
        },
      ],
      mentions: [{ entity: "Salesforce", brand: "Salesforce", url_linked: true }],
      follow_up_queries: ["What does CRM stand for?"],
    },
  };

  const bdObs = bdAdapter.normalize(rawBdPayload, { country: "US", device: "desktop" });
  assert.equal(bdObs.provider.name, "brightdata");
  assert.equal(bdObs.collection_status, "SUCCESS");
  assert.equal(bdObs.elements.length, 2);
  assert.ok(bdObs.ai_overview);
  assert.equal(bdObs.ai_overview.citations.length, 1);

  const checkBd = validateAgainst("serp-observation.schema.json", bdObs);
  assert.equal(checkBd.valid, true, checkBd.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-052: SERP Element Model with Unknown-Feature Retention                   */
/* -------------------------------------------------------------------------- */

test("B-052: unrecognized features record UNKNOWN_FEATURE and retain raw evidence", () => {
  const rawItems = [
    {
      type: "organic",
      url: "https://example.test/page1",
      title: "Page 1",
    },
    {
      type: "experimental_ai_canvas_card_v9",
      label: "AI Interactive Canvas",
      data_props: { version: "beta_interactive", confidence: 0.99 },
    },
  ];

  const elements = normalizeSerpElements(rawItems, { query_id: "qry_test" });
  assert.equal(elements.length, 2);

  // Element 0: Organic
  assert.equal(elements[0].feature_type, "ORGANIC");
  assert.equal(elements[0].rank_absolute, 1);
  assert.equal(elements[0].rank_group, 1);

  // Element 1: Unrecognized -> MUST be UNKNOWN_FEATURE, NEVER mapped to ORGANIC!
  assert.equal(elements[1].feature_type, "UNKNOWN_FEATURE");
  assert.equal(elements[1].rank_absolute, 2);
  assert.equal(elements[1].rank_group, 1);
  assert.ok(elements[1].raw_evidence, "raw evidence must be retained for unknown feature");
  assert.equal(elements[1].raw_evidence.label, "AI Interactive Canvas");
});

/* -------------------------------------------------------------------------- */
/* B-053: AI Overview & AI Mode as First-Class Result Types                   */
/* -------------------------------------------------------------------------- */

test("B-053: AI Overview measures cited, mentioned, linked, and neither separately", () => {
  const aiOverview = extractAiOverviewModel({
    present: true,
    text_blocks: [
      "Enterprise security teams use SentinelOne and CrowdStrike for EDR.",
      "AcmeCorp provides endpoint threat telemetry tools.",
    ],
    citations: [
      {
        index: 1,
        url: "https://www.sentinelone.com/platform/",
        domain: "sentinelone.com",
        title: "SentinelOne Platform",
      },
    ],
    mentions: [
      { entity: "SentinelOne", brand: "SentinelOne", url_linked: true },
      { entity: "CrowdStrike", brand: "CrowdStrike", url_linked: false },
      { entity: "AcmeCorp", brand: "AcmeCorp", url_linked: false },
    ],
    follow_up_queries: ["How does EDR differ from XDR?"],
  });

  // 1. SentinelOne is CITED (has cited reference link)
  const rel1 = classifyDomainAiRelationship(aiOverview, "sentinelone.com");
  assert.equal(rel1.relationship, AI_RELATIONSHIP.CITED);
  assert.equal(rel1.is_cited, true);
  assert.equal(rel1.citation_position, 1);

  // 2. CrowdStrike is MENTIONED_ONLY (mentioned in text, not cited with reference link)
  const rel2 = classifyDomainAiRelationship(aiOverview, "crowdstrike");
  assert.equal(rel2.relationship, AI_RELATIONSHIP.MENTIONED_ONLY);
  assert.equal(rel2.is_cited, false);
  assert.equal(rel2.is_mentioned, true);
  assert.equal(rel2.citation_position, null);

  // 3. Non-existent domain is NEITHER
  const rel3 = classifyDomainAiRelationship(aiOverview, "randomdomain123.com");
  assert.equal(rel3.relationship, AI_RELATIONSHIP.NEITHER);
  assert.equal(rel3.is_cited, false);
  assert.equal(rel3.is_mentioned, false);

  // Invariant verification: citation position is recorded independently and never treated as organic rank
  assert.equal(typeof rel1.citation_position, "number");
});

/* -------------------------------------------------------------------------- */
/* B-054: Change Detection with Comparability Guard                           */
/* -------------------------------------------------------------------------- */

test("B-054: detectSerpChanges refuses incomparable observations", () => {
  const baseObs = {
    schema_version: 1,
    observation_id: "serp_obs_base000000000001",
    context: createSerpContext({
      query_text: "crm software",
      engine: "google",
      device: "desktop",
      country: "US",
    }),
    collection_status: "SUCCESS",
    elements: [],
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-01T00:00:00Z", observed_at: "2026-09-01T00:00:00Z", normalized_at: "2026-09-01T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  const mobileObs = {
    schema_version: 1,
    observation_id: "serp_obs_curr000000000002",
    context: createSerpContext({
      query_text: "crm software",
      engine: "google",
      device: "mobile", // Different device!
      country: "US",
    }),
    collection_status: "SUCCESS",
    elements: [],
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-02T00:00:00Z", observed_at: "2026-09-02T00:00:00Z", normalized_at: "2026-09-02T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  const report = detectSerpChanges(baseObs, mobileObs, { domain: "example.com" });
  assert.equal(report.status, "REFUSED_INCOMPARABLE");
  assert.equal(report.comparability_verified, false);
  assert.equal(report.changes.length, 0);

  const check = validateAgainst("serp-change-report.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-054: a failed collection NEVER reads as a ranking loss", () => {
  const baseObs = {
    schema_version: 1,
    observation_id: "serp_obs_base000000000001",
    context: createSerpContext({
      query_text: "crm software",
      engine: "google",
      device: "desktop",
      country: "US",
    }),
    collection_status: "SUCCESS",
    elements: [
      {
        element_id: "el_001",
        feature_type: "ORGANIC",
        rank_absolute: 1,
        rank_group: 1,
        domain: "salesforce.com",
        url: "https://www.salesforce.com/crm/",
      },
    ],
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-01T00:00:00Z", observed_at: "2026-09-01T00:00:00Z", normalized_at: "2026-09-01T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  const failedObs = {
    schema_version: 1,
    observation_id: "serp_obs_curr000000000002",
    context: createSerpContext({
      query_text: "crm software",
      engine: "google",
      device: "desktop",
      country: "US",
    }),
    collection_status: "COLLECTION_FAILED", // Failed collection!
    failure_reason: "Provider 504 Gateway Timeout",
    elements: [], // empty because fetch failed
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-02T00:00:00Z", observed_at: "2026-09-02T00:00:00Z", normalized_at: "2026-09-02T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  const report = detectSerpChanges(baseObs, failedObs, { domain: "salesforce.com" });
  assert.equal(report.status, "REFUSED_COLLECTION_FAILED");
  assert.equal(report.changes.length, 0, "failed collection must produce ZERO change events (never an EXIT or RANK_LOSS)");
  assert.match(report.refusal_reason, /failed or non-success collection never reads as a ranking loss/i);

  const check = validateAgainst("serp-change-report.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-054: detectSerpChanges identifies ENTRY, EXIT, RANK_GAIN, RANK_LOSS, and CITATION_LOSS", () => {
  const baseObs = {
    schema_version: 1,
    observation_id: "serp_obs_base000000000001",
    context: createSerpContext({ query_text: "cloud crm", engine: "google", device: "desktop", country: "US" }),
    collection_status: "SUCCESS",
    elements: [
      { element_id: "e1", feature_type: "ORGANIC", rank_absolute: 1, rank_group: 1, domain: "salesforce.com", url: "https://www.salesforce.com/crm/" },
      { element_id: "e2", feature_type: "ORGANIC", rank_absolute: 2, rank_group: 2, domain: "hubspot.com", url: "https://www.hubspot.com/crm" },
      { element_id: "e3", feature_type: "ORGANIC", rank_absolute: 3, rank_group: 3, domain: "zoho.com", url: "https://www.zoho.com/crm" },
    ],
    ai_overview: {
      response_present: true,
      response_text_hash: "hash1",
      text_blocks: ["CRM overview text"],
      citations: [{ index: 1, url: "https://www.hubspot.com/crm", domain: "hubspot.com" }],
      mentions: [],
      follow_up_queries: [],
    },
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-01T00:00:00Z", observed_at: "2026-09-01T00:00:00Z", normalized_at: "2026-09-01T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  const currObs = {
    schema_version: 1,
    observation_id: "serp_obs_curr000000000002",
    context: createSerpContext({ query_text: "cloud crm", engine: "google", device: "desktop", country: "US" }),
    collection_status: "SUCCESS",
    elements: [
      { element_id: "e2", feature_type: "ORGANIC", rank_absolute: 1, rank_group: 1, domain: "hubspot.com", url: "https://www.hubspot.com/crm" }, // gained 1
      { element_id: "e1", feature_type: "ORGANIC", rank_absolute: 3, rank_group: 2, domain: "salesforce.com", url: "https://www.salesforce.com/crm/" }, // lost 2
      { element_id: "e4", feature_type: "ORGANIC", rank_absolute: 4, rank_group: 3, domain: "pipedrive.com", url: "https://www.pipedrive.com/crm" }, // entered
      // zoho exited
    ],
    ai_overview: {
      response_present: true,
      response_text_hash: "hash2",
      text_blocks: ["Updated overview"],
      citations: [{ index: 1, url: "https://www.salesforce.com/crm/", domain: "salesforce.com" }], // hubspot lost citation!
      mentions: [],
      follow_up_queries: [],
    },
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-02T00:00:00Z", observed_at: "2026-09-02T00:00:00Z", normalized_at: "2026-09-02T00:00:00Z" },
    provider: { name: "test", adapter_version: "1.0.0" },
  };

  // Scope: Serp-wide
  const reportWide = detectSerpChanges(baseObs, currObs, { target_scope: { scope_type: "serp_wide", identifier: "*" } });
  assert.equal(reportWide.status, "SUCCESS");
  const eventTypes = reportWide.changes.map((c) => c.event_type);
  assert.ok(eventTypes.includes("ENTRY"), "pipedrive entered");
  assert.ok(eventTypes.includes("EXIT"), "zoho exited");
  assert.ok(eventTypes.includes("RANK_GAIN"), "hubspot gained position");
  assert.ok(eventTypes.includes("RANK_LOSS"), "salesforce lost position");

  // Scope: Hubspot domain (citation loss)
  const reportHubspot = detectSerpChanges(baseObs, currObs, { domain: "hubspot.com" });
  assert.equal(reportHubspot.status, "SUCCESS");
  const hubspotEvents = reportHubspot.changes.map((c) => c.event_type);
  assert.ok(hubspotEvents.includes("RANK_GAIN"));
  assert.ok(hubspotEvents.includes("CITATION_LOSS"), "hubspot lost AI citation");
});

/* -------------------------------------------------------------------------- */
/* B-055: Collection Scheduler with Enforced Budgets                           */
/* -------------------------------------------------------------------------- */

test("B-055: SerpBudgetManager fails closed on limits and bounds adaptive scheduling", () => {
  const manager = new SerpBudgetManager({
    project_id: "proj_client_acme",
    limits: {
      daily_cost_limit_minor_units: 100, // $1.00
      daily_request_limit: 5,
      per_query_daily_request_limit: 2,
    },
    usage: {
      period_start: "2026-09-25T00:00:00Z",
      current_cost_minor_units: 70,
      current_request_count: 3,
      query_request_counts: {
        qry_1: 1,
        qry_exhausted: 2,
      },
    },
  });

  // 1. Authorize normal request
  const auth1 = manager.authorizeCollection({ query_id: "qry_1", estimated_cost_minor_units: 20 });
  assert.equal(auth1.authorized, true);

  // 2. Query limit exceeded -> refuses
  const authQueryExceeded = manager.authorizeCollection({ query_id: "qry_exhausted", estimated_cost_minor_units: 20 });
  assert.equal(authQueryExceeded.authorized, false);
  assert.equal(authQueryExceeded.refusal_code, "REFUSED_QUERY_LIMIT_EXCEEDED");

  // 3. Project cost exceeded -> refuses
  const authCostExceeded = manager.authorizeCollection({ query_id: "qry_1", estimated_cost_minor_units: 50 }); // 70 + 50 > 100
  assert.equal(authCostExceeded.authorized, false);
  assert.equal(authCostExceeded.refusal_code, "REFUSED_PROJECT_COST_EXCEEDED");

  // 4. Record usage
  manager.recordUsage({ query_id: "qry_1", provider: "dataforseo" }, 20);
  assert.equal(manager.usage.current_cost_minor_units, 90);
  assert.equal(manager.usage.current_request_count, 4);
  assert.equal(manager.usage.query_request_counts.qry_1, 2);

  // 5. Adaptive frequency is bounded by budget
  const adaptRes = manager.requestAdaptiveFrequency("qry_1", 8.0, 60);
  assert.equal(adaptRes.capped, true);
  assert.ok(adaptRes.granted_multiplier <= 4.0, "adaptive frequency must be bounded");

  // Schema check on manager state
  const check = validateAgainst("serp-budget.schema.json", manager.toJSON());
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-056: Cross-Provider Validation Sampling                                  */
/* -------------------------------------------------------------------------- */

test("B-056: measureProviderDisagreement computes rank correlation, Jaccard, and divergence", () => {
  const obsA = {
    schema_version: 1,
    observation_id: "serp_obs_prov_a_0001",
    provider: { name: "provider_a", adapter_version: "1.0.0" },
    context: createSerpContext({ query_text: "ai search tools", engine: "google", device: "desktop", country: "US" }),
    collection_status: "SUCCESS",
    elements: [
      { element_id: "a1", feature_type: "ORGANIC", rank_absolute: 1, rank_group: 1, domain: "tool1.com", url: "https://tool1.com/" },
      { element_id: "a2", feature_type: "ORGANIC", rank_absolute: 2, rank_group: 2, domain: "tool2.com", url: "https://tool2.com/" },
      { element_id: "a3", feature_type: "ORGANIC", rank_absolute: 3, rank_group: 3, domain: "tool3.com", url: "https://tool3.com/" },
      { element_id: "a4", feature_type: "AI_OVERVIEW", rank_absolute: 4, rank_group: 1 },
    ],
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-25T00:00:00Z", observed_at: "2026-09-25T00:00:00Z", normalized_at: "2026-09-25T00:00:00Z" },
  };

  const obsB = {
    schema_version: 1,
    observation_id: "serp_obs_prov_b_0002",
    provider: { name: "provider_b", adapter_version: "1.0.0" },
    context: createSerpContext({ query_text: "ai search tools", engine: "google", device: "desktop", country: "US" }),
    collection_status: "SUCCESS",
    elements: [
      { element_id: "b1", feature_type: "ORGANIC", rank_absolute: 1, rank_group: 1, domain: "tool1.com", url: "https://tool1.com/" }, // pos 1
      { element_id: "b2", feature_type: "ORGANIC", rank_absolute: 2, rank_group: 2, domain: "tool3.com", url: "https://tool3.com/" }, // pos 2 (was 3 in A)
      { element_id: "b3", feature_type: "ORGANIC", rank_absolute: 3, rank_group: 3, domain: "tool4.com", url: "https://tool4.com/" }, // pos 3 (divergent!)
      { element_id: "b4", feature_type: "AI_OVERVIEW", rank_absolute: 4, rank_group: 1 },
    ],
    raw_evidence_checksum: "0".repeat(64),
    timestamps: { requested_at: "2026-09-25T00:00:00Z", observed_at: "2026-09-25T00:00:00Z", normalized_at: "2026-09-25T00:00:00Z" },
  };

  const divergence = measureProviderDisagreement(obsA, obsB);

  assert.equal(divergence.schema_version, 1);
  assert.equal(divergence.providers.length, 2);
  assert.ok(divergence.metrics.top_10_jaccard_similarity > 0 && divergence.metrics.top_10_jaccard_similarity < 1);
  assert.ok(divergence.metrics.spearman_rank_correlation !== null);
  assert.equal(divergence.feature_agreement.ai_overview, true);
  assert.ok(divergence.divergent_elements.length >= 2, "must detect tool2.com missing in B and tool4.com missing in A");

  const check = validateAgainst("serp-divergence.schema.json", divergence);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* Domain Module Integration                                                  */
/* -------------------------------------------------------------------------- */

test("SERP Domain Module satisfies domain module contract", () => {
  assert.equal(serpDomainModule.module_id, "domain-serp");
  assert.equal(serpDomainModule.namespace, "SERP");
  assert.ok(serpDomainModule.observation_kinds.includes("serp_observation"));

  const check = validateAgainst("domain-module.schema.json", serpDomainModule);
  assert.equal(check.valid, true, check.errors?.join("; "));
});
