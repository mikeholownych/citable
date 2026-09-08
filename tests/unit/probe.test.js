import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeEngine } from "../../src/commands/probe.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function tmpProject(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-probe-test-"));
  fs.mkdirSync(path.join(dir, ".citable"), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, ".citable", f));
    }
  }
  return dir;
}

test("probeEngine returns schema-valid observation envelope", async () => {
  const root = tmpProject("registries-good");
  const obs = await probeEngine(root, "best web component framework", {
    engine: "perplexity",
    targetDomain: "nebulacomponents.com",
    mock: true,
  });

  const { valid, errors } = validateAgainst("observation.schema.json", obs);
  assert.equal(valid, true, errors.join("; "));
  assert.equal(obs.kind, "citation");
  assert.equal(obs.state, "observed");
  assert.equal(obs.data.provider, "perplexity");
  assert.equal(obs.data.property_cited, true);
  assert.ok(obs.evidence_hash.length === 64);
});
