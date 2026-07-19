import { loadRegistries, saveRegistry } from '../registries/index.js';
import { envelope, observationRun } from '../observations/common.js';
import { getConnector, listConnectors } from '../connectors/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function findConnection(root, connectionId) {
  const loaded = loadRegistries(root);
  if (loaded.problems.length) throw new Error(`registry validation failed: ${loaded.problems.join('; ')}`);
  const connection = loaded.registries.connections.entries.find((item) => item.connection_id === connectionId);
  if (!connection) throw new Error(`connection not found: ${connectionId}`);
  return { ...loaded, connection };
}

function contextFor(connection, connector, options) {
  const credentialEnv = connection.credential_env || connector.defaultCredentialEnv;
  return { token: options.accessToken || options.env?.[credentialEnv] || process.env[credentialEnv], fetchImpl: options.fetchImpl, credentialEnv };
}

export function connectionStatus(root) {
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  return { available: listConnectors(), connections: registries.connections.entries };
}

export function configureConnection(root, { provider, connectionId, propertyId, credentialEnv, write = false }) {
  if (!provider || !connectionId || !propertyId) throw new Error('connect configure requires --provider, --connection-id, and --property-id');
  const connector = getConnector(provider);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const entry = { connection_id: connectionId, provider: connector.provider, property_id: String(propertyId), state: 'configured', authentication: 'environment', credential_env: credentialEnv || connector.defaultCredentialEnv, scopes: connector.readOnlyScopes, last_synchronized_at: null, cursor: null, limitations: [] };
  const entries = registries.connections.entries.filter((item) => item.connection_id !== connectionId);
  const candidate = { ...registries.connections, entries: [...entries, entry] };
  const check = validateAgainst('connection.schema.json', candidate);
  if (!check.valid) throw new Error(`connection violates contract: ${check.errors.join('; ')}`);
  if (write) saveRegistry(root, 'connections', candidate);
  return { connection: entry, written: write };
}

export async function discoverConnections(root, { provider, accessToken, env, fetchImpl } = {}) {
  const connector = getConnector(provider);
  const context = { token: accessToken || env?.[connector.defaultCredentialEnv] || process.env[connector.defaultCredentialEnv], fetchImpl };
  return { provider: connector.provider, properties: await connector.discoverProperties(context), credential_env: connector.defaultCredentialEnv };
}

export async function validateConnection(root, { connectionId, accessToken, env, fetchImpl } = {}) {
  const { connection } = findConnection(root, connectionId);
  const connector = getConnector(connection.provider);
  const result = await connector.validateConnection(connection, contextFor(connection, connector, { accessToken, env, fetchImpl }));
  return { connection_id: connectionId, provider: connection.provider, state: result.valid ? 'configured' : 'permission_denied', ...result };
}

export function disconnectConnection(root, { connectionId, write = false } = {}) {
  const loaded = findConnection(root, connectionId);
  const candidate = { ...loaded.registries.connections, entries: loaded.registries.connections.entries.filter((item) => item.connection_id !== connectionId) };
  if (write) saveRegistry(root, 'connections', candidate);
  return { connection_id: connectionId, disconnected: write, state: write ? 'not_configured' : loaded.connection.state };
}

export async function syncConnection(root, { connectionId, startDate, endDate, accessToken, env, fetchImpl } = {}) {
  if (!startDate || !endDate) throw new Error('connect sync requires --start-date and --end-date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) throw new Error('connector dates must use valid YYYY-MM-DD values');
  if (startDate > endDate) throw new Error('connector start-date must not be after end-date');
  const loaded = findConnection(root, connectionId);
  const connector = getConnector(loaded.connection.provider);
  const metrics = loaded.registries.metrics.entries.filter((item) => item.provider.toLowerCase() === connector.provider && item.status !== 'deprecated');
  if (!metrics.length) throw new Error(`no active metrics declared for provider ${connector.provider}`);
  const supported = connector.describeMetrics();
  const unsupported = metrics.filter((item) => !supported[item.external_name]);
  if (unsupported.length) throw new Error(`unsupported ${connector.provider} metrics: ${unsupported.map((item) => item.external_name).join(', ')}`);
  let result;
  try {
    result = await connector.sync(loaded.connection, metrics, { startDate, endDate, ...contextFor(loaded.connection, connector, { accessToken, env, fetchImpl }) });
  } catch (error) {
    if (error.connectorState) {
      const failed = { ...loaded.registries.connections, entries: loaded.registries.connections.entries.map((item) => item.connection_id === connectionId ? { ...item, state: error.connectorState, limitations: [`${connector.provider} synchronization did not complete; inspect command output and provider access.`] } : item) };
      saveRegistry(root, 'connections', failed);
    }
    throw error;
  }
  const observations = result.rows.map((row) => envelope('metric', {
    metric_id: row.metric.metric_id, provider: connector.provider, external_name: row.metric.external_name,
    value: Number(row.value), unit: row.metric.unit === 'custom' ? row.metric.custom_unit : row.metric.unit,
    aggregation: row.metric.aggregation, observed_at: row.observed_at, period_start: row.observed_at,
    period_end: row.observed_at, dimensions: row.dimensions,
  }, { method: 'live_api', source: connector.provider, limitations: [...row.metric.limitations, ...result.limitations] }));
  const run = observationRun(root, 'connect sync', loaded.connection.property_id, observations);
  const updated = { ...loaded.registries.connections, entries: loaded.registries.connections.entries.map((item) => item.connection_id === connectionId ? { ...item, state: 'synchronized', last_synchronized_at: new Date().toISOString(), cursor: result.cursor, limitations: result.limitations } : item) };
  saveRegistry(root, 'connections', updated);
  return { ...run, connection_id: connectionId, provider: connector.provider };
}
