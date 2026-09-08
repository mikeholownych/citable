#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) Stdio Pilot Server.
 *
 * Implements read-only evidence verification tools for testing and pilot runs.
 */

import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed);
    if (!msg || msg.id === undefined) return;

    if (msg.method === "initialize") {
      const resp = {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "citable-evidence-pilot", version: "1.0.0" },
        },
      };
      process.stdout.write(JSON.stringify(resp) + "\n");
    } else if (msg.method === "tools/list") {
      const resp = {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          tools: [
            {
              name: "inspect_target",
              description: "Extract title, canonical URL, and meta tags for target URL",
              inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
            },
            {
              name: "get_canonical_evidence",
              description: "Collect publisher canonical declarations and HTTP Link headers",
              inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
            },
            {
              name: "query_search_index",
              description: "Query indexed URL status from provider search index",
              inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" }, host: { type: "string" } } },
            },
          ],
        },
      };
      process.stdout.write(JSON.stringify(resp) + "\n");
    } else if (msg.method === "tools/call") {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      let content = [];
      if (name === "inspect_target") {
        content = [{ type: "text", text: JSON.stringify({ url: args.url, canonical: args.url, title: "Sample Title", robots: "index, follow" }) }];
      } else if (name === "get_canonical_evidence") {
        content = [{ type: "text", text: JSON.stringify({ url: args.url, canonical_tag: args.url, og_url: args.url, link_header: null }) }];
      } else if (name === "query_search_index") {
        content = [{ type: "text", text: JSON.stringify({ url: args.url, indexed: true, last_crawled: "2026-09-08T00:00:00Z", coverage_state: "Submitted and indexed" }) }];
      } else {
        const resp = { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Tool not found: ${name}` } };
        process.stdout.write(JSON.stringify(resp) + "\n");
        return;
      }
      const resp = {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content, isError: false },
      };
      process.stdout.write(JSON.stringify(resp) + "\n");
    }
  } catch (err) {
    // Ignore malformed JSON-RPC frames
  }
});
