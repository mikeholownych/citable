import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { configureConnection, connectionStatus, disconnectConnection, syncConnection } from '../../src/commands/connect.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';

test('connections are optional, dry-run by default, and persist no credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-connect-'));
  init(root);
  assert.deepEqual(connectionStatus(root).connections, []);
  const dry = configureConnection(root, { provider: 'gsc', connectionId: 'CONNECTION-GSC', propertyId: 'sc-domain:example.test' });
  assert.equal(dry.written, false);
  assert.deepEqual(connectionStatus(root).connections, []);
  configureConnection(root, { provider: 'gsc', connectionId: 'CONNECTION-GSC', propertyId: 'sc-domain:example.test', credentialEnv: 'CUSTOM_GSC_TOKEN', write: true });
  const saved = connectionStatus(root).connections[0];
  assert.equal(saved.credential_env, 'CUSTOM_GSC_TOKEN');
  assert.equal(JSON.stringify(saved).includes('secret'), false);
  assert.equal(disconnectConnection(root, { connectionId: 'CONNECTION-GSC' }).disconnected, false);
  disconnectConnection(root, { connectionId: 'CONNECTION-GSC', write: true });
  assert.deepEqual(connectionStatus(root).connections, []);
});

test('sync rejects invalid windows and records authorization failure without persisting the token', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sync-fail-'));
  init(root);
  configureConnection(root, { provider: 'gsc', connectionId: 'CONNECTION-GSC', propertyId: 'sc-domain:example.test', write: true });
  const { registries } = loadRegistries(root);
  saveRegistry(root, 'metrics', { ...registries.metrics, entries: [{ metric_id: 'METRIC-GSC', name: 'GSC', provider: 'gsc', external_name: 'clicks', unit: 'count', value_type: 'integer', aggregation: 'sum', direction: 'increase', dimensions: ['date'], limitations: [] }] });
  await assert.rejects(syncConnection(root, { connectionId: 'CONNECTION-GSC', startDate: '2026-08-01', endDate: '2026-07-01' }), /must not be after/);
  await assert.rejects(syncConnection(root, { connectionId: 'CONNECTION-GSC', startDate: '2026-07-01', endDate: '2026-07-18', env: {} }), /authorization is not configured/);
  const saved = connectionStatus(root).connections[0];
  assert.equal(saved.state, 'not_configured');
  assert.equal(JSON.stringify(saved).includes('Bearer'), false);
});

test('GSC sync writes immutable metric evidence and advances non-secret cursor', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sync-'));
  init(root);
  configureConnection(root, { provider: 'gsc', connectionId: 'CONNECTION-GSC', propertyId: 'sc-domain:example.test', write: true });
  const { registries } = loadRegistries(root);
  saveRegistry(root, 'metrics', { ...registries.metrics, entries: [{
    metric_id: 'METRIC-GSC_IMPRESSIONS', name: 'Impressions', provider: 'gsc', external_name: 'impressions',
    unit: 'count', value_type: 'integer', aggregation: 'sum', direction: 'increase', dimensions: ['date', 'page'], limitations: [], status: 'active',
  }] });
  const fetchImpl = async () => new Response(JSON.stringify({ rows: [{ keys: ['2026-07-18', 'https://example.test/a'], impressions: 20 }] }), { status: 200 });
  const result = await syncConnection(root, { connectionId: 'CONNECTION-GSC', startDate: '2026-07-01', endDate: '2026-07-18', env: { GSC_ACCESS_TOKEN: 'do-not-persist' }, fetchImpl });
  assert.equal(result.summary.total, 1);
  const serialized = fs.readFileSync(path.join(result.dir, 'observations', '0001-metric.json'), 'utf8');
  assert.equal(serialized.includes('do-not-persist'), false);
  const saved = connectionStatus(root).connections[0];
  assert.equal(saved.state, 'synchronized');
  assert.equal(saved.cursor, '2026-07-18');
});
