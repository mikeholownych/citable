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
  const regressionCount = alerts.filter((a) => [
    'index_loss',
    'canonical_regression',
    'citation_presence_change',
    'representation_divergence_observed',
    'state_change',
    'observation_missing',
    'share_of_voice_drop',
    'stance_regression',
  ].includes(a.type)).length;
  return {
    event: 'citable.regression_alert',
    source,
    generated_at: timestamp,
    run_a: runA ?? null,
    run_b: runB,
    summary: {
      total_alerts: alerts.length,
      regression_count: regressionCount,
      critical_or_high: critOrHigh,
      ...summary,
    },
    alerts,
  };
}

export async function dispatchAlertWebhook(root, payload, {
  webhookUrl,
  headers = {},
  secret = process.env.CITABLE_WEBHOOK_SECRET,
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
  const dispatchesDir = path.join(root, '.citable', 'monitoring', 'dispatches');
  const receiptFile = path.join(deliveriesDir, `${deliveryId}.json`);
  const dispatchFile = path.join(dispatchesDir, `${deliveryId}.json`);

  const requestHeaders = {
    'content-type': 'application/json',
    'x-citable-event': 'citable.regression_alert',
    'x-citable-delivery': deliveryId,
    ...headers,
  };

  let signature = null;
  if (secret) {
    const hmac = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    signature = `sha256=${hmac}`;
    requestHeaders['x-citable-signature'] = signature;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let statusCode = null;
  let success = false;
  let errorMessage = null;

  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: requestHeaders,
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
    signature,
    error: errorMessage,
    summary: payload.summary,
  };

  writeJson(receiptFile, receipt);
  writeJson(dispatchFile, receipt);
  return { ...receipt, receipt_file: receiptFile, dispatch_file: dispatchFile };
}

export function formatSlackPayload(payload) {
  const summary = payload.summary || {};
  const alertLines = (payload.alerts || []).slice(0, 5).map((a) => `• *[${a.severity.toUpperCase()}]* ${a.message || a.detail || a.type}`);
  return {
    text: `Citable Alert: ${summary.total_alerts || 0} alerts detected (${summary.critical_or_high || 0} critical/high)`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 Citable Search & AEO Governance Alert', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Alerts:* ${summary.total_alerts || 0}` },
          { type: 'mrkdwn', text: `*Critical / High:* ${summary.critical_or_high || 0}` },
          { type: 'mrkdwn', text: `*Source:* ${payload.source || 'monitor'}` },
          { type: 'mrkdwn', text: `*Generated At:* ${payload.generated_at}` },
        ],
      },
      ...(alertLines.length > 0 ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: alertLines.join('\n') },
      }] : []),
    ],
  };
}

export function formatTeamsPayload(payload) {
  const summary = payload.summary || {};
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: 'Citable Search & AEO Governance Alert',
    themeColor: summary.critical_or_high > 0 ? 'D9381E' : '0076D7',
    title: 'Citable Governance Alert',
    sections: [
      {
        activityTitle: `Total Alerts: ${summary.total_alerts || 0} (${summary.critical_or_high || 0} critical/high)`,
        facts: [
          { name: 'Source', value: payload.source || 'monitor' },
          { name: 'Timestamp', value: payload.generated_at },
        ],
        text: (payload.alerts || []).slice(0, 5).map((a) => `**[${a.severity.toUpperCase()}]** ${a.message || a.detail || a.type}`).join('\n\n'),
      },
    ],
  };
}

export function formatDiscordPayload(payload) {
  const summary = payload.summary || {};
  return {
    content: `🚨 **Citable Alert**: ${summary.total_alerts || 0} alerts detected`,
    embeds: [
      {
        title: 'Citable Search & AEO Governance Alert',
        color: summary.critical_or_high > 0 ? 14232606 : 3447003,
        fields: [
          { name: 'Total Alerts', value: String(summary.total_alerts || 0), inline: true },
          { name: 'Critical/High', value: String(summary.critical_or_high || 0), inline: true },
          { name: 'Source', value: payload.source || 'monitor', inline: true },
        ],
        description: (payload.alerts || []).slice(0, 5).map((a) => `• **[${a.severity.toUpperCase()}]** ${a.message || a.detail || a.type}`).join('\n'),
        timestamp: payload.generated_at,
      },
    ],
  };
}

