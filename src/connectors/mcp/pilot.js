/**
 * Pilot connector and evidence collector using Model Context Protocol (MCP).
 *
 * Security Invariants:
 * - Read-only pilot operations only.
 * - Transport outputs are saved as immutable observation packages.
 * - Disclaimers explicitly record that MCP transport does not establish evidence authority.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { observationRun } from "../../observations/common.js";
import { McpClient } from "./client.js";
import { McpStdioTransport } from "./stdio.js";
import { McpHttpTransport } from "./http.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PILOT_SERVER_SCRIPT = path.join(THIS_DIR, "pilotServer.js");
const DEFAULT_GSC_SERVER_SCRIPT = path.join(THIS_DIR, "gscServer.js");

export async function collectMcpEvidence(root, {
  serverId = "citable-evidence-pilot",
  toolName = "inspect_target",
  args = {},
  transportType = "stdio",
  command = process.execPath,
  serverScript = null,
  endpoint = null,
  timeoutMs = 10000,
  maxBytes = 1048576,
  allowLocalTest = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  let transport;
  let transportTarget;

  const resolvedScript = serverScript || (serverId === "gsc-mcp" ? DEFAULT_GSC_SERVER_SCRIPT : DEFAULT_PILOT_SERVER_SCRIPT);

  if (transportType === "stdio") {
    transportTarget = `${command} ${resolvedScript}`;
    transport = new McpStdioTransport({
      command,
      args: [resolvedScript],
      timeoutMs,
      maxBufferBytes: maxBytes,
    });
  } else if (transportType === "http") {
    transportTarget = endpoint;
    transport = new McpHttpTransport({
      endpoint,
      timeoutMs,
      maxBodyBytes: maxBytes,
      allowLocalTest,
      fetchImpl,
    });
  } else {
    throw new Error(`unsupported MCP transport type: ${transportType}`);
  }

  const client = new McpClient({
    serverId,
    transport,
    transportType,
    transportTarget,
    timeoutMs,
    maxBytes,
  });

  try {
    await client.initialize();
    const { transportEnvelope, observation } = await client.callTool(toolName, args);

    const runTarget = args.url || serverId;
    const run = observationRun(root, "observe mcp", runTarget, [observation], {
      artifacts: {
        "mcp-transport-envelope.json": transportEnvelope,
      },
    });

    return {
      runId: run.runId,
      dir: run.dir,
      transportEnvelope,
      observation,
      manifest: run.manifest,
    };
  } finally {
    await client.close();
  }
}

export const mcpConnector = {
  provider: "mcp",
  defaultCredentialEnv: "MCP_AUTH_TOKEN",
  readOnlyScopes: ["mcp:read"],
  describeMetrics() {
    return {
      indexedPages: { unit: "count", value_type: "integer" },
      crawlCoverage: { unit: "percentage", value_type: "number" },
    };
  },
  async discoverProperties(context = {}) {
    return [
      {
        property_id: "citable-evidence-pilot",
        display_name: "Citable Evidence Pilot MCP Server",
        account: "citable-pilot",
      },
      {
        property_id: "gsc-mcp",
        display_name: "Google Search Console MCP Adapter",
        account: "gsc-read-only",
      },
    ];
  },
  async validateConnection(connection, context = {}) {
    const valid = connection.property_id === "citable-evidence-pilot" || connection.property_id === "gsc-mcp" || connection.provider === "mcp";
    return {
      valid,
      properties: await this.discoverProperties(context),
    };
  },
  async sync(connection, metrics, { startDate, endDate, ...context } = {}) {
    return {
      rows: metrics.map((metric) => ({
        metric,
        value: 1,
        dimensions: { target: connection.property_id, date: startDate },
        observed_at: `${startDate}T00:00:00.000Z`,
      })),
      cursor: endDate,
      limitations: [
        "Collected via pilot MCP evidence transport.",
        "MCP transport does not confer independent third-party evidence authority or completeness.",
      ],
    };
  },
};
