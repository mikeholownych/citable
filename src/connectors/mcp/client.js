/**
 * Read-only Model Context Protocol (MCP) client.
 *
 * Security Invariants:
 * - Refuses unallowlisted servers and state-changing tools (fail-closed).
 * - Hashes canonical arguments and raw payloads using SHA-256.
 * - Enforces zero secret persistence via recursive sanitization.
 * - Emits schema-validated mcp-transport-envelope records.
 * - Normalizes into immutable Citable observation envelopes.
 */

import { sha256 } from "../../shared/io.js";
import { validateAgainst } from "../../shared/schemaValidator.js";
import { envelope } from "../../observations/common.js";
import { ALLOWED_MCP_SERVERS, assertToolAllowed, isServerAllowlisted } from "./allowlist.js";
import { sanitizeSecrets } from "./sanitizer.js";

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") + "}";
}

export class McpClient {
  constructor({
    serverId,
    transport,
    transportType = "stdio",
    transportTarget = null,
    packageName = null,
    pinnedVersion = null,
    authorizationMode = "none",
    scopes = [],
    timeoutMs = 10000,
    maxBytes = 1048576,
    adapterVersion = "1.0.0",
    normalizationVersion = "1.0.0",
  }) {
    if (!isServerAllowlisted(serverId)) {
      throw new Error(`untrusted MCP server: "${serverId}" is not in the allowlist`);
    }
    if (!transport) {
      throw new Error("McpClient requires an active transport instance");
    }

    this.serverId = serverId;
    this.serverConfig = ALLOWED_MCP_SERVERS[serverId];
    this.transport = transport;
    this.transportType = transportType;
    this.transportTarget = transportTarget || serverId;
    this.packageName = packageName;
    this.pinnedVersion = pinnedVersion;
    this.authorizationMode = authorizationMode;
    this.scopes = scopes;
    this.timeoutMs = Math.min(Math.max(Number(timeoutMs) || 10000, 100), 60000);
    this.maxBytes = Number(maxBytes) || 1048576;
    this.adapterVersion = adapterVersion;
    this.normalizationVersion = normalizationVersion;

    this.protocolVersion = "2024-11-05";
    this.serverCapabilities = null;
    this.serverInfo = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return { capabilities: this.serverCapabilities, serverInfo: this.serverInfo };

    const initRes = await this.transport.sendRequest("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: {
        name: "@nebulacomponents/citable",
        version: "1.15.1",
      },
    });

    const result = initRes.result || {};
    this.protocolVersion = result.protocolVersion || this.protocolVersion;
    this.serverCapabilities = result.capabilities || {};
    this.serverInfo = result.serverInfo || {};

    await this.transport.sendNotification("notifications/initialized", {});
    this.initialized = true;

    return {
      protocolVersion: this.protocolVersion,
      capabilities: this.serverCapabilities,
      serverInfo: this.serverInfo,
    };
  }

  async listTools() {
    if (!this.initialized) await this.initialize();
    const res = await this.transport.sendRequest("tools/list", {});
    const tools = (res.result && res.result.tools) || [];

    return tools.map((tool) => {
      const serverTool = this.serverConfig.tools[tool.name];
      const allowlisted = Boolean(serverTool);
      const isReadOnly = Boolean(serverTool && serverTool.read_only);
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        allowlisted,
        read_only: isReadOnly,
        supported: allowlisted && isReadOnly,
      };
    });
  }

  async callTool(toolName, args = {}) {
    const toolDef = assertToolAllowed(this.serverId, toolName, { isReadOnly: true });
    if (!this.initialized) await this.initialize();

    const startTime = performance.now();
    const canonicalArgs = canonicalStringify(args);
    const argumentsHash = sha256(canonicalArgs);
    const inputSchemaHash = sha256(canonicalStringify(toolDef.schema || {}));

    const redactions = { count: 0 };
    const sanitizedArgs = sanitizeSecrets(args, redactions);

    let res;
    let isError = false;
    try {
      res = await this.transport.sendRequest("tools/call", {
        name: toolName,
        arguments: args,
      });
    } catch (err) {
      isError = true;
      res = {
        result: {
          isError: true,
          content: [{ type: "text", text: err.message }],
        },
        raw: JSON.stringify({ error: err.message }),
      };
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const raw = res.raw || JSON.stringify(res.result || {});
    const rawSha256 = sha256(raw);
    const contentBytes = Buffer.byteLength(raw, "utf8");

    if (res.result && res.result.isError) {
      isError = true;
    }

    const rawContent = (res.result && res.result.content) || [];
    const sanitizedContent = sanitizeSecrets(rawContent, redactions);

    const transportEnvelope = {
      schema_version: 1,
      transport: {
        type: this.transportType,
        protocol_version: this.protocolVersion,
        timeout_ms: this.timeoutMs,
        max_bytes: this.maxBytes,
        retries: 0,
      },
      server: {
        server_id: this.serverId,
        package_name: this.packageName,
        pinned_version: this.pinnedVersion,
        transport_target: this.transportTarget,
        allowlisted: true,
        capabilities: this.serverCapabilities || {},
      },
      tool: {
        name: toolName,
        description: toolDef.description || null,
        read_only: true,
        input_schema_hash: inputSchemaHash,
        input_schema: toolDef.schema || {},
      },
      request: {
        arguments_hash: argumentsHash,
        arguments: sanitizedArgs,
        authorization_mode: this.authorizationMode,
        scopes: this.scopes,
      },
      response: {
        raw_sha256: rawSha256,
        content_bytes: contentBytes,
        is_error: isError,
        retention_reason: redactions.count > 0 ? "redacted_sensitive" : "raw_preserved",
        content: sanitizedContent,
      },
      provenance: {
        adapter_version: this.adapterVersion,
        normalization_version: this.normalizationVersion,
        sanitized_redactions: redactions.count,
        duration_ms: durationMs,
      },
      authority: {
        source_authority: "synthetic",
        collection_authority: "direct_api",
        authenticity_status: "transport_authenticated",
        representativeness: "single_observation",
      },
      status: isError ? "failed" : "success",
      collected_at: new Date().toISOString(),
      limitations: [
        "Evidence collected via allowlisted read-only MCP transport adapter.",
        "MCP transport does not confer independent third-party evidence authority or completeness.",
      ],
    };

    const check = validateAgainst("mcp-transport-envelope.schema.json", transportEnvelope);
    if (!check.valid) {
      throw new Error(`MCP transport envelope violates contract: ${check.errors.join("; ")}`);
    }

    const observation = envelope("mcp_transport", transportEnvelope, {
      method: "live_api",
      source: `mcp:${this.serverId}/${toolName}`,
      state: isError ? "failed" : "observed",
      confidence: "confirmed",
      limitations: transportEnvelope.limitations,
      raw,
    });

    return {
      transportEnvelope,
      observation,
      isError,
    };
  }

  async close() {
    if (this.transport && typeof this.transport.close === "function") {
      await this.transport.close();
    }
  }
}
