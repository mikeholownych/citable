import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeEventCollector } from '../../src/observations/browser/runtimeEventCollector.js';
import { CorrelationTracker } from '../../src/observations/browser/correlation.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

test('RuntimeEventCollector captures generic runtime events and validates schema', async () => {
  const tracker = new CorrelationTracker();
  const collector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [
        {
          source_id: 'app_data_layer',
          type: 'global_array',
          global_name: 'window.dataLayer',
          event_name_key: 'event',
        },
        {
          source_id: 'custom_events',
          type: 'global_array',
          global_name: 'window._myQueue',
          event_name_key: 'name',
        },
      ],
      allowed_event_names: ['page_view', 'purchase', 'custom_click'],
      allowed_fields: ['event', 'name', 'page_path', 'transaction_id', 'value', 'user_token'],
      hash_fields: ['transaction_id'],
      max_events: 100,
      max_payload_depth: 5,
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-RUNTIME-TEST',
    profileId: 'chromium-desktop',
  });

  // Verify init script generation
  const initScript = collector.getInitScript();
  assert.ok(initScript.includes('window.__citable_events'));
  assert.ok(initScript.includes('window.dataLayer'));
  assert.ok(initScript.includes('window._myQueue'));

  let inPageEvents = [
    {
      source_id: 'app_data_layer',
      payload: {
        event: 'page_view',
        page_path: '/products',
        unallowed_meta: 'drop_this',
      },
    },
    {
      source_id: 'app_data_layer',
      payload: {
        event: 'unsupported_event_filtered',
        data: 123,
      },
    },
  ];

  const mockPage = {
    evaluate: async () => {
      const copy = inPageEvents;
      inPageEvents = [];
      return copy;
    },
  };

  // Initial event drain
  await collector.drainEvents(mockPage);

  // Step 1 event drain
  tracker.startStep({ step_id: 'complete_checkout' }, 1);
  inPageEvents = [
    {
      source_id: 'app_data_layer',
      payload: {
        event: 'purchase',
        transaction_id: 'TXN-ABC-999',
        value: 49.99,
        user_token: 'Bearer superSecretToken12345',
      },
    },
    {
      source_id: 'custom_events',
      payload: {
        name: 'custom_click',
        value: 1,
      },
    },
  ];
  await collector.drainEvents(mockPage);
  tracker.endStep({ step_id: 'complete_checkout' }, 1);

  const artifact = collector.toArtifact();

  // Validate against browser-runtime-events schema
  const check = validateAgainst('browser-runtime-events.schema.json', artifact);
  assert.equal(check.valid, true, `Schema validation failed: ${check.errors.join('; ')}`);

  assert.equal(artifact.summary.total_events, 3);
  assert.equal(artifact.summary.by_source['app_data_layer'], 2);
  assert.equal(artifact.summary.by_source['custom_events'], 1);
  assert.equal(artifact.summary.by_event_name['page_view'], 1);
  assert.equal(artifact.summary.by_event_name['purchase'], 1);
  assert.equal(artifact.summary.by_event_name['custom_click'], 1);

  // Verify field allowlisting and hashing on purchase event
  const purchaseEvent = artifact.events.find((e) => e.event_name === 'purchase');
  assert.equal(purchaseEvent.correlation.step_id, 'complete_checkout');
  assert.equal(purchaseEvent.correlation.attribution_phase, 'during_step');
  assert.ok(purchaseEvent.payload.transaction_id.startsWith('sha256:'));
  assert.equal(purchaseEvent.payload.value, 49.99);
  assert.equal(purchaseEvent.payload.user_token, '[REDACTED_SECRET]');
  assert.equal(purchaseEvent.disposition.capture_status, 'redacted');
  assert.equal(purchaseEvent.disposition.redacted_count, 1);
});

test('RuntimeEventCollector handles circular payload objects without infinite recursion', async () => {
  const tracker = new CorrelationTracker();
  const collector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'test', type: 'global_array', global_name: 'events' }],
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-RUNTIME-CIRCULAR',
    profileId: 'chromium-desktop',
  });

  const cyclicPayload = { event: 'cycle_test', data: 'ok' };
  cyclicPayload.self = cyclicPayload;

  const mockPage = {
    evaluate: async () => [{ source_id: 'test', payload: cyclicPayload }],
  };

  await collector.drainEvents(mockPage);
  const artifact = collector.toArtifact();
  assert.equal(artifact.events.length, 1);
  assert.equal(artifact.events[0].payload.self, '[CIRCULAR]');
});

test('RuntimeEventCollector truncates when max_events is exceeded', async () => {
  const tracker = new CorrelationTracker();
  const collector = new RuntimeEventCollector({
    runtimeEventPolicy: {
      enabled: true,
      sources: [{ source_id: 'test', type: 'global_array', global_name: 'events' }],
      max_events: 2,
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-RUNTIME-BOUNDS',
    profileId: 'chromium-desktop',
  });

  const mockPage = {
    evaluate: async () => [
      { source_id: 'test', payload: { event: 'ev1' } },
      { source_id: 'test', payload: { event: 'ev2' } },
      { source_id: 'test', payload: { event: 'ev3' } },
    ],
  };

  await collector.drainEvents(mockPage);
  const artifact = collector.toArtifact();
  assert.equal(artifact.summary.truncated, true);
  assert.equal(artifact.summary.truncation_reason, 'max_events_exceeded');
  assert.equal(artifact.events.length, 2);
});
