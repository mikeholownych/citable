import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnoseMcpTransports } from '../../src/connectors/mcp/diagnostics.js';
import { doctorCommand, parseInstallerArgs } from '../../src/installer/index.js';
import { writeYaml } from '../../src/shared/io.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, '../..');

test('diagnoseMcpTransports: returns PASS checks and verified summary on repository root', async () => {
  const result = await diagnoseMcpTransports({
    packageRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.stdio_ready, true);
  assert.equal(result.summary.http_guards_active, true);
  assert.equal(result.summary.allowlist_valid, true);
  assert.ok(result.summary.servers_count >= 2);
  assert.ok(result.summary.tools_count >= 5);

  const checks = result.checks;
  assert.ok(checks.some((c) => c.level === 'PASS' && c.message.includes('MCP allowlist valid')));
  assert.ok(checks.some((c) => c.level === 'PASS' && c.message.includes('pilot script verified')));
  assert.ok(checks.some((c) => c.level === 'PASS' && c.message.includes('pilot server handshake responsive')));
  assert.ok(checks.some((c) => c.level === 'PASS' && c.message.includes('HTTP endpoint security guards active')));
});

test('diagnoseMcpTransports: reports configured MCP connections from .citable/connections.yaml', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-doctor-mcp-conn-'));
  const dotCitable = path.join(tempDir, '.citable');
  fs.mkdirSync(dotCitable, { recursive: true });

  const connectionsYaml = path.join(dotCitable, 'connections.yaml');
  writeYaml(connectionsYaml, {
    version: 1,
    kind: 'connections',
    updated: '2026-09-08T00:00:00Z',
    entries: [
      {
        connection_id: 'CONNECTION-TEST-MCP',
        provider: 'citable-evidence-pilot',
        state: 'configured',
        authentication: 'none',
        scopes: ['read'],
        limitations: ['read-only test binding'],
      },
    ],
  });

  try {
    const result = await diagnoseMcpTransports({
      packageRoot: ROOT,
      projectRoot: tempDir,
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.connections_found, 1);
    assert.ok(result.checks.some((c) => c.level === 'PASS' && c.message.includes('CONNECTION-TEST-MCP bound in registry')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('diagnoseMcpTransports: warns cleanly when .citable/connections.yaml is uninitialized', async () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-doctor-mcp-empty-'));

  try {
    const result = await diagnoseMcpTransports({
      packageRoot: ROOT,
      projectRoot: emptyDir,
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.connections_found, 0);
    assert.ok(result.checks.some((c) => c.level === 'WARN' && c.message.includes('No .citable/connections.yaml registry found')));
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('diagnoseMcpTransports: fails closed when pilot script is missing', async () => {
  const result = await diagnoseMcpTransports({
    packageRoot: ROOT,
    projectRoot: ROOT,
    pilotScript: path.join(ROOT, 'src/connectors/mcp/nonexistent-pilot.js'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.stdio_ready, false);
  assert.ok(result.checks.some((c) => c.level === 'FAIL' && c.message.includes('MCP stdio pilot script missing')));
});

test('doctorCommand: runs MCP diagnostics when --mcp flag is passed', async () => {
  const args = parseInstallerArgs(['--mcp', '--json']);
  assert.equal(args.mcp, true);

  const result = await doctorCommand(args, {
    packageRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(result.ok, true);
  assert.ok(result.mcp);
  assert.equal(result.mcp.stdio_ready, true);
  assert.equal(result.mcp.http_guards_active, true);
  assert.ok(result.capabilities.some((c) => c.id === 'mcp_transport' && c.state === 'ready'));
});

test('doctorCommand: omits mcp_transport when --mcp flag is not passed (backward compatibility)', async () => {
  const args = parseInstallerArgs(['--json']);
  assert.equal(args.mcp, false);

  const result = await doctorCommand(args, {
    packageRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(result.mcp, undefined);
  assert.equal(result.capabilities.some((c) => c.id === 'mcp_transport'), false);
});
