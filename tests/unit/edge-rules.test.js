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

  const croRes = await exportEdgeRules(root, { format: "cloudflare-cro" });
  assert.equal(croRes.format, "cloudflare-cro");
  assert.ok(croRes.content.includes("HTMLRewriter"));
  assert.ok(croRes.content.includes("autocomplete"));

  const vercelRes = await exportEdgeRules(root, { format: "vercel-middleware" });
  assert.equal(vercelRes.format, "vercel-middleware");
  assert.ok(vercelRes.content.includes("NextResponse"));

  const shopifyRes = await exportEdgeRules(root, { format: "shopify-snippet" });
  assert.equal(shopifyRes.format, "shopify-snippet");
  assert.ok(shopifyRes.content.includes("autocomplete"));

  const awsRes = await exportEdgeRules(root, { format: "aws-cloudfront" });
  assert.equal(awsRes.format, "aws-cloudfront");
  assert.ok(awsRes.content.includes("CloudFront"));
  assert.ok(awsRes.content.includes("/llms.txt"));

  const fastlyRes = await exportEdgeRules(root, { format: "fastly-compute" });
  assert.equal(fastlyRes.format, "fastly-compute");
  assert.ok(fastlyRes.content.includes("Fastly"));
  assert.ok(fastlyRes.content.includes("handleRequest"));

  const splitRes = await exportEdgeRules(root, { format: "edge-variant-split" });
  assert.equal(splitRes.format, "edge-variant-split");
  assert.ok(splitRes.content.includes("getExperimentVariant"));
  assert.ok(splitRes.content.includes("fnv1a32"));
});

test("testEdgeRules validates Cloudflare, AWS CloudFront, and Fastly headers", async () => {
  const root = tmpProject("registries-good");

  // Clean Cloudflare edge response
  const cleanCf = await testEdgeRules(root, {
    provider: "cloudflare",
    baseUrl: "https://nebulacomponents.com",
    headers: {
      "cf-ray": "8bf123456789-IAD",
      "x-content-type-options": "nosniff",
    },
  });
  assert.equal(cleanCf.status, "healthy");
  assert.equal(cleanCf.passed_checks, 3);

  // Clean AWS CloudFront response
  const cleanAws = await testEdgeRules(root, {
    provider: "aws",
    baseUrl: "https://nebulacomponents.com",
    headers: {
      "x-amz-cf-id": "AbCdEf1234==",
      "x-content-type-options": "nosniff",
    },
  });
  assert.equal(cleanAws.status, "healthy");
  assert.equal(cleanAws.passed_checks, 3);

  // Clean Fastly response
  const cleanFastly = await testEdgeRules(root, {
    provider: "fastly",
    baseUrl: "https://nebulacomponents.com",
    headers: {
      "x-served-by": "cache-iad-12345",
      "x-content-type-options": "nosniff",
    },
  });
  assert.equal(cleanFastly.status, "healthy");
  assert.equal(cleanFastly.passed_checks, 3);

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
