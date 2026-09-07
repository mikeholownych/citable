import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validatePublicUrl } from '../crawler/fetch.js';
import { nowIso, sha256, writeJson } from '../shared/io.js';

export const SEVERITY_ORDER = {
  informational: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function filterAlerts(alerts = [], minSeverity = 'informational') {
  const minRank = SEVERITY_ORDER[minSeverity] ?? SEVERITY_ORDER.informational;
  return alerts.filter((item) => (SEVERITY_ORDER[item.severity] ?? 0) >= minRank);
}

export function buildAlertPayload({ runA, runB, source = 'monitor', summary = {}, alerts = [], timestamp = nowIso() } = {}) {
  const critOrHigh = alerts.filter((a) => ['critical', 'high'].includes(a.severity)).length;
  return {
    event: 'citable.regression_alert',
    source,
    generated_at: timestamp,
    run_a: runA ?? null,
    run_b: runB,
    summary: {
      total_alerts: alerts.length,
      critical_or_high: critOrHigh,
      ...summary,
    },
    alerts,
  };
}

export async function dispatchAlertWebhook(root, payload, {
  webhookUrl,
  headers = {},
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
  lookup,
  allowPrivateForTest = false,
} = {}) {
  if (!webhookUrl) throw new Error('webhookUrl is required for alert dispatch');
  if (!allowPrivateForTest) {
    await validatePublicUrl(webhookUrl, { lookup });
  }

  const deliveryId = `DELIVERY-${nowIso().replace(/[:.]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
  const payloadString = JSON.stringify(payload);
  const payloadHash = sha256(Buffer.from(payloadString));
  const deliveriesDir = path.join(root, '.citable', 'monitoring', 'deliveries');
  const receiptFile = path.join(deliveriesDir, `${deliveryId}.json`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let statusCode = null;
  let success = false;
  let errorMessage = null;

  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-citable-event': 'citable.regression_alert',
        'x-citable-delivery': deliveryId,
        ...headers,
      },
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = res.status;
    success = res.ok;
    if (!res.ok) {
      errorMessage = `HTTP ${res.status} ${res.statusText || 'Error'}`;
    }
  } catch (err) {
    clearTimeout(timer);
    errorMessage = err.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : err.message;
  }

  const receipt = {
    delivery_id: deliveryId,
    target_url: webhookUrl,
    delivered_at: nowIso(),
    status_code: statusCode,
    success,
    payload_hash: payloadHash,
    error: errorMessage,
    summary: payload.summary,
  };

  writeJson(receiptFile, receipt);
  return { ...receipt, receipt_file: receiptFile };
}
