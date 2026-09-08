import { gscConnector } from './gsc.js';
import { ga4Connector } from './ga4.js';
import { wordpressConnector } from './wordpress.js';
import { webflowConnector } from './webflow.js';
import { indexnowConnector } from './indexnow.js';
import { mcpConnector } from './mcp/pilot.js';

const CONNECTORS = new Map([gscConnector, ga4Connector, wordpressConnector, webflowConnector, indexnowConnector, mcpConnector].map((connector) => [connector.provider, connector]));

export function getConnector(provider) {
  const connector = CONNECTORS.get(String(provider).toLowerCase());
  if (!connector) throw new Error(`unsupported connector provider: ${provider}`);
  return connector;
}

export function listConnectors() {
  return [...CONNECTORS.values()].map((item) => ({ provider: item.provider, credential_env: item.defaultCredentialEnv, scopes: item.readOnlyScopes, metrics: Object.keys(item.describeMetrics()) }));
}

export { McpClient, McpStdioTransport, McpHttpTransport, ALLOWED_MCP_SERVERS, isServerAllowlisted, isToolAllowlisted, assertToolAllowed, collectMcpEvidence, mcpConnector, diagnoseMcpTransports } from './mcp/index.js';

