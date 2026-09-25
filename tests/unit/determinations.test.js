import test from "node:test";
import assert from "node:assert/strict";
import { DETERMINATION_STATUS, COLLECTOR_FAILURES, SITE_PROFILES } from "../../src/conditions/constants.js";
import { resolveSiteProfile, isConditionApplicable, ECOMMERCE_DETECTOR_IDS } from "../../src/conditions/siteProfile.js";
import { detectCollectorFailure, classifyCollectorError } from "../../src/conditions/collectorFailure.js";
import { evaluateDeterminations } from "../../src/conditions/determinationEngine.js";
import { computeApplicabilityScore, compareScoreEnvelopes } from "../../src/conditions/scoring.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

function dummyDetector(overrides = {}) {
  return {
    id: "TECH-999",
    name: "Test Detector",
    namespace: "TECH",
    discipline: ["seo"],
    severity: "high",
    deterministic: true,
    requires: ["site"],
    coverage_requirement: "evaluated_subset",
    description: "Test condition description",
    remediation: "Test remediation instructions",
    verification: "Test verification step",
    check: () => [],
    ...overrides,
  };
}

test("B-010: every evaluated condition yields a valid determination with PASS/FAIL/WARNING/etc.", () => {
  const passingDet = dummyDetector({ id: "TECH-901", check: () => [] });
  const failingDet = dummyDetector({
    id: "TECH-902",
    check: (ctx) => [{
      subject: { type: "page", identifier: "https://example.test/" },
      summary: "Page failed condition",
      severity: "critical",
    }],
  });
  const warningDet = dummyDetector({
    id: "TECH-903",
    check: (ctx) => [{
      subject: { type: "page", identifier: "https://example.test/" },
      summary: "Page has warning",
      severity: "warning",
    }],
  });

  const ctx = {
    site: {
      baseUrl: "https://example.test",
      pages: [{ url: "https://example.test/", status: 200, headers: {}, links: [], jsonLd: [] }],
    },
  };

  const res = evaluateDeterminations([passingDet, failingDet, warningDet], ctx);

  assert.equal(res.determinations.length, 3);
  const byId = Object.fromEntries(res.determinations.map((d) => [d.detector_id, d]));

  assert.equal(byId["TECH-901"].status, DETERMINATION_STATUS.PASS);
  assert.equal(byId["TECH-902"].status, DETERMINATION_STATUS.FAIL);
  assert.equal(byId["TECH-903"].status, DETERMINATION_STATUS.WARNING);

  // Findings become a projection of FAIL and WARNING determinations
  assert.equal(res.findings.length, 2);
  const findingDetectorIds = res.findings.map((f) => f.detector_id).sort();
  assert.deepEqual(findingDetectorIds, ["TECH-902", "TECH-903"]);

  // All determinations strictly validate against determination.schema.json
  for (const det of res.determinations) {
    const val = validateAgainst("determination.schema.json", det);
    assert.ok(val.valid, `determination ${det.detector_id} must be schema-valid: ${val.errors.join("; ")}`);
  }
});

test("B-011: content-only property records ecommerce conditions as NOT_APPLICABLE", () => {
  const ecommerceDet = dummyDetector({
    id: "SCHEMA-006",
    check: (ctx) => [{
      subject: { type: "page", identifier: "https://example.test/" },
      summary: "Stale offer price",
    }],
  });

  const ctx = {
    config: { site_profile: SITE_PROFILES.CONTENT_ONLY },
    site: {
      baseUrl: "https://example.test",
      pages: [{ url: "https://example.test/", status: 200, headers: {}, links: [], jsonLd: [] }],
    },
  };

  const res = evaluateDeterminations([ecommerceDet], ctx);

  assert.equal(res.determinations.length, 1);
  assert.equal(res.determinations[0].status, DETERMINATION_STATUS.NOT_APPLICABLE);
  assert.equal(res.determinations[0].applicable, false);
  assert.match(res.determinations[0].reason, /ecommerce condition not applicable/i);

  // NOT_APPLICABLE condition never contributes to findings (failure count)
  assert.equal(res.findings.length, 0);

  // NOT_APPLICABLE never contributes to a scoring denominator
  const scoring = computeApplicabilityScore(res.determinations, { siteProfile: SITE_PROFILES.CONTENT_ONLY });
  assert.equal(scoring.applicability_denominator, 0);
  assert.equal(scoring.counts.not_applicable, 1);
  assert.equal(scoring.counts.fail, 0);
  assert.equal(scoring.score, null);
});

test("B-011: site profile auto-detection identifies ecommerce signals from product and cart pathways", () => {
  const commerceCtx = {
    site: {
      pages: [
        { url: "https://shop.test/products/shoes", text: "Add to cart now", jsonLd: [] },
      ],
    },
  };
  assert.equal(resolveSiteProfile(commerceCtx), SITE_PROFILES.ECOMMERCE);

  const contentCtx = {
    site: {
      pages: [
        { url: "https://blog.test/posts/hello-world", text: "An informational blog post", jsonLd: [] },
      ],
    },
  };
  assert.equal(resolveSiteProfile(contentCtx), SITE_PROFILES.CONTENT_ONLY);
});

test("B-013: applicability-scoped scoring exposes input conditions, weights, formula, and denominator", () => {
  const determinations = [
    { condition_id: "TECH-001", status: DETERMINATION_STATUS.PASS, severity: "critical" },
    { condition_id: "TECH-002", status: DETERMINATION_STATUS.PASS, severity: "high" },
    { condition_id: "TECH-003", status: DETERMINATION_STATUS.WARNING, severity: "medium" },
    { condition_id: "SCHEMA-006", status: DETERMINATION_STATUS.NOT_APPLICABLE, severity: "medium" },
    { condition_id: "PAGE-001", status: DETERMINATION_STATUS.FAIL, severity: "high" },
    { condition_id: "AGENT-001", status: DETERMINATION_STATUS.NOT_TESTED, severity: "low" },
  ];

  const score = computeApplicabilityScore(determinations, { siteProfile: "content_only" });

  assert.equal(typeof score.score, "number");
  assert.equal(score.score_version, "1.0");
  assert.equal(score.formula, "sum(weight * condition_value) / sum(applicable_weights)");
  assert.ok(score.weights && typeof score.weights === "object");
  assert.ok(Array.isArray(score.input_conditions));
  assert.ok(score.input_conditions.includes("TECH-001"));
  assert.ok(!score.input_conditions.includes("SCHEMA-006"), "NOT_APPLICABLE condition excluded from inputs");

  // Denominator strictly excludes NOT_APPLICABLE, NOT_TESTED, ERROR
  // Applicable: TECH-001 (PASS), TECH-002 (PASS), TECH-003 (WARNING), PAGE-001 (FAIL) = 4
  assert.equal(score.applicability_denominator, 4);
  assert.equal(score.counts.not_applicable, 1);
  assert.equal(score.counts.not_tested, 1);
  assert.equal(score.counts.fail, 1);
  assert.equal(score.counts.warning, 1);
  assert.equal(score.counts.pass, 2);
});

test("B-013: differing profiles and differing applicability counts are never compared on a shared denominator", () => {
  const scoreA = {
    score: 85,
    applicability_denominator: 10,
    site_profile: "content_only",
  };
  const scoreB = {
    score: 85,
    applicability_denominator: 15,
    site_profile: "content_only",
  };
  const scoreC = {
    score: 85,
    applicability_denominator: 10,
    site_profile: "ecommerce",
  };

  const diffDenomResult = compareScoreEnvelopes(scoreA, scoreB);
  assert.equal(diffDenomResult.comparable, false);
  assert.equal(diffDenomResult.reason, "differing_applicability_denominators");

  const diffProfileResult = compareScoreEnvelopes(scoreA, scoreC);
  assert.equal(diffProfileResult.comparable, false);
  assert.equal(diffProfileResult.reason, "differing_site_profiles");

  const sameResult = compareScoreEnvelopes(scoreA, { ...scoreA, score: 90 });
  assert.equal(sameResult.comparable, true);
  assert.equal(sameResult.score_diff, 5);
});

test("B-014: collector failures (DNS, timeout, blocked, captcha, rate limit, parser) resolve to ERROR or NOT_TESTED, never FAIL", () => {
  const failingDetector = dummyDetector({
    id: "TECH-001",
    check: (ctx) => [{
      subject: { type: "page", identifier: "https://example.test/page" },
      summary: "HTTP status is not 200",
      severity: "critical",
    }],
  });

  const failureScenarios = [
    { name: "DNS_FAILED", error: "ENOTFOUND example.test", expectedCode: COLLECTOR_FAILURES.DNS_FAILED },
    { name: "TIMEOUT", error: "FETCH_TIMEOUT after 10000ms", expectedCode: COLLECTOR_FAILURES.TIMEOUT },
    { name: "BLOCKED", pageStatus: 403, expectedCode: COLLECTOR_FAILURES.BLOCKED },
    { name: "CAPTCHA", challengeWall: true, expectedCode: COLLECTOR_FAILURES.CAPTCHA },
    { name: "RATE_LIMITED", pageStatus: 429, expectedCode: COLLECTOR_FAILURES.RATE_LIMITED },
    { name: "PARSER_FAILED", parseError: true, expectedCode: COLLECTOR_FAILURES.PARSER_FAILED },
  ];

  for (const scenario of failureScenarios) {
    const page = {
      url: "https://example.test/page",
      status: scenario.pageStatus || 200,
      resourceValidity: {
        signals: { challenge_wall: Boolean(scenario.challengeWall) },
        reason_codes: scenario.parseError ? ["parser_failed"] : [],
      },
      parseError: Boolean(scenario.parseError),
    };

    const ctx = {
      site: {
        baseUrl: "https://example.test",
        pages: [page],
        fetchErrors: scenario.error ? [scenario.error] : [],
      },
    };

    const res = evaluateDeterminations([failingDetector], ctx);

    assert.equal(res.determinations.length, 1, `${scenario.name}: must produce 1 determination`);
    const det = res.determinations[0];

    // INVARIANT: Never FAIL! Must be ERROR or NOT_TESTED.
    assert.notEqual(det.status, DETERMINATION_STATUS.FAIL, `${scenario.name}: must NEVER resolve to FAIL`);
    assert.ok(
      det.status === DETERMINATION_STATUS.ERROR || det.status === DETERMINATION_STATUS.NOT_TESTED,
      `${scenario.name}: expected ERROR or NOT_TESTED, got ${det.status}`
    );
    assert.equal(det.collector_failure, scenario.expectedCode);

    // INVARIANT: Collector failure never produces a condition FAIL finding!
    assert.equal(res.findings.length, 0, `${scenario.name}: must NOT produce any FAIL finding`);
  }
});
