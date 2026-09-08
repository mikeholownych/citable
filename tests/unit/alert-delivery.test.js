import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAlertPayload,
  dispatchAlertWebhook,
  filterAlerts,
  SEVERITY_ORDER,
} from '../../src/monitoring/alertDelivery.js';
import { init } from '../../src/commands/init.js';
import { readJson } from '../../src/shared/io.js';

test('filterAlerts filters alerts according to minimum severity threshold', () => {
  const alerts = [
    { severity: 'informational', type: 'info_1' },
    { severity: 'medium', type: 'med_1' },
    { severity: 'high', type: 'high_1' },
    { severity: 'critical', type: 'crit_1' },
  ];

  assert.equal(filterAlerts(alerts, 'informational').length, 4);
  assert.equal(filterAlerts(alerts, 'medium').length, 3);
  assert.equal(filterAlerts(alerts, 'high').length, 2);
  assert.equal(filterAlerts(alerts, 'critical').length, 1);
  assert.equal(filterAlerts(alerts, 'critical')[0].type, 'crit_1');
});

test('buildAlertPayload constructs valid regression alert envelope', () => {
  const alerts = [
    { severity: 'high', type: 'index_loss', key: 'index:url' },
    { severity: 'medium', type: 'state_change', key: 'citation:p1' },
    { severity: 'high', type: 'share_of_voice_drop', key: 'share_of_voice:aggregate' },
    { severity: 'high', type: 'stance_regression', key: 'stance:ENT-1' },
  ];
  const payload = buildAlertPayload({
    runA: '2026-07-01T00:00:00Z-audit-1',
    runB: '2026-07-02T00:00:00Z-audit-2',
    source: 'monitor',
    alerts,
    timestamp: '2026-07-02T00:01:00Z',
  });

  assert.equal(payload.event, 'citable.regression_alert');
  assert.equal(payload.source, 'monitor');
  assert.equal(payload.run_a, '2026-07-01T00:00:00Z-audit-1');
  assert.equal(payload.run_b, '2026-07-02T00:00:00Z-audit-2');
  assert.equal(payload.generated_at, '2026-07-02T00:01:00Z');
  assert.equal(payload.summary.total_alerts, 4);
  assert.equal(payload.summary.critical_or_high, 3);
  assert.equal(payload.summary.regression_count, 4);
  assert.deepEqual(payload.alerts, alerts);
});

test('dispatchAlertWebhook logs successful receipt and sends payload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-alert-test-'));
  init(dir);

  let capturedRequest = null;
  const mockFetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
    };
  };

  const payload = buildAlertPayload({
    runA: 'run-1',
    runB: 'run-2',
    alerts: [{ severity: 'high', type: 'test_alert' }],
  });

  const result = await dispatchAlertWebhook(dir, payload, {
    webhookUrl: 'https://example.test/citable-webhook',
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.status_code, 200);
  assert.ok(result.delivery_id.startsWith('DELIVERY-'));
  assert.ok(fs.existsSync(result.receipt_file));

  const savedReceipt = readJson(result.receipt_file);
  assert.equal(savedReceipt.delivery_id, result.delivery_id);
  assert.equal(savedReceipt.success, true);
  assert.equal(savedReceipt.status_code, 200);

  assert.equal(capturedRequest.url, 'https://example.test/citable-webhook');
  assert.equal(capturedRequest.options.headers['x-citable-event'], 'citable.regression_alert');
  assert.equal(capturedRequest.options.headers['x-citable-delivery'], result.delivery_id);
  assert.deepEqual(JSON.parse(capturedRequest.options.body), payload);
});

test('dispatchAlertWebhook handles HTTP failure without throwing and records error in receipt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-alert-fail-'));
  init(dir);

  const mockFetch = async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
  });

  const payload = buildAlertPayload({ runA: 'a', runB: 'b' });
  const result = await dispatchAlertWebhook(dir, payload, {
    webhookUrl: 'https://example.test/hooks',
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(result.success, false);
  assert.equal(result.status_code, 503);
  assert.match(result.error, /HTTP 503 Service Unavailable/);
  assert.ok(fs.existsSync(result.receipt_file));

  const saved = readJson(result.receipt_file);
  assert.equal(saved.success, false);
  assert.equal(saved.status_code, 503);
});

test('dispatchAlertWebhook refuses non-public destination by default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-alert-ssrf-'));
  init(dir);

  const payload = buildAlertPayload({ runA: 'a', runB: 'b' });
  await assert.rejects(
    async () => {
      await dispatchAlertWebhook(dir, payload, {
        webhookUrl: 'http://127.0.0.1:8080/hook',
      });
    },
    /refusing private, loopback, or non-public destination/
  );
});

test('dispatchAlertWebhook signs payload with HMAC-SHA256 and writes to dispatches directory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-alert-hmac-'));
  init(dir);

  const secret = 'test-secret-key-12345';
  let capturedHeaders = null;
  let capturedBody = null;

  const mockFetch = async (url, options) => {
    capturedHeaders = options.headers;
    capturedBody = options.body;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
    };
  };

  const payload = buildAlertPayload({
    runA: 'run-1',
    runB: 'run-2',
    alerts: [{ severity: 'critical', type: 'index_loss', key: 'url1' }],
  });

  const result = await dispatchAlertWebhook(dir, payload, {
    webhookUrl: 'https://example.test/webhook',
    secret,
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(result.success, true);
  assert.ok(result.signature);
  assert.ok(result.signature.startsWith('sha256='));
  assert.equal(capturedHeaders['x-citable-signature'], result.signature);

  // Verify HMAC calculation
  const crypto = await import('node:crypto');
  const expectedHmac = 'sha256=' + crypto.createHmac('sha256', secret).update(capturedBody).digest('hex');
  assert.equal(result.signature, expectedHmac);

  // Verify dispatch receipt in .citable/monitoring/dispatches/
  assert.ok(result.dispatch_file);
  assert.ok(fs.existsSync(result.dispatch_file));
  assert.ok(result.dispatch_file.includes('dispatches'));

  const dispatchReceipt = readJson(result.dispatch_file);
  assert.equal(dispatchReceipt.delivery_id, result.delivery_id);
  assert.equal(dispatchReceipt.signature, expectedHmac);
  assert.equal(dispatchReceipt.summary.regression_count, 1);
});
