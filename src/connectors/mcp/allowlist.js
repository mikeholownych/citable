/**
 * Explicit server and tool allowlist for Model Context Protocol (MCP) transports.
 *
 * Security Invariants:
 * - Servers must be explicitly declared; unknown servers fail closed.
 * - Tools must be explicitly declared as read_only: true; state-changing tools are rejected.
 * - Transport type must be supported by the server entry.
 */

export const ALLOWED_MCP_SERVERS = {
  "citable-evidence-pilot": {
    description: "Citable read-only evidence verification pilot server",
    transports: ["stdio", "http"],
    tools: {
      inspect_target: {
        read_only: true,
        description: "Extract title, canonical URL, and meta tags for target URL",
        schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string" },
          },
        },
      },
      get_canonical_evidence: {
        read_only: true,
        description: "Collect publisher canonical declarations and HTTP Link headers",
        schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string" },
          },
        },
      },
      query_search_index: {
        read_only: true,
        description: "Query indexed URL status from provider search index",
        schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string" },
            host: { type: "string" },
          },
        },
      },
    },
  },
  "gsc-mcp": {
    description: "Google Search Console read-only MCP adapter",
    transports: ["stdio", "http"],
    tools: {
      inspect_url: {
        read_only: true,
        description: "Inspect URL indexing status via Search Console",
        schema: {
          type: "object",
          required: ["url", "siteUrl"],
          properties: {
            url: { type: "string" },
            siteUrl: { type: "string" },
          },
        },
      },
      query_search_analytics: {
        read_only: true,
        description: "Query search analytics impressions and clicks",
        schema: {
          type: "object",
          required: ["siteUrl", "startDate", "endDate"],
          properties: {
            siteUrl: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
        },
      },
    },
  },
};

export function isServerAllowlisted(serverId) {
  return Boolean(ALLOWED_MCP_SERVERS[serverId]);
}

export function isToolAllowlisted(serverId, toolName) {
  const server = ALLOWED_MCP_SERVERS[serverId];
  if (!server) return false;
  return Boolean(server.tools[toolName]);
}

export function assertToolAllowed(serverId, toolName, { isReadOnly = true } = {}) {
  const server = ALLOWED_MCP_SERVERS[serverId];
  if (!server) {
    throw new Error(`untrusted MCP server: "${serverId}" is not in the allowlist`);
  }
  const tool = server.tools[toolName];
  if (!tool) {
    throw new Error(`untrusted MCP tool: "${toolName}" is not allowlisted for server "${serverId}"`);
  }
  if (!tool.read_only || isReadOnly === false) {
    throw new Error(`refusing state-changing MCP tool: "${toolName}" is not read-only`);
  }
  return tool;
}
