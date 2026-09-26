import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

import {
  executeGroundedJourney,
  JOURNEY_OUTCOMES,
  EVIDENCE_TYPES,
  evaluateReadinessLevel,
  READINESS_LEVELS,
  evaluateDeterminationRepeatability,
} from "../../src/agent/index.js";

/* -------------------------------------------------------------------------- */
/* B-065: Grounded Task-Oriented Agent Journeys                               */
/* -------------------------------------------------------------------------- */

test("B-065: executeGroundedJourney resolves to SUCCESS with direct evidence", () => {
  const siteContext = {
    pages: [
      {
        url: "https://example.test/pricing",
        title: "Pricing Plans",
        headings: ["Enterprise Tier - $99/month", "Starter Tier - Free"],
        paragraphs: ["All plans include automated agent execution."],
        text: "Enterprise Tier - $99/month. Starter Tier - Free. All plans include automated agent execution.",
      },
      {
        url: "https://example.test/about",
        title: "About Us",
        jsonLd: [{ author: { name: "Alice Developer" } }],
        text: "Written by Alice Developer.",
      },
    ],
  };

  const journeyDef = {
    goal: "Determine SaaS pricing and content author",
    journey_type: "saas",
    steps: [
      {
        description: "Find enterprise pricing",
        property: "pricing",
        target_url: "https://example.test/pricing",
      },
      {
        description: "Find author of documentation",
        property: "author",
        target_url: "https://example.test/about",
      },
    ],
  };

  const journey = executeGroundedJourney(journeyDef, siteContext);

  assert.equal(journey.outcome, JOURNEY_OUTCOMES.SUCCESS);
  assert.equal(journey.steps.length, 2);
  assert.equal(journey.steps[0].status, JOURNEY_OUTCOMES.SUCCESS);
  assert.equal(journey.steps[1].status, JOURNEY_OUTCOMES.SUCCESS);

  // Evidence grounding check
  const ans0 = journey.steps[0].extracted_answers[0];
  assert.equal(ans0.source_url, "https://example.test/pricing");
  assert.ok(ans0.source_element);
  assert.ok(ans0.source_text);
  assert.equal(ans0.evidence_type, EVIDENCE_TYPES.DIRECT_EVIDENCE);

  const ans1 = journey.steps[1].extracted_answers[0];
  assert.equal(ans1.source_url, "https://example.test/about");
  assert.equal(ans1.extracted_value, "Alice Developer");
  assert.equal(ans1.evidence_type, EVIDENCE_TYPES.DIRECT_EVIDENCE);

  assert.equal(journey.evidence_summary.direct_evidence_count, 2);
  assert.equal(journey.evidence_summary.model_inference_count, 0);

  const check = validateAgainst("agent-journey.schema.json", journey);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-065: executeGroundedJourney distinguishes direct evidence from model inference", () => {
  const siteContext = {
    pages: [{ url: "https://example.test/contact", text: "Contact us by email." }],
  };

  const journeyDef = {
    goal: "Find refund policy window",
    journey_type: "support",
    steps: [
      {
        description: "Find refund policy days",
        property: "refund_window_days",
        model_inference_fallback: "Likely 30 days standard policy based on industry convention",
      },
    ],
  };

  const journey = executeGroundedJourney(journeyDef, siteContext);

  assert.equal(journey.outcome, JOURNEY_OUTCOMES.PARTIAL);
  const ans = journey.steps[0].extracted_answers[0];
  assert.equal(ans.evidence_type, EVIDENCE_TYPES.MODEL_INFERENCE, "must explicitly tag model inferences");
  assert.equal(ans.confidence, "low");
  assert.equal(journey.evidence_summary.model_inference_count, 1);
  assert.equal(journey.evidence_summary.direct_evidence_count, 0);

  const check = validateAgainst("agent-journey.schema.json", journey);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-065: executeGroundedJourney resolves to BLOCKED on access restrictions", () => {
  const siteContext = {
    is_blocked: true,
    access_denied: true,
    pages: [],
  };

  const journeyDef = {
    goal: "Access member portal",
    journey_type: "saas",
    steps: [{ description: "Access dashboard", property: "dashboard" }],
  };

  const journey = executeGroundedJourney(journeyDef, siteContext);
  assert.equal(journey.outcome, JOURNEY_OUTCOMES.BLOCKED);
  assert.equal(journey.steps[0].status, JOURNEY_OUTCOMES.BLOCKED);
  assert.match(journey.steps[0].error_or_refusal, /blocked/i);

  const check = validateAgainst("agent-journey.schema.json", journey);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-066: Readiness Levels with Published Gating Rules                        */
/* -------------------------------------------------------------------------- */

test("B-066: Agent Native is unreachable while an unresolved CRITICAL finding exists", () => {
  const criticalFinding = {
    finding_id: "FND-PROMPT-INJ-001",
    detector_id: "AGENT-010",
    severity: "CRITICAL",
    summary: "High-risk prompt injection payload detected in user comments block",
  };

  const successfulJourney = {
    schema_version: 1,
    journey_id: "jrn_0000000000000001",
    journey_type: "saas",
    goal: "Test journey",
    outcome: "SUCCESS",
    steps: [],
    evidence_summary: {
      direct_evidence_count: 5,
      derived_interpretation_count: 0,
      model_inference_count: 0,
    },
    executed_at: new Date().toISOString(),
  };

  const assessment = evaluateReadinessLevel({
    siteUrl: "https://example.test",
    findings: [criticalFinding], // Critical finding present!
    determinations: [
      { detector_id: "SCHEMA-001", status: "PASS" },
      { detector_id: "AGENT-001", status: "PASS" },
    ],
    journeys: [successfulJourney],
    siteContext: {
      mcp_card: { server_name: "test" },
      site: { pages: [{ url: "https://example.test", jsonLd: [{ type: "WebSite" }] }] },
    },
  });

  // Level 4 (Agent Operable) and Level 5 (Agent Native) MUST be blocked!
  assert.ok(assessment.assigned_level <= 3, `Assigned level must not exceed 3, got ${assessment.assigned_level}`);
  assert.notEqual(assessment.level_name, "AGENT_NATIVE");
  assert.notEqual(assessment.level_name, "AGENT_OPERABLE");

  assert.equal(assessment.gating_evaluation.critical_findings_present, true);
  assert.equal(assessment.gating_evaluation.critical_findings_count, 1);
  assert.equal(assessment.point_accumulation_bypass_blocked, true);

  // Check Level 4 and Level 5 gate failures
  const gate4 = assessment.gating_evaluation.level_gates.find((g) => g.level === 4);
  assert.equal(gate4.satisfied, false);
  assert.ok(gate4.missing_prerequisites.some((p) => /critical/i.test(p)));

  const check = validateAgainst("agent-readiness-level.schema.json", assessment);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-066: Clean site with verified journeys achieves Level 5 (Agent Native)", () => {
  const successfulJourney = {
    schema_version: 1,
    journey_id: "jrn_0000000000000002",
    journey_type: "saas",
    goal: "End-to-end task",
    outcome: "SUCCESS",
    steps: [],
    evidence_summary: {
      direct_evidence_count: 3,
      derived_interpretation_count: 0,
      model_inference_count: 0,
    },
    executed_at: new Date().toISOString(),
  };

  const assessment = evaluateReadinessLevel({
    siteUrl: "https://example.test",
    findings: [], // Zero critical, zero high findings
    determinations: [
      { detector_id: "SCHEMA-001", status: "PASS" },
      { detector_id: "AGENT-001", status: "PASS" },
    ],
    journeys: [successfulJourney],
    siteContext: {
      mcp_card: { server_name: "test" },
      site: { pages: [{ url: "https://example.test", jsonLd: [{ type: "Organization" }] }] },
    },
  });

  assert.equal(assessment.assigned_level, 5);
  assert.equal(assessment.level_name, "AGENT_NATIVE");
  assert.equal(assessment.gating_evaluation.critical_findings_present, false);

  const check = validateAgainst("agent-readiness-level.schema.json", assessment);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* B-067: Repeatability Testing for Probabilistic Determinations              */
/* -------------------------------------------------------------------------- */

test("B-067: Unstable conclusions report BUSINESS_IDENTITY_AMBIGUOUS rather than last answer", () => {
  // 3 independent runs that fluctuate
  const runs = [
    { run_index: 1, answer: "saas product", confidence: 0.7 },
    { run_index: 2, answer: "consulting agency", confidence: 0.65 },
    { run_index: 3, answer: "analytics tool", confidence: 0.68 },
  ];

  const report = evaluateDeterminationRepeatability(runs, "business_identity", {
    consensus_threshold: 0.75,
  });

  assert.equal(report.stability.is_stable, false);
  assert.equal(report.stability.consensus_answer, null, "unstable determination must not return arbitrary last run answer");
  assert.equal(report.stability.ambiguity_code, "BUSINESS_IDENTITY_AMBIGUOUS");
  assert.ok(report.stability.agreement_ratio < 0.5);

  const check = validateAgainst("agent-repeatability.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("B-067: Stable consensus determination returns valid consensus answer and tests hallucination", () => {
  const runs = [
    { run_index: 1, answer: "b2b saas platform", confidence: 0.95 },
    { run_index: 2, answer: "b2b saas platform", confidence: 0.92 },
    { run_index: 3, answer: "b2b saas platform", confidence: 0.94 },
    { run_index: 4, answer: "software vendor", confidence: 0.6 },
  ];

  const siteText = "Acme provides an enterprise B2B SaaS platform for automated security compliance.";

  const report = evaluateDeterminationRepeatability(runs, "business_identity", {
    consensus_threshold: 0.70,
    site_text: siteText,
  });

  assert.equal(report.stability.is_stable, true);
  assert.equal(report.stability.consensus_answer, "b2b saas platform");
  assert.equal(report.stability.ambiguity_code, null);
  assert.equal(report.stability.agreement_ratio, 0.75);

  assert.equal(report.hallucination_susceptibility.tested, true);
  assert.equal(report.hallucination_susceptibility.status, "SUPPORTED");

  const check = validateAgainst("agent-repeatability.schema.json", report);
  assert.equal(check.valid, true, check.errors?.join("; "));
});
