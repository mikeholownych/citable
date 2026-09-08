import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { runSchedule } from '../../src/commands/delivery.js';
import { monitor, monitorAndAlert } from '../../src/commands/monitor.js';
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
  assert.ok(fs.existsSync(res.delivery.dispatch_file));
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

test('monitor detects share_of_voice_drop and competitive citation drift between observation runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-mon-sov-'));
  init(dir);

  const { registries } = loadRegistries(dir);
  registries.competitors.entries = [
    { competitor_id: 'COMP-1', name: 'Competitor A', domains: ['comp-a.test'], status: 'active' },
  ];
  saveRegistry(dir, 'competitors', registries.competitors);

  const runsDir = path.join(dir, '.citable', 'runs');
  const run1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  const run2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-2', 'observations');
  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });

  // Run 1: 5 total citations, 4 first-party (share = 0.80), 1 competitor (share = 0.20)
  writeJson(path.join(run1Dir, '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      provider: 'perplexity',
      product_mode: 'pro',
      prompt_id: 'P1',
      run_index: 1,
      property_cited: true,
      citations: [
        { url: 'https://example.test/product', first_party: true },
        { url: 'https://example.test/features', first_party: true },
        { url: 'https://example.test/pricing', first_party: true },
        { url: 'https://example.test/about', first_party: true },
        { url: 'https://comp-a.test/alternative', first_party: false },
      ],
    },
  });

  // Run 2: 5 total citations, 1 first-party (share = 0.20), 4 competitor (share = 0.80)
  // Drop = 0.60 (>= 0.20)
  writeJson(path.join(run2Dir, '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      provider: 'perplexity',
      product_mode: 'pro',
      prompt_id: 'P1',
      run_index: 1,
      property_cited: true,
      citations: [
        { url: 'https://example.test/product', first_party: true },
        { url: 'https://comp-a.test/alt1', first_party: false },
        { url: 'https://comp-a.test/alt2', first_party: false },
        { url: 'https://comp-a.test/alt3', first_party: false },
        { url: 'https://comp-a.test/alt4', first_party: false },
      ],
    },
  });

  const res = monitor(dir, {
    runA: '2026-07-01T00:00:00Z-obs-1',
    runB: '2026-07-02T00:00:00Z-obs-2',
  });

  const sovAlert = res.alerts.find((a) => a.type === 'share_of_voice_drop');
  assert.ok(sovAlert, 'share_of_voice_drop alert must be emitted');
  assert.equal(sovAlert.severity, 'high');
  assert.equal(sovAlert.previous_share, 0.8);
  assert.equal(sovAlert.current_share, 0.2);
  assert.equal(sovAlert.drop, 0.6);
  assert.ok(sovAlert.relative_drop >= 0.2);

  // Check competitive drift in alert
  const compDrift = sovAlert.competitors.find((c) => c.competitor_id === 'COMP-1');
  assert.ok(compDrift);
  assert.equal(compDrift.previous_share, 0.2);
  assert.equal(compDrift.current_share, 0.8);
  assert.equal(compDrift.drift, 0.6);
});

test('monitor detects stance_regression when favorable stance degrades to unfavorable or mixed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-mon-stance-'));
  init(dir);

  const runsDir = path.join(dir, '.citable', 'runs');
  const run1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  const run2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-2', 'observations');
  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });

  // Run 1: Entity ENT-1 has favorable stance, Entity ENT-2 has favorable stance
  writeJson(path.join(run1Dir, '0001-stance.json'), {
    kind: 'stance',
    state: 'observed',
    data: {
      entity_id: 'ENT-1',
      canonical_name: 'Acme Corp',
      prompt_id: 'PR-1',
      engine: 'gemini',
      stance: 'favorable',
    },
  });
  writeJson(path.join(run1Dir, '0002-stance.json'), {
    kind: 'stance',
    state: 'observed',
    data: {
      entity_id: 'ENT-2',
      canonical_name: 'Beta Tool',
      prompt_id: 'PR-2',
      engine: 'gemini',
      stance: 'favorable',
    },
  });

  // Run 2: Entity ENT-1 regresses to unfavorable, Entity ENT-2 regresses to mixed
  writeJson(path.join(run2Dir, '0001-stance.json'), {
    kind: 'stance',
    state: 'observed',
    data: {
      entity_id: 'ENT-1',
      canonical_name: 'Acme Corp',
      prompt_id: 'PR-1',
      engine: 'gemini',
      stance: 'unfavorable',
    },
  });
  writeJson(path.join(run2Dir, '0002-stance.json'), {
    kind: 'stance',
    state: 'observed',
    data: {
      entity_id: 'ENT-2',
      canonical_name: 'Beta Tool',
      prompt_id: 'PR-2',
      engine: 'gemini',
      stance: 'mixed',
    },
  });

  const res = monitor(dir, {
    runA: '2026-07-01T00:00:00Z-obs-1',
    runB: '2026-07-02T00:00:00Z-obs-2',
  });

  const stanceAlerts = res.alerts.filter((a) => a.type === 'stance_regression');
  assert.equal(stanceAlerts.length, 2);

  const ent1Alert = stanceAlerts.find((a) => a.entity_id === 'ENT-1');
  assert.ok(ent1Alert);
  assert.equal(ent1Alert.severity, 'high');
  assert.equal(ent1Alert.previous_stance, 'favorable');
  assert.equal(ent1Alert.current_stance, 'unfavorable');

  const ent2Alert = stanceAlerts.find((a) => a.entity_id === 'ENT-2');
  assert.ok(ent2Alert);
  assert.equal(ent2Alert.severity, 'high');
  assert.equal(ent2Alert.previous_stance, 'favorable');
  assert.equal(ent2Alert.current_stance, 'mixed');
});

test('monitor emits claim_contradiction_observed alert on negated or distorted registered claims', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-mon-claim-'));
  init(dir);

  const fixReg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/registries-good');
  for (const f of fs.readdirSync(fixReg)) {
    fs.copyFileSync(path.join(fixReg, f), path.join(dir, '.citable', f));
  }

  const runsDir = path.join(dir, '.citable', 'runs');
  const run1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-1', 'observations');
  const run2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-2', 'observations');
  fs.mkdirSync(run1Dir, { recursive: true });
  fs.mkdirSync(run2Dir, { recursive: true });

  writeJson(path.join(run1Dir, '0001-cit.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      provider: 'perplexity',
      product_mode: 'pro',
      prompt_id: 'PR-1',
      run_index: 0,
      answer_text: 'Gatekeeper validates whether an AI-initiated action remains admissible before execution.',
      property_cited: true,
    },
  });

  writeJson(path.join(run2Dir, '0001-cit.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      provider: 'perplexity',
      product_mode: 'pro',
      prompt_id: 'PR-1',
      run_index: 0,
      answer_text: 'Gatekeeper cannot validate whether an AI-initiated action remains admissible before execution.',
      property_cited: true,
    },
  });

  const res = monitor(dir, {
    runA: '2026-07-01T00:00:00Z-obs-1',
    runB: '2026-07-02T00:00:00Z-obs-2',
  });

  const contradictionAlerts = res.alerts.filter((a) => a.type === 'claim_contradiction_observed');
  assert.equal(contradictionAlerts.length, 1);
  assert.equal(contradictionAlerts[0].severity, 'high');
  assert.equal(contradictionAlerts[0].claim_id, 'CLAIM-ENFORCE');
  assert.equal(contradictionAlerts[0].engine, 'perplexity');
});


