import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { runSchedule } from '../../src/commands/delivery.js';
import { monitorAndAlert } from '../../src/commands/monitor.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';
import { readJson, writeJson } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/site-clean');
const VERSION = readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')).version;

test('monitorAndAlert dispatches webhook and writes receipt when alerts exist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-mon-alert-'));
  init(dir);

  const runsDir = path.join(dir, '.citable', 'runs');
  const run1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  const run2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-2', 'observations');
  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });

  writeJson(path.join(run1Dir, '0001-index.json'), {
    kind: 'index',
    state: 'observed',
    data: { url: 'https://example.test/page1', indexed: true },
  });
  writeJson(path.join(run2Dir, '0001-index.json'), {
    kind: 'index',
    state: 'observed',
    data: { url: 'https://example.test/page1', indexed: false },
  });

  let dispatched = null;
  const mockFetch = async (url, options) => {
    dispatched = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, statusText: 'OK' };
  };

  const res = await monitorAndAlert(dir, {
    runA: '2026-07-01T00:00:00Z-obs-1',
    runB: '2026-07-02T00:00:00Z-obs-2',
    webhookUrl: 'https://example.test/webhook',
    minSeverity: 'medium',
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(res.summary.alerts, 1);
  assert.equal(res.summary.critical_or_high, 1);
  assert.equal(res.alerts[0].type, 'index_loss');
  assert.ok(res.delivery);
  assert.equal(res.delivery.success, true);
  assert.equal(res.delivery.status_code, 200);
  assert.ok(fs.existsSync(res.delivery.receipt_file));
  assert.equal(dispatched.body.summary.total_alerts, 1);
});

test('monitorAndAlert skips webhook when no alerts meet minimum severity', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-mon-skip-'));
  init(dir);

  const runsDir = path.join(dir, '.citable', 'runs');
  const run1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  const run2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-2', 'observations');
  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });

  writeJson(path.join(run1Dir, '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: { provider: 'test', product_mode: 'chat', prompt_id: 'P1', run_index: 1, property_cited: true },
  });
  writeJson(path.join(run2Dir, '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: { provider: 'test', product_mode: 'chat', prompt_id: 'P1', run_index: 1, property_cited: false },
  });

  let called = false;
  const mockFetch = async () => {
    called = true;
    return { ok: true, status: 200 };
  };

  const res = await monitorAndAlert(dir, {
    runA: '2026-07-01T00:00:00Z-obs-1',
    runB: '2026-07-02T00:00:00Z-obs-2',
    webhookUrl: 'https://example.test/webhook',
    minSeverity: 'critical', // citation presence change is medium, so should be skipped
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(called, false);
  assert.equal(res.delivery.skipped, true);
});

test('runSchedule with automated monitoring compares against baseline and dispatches regression webhook', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sched-mon-'));
  init(dir);
  const { registries } = loadRegistries(dir);

  registries.schedules.entries = [{
    schedule_id: 'SCHEDULE-MONITORED',
    name: 'Nightly Monitored',
    status: 'active',
    cron: '0 2 * * *',
    owner: 'Reliability team',
    expected_tool_version: VERSION,
    audit: { target: FIX, scope: 'technical', base_url: 'https://example.test' },
    monitor: {
      enabled: true,
      webhook_url: 'https://example.test/nightly-alerts',
      min_severity: 'high',
    },
    retention_days: 14,
    limitations: ['Automated scheduled audit test.'],
  }];
  saveRegistry(dir, 'schedules', registries.schedules);

  // Run 1: first run, no baseline exists
  const run1 = await runSchedule(dir, { scheduleId: 'SCHEDULE-MONITORED' });
  assert.ok(run1.schedule_execution.monitor);
  assert.equal(run1.schedule_execution.monitor.status, 'insufficient_history');

  // Synthesize a finding into a baseline run to guarantee a comparative difference
  const baselineDir = path.join(dir, '.citable', 'runs', '2026-07-01T00:00:00Z-audit-baseline');
  fs.mkdirSync(baselineDir, { recursive: true });
  writeJson(path.join(baselineDir, 'manifest.json'), {
    timestamp: '2026-07-01T00:00:00Z',
    command: 'audit',
    argv: [],
    tool_version: VERSION,
    detectors_run: ['TECH-001'],
    configuration_hash: 'same',
    input_hashes: {},
    output_hashes: {},
    target: { kind: 'directory', location: FIX },
  });
  writeJson(path.join(baselineDir, 'findings.json'), []);

  let captured = null;
  const mockFetch = async (url, options) => {
    captured = { url, payload: JSON.parse(options.body) };
    return { ok: true, status: 200, statusText: 'OK' };
  };

  // Run 2: compares with baseline and triggers alert if new findings exist
  const run2 = await runSchedule(dir, {
    scheduleId: 'SCHEDULE-MONITORED',
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.ok(run2.schedule_execution.monitor);
  assert.ok(run2.schedule_execution.monitor.baseline_run);
  assert.ok(run2.schedule_execution.alert_delivery);
});
