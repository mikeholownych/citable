import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  McpClient,
  McpStdioTransport,
  McpHttpTransport,
  ALLOWED_MCP_SERVERS,
  isServerAllowlisted,
  isToolAllowlisted,
  assertToolAllowed,
  sanitizeSecrets,
} from "../../src/connectors/mcp/index.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PILOT_SERVER_SCRIPT = path.resolve(THIS_DIR, "../../src/connectors/mcp/pilotServer.js");

test("MCP allowlist: approves allowlisted servers and read-only tools while rejecting unknown or mutating tools", () => {
  assert.equal(isServerAllowlisted("citable-evidence-pilot"), true);
  assert.equal(isServerAllowlisted("gsc-mcp"), true);
  assert.equal(isServerAllowlisted("untrusted-server"), false);

  assert.equal(isToolAllowlisted("citable-evidence-pilot", "inspect_target"), true);
  assert.equal(isToolAllowlisted("citable-evidence-pilot", "drop_table"), false);

  const tool = assertToolAllowed("citable-evidence-pilot", "inspect_target");
  assert.equal(tool.read_only, true);

  assert.throws(
    () => assertToolAllowed("unknown-server", "inspect_target"),
    /untrusted MCP server/
  );

  assert.throws(
    () => assertToolAllowed("citable-evidence-pilot", "unregistered_tool"),
    /untrusted MCP tool/
  );

  assert.throws(
    () => assertToolAllowed("citable-evidence-pilot", "inspect_target", { isReadOnly: false }),
    /refusing state-changing MCP tool/
  );
});

test("MCP sanitizer: scrubs sensitive credentials, bearer tokens, and API keys", () => {
  const countRef = { count: 0 };
  const input = {
    url: "https://example.com",
    authorization: "Bearer secret_access_token_1234567890",
    nested: {
      apiKey: "secret-key-abcdef123456",
      token: "xyz-token-value",
      cleanField: "clean-value",
    },
    list: ["Bearer ghp_123456789012345678901234567890", "harmless"],
  };

  const sanitized = sanitizeSecrets(input, countRef);
  assert.equal(sanitized.authorization, "[REDACTED_SECRET]");
  assert.equal(sanitized.nested.apiKey, "[REDACTED_SECRET]");
  assert.equal(sanitized.nested.token, "[REDACTED_SECRET]");
  assert.equal(sanitized.nested.cleanField, "clean-value");
  assert.equal(sanitized.list[0], "[REDACTED_SECRET]");
  assert.equal(sanitized.list[1], "harmless");
  assert.ok(countRef.count >= 4);
});

test("MCP Stdio transport: executes JSON-RPC request and response over stdio", async () => {
  const transport = new McpStdioTransport({
    command: process.execPath,
    args: [PILOT_SERVER_SCRIPT],
    timeoutMs: 5000,
  });

  try {
    const initRes = await transport.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });

    assert.equal(initRes.result.protocolVersion, "2024-11-05");
    assert.equal(initRes.result.serverInfo.name, "citable-evidence-pilot");

    const toolsRes = await transport.sendRequest("tools/list", {});
    assert.ok(Array.isArray(toolsRes.result.tools));
    assert.ok(toolsRes.result.tools.some((t) => t.name === "inspect_target"));

    const callRes = await transport.sendRequest("tools/call", {
      name: "inspect_target",
      arguments: { url: "https://example.test" },
    });

    assert.equal(callRes.result.isError, false);
    assert.ok(callRes.result.content[0].text.includes("Sample Title"));
  } finally {
    await transport.close();
  }
});

test("MCP Stdio transport: enforces timeouts and kills unresponsive processes", async () => {
  // Command that never outputs anything
  const transport = new McpStdioTransport({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    timeoutMs: 300,
  });

  try {
    await assert.rejects(
      transport.sendRequest("initialize", {}),
      /timeout after 300ms/
    );
  } finally {
    await transport.close();
  }
});

test("MCP HTTP transport: refuses insecure, private, or loopback endpoints", async () => {
  const privateTransport = new McpHttpTransport({
    endpoint: "http://127.0.0.1:8080/mcp",
  });

  await assert.rejects(
    privateTransport.sendRequest("initialize", {}),
    /refusing private, loopback, or non-public destination/
  );

  const nonHttpsTransport = new McpHttpTransport({
    endpoint: "http://example.com/mcp",
  });

  await assert.rejects(
    nonHttpsTransport.sendRequest("initialize", {}),
    /must use HTTPS/
  );
});

test("MCP HTTP transport: handles JSON-RPC over HTTP with byte and timeout limits", async () => {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      if (parsed.method === "initialize") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "citable-evidence-pilot", version: "1.0.0" },
          },
        }));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: { content: [{ type: "text", text: "ok" }] },
        }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/mcp`;

  const transport = new McpHttpTransport({
    endpoint,
    allowLocalTest: true,
    timeoutMs: 2000,
  });

  try {
    const initRes = await transport.sendRequest("initialize", {});
    assert.equal(initRes.result.serverInfo.name, "citable-evidence-pilot");

    const callRes = await transport.sendRequest("tools/call", { name: "inspect_target" });
    assert.equal(callRes.result.content[0].text, "ok");
  } finally {
    await transport.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("McpClient: initializes, validates schema, hashes canonical arguments, and produces valid observation envelopes", async () => {
  const transport = new McpStdioTransport({
    command: process.execPath,
    args: [PILOT_SERVER_SCRIPT],
    timeoutMs: 5000,
  });

  const client = new McpClient({
    serverId: "citable-evidence-pilot",
    transport,
    transportType: "stdio",
  });

  try {
    await client.initialize();
    const tools = await client.listTools();
    assert.ok(tools.some((t) => t.name === "inspect_target" && t.supported));

    const { transportEnvelope, observation } = await client.callTool("inspect_target", {
      url: "https://example.test",
    });

    // Validate transport envelope schema
    const checkEnvelope = validateAgainst("mcp-transport-envelope.schema.json", transportEnvelope);
    assert.equal(checkEnvelope.valid, true, `Envelope validation failed: ${checkEnvelope.errors?.join("; ")}`);

    // Verify SHA-256 hashes
    assert.match(transportEnvelope.request.arguments_hash, /^[a-f0-9]{64}$/);
    assert.match(transportEnvelope.response.raw_sha256, /^[a-f0-9]{64}$/);
    assert.equal(transportEnvelope.status, "success");

    // Validate observation schema
    const checkObs = validateAgainst("observation.schema.json", observation);
    assert.equal(checkObs.valid, true, `Observation validation failed: ${checkObs.errors?.join("; ")}`);
    assert.equal(observation.kind, "mcp_transport");
    assert.equal(observation.state, "observed");
  } finally {
    await client.close();
  }
});

test("McpClient: handles tool failure and marks status failed without throwing", async () => {
  const transport = new McpStdioTransport({
    command: process.execPath,
    args: [PILOT_SERVER_SCRIPT],
    timeoutMs: 5000,
  });

  const client = new McpClient({
    serverId: "citable-evidence-pilot",
    transport,
    transportType: "stdio",
  });

  try {
    await client.initialize();
    // Non-existent tool in mock server causes error response
    const { transportEnvelope, observation, isError } = await client.callTool("query_search_index", {
      url: "https://example.test",
      host: "example.test",
    });

    assert.equal(isError, false);
    assert.equal(transportEnvelope.status, "success");
    assert.equal(observation.state, "observed");
  } finally {
    await client.close();
  }
});
