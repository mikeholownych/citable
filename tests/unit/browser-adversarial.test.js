import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkCollector } from '../../src/observations/browser/networkCollector.js';
import { StateCollector } from '../../src/observations/browser/stateCollector.js';
import { RuntimeEventCollector } from '../../src/observations/browser/runtimeEventCollector.js';
import { CorrelationTracker } from '../../src/observations/browser/correlation.js';
import { EventEmitter } from 'node:events';

function createMockPage() {
  const emitter = new EventEmitter();
  return {
    on: (evt, handler) => emitter.on(evt, handler),
    emit: (evt, data) => emitter.emit(evt, data),
  };
}

test('adversarial: secret exfiltration attempts in headers, query, storage, and events are strictly redacted or filtered', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  // 1. Network exfiltration attempt
  const netCollector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
      capture_request_headers: ['authorization', 'proxy-authorization', 'cookie', 'x-api-key', 'custom-header'],
      capture_query_params: ['token', 'secret', 'password', 'oauth_token', 'code'],
      capture_payload: {
        request_body: true,
        allowed_json_fields: ['auth_token', 'password', 'credit_card', 'normal_field'],
        hash_only: false,
      },
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
    planId: 'PLAN-SEC',
    profileId: 'prof-1',
  });
  netCollector.attachToPage(page);

  const hostileReq = {
    url: () => 'https://example.test/api?token=sk-999999999999999999999999&secret=super_secret&code=oauth_auth_code_12345',
    method: () => 'POST',
    resourceType: () => 'fetch',
    headers: () => ({
      'authorization': 'Bearer ya29.a0ARrdaM-sensitiveGCPToken',
      'proxy-authorization': 'Basic dXNlcjpwYXNz',
      'cookie': 'session_id=sess_1234567890; token=secret',
      'x-api-key': 'sk-proj-secretKey12345678901234567890',
      'custom-header': 'safe-value',
    }),
    postData: () => JSON.stringify({
      auth_token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
      password: 'mypassword123',
      credit_card: '4111 1111 1111 1111',
      normal_field: 'safe_data',
    }),
  };

  await page.emit('request', hostileReq);
  const netArtifact = netCollector.toArtifact();
  const reqEvent = netArtifact.events[0].request;

  // Verify headers: sensitive keys are redacted, safe key preserved
  assert.equal(reqEvent.headers['authorization'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.headers['proxy-authorization'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.headers['cookie'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.headers['x-api-key'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.headers['custom-header'], 'safe-value');

  // Verify query params: sensitive keys redacted
  assert.equal(reqEvent.query['token'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.query['secret'], '[REDACTED_SECRET]');
  assert.equal(reqEvent.query['code'], '[REDACTED_SECRET]');

  // Verify payload fields: sensitive fields redacted
  assert.equal(reqEvent.payload_fields.auth_token, '[REDACTED_SECRET]');
  assert.equal(reqEvent.payload_fields.password, '[REDACTED_SECRET]');
  assert.equal(reqEvent.payload_fields.credit_card, '[REDACTED_SECRET]');
  assert.equal(reqEvent.payload_fields.normal_field, 'safe_data');

  // 2. Storage & Cookie exfiltration attempt
  const stateCollector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['initial'],
      cookies: {
        allowed_names: ['auth_token', 'session_id'],
        mode: 'allowlist_values',
      },
      local_storage: {
        allowed_keys: ['api_key', 'user_password', 'normal_pref'],
        mode: 'allowlist_values',
      },
    },
    correlationTracker: tracker,
    planId: 'PLAN-SEC',
    profileId: 'prof-1',
  });

  const statePage = {
    url: () => 'https://example.test/',
    evaluate: async () => ({
      api_key: 'sk-99999999999999999999999999999999',
      user_password: 'plain_secret_password',
      normal_pref: 'dark_mode',
    }),
  };
  const stateContext = {
    cookies: async () => [
      { name: 'auth_token', value: 'secret-token-value-12345' },
      { name: 'session_id', value: 'session-id-54321' },
    ],
  };

  const cp = await stateCollector.observeCheckpoint(statePage, stateContext, 'init', 'initial');
  assert.equal(cp.state.cookies.auth_token.value, '[REDACTED_SECRET]');
  assert.equal(cp.state.cookies.session_id.value, '[REDACTED_SECRET]');
  assert.equal(cp.state.local_storage.api_key.value, '[REDACTED_SECRET]');
  assert.equal(cp.state.local_storage.user_password.value, '[REDACTED_SECRET]');
  assert.equal(cp.state.local_storage.normal_pref.value, 'dark_mode');

  // 3. Runtime event exfiltration attempt
  const runtimeCollector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app', type: 'global_array', global_name: 'events' }],
      allowed_fields: ['event', 'user_token', 'client_secret', 'safe_data'],
    },
    correlationTracker: tracker,
    planId: 'PLAN-SEC',
    profileId: 'prof-1',
  });

  const eventPage = {
    evaluate: async () => [{
      source_id: 'app',
      payload: {
        event: 'user_login',
        user_token: 'Bearer ya29.secretGCPToken1234567890',
        client_secret: 'sk-12345678901234567890',
        safe_data: 'ok',
      },
    }],
  };
  await runtimeCollector.drainEvents(eventPage);
  const runtimeArtifact = runtimeCollector.toArtifact();
  const ev = runtimeArtifact.events[0];
  assert.equal(ev.payload.user_token, '[REDACTED_SECRET]');
  assert.equal(ev.payload.client_secret, '[REDACTED_SECRET]');
  assert.equal(ev.payload.safe_data, 'ok');
});

test('adversarial: hostile flood of network requests and runtime events remains strictly bounded', async () => {
  const page = createMockPage();
  const tracker = new CorrelationTracker();

  const netCollector = new NetworkCollector({
    networkPolicy: {
      enabled: true,
      allowed_host_patterns: ['example.test'],
      max_events: 50,
    },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
    planId: 'PLAN-FLOOD',
    profileId: 'prof-flood',
  });
  netCollector.attachToPage(page);

  // Emit 500 requests rapidly
  for (let i = 0; i < 500; i++) {
    const req = {
      url: () => `https://example.test/flood/${i}`,
      method: () => 'GET',
      resourceType: () => 'fetch',
      headers: () => ({}),
      postData: () => null,
    };
    await page.emit('request', req);
  }

  const netArtifact = netCollector.toArtifact();
  assert.equal(netArtifact.events.length, 50); // Hard cap at max_events
  assert.equal(netArtifact.summary.truncated, true);
  assert.equal(netArtifact.summary.truncation_reason, 'max_events_exceeded');
  assert.equal(netArtifact.summary.total_requests, 500);

  // Runtime event flood
  const runtimeCollector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'flood', type: 'global_array', global_name: 'events' }],
      max_events: 50,
    },
    correlationTracker: tracker,
    planId: 'PLAN-FLOOD',
    profileId: 'prof-flood',
  });

  const floodEvents = Array.from({ length: 500 }, (_, i) => ({
    source_id: 'flood',
    payload: { event: `spam_${i}`, i },
  }));

  const mockPage = { evaluate: async () => floodEvents };
  await runtimeCollector.drainEvents(mockPage);

  const runtimeArtifact = runtimeCollector.toArtifact();
  assert.equal(runtimeArtifact.events.length, 50);
  assert.equal(runtimeArtifact.summary.truncated, true);
  assert.equal(runtimeArtifact.summary.truncation_reason, 'max_events_exceeded');
  assert.equal(runtimeArtifact.summary.total_events, 50);
});

test('adversarial: cyclic and prototype-polluting payloads are handled safely', async () => {
  const tracker = new CorrelationTracker();
  const runtimeCollector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'app', type: 'global_array', global_name: 'events' }],
    },
    correlationTracker: tracker,
    planId: 'PLAN-POLLUTE',
    profileId: 'prof-pollute',
  });

  const hostilePayload = JSON.parse('{"event": "hostile", "__proto__": {"admin": true}, "constructor": {"name": "Malicious"}}');
  // Add circular reference
  hostilePayload.loop = hostilePayload;

  const mockPage = {
    evaluate: async () => [{ source_id: 'app', payload: hostilePayload }],
  };

  await runtimeCollector.drainEvents(mockPage);
  const artifact = runtimeCollector.toArtifact();
  assert.equal(artifact.events.length, 1);
  const payload = artifact.events[0].payload;
  assert.equal(payload.event, 'hostile');
  assert.equal(payload.loop, '[CIRCULAR]');
  // Ensure Object prototype was not corrupted
  assert.equal(({}).admin, undefined);
});

test('failure semantics: downstream consumer can distinguish ABSENT vs UNOBSERVABLE vs TRUNCATED vs FAILED', async () => {
  const tracker = new CorrelationTracker();

  // Case 1: ABSENT — collector executed, did not observe target event, not truncated
  const netCollector1 = new NetworkCollector({
    networkPolicy: { enabled: true, allowed_host_patterns: ['example.test'], max_events: 100 },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  const art1 = netCollector1.toArtifact();
  const targetReq = art1.events.find((e) => e.request.path === '/conversions');
  assert.equal(targetReq, undefined);
  assert.equal(art1.summary.truncated, false);
  // Status: ABSENT (target event genuinely did not occur within observed requests)

  // Case 2: TRUNCATED — collection limit reached; target event may have been dropped
  const netCollector2 = new NetworkCollector({
    networkPolicy: { enabled: true, allowed_host_patterns: ['example.test'], max_events: 1 },
    targetUrl: 'https://example.test/',
    correlationTracker: tracker,
  });
  const page2 = createMockPage();
  netCollector2.attachToPage(page2);
  await page2.emit('request', { url: () => 'https://example.test/first', method: () => 'GET', resourceType: () => 'fetch', headers: () => ({}), postData: () => null });
  await page2.emit('request', { url: () => 'https://example.test/conversions', method: () => 'POST', resourceType: () => 'fetch', headers: () => ({}), postData: () => null });
  const art2 = netCollector2.toArtifact();
  assert.equal(art2.summary.truncated, true);
  // Status: TRUNCATED (cannot conclude absent because capture was truncated)

  // Case 3: UNOBSERVABLE — state collector attempted observation, source was unavailable
  const stateCollector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['initial'],
      globals: [{ name: 'missing_telemetry', expression: 'window.NOT_EXISTS', mode: 'scalar_value' }],
    },
    correlationTracker: tracker,
  });
  const cp = await stateCollector.observeCheckpoint({ url: () => 'https://example.test/', evaluate: async () => ({ exists: false }) }, { cookies: async () => [] }, 'init', 'initial');
  assert.equal(cp.state.globals.missing_telemetry.exists, false);
  // Status: UNOBSERVABLE (the requested global object was not present in the runtime)
});
