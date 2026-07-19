import { gscConnector } from './gsc.js';
import { ga4Connector } from './ga4.js';

const CONNECTORS = new Map([gscConnector, ga4Connector].map((connector) => [connector.provider, connector]));

export function getConnector(provider) {
  const connector = CONNECTORS.get(String(provider).toLowerCase());
  if (!connector) throw new Error(`unsupported connector provider: ${provider}`);
  return connector;
}

export function listConnectors() {
  return [...CONNECTORS.values()].map((item) => ({ provider: item.provider, credential_env: item.defaultCredentialEnv, scopes: item.readOnlyScopes, metrics: Object.keys(item.describeMetrics()) }));
}
