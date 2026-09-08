import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportEdgeRules, testEdgeRules } from "../../src/commands/edgeRules.js";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function tmpProject(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-edge-test-"));
  fs.mkdirSync(path.join(dir, ".citable"), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, ".citable", f));
    }
  }
  return dir;
}

test("exportEdgeRules generates Cloudflare redirects, WAF expressions, and worker scripts", async () => {
  const root = tmpProject("registries-good");

  const redRes = await exportEdgeRules(root, { format: "cloudflare-redirects" });
  assert.equal(redRes.format, "cloudflare-redirects");
  assert.ok(redRes.content.includes("Cloudflare"));

  const wafRes = await exportEdgeRules(root, { format: "cloudflare-waf" });
  assert.equal(wafRes.format, "cloudflare-waf");
  assert.ok(wafRes.content.includes("WAF"));

  const workerRes = await exportEdgeRules(root, { format: "cloudflare-worker" });
  assert.equal(workerRes.format, "cloudflare-worker");
  assert.ok(workerRes.content.includes("HTMLRewriter") || workerRes.content.includes("/llms.txt"));
});

test("testEdgeRules validates Cloudflare headers and catches edge challenges", async () => {
  const root = tmpProject("registries-good");

  // Clean edge response
  const cleanRes = await testEdgeRules(root, {
    provider: "cloudflare",
    baseUrl: "https://nebulacomponents.com",
    headers: {
      "cf-ray": "8bf123456789-IAD",
      "x-content-type-options": "nosniff",
    },
  });
  assert.equal(cleanRes.status, "healthy");
  assert.equal(cleanRes.passed_checks, 3);

  // Challenged response
  const challengedRes = await testEdgeRules(root, {
    provider: "cloudflare",
    baseUrl: "https://nebulacomponents.com",
    headers: {
      "cf-ray": "8bf123456789-IAD",
      "cf-mitigated": "challenge",
    },
  });
  assert.equal(challengedRes.status, "remediation_needed");
  assert.ok(challengedRes.checks.some((c) => c.check_id === "EDGE-BOT-CHALLENGE" && !c.passed));
});
