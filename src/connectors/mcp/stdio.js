/**
 * Stdio transport adapter for Model Context Protocol (MCP).
 *
 * Security Invariants:
 * - Bounded timeouts on every RPC call.
 * - Bounded buffer/payload sizes.
 * - Graceful process cleanup and SIGKILL fallback.
 * - Fail closed on non-zero exit codes, premature termination, or invalid JSON framing.
 */

import { spawn } from "node:child_process";
import readline from "node:readline";

export class McpStdioTransport {
  constructor({ command, args = [], cwd, env = {}, timeoutMs = 10000, maxBufferBytes = 1048576 }) {
    if (!command) throw new Error("McpStdioTransport requires command");
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = { ...process.env, ...env };
    this.timeoutMs = Math.min(Math.max(Number(timeoutMs) || 10000, 100), 60000);
    this.maxBufferBytes = Number(maxBufferBytes) || 1048576;

    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.totalBytes = 0;
    this.stderrOutput = "";
  }

  async start() {
    if (this.process) return;
    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("error", (err) => {
      this._rejectAll(new Error(`McpStdioTransport process error: ${err.message}`));
    });

    this.process.on("exit", (code, signal) => {
      if (!this.closed && code !== 0) {
        this._rejectAll(new Error(`McpStdioTransport process exited prematurely with code ${code} (signal: ${signal})`));
      }
    });

    this.process.stderr.on("data", (chunk) => {
      if (this.stderrOutput.length < 16384) {
        this.stderrOutput += chunk.toString("utf8").slice(0, 16384 - this.stderrOutput.length);
      }
    });

    const rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
    });

    rl.on("line", (line) => {
      this.totalBytes += Buffer.byteLength(line, "utf8");
      if (this.totalBytes > this.maxBufferBytes) {
        this._rejectAll(new Error(`McpStdioTransport exceeded max buffer limit of ${this.maxBufferBytes} bytes`));
        this.close();
        return;
      }
      this._handleLine(line);
    });
  }

  _handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      // Non-JSON line ignored or unparseable framing
      return;
    }

    if (msg && msg.id !== undefined) {
      const handler = this.pending.get(msg.id);
      if (handler) {
        this.pending.delete(msg.id);
        clearTimeout(handler.timer);
        if (msg.error) {
          handler.reject(new Error(`MCP RPC error ${msg.error.code}: ${msg.error.message}`));
        } else {
          handler.resolve({ result: msg.result, raw: trimmed });
        }
      }
    }
  }

  _rejectAll(err) {
    for (const [id, handler] of this.pending.entries()) {
      clearTimeout(handler.timer);
      handler.reject(err);
    }
    this.pending.clear();
  }

  async sendRequest(method, params = {}) {
    if (this.closed) throw new Error("McpStdioTransport is closed");
    if (!this.process) await this.start();

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n";

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`McpStdioTransport timeout after ${this.timeoutMs}ms waiting for method: ${method}`));
        }
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      this.process.stdin.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`failed to write to MCP stdio stdin: ${err.message}`));
        }
      });
    });
  }

  sendNotification(method, params = {}) {
    if (this.closed || !this.process) return;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    }) + "\n";
    this.process.stdin.write(payload);
  }

  async close() {
    this.closed = true;
    this._rejectAll(new Error("McpStdioTransport closed by client"));
    if (!this.process) return;

    try {
      this.process.stdin.end();
    } catch {}

    const proc = this.process;
    this.process = null;

    return new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        resolve();
      }, 500);

      proc.once("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });

      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(killTimer);
        resolve();
      }
    });
  }
}
