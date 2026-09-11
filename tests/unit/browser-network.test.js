import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkCollector } from '../../src/observations/browser/networkCollector.js';
import { CorrelationTracker } from '../../src/observations/browser/correlation.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';
import { EventEmitter } from 'node:events';

function createMockPage() {
  const emitter = new EventEmitter();
  return {
    on: (evt, handler) => emitter.on(evt, handler),
    emit: (evt, data) => emitter.emit(evt, data),
  };
}

test('NetworkCollector captures allowed requests and responses with schema validation', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();
  const collector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test', '*.metrics.test'],
      allowed_methods: ['GET', 'POST'],
      allowed_resource_types: ['document', 'fetch', 'xhr'],
      capture_request_headers: ['accept', 'content-type', 'authorization'],
      capture_response_headers: ['content-type', 'cache-control'],
      capture_query_params: ['page', 'sort', 'token'],
      capture_payload: {
        request_body: true,
        response_body: true,
        allowed_json_fields: ['event', 'user_id', 'password'],
        hash_only: false,
        max_bytes: 4096,
      },
      max_events: 50,
      max_field_size: 1024,
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-NET-TEST',
    profileId: 'chromium-desktop',
  });

  collector.attachToPage(page);

  // 1. Initial request / response
  const req1 = {
    url: () => 'https://example.test/api/data?page=2&token=sec_abc123&unallowed=ignore_me',
    method: () => 'GET',
    resourceType: () => 'fetch',
    headers: () => ({
      'accept': 'application/json',
      'authorization': 'Bearer top-secret-token',
      'user-agent': 'Browser',
    }),
    postData: () => null,
  };

  const resp1 = {
    request: () => req1,
    status: () => 200,
    statusText: () => 'OK',
    headers: () => ({
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
      'set-cookie': 'secret_cookie=val',
    }),
    body: async () => Buffer.from(JSON.stringify({ result: 'ok' })),
    fromServiceWorker: false,
  };

  await page.emit('request', req1);
  await page.emit('response', resp1);

  // 2. Step 1 request
  tracker.startStep({ step_id: 'submit-lead' }, 1);

  const req2 = {
    url: () => 'https://sub.metrics.test/collect',
    method: () => 'POST',
    resourceType: () => 'xhr',
    headers: () => ({
      'content-type': 'application/json',
    }),
    postData: () => JSON.stringify({
      event: 'lead_form_submitted',
      user_id: 'user-999',
      password: 'plain-password',
      extra_unallowed_field: 'drop-me',
    }),
  };

  const resp2 = {
    request: () => req2,
    status: () => 201,
    statusText: () => 'Created',
    headers: () => ({
      'content-type': 'application/json',
    }),
    body: async () => Buffer.from('{"id": 123}'),
    fromServiceWorker: false,
  };

  await page.emit('request', req2);
  await page.emit('response', resp2);

  tracker.endStep({ step_id: 'submit-lead' }, 1);

  // 3. Disallowed host request (should be filtered)
  const reqFiltered = {
    url: () => 'https://unauthorized-domain.test/track',
    method: () => 'GET',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => null,
  };
  await page.emit('request', reqFiltered);

  // 4. Failed request
  const reqFailed = {
    url: () => 'https://example.test/failing/endpoint',
    method: () => 'GET',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => null,
    failure: () => ({ errorText: 'net::ERR_CONNECTION_REFUSED' }),
  };
  await page.emit('request', reqFailed);
  await page.emit('requestfailed', reqFailed);

  const artifact = collector.toArtifact();

  // Validate against browser-network-events schema
  const check = validateAgainst('browser-network-events.schema.json', artifact);
  assert.equal(check.valid, true, `Schema validation failed: ${check.errors.join('; ')}`);

  // Assert counts & stats
  assert.equal(artifact.summary.total_requests, 3);
  assert.equal(artifact.summary.successful_responses, 2);
  assert.equal(artifact.summary.failed_requests, 1);
  assert.equal(artifact.summary.filtered_requests, 1);
  assert.equal(artifact.summary.truncated, false);
  assert.equal(artifact.summary.status_codes['200'], 1);
  assert.equal(artifact.summary.status_codes['201'], 1);

  // Verify secret protections in captured evidence
  const ev1Req = artifact.events.find((e) => e.transaction_id === 'TX-0001' && e.direction === 'request');
  assert.equal(ev1Req.request.headers['authorization'], '[REDACTED_SECRET]');
  assert.equal(ev1Req.request.query['token'], '[REDACTED_SECRET]');
  assert.equal(ev1Req.request.query['unallowed'], undefined);

  // Verify step 2 POST payload protections
  const ev2Req = artifact.events.find((e) => e.transaction_id === 'TX-0002' && e.direction === 'request');
  assert.equal(ev2Req.correlation.step_id, 'submit-lead');
  assert.equal(ev2Req.correlation.attribution_phase, 'during_step');
  assert.equal(ev2Req.request.payload_fields.event, 'lead_form_submitted');
  assert.equal(ev2Req.request.payload_fields.user_id, 'user-999');
  assert.equal(ev2Req.request.payload_fields.password, '[REDACTED_SECRET]');
  assert.equal(ev2Req.request.payload_fields.extra_unallowed_field, undefined);
});

test('NetworkCollector enforces event bounding and sets truncation flag', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();
  const collector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
      max_events: 3, // Bounded to 3 events
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-NET-BOUNDS',
    profileId: 'chromium-desktop',
  });

  collector.attachToPage(page);

  for (let i = 1; i <= 5; i++) {
    const req = {
      url: () => `https://example.test/api/${i}`,
      method: () => 'GET',
      resourceType: () => 'fetch',
      headers: () => ({}),
      postData: () => null,
    };
    const resp = {
      request: () => req,
      status: () => 200,
      statusText: () => 'OK',
      headers: () => ({}),
      body: async () => Buffer.from(''),
      fromServiceWorker: false,
    };
    await page.emit('request', req);
    await page.emit('response', resp);
  }

  const artifact = collector.toArtifact();
  assert.equal(artifact.summary.truncated, true);
  assert.equal(artifact.summary.truncation_reason, 'max_events_exceeded');
  assert.equal(artifact.events.length, 3);
  assert.equal(artifact.summary.total_requests, 5);
});
