import test from "node:test";
import assert from "node:assert/strict";
import { domainRegistry, defineDomainModule, registerDomainModule, ALL_DOMAIN_MODULES } from "../../src/domains/index.js";
import { ALL_DETECTORS, selectDetectors } from "../../src/detectors/index.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";
import { evaluateDeterminations } from "../../src/conditions/determinationEngine.js";
import { DETERMINATION_STATUS } from "../../src/conditions/constants.js";
import { defineDetector } from "../../src/detectors/framework.js";

test("B-040: defineDomainModule enforces the domain module contract", () => {
  const dummyCondition = defineDetector({
    id: "TECH-DUMMY-01",
    name: "Dummy tech condition",
    namespace: "TECH",
    description: "Test condition",
    discipline: ["seo"],
    severity: "info",
    deterministic: true,
    coverage_requirement: "page_resource",
    remediation: "None needed",
    verification: "Detector ceases reporting",
    check: () => [],
  });

  const validModule = defineDomainModule({
    module_id: "dummy-test-domain",
    namespace: "TECH",
    title: "Dummy Test Domain",
    description: "Test domain module for B-040",
    conditions: [dummyCondition],
    observation_kinds: ["render"],
    collectors: {
      synthetic: { method: "synthetic_fetch" },
    },
    report_projections: {
      summary: () => ({ ok: true }),
    },
  });

  assert.equal(validModule.module_id, "dummy-test-domain");
  assert.equal(validModule.namespace, "TECH");
  assert.equal(validModule.conditions.length, 1);

  const check = validateAgainst("domain-module.schema.json", validModule);
  assert.equal(check.valid, true, check.errors?.join("; "));

  // Fails closed on missing required fields
  assert.throws(() => defineDomainModule({ module_id: "bad" }), /missing required field/);
  // Fails closed on mismatched namespace
  assert.throws(() => defineDomainModule({
    module_id: "mismatch",
    namespace: "CRAWL",
    title: "Mismatch",
    description: "desc",
    conditions: [dummyCondition],
    observation_kinds: [],
    collectors: {},
    report_projections: {},
  }), /does not match module namespace/);
});

test("B-040: adding a domain touches no core file (pluggable registration)", () => {
  const customCondition = defineDetector({
    id: "TECH-CUSTOM-SEAM-01",
    name: "Custom seam condition",
    namespace: "TECH",
    description: "Pluggable domain condition",
    discipline: ["technical"],
    severity: "low",
    deterministic: true,
    coverage_requirement: "page_resource",
    remediation: "Remediate custom seam",
    verification: "Passes check",
    check: () => [],
  });

  const customModule = {
    module_id: "custom-plug-domain",
    namespace: "TECH_CUSTOM",
    title: "Custom Domain",
    description: "Dynamically added domain",
    conditions: [
      {
        id: "TECH_CUSTOM-01",
        name: "Custom condition 01",
        namespace: "TECH_CUSTOM",
        check: () => [],
      },
    ],
    observation_kinds: ["custom_obs"],
    collectors: { custom: {} },
    report_projections: { score: () => 100 },
  };

  registerDomainModule(customModule);

  try {
    const fetched = domainRegistry.get("custom-plug-domain");
    assert.ok(fetched, "custom domain must be registered in domainRegistry");
    assert.equal(fetched.module_id, "custom-plug-domain");

    // Immediately discoverable in conditions
    const allConds = domainRegistry.getAllConditions();
    assert.ok(allConds.some((c) => c.id === "TECH_CUSTOM-01"), "custom condition must be in getAllConditions without touching core files");
  } finally {
    domainRegistry.unregister("custom-plug-domain");
  }
});

test("B-041: all 19 namespaces register through the module interface", () => {
  assert.equal(ALL_DOMAIN_MODULES.length, 19, "must have exactly 19 domain modules");

  const expectedNamespaces = [
    "AGENT", "ANS", "ARCH", "CLAIM", "CRAWL", "CRO", "CWV",
    "ENTITY", "EVD", "EXT", "GEO", "HREFLANG", "LIFE", "LINK",
    "MEAS", "PAGE", "RECO", "SCHEMA", "TECH",
  ].sort();

  const registeredNamespaces = ALL_DOMAIN_MODULES.map((m) => m.namespace).sort();
  assert.deepEqual(registeredNamespaces, expectedNamespaces, "every namespace must be registered");

  // Every module must conform to domain-module.schema.json
  for (const mod of ALL_DOMAIN_MODULES) {
    const check = validateAgainst("domain-module.schema.json", mod);
    assert.equal(check.valid, true, `module ${mod.module_id} failed schema validation: ${check.errors?.join("; ")}`);
    assert.ok(mod.conditions.length > 0, `module ${mod.module_id} must have conditions`);
    assert.ok(Array.isArray(mod.observation_kinds), `module ${mod.module_id} must declare observation_kinds`);
    assert.ok(typeof mod.collectors === "object", `module ${mod.module_id} must declare collectors`);
    assert.ok(typeof mod.report_projections === "object", `module ${mod.module_id} must declare report_projections`);
  }

  // Exact 186 condition parity
  const allDomainConditions = domainRegistry.getAllConditions();
  assert.equal(allDomainConditions.length, 186, "aggregated domain conditions must equal exactly 186");
  assert.equal(ALL_DETECTORS.length, 186, "ALL_DETECTORS must equal exactly 186");
});

test("B-042: disabled domain produces NOT_TESTED, not absence", () => {
  const allDetectors = domainRegistry.getAllConditions();
  const croDetectors = allDetectors.filter((d) => d.namespace === "CRO");
  const techDetectors = allDetectors.filter((d) => d.namespace === "TECH");

  assert.equal(croDetectors.length, 21);
  assert.equal(techDetectors.length, 25);

  const ctxWithCroDisabled = {
    disabled_domains: ["cro"],
    site: {
      baseUrl: "https://example.test",
      pages: [
        {
          url: "https://example.test/",
          title: "Home",
          text: "Sample page",
          headings: [],
          paragraphs: ["Sample paragraph"],
          links: [],
          images: [],
          jsonLd: [],
          html: "<html><body>Sample</body></html>",
          rawHtml: "<html><body>Sample</body></html>",
          ctas: [],
          forms: [],
        },
      ],
    },
  };

  const { determinations } = evaluateDeterminations(allDetectors, ctxWithCroDisabled);

  // 1. CRO determinations MUST be present (not absent!)
  const croDets = determinations.filter((d) => d.detector_id.startsWith("CRO-"));
  assert.equal(croDets.length, 21, "all 21 CRO conditions must be present in determinations");

  // 2. All CRO determinations MUST have status NOT_TESTED
  for (const det of croDets) {
    assert.equal(det.status, DETERMINATION_STATUS.NOT_TESTED, `${det.condition_id} must be NOT_TESTED when cro is disabled`);
    assert.match(det.reason, /disabled/i, "reason must explain that domain is disabled");
    assert.equal(det.applicable, false, "applicable must be false when domain is disabled");
    assert.equal(det.finding_id, null, "disabled condition must produce no finding");
  }

  // 3. Other domains (e.g. TECH) evaluate normally and are completely unaffected!
  const techDets = determinations.filter((d) => d.detector_id.startsWith("TECH-"));
  assert.ok(techDets.length > 0);
  assert.ok(techDets.some((d) => d.status !== DETERMINATION_STATUS.NOT_TESTED), "TECH conditions must evaluate normally and not be marked disabled");
});

test("B-042: domain disablement via config.disabled_domains preserves unaffected domains", () => {
  const detectors = domainRegistry.getAllConditions();
  const ctx = {
    config: {
      disabled_domains: ["agent"],
    },
    site: {
      baseUrl: "https://example.test",
      pages: [],
    },
  };

  const { determinations } = evaluateDeterminations(detectors, ctx);

  const agentDets = determinations.filter((d) => d.detector_id.startsWith("AGENT-"));
  assert.equal(agentDets.length, 16, "all 16 AGENT conditions must produce determinations");
  for (const det of agentDets) {
    assert.equal(det.status, DETERMINATION_STATUS.NOT_TESTED);
    assert.match(det.reason, /disabled by configuration/i);
  }
});
