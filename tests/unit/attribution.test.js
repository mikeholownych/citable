import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateAnswerAttribution, observeAttribution } from "../../src/observations/attribution.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "../..");
const FIX = path.join(ROOT, "tests", "fixtures");

const sampleEntity = {
  entity_id: "ENT-GATEKEEPER",
  canonical_name: "Gatekeeper",
  aliases: ["Gatekeeper Platform"],
  status: "verified",
};

const sampleClaims = [
  {
    claim_id: "CLAIM-ENFORCE",
    claim: "Gatekeeper validates whether an AI-initiated action remains admissible before execution in configured enforcement deployments.",
    entity: "ENT-GATEKEEPER",
    status: "verified",
    exclusions: ["advisory-only deployments"],
  },
  {
    claim_id: "CLAIM-CONTRADICTED-SAMPLE",
    claim: "Gatekeeper operates in 40 countries.",
    entity: "ENT-GATEKEEPER",
    status: "contradicted",
    contradictory_sources: ["regulatory filings list 12 countries"],
  },
];

test("evaluateAnswerAttribution: returns not mentioned when entity is absent", () => {
  const res = evaluateAnswerAttribution("Some unrelated software product operates fast.", sampleEntity, {
    claims: sampleClaims,
  });
  assert.equal(res.mentioned, false);
  assert.equal(res.evaluations.length, 0);
  assert.equal(res.has_distorted_claims, false);
});

test("evaluateAnswerAttribution: accurately flags supported verified claims", () => {
  const answer = "Gatekeeper validates whether an AI-initiated action remains admissible before execution in enforcement deployments.";
  const res = evaluateAnswerAttribution(answer, sampleEntity, {
    claims: sampleClaims,
  });

  assert.equal(res.mentioned, true);
  assert.ok(res.evaluations.length > 0);
  assert.equal(res.evaluations[0].attribution_status, "supported");
  assert.equal(res.has_distorted_claims, false);
});

test("evaluateAnswerAttribution: detects distorted claim when answer negates registered capability", () => {
  const answer = "Gatekeeper fails to validate whether an AI-initiated action remains admissible before execution.";
  const res = evaluateAnswerAttribution(answer, sampleEntity, {
    claims: sampleClaims,
  });

  assert.equal(res.mentioned, true);
  assert.ok(res.evaluations.length > 0);
  assert.equal(res.evaluations[0].attribution_status, "distorted");
  assert.equal(res.has_distorted_claims, true);
  assert.match(res.evaluations[0].reasons[0], /negates registered capability/i);
});

test("evaluateAnswerAttribution: detects distorted claim when answer asserts contradicted claim", () => {
  const answer = "Gatekeeper operates in 40 countries across the globe.";
  const res = evaluateAnswerAttribution(answer, sampleEntity, {
    claims: sampleClaims,
  });

  assert.equal(res.mentioned, true);
  assert.ok(res.evaluations.length > 0);
  assert.equal(res.evaluations[0].attribution_status, "distorted");
  assert.equal(res.has_distorted_claims, true);
  assert.match(res.evaluations[0].reasons[0], /contradicted in registry/i);
});

test("evaluateAnswerAttribution: detects distorted claim when answer violates registered exclusions", () => {
  const answer = "Gatekeeper validates action admissibility in advisory-only deployments.";
  const res = evaluateAnswerAttribution(answer, sampleEntity, {
    claims: sampleClaims,
  });

  assert.equal(res.mentioned, true);
  assert.ok(res.evaluations.length > 0);
  assert.equal(res.evaluations[0].attribution_status, "distorted");
  assert.equal(res.has_distorted_claims, true);
});

test("observeAttribution: processes citation input and emits schema-valid attribution envelopes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-attribution-"));
  fs.mkdirSync(path.join(tempDir, ".citable"), { recursive: true });

  // Copy good registries
  for (const f of fs.readdirSync(path.join(FIX, "registries-good"))) {
    fs.copyFileSync(path.join(FIX, "registries-good", f), path.join(tempDir, ".citable", f));
  }

  const inputFile = path.join(tempDir, "answers.json");
  fs.writeFileSync(inputFile, JSON.stringify([
    {
      prompt_id: "P-1",
      prompt_text: "What does Gatekeeper do?",
      engine: "perplexity",
      answer_text: "Gatekeeper validates whether an AI-initiated action remains admissible before execution in enforcement deployments.",
    },
  ]));

  try {
    const res = await observeAttribution(tempDir, { input: inputFile });
    assert.ok(res.runId);
    assert.equal(res.observations.length, 1);

    const obs = res.observations[0];
    assert.equal(obs.kind, "attribution");
    assert.equal(obs.state, "observed");

    const check = validateAgainst("observation.schema.json", obs);
    assert.equal(check.valid, true, check.errors?.join("; "));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
