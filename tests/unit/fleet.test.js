import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fleetSummary, fleetAudit } from "../../src/commands/fleet.js";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function tmpProject(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-fleet-test-"));
  fs.mkdirSync(path.join(dir, ".citable"), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, ".citable", f));
    }
  }
  return dir;
}

test("fleetSummary reports property counts, environments, and active status", async () => {
  const root = tmpProject("registries-good");
  const res = await fleetSummary(root);

  assert.equal(res.total_properties, 2);
  assert.equal(res.active_properties, 2);
  assert.equal(res.by_environment.production, 1);
  assert.equal(res.by_environment.staging, 1);
  assert.equal(res.properties[0].property_id, "PROP-NEBULA-PROD");
});

test("fleetAudit filters by environment and calculates health summary", async () => {
  const root = tmpProject("registries-good");
  const mockFetcher = async (url) => {
    if (url.endsWith('/robots.txt')) {
      return { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nAllow: /\n' };
    }
    return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html><html lang="en"><head><title>Nebula Test</title></head><body><h1>Nebula</h1></body></html>' };
  };
  const res = await fleetAudit(root, { environment: "production", fetcher: mockFetcher, maxPages: 1 });

  assert.equal(res.fleet_size, 1);
  assert.equal(res.properties[0].property_id, "PROP-NEBULA-PROD");
  assert.equal(typeof res.fleet_health, "string");
});
