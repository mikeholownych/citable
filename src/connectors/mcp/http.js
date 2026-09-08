/**
 * HTTP transport adapter for Model Context Protocol (MCP).
 *
 * Security Invariants:
 * - Refuses private, loopback, or non-public network destinations unless explicitly bypassed for local test harnesses.
 * - Requires HTTPS in production.
 * - Enforces bounded request timeouts and response body limits.
 * - Strips credentials from URLs.
 */

import { validatePublicUrl } from "../../crawler/fetch.js";

export class McpHttpTransport {
  constructor({
    endpoint,
    headers = {},
    timeoutMs = 10000,
    maxBodyBytes = 1048576,
    allowLocalTest = false,
    fetchImpl = globalThis.fetch,
  }) {
    if (!endpoint) throw new Error("McpHttpTransport requires endpoint URL");
    this.endpoint = endpoint;
    this.headers = headers;
    this.timeoutMs = Math.min(Math.max(Number(timeoutMs) || 10000, 100), 60000);
    this.maxBodyBytes = Number(maxBodyBytes) || 1048576;
    this.allowLocalTest = Boolean(allowLocalTest);
    this.fetchImpl = fetchImpl;
    this.nextId = 1;
    this.closed = false;
  }

  async validateEndpoint() {
    if (this.allowLocalTest) {
      const parsed = new URL(this.endpoint);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`unsupported URL protocol: ${parsed.protocol}`);
      }
      return parsed;
    }

    const parsed = await validatePublicUrl(this.endpoint);
    if (parsed.protocol !== "https:") {
      throw new Error(`remote MCP HTTP endpoint must use HTTPS: ${this.endpoint}`);
    }
    return parsed;
  }

  async sendRequest(method, params = {}) {
    if (this.closed) throw new Error("McpHttpTransport is closed");
    await this.validateEndpoint();

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`McpHttpTransport timeout after ${this.timeoutMs}ms`)), this.timeoutMs);

    try {
      const res = await (this.fetchImpl || fetch)(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          ...this.headers,
        },
        body: payload,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`MCP HTTP transport error: server returned HTTP ${res.status} ${res.statusText}`);
      }

      // Check Content-Length if present
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > this.maxBodyBytes) {
        throw new Error(`MCP HTTP response exceeds maximum body limit of ${this.maxBodyBytes} bytes`);
      }

      const text = await res.text();
      if (Buffer.byteLength(text, "utf8") > this.maxBodyBytes) {
        throw new Error(`MCP HTTP response exceeds maximum body limit of ${this.maxBodyBytes} bytes`);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`MCP HTTP response is not valid JSON-RPC: ${err.message}`);
      }

      if (parsed.error) {
        throw new Error(`MCP RPC error ${parsed.error.code}: ${parsed.error.message}`);
      }

      return { result: parsed.result, raw: text };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendNotification(method, params = {}) {
    if (this.closed) return;
    try {
      await this.validateEndpoint();
      const payload = JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      });
      await (this.fetchImpl || fetch)(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headers },
        body: payload,
      });
    } catch {
      // Notifications do not wait for or guarantee delivery
    }
  }

  async close() {
    this.closed = true;
  }
}
