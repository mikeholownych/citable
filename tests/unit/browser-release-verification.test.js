import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkCollector } from '../../src/observations/browser/networkCollector.js';
import { StateCollector } from '../../src/observations/browser/stateCollector.js';
import { RuntimeEventCollector } from '../../src/observations/browser/runtimeEventCollector.js';
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

test('body capture disabled by default (deny-by-default)', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  // Legacy or default plan with NO capture_payload configured
  const collector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
    planId: 'PLAN-BODY-DEFAULT',
    profileId: 'prof-default',
  });
  collector.attachToPage(page);

  let responseBodyCalled = false;
  const mockReq = {
    url: () => 'https://example.test/api/checkout',
    method: () => 'POST',
    resourceType: () => 'xhr',
    headers: () => ({ 'content-type': 'application/json' }),
    postData: () => JSON.stringify({ card: '4111111111111111', secret: '12345' }),
  };

  const mockResp = {
    request: () => mockReq,
    status: () => 200,
    statusText: () => 'OK',
    headers: () => ({ 'content-type': 'application/json' }),
    body: async () => {
      responseBodyCalled = true;
      return Buffer.from(JSON.stringify({ order_id: 'ORD-123' }));
    },
  };

  await page.emit('request', mockReq);
  await page.emit('response', mockResp);

  const artifact = collector.toArtifact();
  const reqEvent = artifact.events.find((e) => e.direction === 'request');
  const respEvent = artifact.events.find((e) => e.direction === 'response');

  // 1. Request body must be completely omitted
  assert.equal(reqEvent.request.payload_status, 'not_requested');
  assert.equal(reqEvent.request.payload_fields, null);
  assert.equal(reqEvent.request.payload_hash, null);
  assert.equal(reqEvent.request.payload_bytes, null);

  // 2. Response body must not be read or persisted
  assert.equal(responseBodyCalled, false, 'response.body() should NOT be invoked when not requested');
  assert.equal(respEvent.response.body_status, 'not_requested');
  assert.equal(respEvent.response.body_fields, null);
  assert.equal(respEvent.response.body_hash, null);
  assert.equal(respEvent.response.body_bytes, null);

  const check = validateAgainst('browser-network-events.schema.json', artifact);
  assert.equal(check.valid, true);
});

test('host allowlist alone does not enable body capture', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  // Allowed host without explicit request_body / response_body
  const collector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
      capture_payload: {
        request_body: false,
        response_body: false,
        hash_only: false,
      },
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  collector.attachToPage(page);

  const mockReq = {
    url: () => 'https://example.test/api/login',
    method: () => 'POST',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => 'username=admin&password=supersecretpassword',
  };

  await page.emit('request', mockReq);
  const artifact = collector.toArtifact();
  const reqEvent = artifact.events[0];
  assert.equal(reqEvent.request.payload_status, 'not_requested');
  assert.equal(reqEvent.request.payload_fields, null);
});

test('body capture requires explicit authorization and redacts secret-bearing fields', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  const collector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
      capture_payload: {
        request_body: true,
        response_body: true,
        allowed_json_fields: ['auth_token', 'password', 'user_id', 'amount'],
      },
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  collector.attachToPage(page);

  const mockReq = {
    url: () => 'https://example.test/pay',
    method: () => 'POST',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => JSON.stringify({
      auth_token: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG4m1e_pI2G0-8chd2vW_b9sYwL-E_sample',
      password: 'myPlainTextPassword',
      user_id: 'usr_777',
      amount: 100,
      unauthorized_secret: 'leaked_internal_token',
    }),
  };

  const mockResp = {
    request: () => mockReq,
    status: () => 200,
    statusText: () => 'OK',
    headers: () => ({ 'content-type': 'application/json' }),
    body: async () => Buffer.from(JSON.stringify({
      auth_token: 'Bearer ya29.secretGCPToken',
      amount: 100,
      internal_debug: 'do_not_capture',
    })),
  };

  await page.emit('request', mockReq);
  await page.emit('response', mockResp);

  const artifact = collector.toArtifact();
  const reqEvent = artifact.events.find((e) => e.direction === 'request');
  const respEvent = artifact.events.find((e) => e.direction === 'response');

  // Authorized JSON fields are captured, but sensitive keys/values are unconditionally redacted
  assert.equal(reqEvent.request.payload_status, 'captured');
  assert.equal(reqEvent.request.payload_fields.user_id, 'usr_777');
  assert.equal(reqEvent.request.payload_fields.amount, 100);
  assert.equal(reqEvent.request.payload_fields.auth_token, '[REDACTED_SECRET]');
  assert.equal(reqEvent.request.payload_fields.password, '[REDACTED_SECRET]');
  assert.equal(reqEvent.request.payload_fields.unauthorized_secret, undefined);

  assert.equal(respEvent.response.body_status, 'captured');
  assert.equal(respEvent.response.body_fields.amount, 100);
  assert.equal(respEvent.response.body_fields.auth_token, '[REDACTED_SECRET]');
  assert.equal(respEvent.response.body_fields.internal_debug, undefined);
});

test('HttpOnly cookie semantics: Playwright capability vs policy restriction', async () => {
  const tracker = new CorrelationTracker();

  const collector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['final'],
      cookies: {
        allowed_names: ['session_cookie', 'consent_cookie', 'non_existent_cookie'],
        mode: 'allowlist_values',
      },
    },
    correlationTracker: tracker,
  });

  const statePage = { url: () => 'https://example.test/' };
  const stateContext = {
    cookies: async () => [
      {
        name: 'session_cookie',
        value: 'sess_opaque_value_99999',
        domain: 'example.test',
        path: '/',
        httpOnly: true, // HttpOnly cookie!
        secure: true,
        sameSite: 'Lax',
      },
      {
        name: 'consent_cookie',
        value: 'granted',
        domain: 'example.test',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Strict',
      },
    ],
  };

  const cp = await collector.observeCheckpoint(statePage, stateContext, 'final_chk', 'final');
  const cookies = cp.state.cookies;

  // 1. Playwright CAN observe HttpOnly cookies at context level
  assert.ok(cookies.session_cookie.exists, 'HttpOnly cookie is observable by Playwright');
  assert.equal(cookies.session_cookie.http_only, true);
  assert.equal(cookies.session_cookie.secure, true);
  assert.equal(cookies.session_cookie.same_site, 'Lax');

  // 2. Citable POLICY restricts raw value exposure of HttpOnly cookies
  assert.equal(cookies.session_cookie.value, '[POLICY_RESTRICTED_HTTPONLY]');
  assert.equal(cookies.session_cookie.disposition, 'policy_restricted');

  // 3. Non-HttpOnly allowed cookie exposes value
  assert.equal(cookies.consent_cookie.exists, true);
  assert.equal(cookies.consent_cookie.http_only, false);
  assert.equal(cookies.consent_cookie.value, 'granted');

  // 4. Absent cookie
  assert.equal(cookies.non_existent_cookie.exists, false);

  const artifact = collector.toArtifact();
  const check = validateAgainst('browser-state-observations.schema.json', artifact);
  assert.equal(check.valid, true);
});

test('incomplete observation cannot collapse to ABSENT', async () => {
  const tracker = new CorrelationTracker();

  // Test that if context.cookies throws, cookies is null and recorded in unavailable_items, NOT exists: false
  const stateCollector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['initial'],
      cookies: {
        allowed_names: ['my_cookie'],
        mode: 'presence_only',
      },
      local_storage: {
        allowed_keys: ['my_storage'],
        mode: 'presence_only',
      },
    },
    correlationTracker: tracker,
  });

  const brokenPage = {
    url: () => 'https://example.test/',
    evaluate: async () => { throw new Error('DOM navigation destroyed execution context'); },
  };
  const brokenContext = {
    cookies: async () => { throw new Error('Browser closed'); },
  };

  const cp = await stateCollector.observeCheckpoint(brokenPage, brokenContext, 'chk1', 'initial');

  // Verification: Neither cookies nor localStorage reported exists: false!
  assert.equal(cp.state.cookies, null);
  assert.equal(cp.state.local_storage, null);
  assert.equal(cp.disposition.observation_status, 'partially_observed');
  assert.ok(cp.disposition.unavailable_items.includes('cookies:context_error'));
  assert.ok(cp.disposition.unavailable_items.includes('local_storage'));

  const artifact = stateCollector.toArtifact();
  const check = validateAgainst('browser-state-observations.schema.json', artifact);
  assert.equal(check.valid, true);
});

test('filter-vs-absence distinction in network and runtime events', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  // 1. Network filter vs absence
  const netCollector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['api.example.test'], // Excludes analytics.test
      max_events: 100,
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  netCollector.attachToPage(page);

  // Request to excluded host
  await page.emit('request', {
    url: () => 'https://analytics.test/collect',
    method: () => 'POST',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => null,
  });

  const netArtifact = netCollector.toArtifact();
  // Target request was filtered out by policy, NOT absent from browser activity
  assert.equal(netArtifact.summary.filtered_requests, 1);
  assert.equal(netArtifact.events.length, 0);
  assert.equal(netArtifact.summary.in_flight_requests, 0);

  // 2. Runtime event filter vs absence
  const runtimeCollector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app', type: 'global_array', global_name: 'dataLayer' }],
      allowed_event_names: ['page_view'], // Excludes purchase
    },
    correlationTracker: tracker,
  });

  const mockPage = {
    evaluate: async () => [
      { source_id: 'app', payload: { event: 'purchase', amount: 50 } },
    ],
  };

  await runtimeCollector.drainEvents(mockPage);
  const runtimeArtifact = runtimeCollector.toArtifact();

  // Event purchase was filtered out by policy, NOT absent
  assert.equal(runtimeArtifact.summary.filtered_events, 1);
  assert.equal(runtimeArtifact.summary.total_events, 0);
  assert.equal(runtimeArtifact.events.length, 0);
});

test('asynchronous cross-step network request correlation and in-flight tracking', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  const netCollector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  netCollector.attachToPage(page);

  const req1 = {
    url: () => 'https://example.test/api/async-operation',
    method: () => 'GET',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => null,
  };

  // Step 1: Request initiated
  tracker.startStep({ step_id: 'step-1' }, 1);
  await page.emit('request', req1);
  tracker.endStep({ step_id: 'step-1' }, 1);

  // Step 2: Request completes during step 2
  tracker.startStep({ step_id: 'step-2' }, 2);
  const resp1 = {
    request: () => req1,
    status: () => 200,
    statusText: () => 'OK',
    headers: () => ({}),
    body: async () => null,
  };
  await page.emit('response', resp1);
  tracker.endStep({ step_id: 'step-2' }, 2);

  // Step 3: Another request initiated, but never completes (in-flight when journey ends)
  const req2 = {
    url: () => 'https://example.test/api/hanging-request',
    method: () => 'GET',
    resourceType: () => 'fetch',
    headers: () => ({}),
    postData: () => null,
  };
  tracker.startStep({ step_id: 'step-3' }, 3);
  await page.emit('request', req2);
  tracker.endStep({ step_id: 'step-3' }, 3);
  tracker.finishJourney();

  const artifact = collectorToArtifact(netCollector);

  // Verify cross-step completion tagged as ambiguous_async
  const respEvent = artifact.events.find((e) => e.direction === 'response');
  assert.equal(respEvent.correlation.attribution_phase, 'ambiguous_async');
  assert.equal(respEvent.correlation.initiated_step_id, 'step-1');
  assert.equal(respEvent.correlation.completed_step_id, 'step-2');
  assert.equal(respEvent.correlation.ambiguous_async, true);

  // Verify in-flight request accounting
  assert.equal(artifact.summary.total_requests, 2);
  assert.equal(artifact.summary.successful_responses, 1);
  assert.equal(artifact.summary.in_flight_requests, 1);
  assert.equal(artifact.summary.collector_status, 'complete');
});

function collectorToArtifact(collector) {
  return collector.toArtifact();
}

test('runtime queue tamper analysis: getter/setter replacement and throwing getters', async () => {
  const tracker = new CorrelationTracker();

  const runtimeCollector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app_dl', type: 'global_array', global_name: 'dataLayer' }],
    },
    correlationTracker: tracker,
  });

  // Verify init script contains getter/setter definition and throwing getter protection
  const script = runtimeCollector.getInitScript();
  assert.ok(script.includes('Object.defineProperty(window, prop'));
  assert.ok(script.includes('safeExtract'));
  assert.ok(script.includes('[GETTER_ERROR]'));
  assert.ok(script.includes('queue_replaced = true'));
  assert.ok(script.includes('polling_fallback_used'));

  // Test drain with throwing getter payload and health metadata
  const throwingPayload = {
    event: 'test_event',
    get dangerous_prop() { throw new Error('Hostile getter error'); },
    safe_prop: 'hello',
  };

  const mockPage = {
    evaluate: async () => ({
      events: [
        {
          source_id: 'app_dl',
          payload: throwingPayload,
          ts: Date.now(),
        },
      ],
      health: {
        queue_replaced: true,
        push_replaced: false,
        polling_fallback_used: true,
      },
    }),
  };

  await runtimeCollector.drainEvents(mockPage);
  const artifact = runtimeCollector.toArtifact();

  assert.equal(artifact.summary.total_events, 1);
  assert.equal(artifact.summary.collector_health.queue_replaced, true);
  assert.equal(artifact.summary.collector_health.polling_fallback_used, true);
  assert.equal(artifact.summary.collector_health.supported_contexts.includes('top_level_main_frame'), true);
  assert.equal(artifact.summary.collector_health.unsupported_contexts.includes('cross_origin_iframes'), true);
});

test('minimization vs residual risk: opaque secrets in unrequested vs explicitly allowlisted fields', async () => {
  const tracker = new CorrelationTracker();

  // Scenario 1: Minimization protects unknown opaque secrets in unauthorized fields
  const collector1 = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app', type: 'global_array', global_name: 'events' }],
      allowed_fields: ['event', 'item_id'], // 'user_secret_code' is NOT authorized
    },
    correlationTracker: tracker,
  });

  const mockPage1 = {
    evaluate: async () => [
      {
        source_id: 'app',
        payload: {
          event: 'add_to_cart',
          item_id: 'ITM-001',
          user_secret_code: 'opaque-high-entropy-proprietary-token-9876543210',
        },
      },
    ],
  };

  await collector1.drainEvents(mockPage1);
  const artifact1 = collector1.toArtifact();
  const ev1 = artifact1.events[0];
  assert.equal(ev1.payload.item_id, 'ITM-001');
  assert.equal(ev1.payload.user_secret_code, undefined, 'Unauthorized field must be omitted via minimization');

  // Scenario 2: Residual Risk — customer explicitly puts benign-named field in allowed_fields
  const collector2 = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app', type: 'global_array', global_name: 'events' }],
      allowed_fields: ['event', 'item_id', 'custom_metadata'], // customer explicitly requested custom_metadata
    },
    correlationTracker: tracker,
  });

  const mockPage2 = {
    evaluate: async () => [
      {
        source_id: 'app',
        payload: {
          event: 'add_to_cart',
          item_id: 'ITM-001',
          custom_metadata: 'opaque-high-entropy-proprietary-token-9876543210',
        },
      },
    ],
  };

  await collector2.drainEvents(mockPage2);
  const artifact2 = collector2.toArtifact();
  const ev2 = artifact2.events[0];
  assert.equal(ev2.payload.custom_metadata, 'opaque-high-entropy-proprietary-token-9876543210',
    'Customer-authorized field with unknown opaque string is retained as documented residual risk');
});
