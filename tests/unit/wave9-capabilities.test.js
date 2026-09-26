import test from "node:test";
import assert from "node:assert/strict";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

import {
  createPassiveBacklinkObservation,
  compareBacklinkObservations,
  backlinksForTarget,
  referringDomainsForTarget,
} from "../../src/discovery/backlinks.js";

import {
  EvidenceInterface,
  createEvidenceInterface,
  EPISTEMIC_STATES,
} from "../../src/evidence/interface.js";

import {
  createExternalObservation,
  createResearchDataset,
  createEvidenceClaim,
} from "../../src/evidence/external.js";

import {
  verifyContentEvidenceBoundary,
} from "../../src/representation/contentBoundary.js";

/* -------------------------------------------------------------------------- */
/* ER-10: Passive Backlink and Referring-Domain Observations                  */
/* -------------------------------------------------------------------------- */

test("ER-10: passive backlink observation preserves source, target, link and retrieval state", () => {
  const obs = createPassiveBacklinkObservation({
    source_url: "https://tech-digest.example/best-seo-tools",
    target_url: "https://myproduct.example/features",
    link: {
      raw_href: "https://myproduct.example/features",
      anchor_text: "Top SEO Suite",
      rel: "nofollow",
      rel_tokens: ["nofollow"],
      nofollow: true,
      sponsored: false,
      ugc: false,
    },
    retrieval: {
      status: "SUCCEEDED",
      method: "passive_html_crawler",
      http_status: 200,
      extraction_version: "1.0.0",
      retrieval_version: "1.0.0",
    },
    observed_at: "2026-09-26T06:00:00.000Z",
  });

  assert.ok(obs.observation_id.startsWith("BL-OBS-"));
  assert.ok(obs.logical_link_id.startsWith("BL-LINK-"));
  assert.equal(obs.observation_status, "OBSERVED");
  assert.equal(obs.source.domain, "tech-digest.example");
  assert.equal(obs.target.normalized_url, "https://myproduct.example/features");
  assert.equal(obs.link.anchor_text, "Top SEO Suite");
  assert.equal(obs.link.nofollow, true);

  const check = validateAgainst("backlink-observation.schema.json", obs);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

test("ER-10: acquisition, exchange, outreach, and link-quality conclusions are rejected", () => {
  assert.throws(
    () => {
      createPassiveBacklinkObservation({
        source_url: "https://publisher.example/links",
        target_url: "https://mysite.example/",
        acquisition_effort: "outreach_campaign_q3", // Prohibited conclusion!
      });
    },
    /NON_GOAL_VIOLATION/
  );

  assert.throws(
    () => {
      createPassiveBacklinkObservation({
        source_url: "https://publisher.example/links",
        target_url: "https://mysite.example/",
        link_quality_rating: "HIGH_AUTHORITY_TIER_1", // Prohibited canonical score!
      });
    },
    /NON_GOAL_VIOLATION/
  );
});

test("ER-10: query helpers filter by target and aggregate referring domains", () => {
  const obs1 = createPassiveBacklinkObservation({
    source_url: "https://domain-a.example/page1",
    target_url: "https://mysite.example/guide",
    link: { anchor_text: "Guide A" },
    observed_at: "2026-09-26T06:00:00.000Z",
  });

  const obs2 = createPassiveBacklinkObservation({
    source_url: "https://domain-a.example/page2",
    target_url: "https://mysite.example/guide",
    link: { anchor_text: "Guide B" },
    observed_at: "2026-09-26T06:00:00.000Z",
  });

  const obs3 = createPassiveBacklinkObservation({
    source_url: "https://domain-b.example/resources",
    target_url: "https://mysite.example/other",
    link: { anchor_text: "Other" },
    observed_at: "2026-09-26T06:00:00.000Z",
  });

  const all = [obs1, obs2, obs3];

  const guideBacklinks = backlinksForTarget(all, "https://mysite.example/guide");
  assert.equal(guideBacklinks.length, 2);

  const referringDomains = referringDomainsForTarget(all, "https://mysite.example/guide");
  assert.deepEqual(referringDomains, ["domain-a.example"]);
});

test("ER-10: compareBacklinkObservations detects UNCHANGED, CHANGED, NO_LONGER_OBSERVED, and NOT_COMPARABLE", () => {
  const base = createPassiveBacklinkObservation({
    source_url: "https://blog.example/post",
    target_url: "https://mysite.example/home",
    link: { anchor_text: "Home", rel_tokens: [] },
    observed_at: "2026-09-26T01:00:00.000Z",
  });

  // 1. Unchanged
  const unchanged = compareBacklinkObservations(base, base);
  assert.equal(unchanged.status, "COMPARABLE");
  assert.equal(unchanged.transition, "UNCHANGED");

  // 2. Changed (rel changed to nofollow)
  const modified = createPassiveBacklinkObservation({
    source_url: "https://blog.example/post",
    target_url: "https://mysite.example/home",
    link: { anchor_text: "Home", rel: "nofollow", rel_tokens: ["nofollow"] },
    observed_at: "2026-09-26T02:00:00.000Z",
  });
  const changedCmp = compareBacklinkObservations(base, modified);
  assert.equal(changedCmp.status, "COMPARABLE");
  assert.equal(changedCmp.transition, "CHANGED");

  // 3. No longer observed
  const lost = createPassiveBacklinkObservation({
    source_url: "https://blog.example/post",
    target_url: "https://mysite.example/home",
    observation_status: "NOT_OBSERVED",
    observed_at: "2026-09-26T03:00:00.000Z",
  });
  const lostCmp = compareBacklinkObservations(base, lost);
  assert.equal(lostCmp.transition, "NO_LONGER_OBSERVED");

  // 4. Incomparable targets
  const differentTarget = createPassiveBacklinkObservation({
    source_url: "https://blog.example/post",
    target_url: "https://competitor.example/other",
    observed_at: "2026-09-26T04:00:00.000Z",
  });
  const diffCmp = compareBacklinkObservations(base, differentTarget);
  assert.equal(diffCmp.status, "NOT_COMPARABLE");

  const check = validateAgainst("backlink-comparison.schema.json", changedCmp);
  assert.equal(check.valid, true, check.errors?.join("; "));
});

/* -------------------------------------------------------------------------- */
/* ER-12: Machine-Consumable Evidence Interface                               */
/* -------------------------------------------------------------------------- */

test("ER-12: structured operations expose observations, verification, datasets, and lineage with explicit epistemic state", () => {
  const engine = createEvidenceInterface();

  // 1. Observations and Epistemic State
  const missing = engine.getObservation("NON_EXISTENT_ID");
  assert.equal(missing.epistemic_state, EPISTEMIC_STATES.UNOBSERVED);
  assert.equal(missing.observation, null);

  const sampleObs = createExternalObservation({
    observation_id: "EXT-OBS-sample-1234567890abcdef",
    observation_type: "EXTERNAL_OBSERVATION",
    subject: { type: "test", id: "subject_1" },
    source: { provider: "test_provider", method: "test_method", authority: "external_provider" },
    collector: { id: "test_collector", version: "1.0.0" },
    parser: { id: "test_parser", version: "1.0.0" },
    configuration: { id: "test_config", version: "1.0.0" },
    observed_at: "2026-09-20T10:00:00Z",
    retrieved_at: "2026-09-20T10:01:00Z",
    population: { declared: { id: "pop_1", size: 1 }, observed: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    observation_status: "observed",
    retrieval_status: "retrieved",
    data: { key: "value" },
    lineage: { source_evidence: ["hash_abc"] },
    limitations: ["Sample limitation"],
  });

  engine.storeObservation(sampleObs);
  const found = engine.getObservation(sampleObs.observation_id);
  assert.equal(found.epistemic_state, EPISTEMIC_STATES.OBSERVED);
  assert.equal(found.observation.observation_id, sampleObs.observation_id);

  // 2. Evidence Verification
  const verifyValid = engine.verifyEvidence(sampleObs);
  assert.equal(verifyValid.epistemic_state, EPISTEMIC_STATES.KNOWN_FACT);
  assert.equal(verifyValid.valid, true);

  const tampered = { ...sampleObs, evidence_hash: "tampered_hash_value" };
  const verifyTampered = engine.verifyEvidence(tampered);
  assert.equal(verifyTampered.epistemic_state, EPISTEMIC_STATES.UNVERIFIABLE);
  assert.equal(verifyTampered.valid, false);

  // 3. Datasets
  const ds = createResearchDataset({
    dataset_id: "DS-benchmark-q3",
    dataset_version: 1,
    declared_purpose: "Evaluate feature X in declared products",
    declared_population: { type: "products", id: "POP-1", size: 1 },
    population_size: 1,
    inclusion_criteria: ["declared products"],
    exclusion_criteria: [],
    collection: { started_at: "2026-09-20T10:00:00Z", ended_at: "2026-09-20T10:02:00Z" },
    source_references: ["SRC-1"],
    observation_references: [sampleObs.observation_id],
    normalization: { method: "identity", version: "1.0.0" },
    derivation_references: [],
    coverage: { declared: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    coverage_status: "complete_for_declared_population",
    limitations: [],
  });
  engine.storeDataset(ds);

  const retrievedDs = engine.getDataset("DS-benchmark-q3", 1);
  assert.equal(retrievedDs.epistemic_state, EPISTEMIC_STATES.KNOWN_FACT);
  assert.equal(retrievedDs.dataset.dataset_id, "DS-benchmark-q3");

  // 4. Lineage Trace
  const lineage = engine.getLineage(sampleObs.observation_id);
  assert.equal(lineage.epistemic_state, EPISTEMIC_STATES.KNOWN_FACT);
  assert.ok(lineage.lineage_chain.length >= 2);
  assert.equal(lineage.lineage_chain[0].id, sampleObs.observation_id);
  assert.equal(lineage.lineage_chain[1].id, "hash_abc");
});

/* -------------------------------------------------------------------------- */
/* ER-13: Autonomous-Content Evidence Boundary                                */
/* -------------------------------------------------------------------------- */

test("ER-13: evaluates proposed claims; refuses generation and unauthorized publication", () => {
  const engine = createEvidenceInterface();

  const obs = createExternalObservation({
    observation_id: "EXT-OBS-product-1234567890abcdef",
    observation_type: "EXTERNAL_OBSERVATION",
    subject: { type: "product", id: "prod_42" },
    source: { provider: "catalog", method: "api", authority: "external_provider" },
    collector: { id: "collector", version: "1.0.0" },
    parser: { id: "parser", version: "1.0.0" },
    configuration: { id: "config", version: "1.0.0" },
    observed_at: "2026-09-20T10:00:00Z",
    retrieved_at: "2026-09-20T10:01:00Z",
    population: { declared: { id: "catalog_pop", size: 1 }, observed: 1, retrieved: 1, evaluated: 1, unavailable: 0, failed: 0 },
    observation_status: "observed",
    retrieval_status: "retrieved",
    data: { status: "in_stock", price: 49.99 },
    lineage: { source_evidence: ["source_hash_xyz"] },
    limitations: [],
  });
  engine.storeObservation(obs);

  // Claim 1: Supported factual proposition within declared observation scope
  const supportedClaim = createEvidenceClaim({
    claim_id: "claim_stock_available",
    claim_version: 1,
    proposition: "Product 42 is in stock",
    declared_scope: { type: "observation", observation_reference: obs.observation_id, generalization: "bounded" },
    evidence_references: [obs.observation_id],
    observation_references: [obs.observation_id],
    dataset_references: [],
    derivation_references: [],
    assertion: { type: "predicate", path: "data.status", operator: "equals", value: "in_stock" },
    limitations: [],
  });

  // Claim 2: Contradicted proposition (claims price is 19.99, but observed price is 49.99)
  const contradictedClaim = createEvidenceClaim({
    claim_id: "claim_price_discounted",
    claim_version: 1,
    proposition: "Product 42 costs 19.99",
    declared_scope: { type: "observation", observation_reference: obs.observation_id, generalization: "bounded" },
    evidence_references: [obs.observation_id],
    observation_references: [obs.observation_id],
    dataset_references: [],
    derivation_references: [],
    assertion: { type: "predicate", path: "data.price", operator: "equals", value: 19.99 },
    limitations: [],
  });

  // Case 1: Proposed content without downstream authority
  const boundaryResult = verifyContentEvidenceBoundary({
    candidateDocumentId: "doc_landing_page_v1",
    proposedClaims: [supportedClaim],
    evidenceInterface: engine,
    downstreamAuthority: null, // No authority provided!
  });

  assert.equal(boundaryResult.citable_content_generated, false); // Citable DOES NOT generate content
  assert.equal(boundaryResult.publication_authorized, false); // Citable DOES NOT authorize publication
  assert.equal(boundaryResult.authority_scope, "EVIDENCE_VERIFICATION_ONLY");
  assert.equal(boundaryResult.verification_summary.supported_claims, 1);
  assert.equal(boundaryResult.verification_summary.all_claims_supported, true);
  assert.match(boundaryResult.downstream_authorization.refusal_reason, /does not authorize publication/);

  // Case 2: Downstream authority provided, and all claims supported -> authorized
  const authorizedResult = verifyContentEvidenceBoundary({
    candidateDocumentId: "doc_landing_page_v1",
    proposedClaims: [supportedClaim],
    evidenceInterface: engine,
    downstreamAuthority: {
      authorized_by: "chief_editor_jane",
      authority_type: "DOWNSTREAM_PUBLISHER",
    },
  });

  assert.equal(authorizedResult.publication_authorized, true);
  assert.equal(authorizedResult.authority_scope, "DOWNSTREAM_AUTHORIZED");
  assert.equal(authorizedResult.downstream_authorization.authorized_by, "chief_editor_jane");
  assert.equal(authorizedResult.downstream_authorization.refusal_reason, null);

  // Case 3: Downstream authority provided, but content includes contradicted claim -> refused
  const contradictedResult = verifyContentEvidenceBoundary({
    candidateDocumentId: "doc_landing_page_v2",
    proposedClaims: [supportedClaim, contradictedClaim],
    evidenceInterface: engine,
    downstreamAuthority: {
      authorized_by: "chief_editor_jane",
      authority_type: "DOWNSTREAM_PUBLISHER",
    },
  });

  assert.equal(contradictedResult.publication_authorized, false);
  assert.equal(contradictedResult.verification_summary.contradicted_claims, 1);
  assert.equal(contradictedResult.verification_summary.all_claims_supported, false);
  assert.match(contradictedResult.downstream_authorization.refusal_reason, /contradicted/i);

  const check = validateAgainst("autonomous-content-boundary.schema.json", authorizedResult);
  assert.equal(check.valid, true, check.errors?.join("; "));
});
