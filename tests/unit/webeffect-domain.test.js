import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

import {
  CanonicalEventRegistry,
  detectEventDuplicates,
  validateAttributionContinuity,
  observeConsentStateDifferential,
  validateCommerceConsistency,
  buildThirdPartyDependencyGraph,
  webeffectDomainModule,
} from "../../src/webeffect/index.js";

/* -------------------------------------------------------------------------- */
/* B-070: Canonical Event Registry & Semantic Event Validation                */
/* -------------------------------------------------------------------------- */

test("B-070: page load does not satisfy a named conversion event (purchase/lead_capture)", () => {
  const registry = new CanonicalEventRegistry();

  const emittedEvents = [
    {
      event_name: "page_view",
      trigger_observed: "page_load",
      parameters: { page_location: "https://example.test/", page_title: "Home" },
    },
    {
      // VIOLATION: Purchase fired on mere page load!
      event_name: "purchase",
      trigger_observed: "page_load",
      parameters: { transaction_id: "tx_1234", currency: "USD", value: 99.00 },
    },
    {
      // VIOLATION: Lead capture fired on view_content without form submit
      event_name: "lead_capture",
      trigger_observed: "view_content",
      parameters: { form_id: "contact_form" },
    },
  ];

  const report = registry.validateEmittedEvents(emittedEvents);
  assert.equal(report.validation_summary.total_observed_events, 3);

  const violations = report.validation_summary.semantic_violations;
  assert.equal(violations.length, 2);

  const purchaseViol = violations.find((v) => v.event_name === "purchase");
  assert.ok(purchaseViol);
  assert.equal(purchaseViol.violation_type, "PROHIBITED_PAGE_LOAD_CONVERSION");
  assert.match(purchaseViol.reason, /page load does not satisfy a named conversion event/i);

  const leadViol = violations.find((v) => v.event_name === "lead_capture");
  assert.ok(leadViol);
  assert.equal(leadViol.violation_type, "PROHIBITED_PAGE_LOAD_CONVERSION");

  const check = validateAgainst("webeffect-event-registry.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-070: catches missing required parameters on canonical events", () => {
  const registry = new CanonicalEventRegistry();

  const emittedEvents = [
    {
      event_name: "purchase",
      trigger_observed: "transaction_confirm",
      parameters: { value: 50.00 }, // Missing transaction_id and currency!
    },
  ];

  const report = registry.validateEmittedEvents(emittedEvents);
  const violations = report.validation_summary.semantic_violations;
  assert.equal(violations.length, 1);
  assert.equal(violations[0].violation_type, "MISSING_REQUIRED_PARAMETERS");
  assert.match(violations[0].reason, /missing required parameters: transaction_id, currency/i);

  const check = validateAgainst("webeffect-event-registry.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-071: Duplicate & Double-Fire Detection                                   */
/* -------------------------------------------------------------------------- */

test("B-071: detectEventDuplicates flags duplicate purchases, double fires, and tag manager duplication", () => {
  const events = [
    // Duplicate purchase: same transaction_id
    {
      event_name: "purchase",
      parameters: { transaction_id: "tx_9999", value: 120.00 },
      timestamp: "2026-09-25T12:00:00Z",
    },
    {
      event_name: "purchase",
      parameters: { transaction_id: "tx_9999", value: 120.00 },
      timestamp: "2026-09-25T12:00:05Z",
    },
    // Double fire: identical lead_capture within 200ms
    {
      event_name: "lead_capture",
      parameters: { form_id: "demo" },
      timestamp: "2026-09-25T12:01:00.000Z",
    },
    {
      event_name: "lead_capture",
      parameters: { form_id: "demo" },
      timestamp: "2026-09-25T12:01:00.150Z",
    },
    // Tag manager concurrent duplication
    {
      event_name: "add_to_cart",
      dispatcher: "gtm_container_1",
      timestamp: "2026-09-25T12:02:00.000Z",
    },
    {
      event_name: "add_to_cart",
      dispatcher: "direct_pixel_script",
      timestamp: "2026-09-25T12:02:00.050Z",
    },
    // SPA re-fire: duplicate virtual pageview without route change
    {
      event_name: "page_view",
      parameters: { page_location: "https://example.test/app/dashboard" },
    },
    {
      event_name: "page_view",
      parameters: { page_location: "https://example.test/app/dashboard" },
    },
  ];

  const duplicates = detectEventDuplicates(events, { debounceWindowMs: 500 });
  const types = duplicates.map((d) => d.duplicate_type);

  assert.ok(types.includes("DUPLICATE_PURCHASE"), "must detect duplicate purchase with identical transaction_id");
  assert.ok(types.includes("DOUBLE_FIRE"), "must detect rapid double fire");
  assert.ok(types.includes("TAG_MANAGER_DUPLICATION"), "must detect concurrent tag manager duplication");
  assert.ok(types.includes("SPA_REFIRE"), "must detect virtual pageview re-fire on identical route");
});

/* -------------------------------------------------------------------------- */
/* B-072: Attribution Continuity Validation                                   */
/* -------------------------------------------------------------------------- */

test("B-072: validateAttributionContinuity traces journey parameters and localizes loss points", () => {
  const journeyWithLoss = [
    {
      stage: "acquisition",
      url: "https://example.test/?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&gclid=Cj0KCQj",
      referrer: "https://www.google.com/",
    },
    {
      stage: "session_navigation",
      url: "https://example.test/pricing",
      retained_parameters: ["utm_source", "utm_medium", "utm_campaign", "gclid"],
    },
    {
      // Subdomain transition strips gclid
      stage: "subdomain_transition",
      url: "https://checkout.example.test/cart",
      retained_parameters: ["utm_source", "utm_medium", "utm_campaign"], // gclid dropped!
    },
    {
      // Return from external gateway drops all UTMs!
      stage: "checkout_return",
      url: "https://example.test/thank-you",
      retained_parameters: [],
    },
  ];

  const report = validateAttributionContinuity(journeyWithLoss, { journey_id: "jrn_attr_001" });
  assert.equal(report.attribution_intact, false);
  assert.equal(report.loss_points.length, 2);

  assert.equal(report.loss_points[0].loss_type, "LOSS_POINT_SUBDOMAIN");
  assert.ok(report.loss_points[0].lost_parameters.includes("gclid"));

  assert.equal(report.loss_points[1].loss_type, "LOSS_POINT_GATEWAY_RETURN");
  assert.match(report.loss_points[1].impact, /self-referral/i);

  const check = validateAgainst("webeffect-attribution-report.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-072: validateAttributionContinuity confirms intact journey attribution", () => {
  const intactJourney = [
    {
      stage: "acquisition",
      url: "https://example.test/?utm_source=newsletter&utm_medium=email&utm_campaign=launch",
    },
    {
      stage: "session_navigation",
      url: "https://example.test/features",
      retained_parameters: ["utm_source", "utm_medium", "utm_campaign"],
    },
    {
      stage: "conversion",
      url: "https://example.test/signup-complete",
      retained_parameters: ["utm_source", "utm_medium", "utm_campaign"],
    },
  ];

  const report = validateAttributionContinuity(intactJourney);
  assert.equal(report.attribution_intact, true);
  assert.equal(report.loss_points.length, 0);

  const check = validateAgainst("webeffect-attribution-report.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-073: Consent State Differential Observation                              */
/* -------------------------------------------------------------------------- */

test("B-073: technical observation is strictly separated from legal compliance", () => {
  const differentialData = {
    before_consent: {
      total_requests: 15,
      third_party_requests: 5,
      active_trackers: ["google-analytics.com", "facebook.net"], // Fired prior to consent!
      cookies_set: ["_fbp"],
    },
    after_reject: {
      total_requests: 10,
      third_party_requests: 2,
      active_trackers: ["criteo.com"], // Continued firing after reject!
      cookies_set: [],
    },
    after_accept: {
      total_requests: 25,
      third_party_requests: 12,
      active_trackers: ["google-analytics.com", "facebook.net", "criteo.com"],
      cookies_set: ["_ga", "_fbp"],
    },
    after_withdrawal: {
      total_requests: 12,
      third_party_requests: 3,
      active_trackers: ["google-analytics.com"], // Active after withdrawal!
      cookies_set: ["_ga"],
    },
  };

  const report = observeConsentStateDifferential(differentialData, "https://example.test");

  // Hard Invariant Check:
  assert.equal(report.epistemic_boundary.is_technical_observation, true);
  assert.equal(report.epistemic_boundary.is_legal_compliance_determination, false);
  assert.match(report.epistemic_boundary.boundary_notice, /does NOT constitute legal advice/i);

  // Technical contradictions check
  assert.equal(report.technical_contradictions.length, 4);
  const types = report.technical_contradictions.map((c) => c.finding_type);
  assert.ok(types.includes("TRACKER_ACTIVE_BEFORE_CONSENT"));
  assert.ok(types.includes("TRACKER_ACTIVE_AFTER_REJECT"));
  assert.ok(types.includes("TRACKER_ACTIVE_AFTER_WITHDRAWAL"));

  const check = validateAgainst("webeffect-consent-differential.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-074: Commerce Fact Consistency Across Representations                    */
/* -------------------------------------------------------------------------- */

test("B-074: commerce fact contradictions produce HIGH/CRITICAL severity findings", () => {
  const productData = {
    product_id: "prod_mechanical_keyboard_99",
    representations: {
      visible_page: {
        price: 99.00,
        currency: "USD",
        availability: "InStock",
        variant: "tactile_brown",
      },
      structured_data: {
        price: 79.00, // Contradiction: $79 vs $99!
        currency: "USD",
        availability: "InStock",
        variant: "tactile_brown",
      },
      api_response: {
        price: 99.00,
        currency: "EUR", // Contradiction: EUR vs USD!
        availability: "InStock",
        variant: "tactile_brown",
      },
      cart: {
        price: 99.00,
        currency: "USD",
        availability: "InStock",
        variant: "tactile_brown",
      },
      checkout: {
        price: 99.00,
        currency: "USD",
        availability: "OutOfStock", // Contradiction: checkout says OutOfStock!
        variant: "tactile_brown",
      },
    },
  };

  const evalReport = validateCommerceConsistency(productData);
  assert.equal(evalReport.is_consistent, false);
  assert.ok(evalReport.contradictions.length >= 3);

  const priceContra = evalReport.contradictions.find((c) => c.dimension === "price");
  assert.ok(priceContra);
  assert.equal(priceContra.severity, "HIGH");

  const currContra = evalReport.contradictions.find((c) => c.dimension === "currency");
  assert.ok(currContra);
  assert.equal(currContra.severity, "CRITICAL");

  const availContra = evalReport.contradictions.find((c) => c.dimension === "availability");
  assert.ok(availContra);
  assert.equal(availContra.severity, "HIGH");

  const check = validateAgainst("webeffect-commerce-consistency.schema.json", evalReport);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-074: consistent commerce representations pass validation with zero contradictions", () => {
  const consistentProduct = {
    product_id: "prod_clean_100",
    representations: {
      visible_page: { price: 49.99, currency: "USD", availability: "InStock", variant: "default" },
      structured_data: { price: 49.99, currency: "USD", availability: "InStock", variant: "default" },
      cart: { price: 49.99, currency: "USD", availability: "InStock", variant: "default" },
      checkout: { price: 49.99, currency: "USD", availability: "InStock", variant: "default" },
    },
  };

  const report = validateCommerceConsistency(consistentProduct);
  assert.equal(report.is_consistent, true);
  assert.equal(report.contradictions.length, 0);

  const check = validateAgainst("webeffect-commerce-consistency.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-075: Third-Party Dependency Graph                                        */
/* -------------------------------------------------------------------------- */

test("B-075: buildThirdPartyDependencyGraph inventories blocking, performance, failure, and privacy effects", () => {
  const dependencies = [
    {
      name: "Google Tag Manager",
      host_domain: "googletagmanager.com",
      purpose: "tag_manager",
      blocking_state: "parser_blocking", // Blocking!
      performance_cost: { transfer_size_bytes: 45000, estimated_execution_time_ms: 120 },
      failure_effect: "benign_fail_open",
      privacy_effect: { collects_pii: true, sets_cookies: true, shares_data_broker: false },
    },
    {
      name: "Stripe Payment Gateway",
      host_domain: "js.stripe.com",
      purpose: "payments",
      blocking_state: "async",
      performance_cost: { transfer_size_bytes: 110000, estimated_execution_time_ms: 80 },
      failure_effect: "payment_outage", // Critical failure effect!
      privacy_effect: { collects_pii: true, sets_cookies: true, shares_data_broker: false },
    },
    {
      name: "Google Fonts Inter",
      host_domain: "fonts.googleapis.com",
      purpose: "fonts",
      blocking_state: "render_blocking", // Blocking!
      performance_cost: { transfer_size_bytes: 25000, estimated_execution_time_ms: 30 },
      failure_effect: "degraded_ux",
      privacy_effect: { collects_pii: false, sets_cookies: false, shares_data_broker: false },
    },
  ];

  const graph = buildThirdPartyDependencyGraph(dependencies, "https://example.test");
  assert.equal(graph.total_dependencies, 3);
  assert.equal(graph.blocking_count, 2);
  assert.equal(graph.critical_failure_dependencies.length, 1);
  assert.equal(graph.critical_failure_dependencies[0], "Stripe Payment Gateway");

  const check = validateAgainst("webeffect-dependency-graph.schema.json", graph);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* Domain Module Integration                                                  */
/* -------------------------------------------------------------------------- */

test("WebEffect Domain Module satisfies domain module contract", () => {
  assert.equal(webeffectDomainModule.module_id, "domain-webeffect");
  assert.equal(webeffectDomainModule.namespace, "WEBEFFECT");
  assert.ok(webeffectDomainModule.observation_kinds.includes("attribution_continuity"));

  const check = validateAgainst("domain-module.schema.json", webeffectDomainModule);
  assert.equal(check.valid, true, check.errors?.join("; "));
});
