import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lintComponents } from "../../src/commands/lintComponents.js";

test("lintComponents detects UI component anti-patterns and passes clean components", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-components-test-"));

  // Broken component
  const brokenContent = `
export function BrokenButton() {
  return (
    <div>
      <button className="h-8">Click here</button>
      <button><svg /></button>
      <input name="email" type="email" />
      <img src="/hero.png" />
    </div>
  );
}
`;
  fs.writeFileSync(path.join(tmpDir, "BrokenButton.tsx"), brokenContent);

  const brokenRes = await lintComponents(tmpDir);
  assert.equal(brokenRes.status, "issues_detected");
  assert.ok(brokenRes.findings.some((f) => f.rule_id === "COMP-001"), "must detect touch target < 44px");
  assert.ok(brokenRes.findings.some((f) => f.rule_id === "COMP-002"), "must detect unlabelled icon button");
  assert.ok(brokenRes.findings.some((f) => f.rule_id === "COMP-003"), "must detect generic CTA");
  assert.ok(brokenRes.findings.some((f) => f.rule_id === "COMP-005"), "must detect missing autocomplete");
  assert.ok(brokenRes.findings.some((f) => f.rule_id === "COMP-006"), "must detect missing alt on img");

  // Clean component
  const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-components-clean-"));
  const cleanContent = `
export function CleanButton() {
  return (
    <div>
      <button className="min-h-12" aria-label="Purchase License">Get Started</button>
      <input id="user-email" aria-label="Email Address" name="email" type="email" autocomplete="email" />
      <img src="/hero.png" alt="Nebula Components Architecture Diagram" width="800" height="600" />
    </div>
  );
}
`;
  fs.writeFileSync(path.join(cleanDir, "CleanButton.tsx"), cleanContent);

  const cleanRes = await lintComponents(cleanDir);
  assert.equal(cleanRes.status, "clean");
  assert.equal(cleanRes.total_findings, 0);
});
