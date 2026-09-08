import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { collectMcpEvidence } from "../../src/connectors/mcp/pilot.js";

const execFileAsync = promisify(execFile);
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "../..");
const CLI_PATH = path.join(ROOT, "src/cli/index.js");

test("collectMcpEvidence writes an immutable observation package with envelope and observation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-mcp-integration-"));

  try {
    const res = await collectMcpEvidence(tempDir, {
      serverId: "citable-evidence-pilot",
      toolName: "inspect_target",
      args: { url: "https://example.test/product" },
    });

    assert.ok(res.runId);
    assert.ok(fs.existsSync(res.dir));

    const manifestPath = path.join(res.dir, "manifest.json");
    const envelopePath = path.join(res.dir, "mcp-transport-envelope.json");
    const obsPath = path.join(res.dir, "observations/0001-mcp_transport.json");

    assert.ok(fs.existsSync(manifestPath));
    assert.ok(fs.existsSync(envelopePath));
    assert.ok(fs.existsSync(obsPath));

    const envelope = JSON.parse(fs.readFileSync(envelopePath, "utf8"));
    assert.equal(envelope.server.server_id, "citable-evidence-pilot");
    assert.equal(envelope.tool.name, "inspect_target");
    assert.equal(envelope.status, "success");

    const obs = JSON.parse(fs.readFileSync(obsPath, "utf8"));
    assert.equal(obs.kind, "mcp_transport");
    assert.equal(obs.state, "observed");
    assert.equal(obs.evidence_hash, envelope.response.raw_sha256);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI: citable connect mcp executes against allowlisted pilot server and outputs JSON", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-mcp-cli-"));

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      CLI_PATH,
      "connect",
      "mcp",
      "--server", "citable-evidence-pilot",
      "--tool", "query_search_index",
      "--target", "https://example.test/docs",
      "--json",
    ], { cwd: tempDir });

    assert.equal(stderr, "");
    const output = JSON.parse(stdout).result;
    assert.ok(output.runId);
    assert.equal(output.transportEnvelope.status, "success");
    assert.equal(output.transportEnvelope.server.server_id, "citable-evidence-pilot");
    assert.equal(output.transportEnvelope.tool.name, "query_search_index");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI: citable connect mcp fails closed when server or tool is unallowlisted", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-mcp-reject-"));

  try {
    // Unallowlisted server
    await assert.rejects(
      execFileAsync(process.execPath, [
        CLI_PATH,
        "connect",
        "mcp",
        "--server", "evil-remote-server",
        "--tool", "inspect_target",
      ], { cwd: tempDir }),
      (err) => err.code !== 0 && (err.stderr.includes("untrusted MCP server") || err.message.includes("untrusted MCP server"))
    );

    // Unallowlisted tool
    await assert.rejects(
      execFileAsync(process.execPath, [
        CLI_PATH,
        "connect",
        "mcp",
        "--server", "citable-evidence-pilot",
        "--tool", "arbitrary_eval",
      ], { cwd: tempDir }),
      (err) => err.code !== 0 && (err.stderr.includes("untrusted MCP tool") || err.message.includes("untrusted MCP tool"))
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("gsc-mcp: inspect_url and query_search_analytics execute over stdio and produce verified observations", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-gsc-mcp-"));

  try {
    // 1. inspect_url
    const inspectRes = await collectMcpEvidence(tempDir, {
      serverId: "gsc-mcp",
      toolName: "inspect_url",
      args: { url: "https://example.test/product", siteUrl: "https://example.test" },
    });

    assert.ok(inspectRes.runId);
    assert.equal(inspectRes.transportEnvelope.status, "success");
    assert.equal(inspectRes.transportEnvelope.server.server_id, "gsc-mcp");
    assert.equal(inspectRes.transportEnvelope.tool.name, "inspect_url");

    const inspectData = JSON.parse(inspectRes.transportEnvelope.response.content[0].text);
    assert.equal(inspectData.url, "https://example.test/product");
    assert.equal(inspectData.inspectionResult.verdict, "PASS");
    assert.equal(inspectData.inspectionResult.coverageState, "Submitted and indexed");

    // 2. query_search_analytics
    const analyticsRes = await collectMcpEvidence(tempDir, {
      serverId: "gsc-mcp",
      toolName: "query_search_analytics",
      args: { siteUrl: "https://example.test", startDate: "2026-09-01", endDate: "2026-09-07" },
    });

    assert.ok(analyticsRes.runId);
    assert.equal(analyticsRes.transportEnvelope.status, "success");
    assert.equal(analyticsRes.transportEnvelope.tool.name, "query_search_analytics");

    const analyticsData = JSON.parse(analyticsRes.transportEnvelope.response.content[0].text);
    assert.equal(analyticsData.siteUrl, "https://example.test");
    assert.ok(Array.isArray(analyticsData.rows));
    assert.equal(analyticsData.rows[0].clicks, 142);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI: citable connect mcp executes against gsc-mcp with auto-mapped arguments", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-gsc-cli-"));

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      CLI_PATH,
      "connect",
      "mcp",
      "--server", "gsc-mcp",
      "--tool", "inspect_url",
      "--target", "https://example.test/page",
      "--json",
    ], { cwd: tempDir });

    assert.equal(stderr, "");
    const output = JSON.parse(stdout).result;
    assert.ok(output.runId);
    assert.equal(output.transportEnvelope.status, "success");
    assert.equal(output.transportEnvelope.server.server_id, "gsc-mcp");
    assert.equal(output.transportEnvelope.tool.name, "inspect_url");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

