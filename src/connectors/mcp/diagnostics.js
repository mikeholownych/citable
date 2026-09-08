import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpStdioTransport } from './stdio.js';
import { McpHttpTransport } from './http.js';
import { ALLOWED_MCP_SERVERS } from './allowlist.js';
import { readYaml } from '../../shared/io.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

export async function diagnoseMcpTransports(options = {}) {
  const checks = [];
  const packageRoot = options.packageRoot || path.resolve(THIS_DIR, '../../..');
  const projectRoot = options.projectRoot || process.cwd();

  // 1. Allowlist and tool schema validation
  let serversValid = true;
  let totalServers = 0;
  let totalTools = 0;
  const allowlistErrors = [];

  for (const [serverId, serverDef] of Object.entries(ALLOWED_MCP_SERVERS)) {
    totalServers++;
    if (!serverDef.description || typeof serverDef.description !== 'string') {
      serversValid = false;
      allowlistErrors.push(`server "${serverId}" lacks valid description`);
    }
    if (!Array.isArray(serverDef.transports) || serverDef.transports.length === 0) {
      serversValid = false;
      allowlistErrors.push(`server "${serverId}" has no valid transports`);
    }
    if (!serverDef.tools || typeof serverDef.tools !== 'object') {
      serversValid = false;
      allowlistErrors.push(`server "${serverId}" has no tools defined`);
      continue;
    }
    for (const [toolName, toolDef] of Object.entries(serverDef.tools)) {
      totalTools++;
      if (toolDef.read_only !== true) {
        serversValid = false;
        allowlistErrors.push(`tool "${serverId}.${toolName}" must be declared read_only: true`);
      }
      if (!toolDef.description || typeof toolDef.description !== 'string') {
        serversValid = false;
        allowlistErrors.push(`tool "${serverId}.${toolName}" lacks valid description`);
      }
      if (!toolDef.schema || toolDef.schema.type !== 'object') {
        serversValid = false;
        allowlistErrors.push(`tool "${serverId}.${toolName}" schema must be type: object`);
      }
    }
  }

  if (serversValid && totalServers > 0) {
    checks.push({
      level: 'PASS',
      message: `MCP allowlist valid: ${totalServers} servers, ${totalTools} read-only tools verified against schema contracts`,
    });
  } else {
    checks.push({
      level: 'FAIL',
      message: `MCP allowlist validation failed: ${allowlistErrors.join('; ')}`,
    });
  }

  // 2. Pilot script presence and stdio probe
  const pilotScript = options.pilotScript || path.resolve(packageRoot, 'src/connectors/mcp/pilotServer.js');
  let stdioReady = false;

  if (fs.existsSync(pilotScript)) {
    checks.push({
      level: 'PASS',
      message: `MCP stdio pilot script verified at ${pilotScript}`,
    });

    // Test non-destructive initialization handshake probe
    const transport = new McpStdioTransport({
      command: process.execPath,
      args: [pilotScript],
      timeoutMs: 3000,
    });

    try {
      await transport.start();
      const initRes = await transport.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: '@nebulacomponents/citable-doctor',
          version: '1.0.0',
        },
      });

      if (initRes?.result?.serverInfo?.name === 'citable-evidence-pilot') {
        stdioReady = true;
        checks.push({
          level: 'PASS',
          message: `MCP stdio pilot server handshake responsive (protocol: ${initRes.result.protocolVersion || '2024-11-05'}, server: citable-evidence-pilot)`,
        });
      } else {
        checks.push({
          level: 'WARN',
          message: `MCP stdio pilot server returned unexpected identity: ${JSON.stringify(initRes?.result?.serverInfo)}`,
        });
      }
    } catch (err) {
      checks.push({
        level: 'FAIL',
        message: `MCP stdio pilot server handshake failed: ${err.message}`,
      });
    } finally {
      await transport.close();
    }
  } else {
    checks.push({
      level: 'FAIL',
      message: `MCP stdio pilot script missing at ${pilotScript}`,
    });
  }

  // 3. HTTP endpoint accessibility and security guards
  let httpGuardsActive = false;
  let loopbackBlocked = false;
  let nonHttpsBlocked = false;

  try {
    const loopbackTransport = new McpHttpTransport({
      endpoint: 'http://127.0.0.1:9999',
      allowLocalTest: false,
    });
    await loopbackTransport.validateEndpoint();
  } catch (err) {
    if (err.message.includes('loopback') || err.message.includes('private') || err.message.includes('non-public') || err.message.includes('HTTPS')) {
      loopbackBlocked = true;
    }
  }

  try {
    const plainHttpTransport = new McpHttpTransport({
      endpoint: 'http://example.com/mcp',
      allowLocalTest: false,
    });
    await plainHttpTransport.validateEndpoint();
  } catch (err) {
    if (err.message.includes('HTTPS') || err.message.includes('protocol')) {
      nonHttpsBlocked = true;
    }
  }

  if (loopbackBlocked && nonHttpsBlocked) {
    httpGuardsActive = true;
    checks.push({
      level: 'PASS',
      message: 'MCP HTTP endpoint security guards active (enforces HTTPS and blocks private/loopback destinations)',
    });
  } else {
    checks.push({
      level: 'FAIL',
      message: `MCP HTTP security guards compromised (loopbackBlocked=${loopbackBlocked}, nonHttpsBlocked=${nonHttpsBlocked})`,
    });
  }

  // 4. Registry bindings (.citable/connections.yaml)
  let connectionsFound = 0;
  const connPath = path.join(projectRoot, '.citable', 'connections.yaml');

  if (fs.existsSync(connPath)) {
    try {
      const parsed = readYaml(connPath);
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      const mcpEntries = entries.filter((e) => e.provider === 'mcp' || Boolean(ALLOWED_MCP_SERVERS[e.provider]));

      if (mcpEntries.length > 0) {
        connectionsFound = mcpEntries.length;
        for (const conn of mcpEntries) {
          checks.push({
            level: 'PASS',
            message: `MCP connection ${conn.connection_id} bound in registry (provider: ${conn.provider}, state: ${conn.state})`,
          });
        }
      } else {
        checks.push({
          level: 'PASS',
          message: 'MCP connection registry present (.citable/connections.yaml); 0 active MCP bindings',
        });
      }
    } catch (err) {
      checks.push({
        level: 'WARN',
        message: `Failed to read .citable/connections.yaml: ${err.message}`,
      });
    }
  } else {
    checks.push({
      level: 'WARN',
      message: 'No .citable/connections.yaml registry found (project context uninitialized)',
    });
  }

  const hasFail = checks.some((c) => c.level === 'FAIL');

  return {
    ok: !hasFail,
    checks,
    summary: {
      stdio_ready: stdioReady,
      http_guards_active: httpGuardsActive,
      allowlist_valid: serversValid,
      servers_count: totalServers,
      tools_count: totalTools,
      connections_found: connectionsFound,
    },
  };
}
