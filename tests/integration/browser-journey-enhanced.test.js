import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { observe } from '../../src/commands/observe.js';
import { readJson, sha256File } from '../../src/shared/io.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const OBS = path.join(FIX, 'observations');
const fresh = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-obs-enh-')); init(root); return root; };
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('enhanced browser journey captures network, state, and runtime event artifacts with full integrity', async () => {
  const root = fresh();
  const planFile = path.join(OBS, 'browser-plan-enhanced.json');

  const mockNetworkEvents = {
    schema_version: 1,
    plan_id: 'BROWSER-PLAN-ENHANCED-FIXTURE',
    profile_id: 'chromium-enhanced',
    collected_at: '2026-09-11T12:00:00.000Z',
    capture_policy: { enabled: true },
    summary: {
      total_requests: 2,
      successful_responses: 2,
      failed_requests: 0,
      filtered_requests: 1,
      truncated: false,
      truncation_reason: null,
      status_codes: { '200': 1, '204': 1 },
    },
    events: [
      {
        sequence: 1,
        transaction_id: 'TX-0001',
        direction: 'request',
        phase: 'request_sent',
        timing: { monotonic_offset_ms: 5.2, timestamp: '2026-09-11T12:00:00.005Z' },
        correlation: { step_id: null, step_sequence: null, checkpoint_id: null, attribution_phase: 'initial' },
        request: {
          url: 'https://example.test/api/init',
          method: 'GET',
          scheme: 'https',
          host: 'example.test',
          path: '/api/init',
          resource_type: 'fetch',
          query: { source: 'organic' },
          headers: { 'content-type': 'application/json', 'authorization': '[REDACTED_SECRET]' },
          payload_hash: null,
          payload_bytes: null,
          payload_fields: null,
        },
        response: null,
        failure: null,
        disposition: { capture_status: 'redacted', redacted_count: 1, filtered_fields: [] },
      },
      {
        sequence: 2,
        transaction_id: 'TX-0001',
        direction: 'response',
        phase: 'response_received',
        timing: { monotonic_offset_ms: 25.1, timestamp: '2026-09-11T12:00:00.025Z' },
        correlation: { step_id: null, step_sequence: null, checkpoint_id: null, attribution_phase: 'initial' },
        request: {
          url: 'https://example.test/api/init',
          method: 'GET',
          scheme: 'https',
          host: 'example.test',
          path: '/api/init',
          resource_type: 'fetch',
          query: null,
          headers: null,
          payload_hash: null,
          payload_bytes: null,
          payload_fields: null,
        },
        response: {
          status: 200,
          status_text: 'OK',
          headers: { 'content-type': 'application/json' },
          mime_type: 'application/json',
          body_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          body_bytes: 42,
          redirect_url: null,
          from_cache: false,
        },
        failure: null,
        disposition: { capture_status: 'captured', redacted_count: 0, filtered_fields: [] },
      },
    ],
  };

  const mockStateObservations = {
    schema_version: 1,
    plan_id: 'BROWSER-PLAN-ENHANCED-FIXTURE',
    profile_id: 'chromium-enhanced',
    collected_at: '2026-09-11T12:00:00.000Z',
    capture_policy: { enabled: true },
    summary: {
      total_checkpoints: 2,
      total_observations: 2,
      truncated: false,
      truncation_reason: null,
    },
    checkpoints: [
      {
        checkpoint_id: 'initial',
        sequence: 3,
        timing: { monotonic_offset_ms: 30.5, timestamp: '2026-09-11T12:00:00.030Z' },
        correlation: { step_id: null, step_sequence: null },
        state: {
          url: 'https://example.test/',
          query_params: null,
          referrer: 'https://google.com/',
          navigation_type: 'navigate',
          cookies: {
            session_id: { exists: true, length: 32, value: '[REDACTED_SECRET]' },
            cookie_consent: { exists: true, length: 7, value: 'granted' },
          },
          local_storage: {
            theme: { exists: true, length: 5, value: 'light' },
            user_auth: { exists: true, length: 64, value: '[REDACTED_SECRET]' },
          },
          session_storage: null,
          globals: {
            app_version: { exists: true, type: 'string', value: '1.5.0' },
          },
          dom_queries: {
            lead_heading: { exists: true, text: 'Enterprise Platform' },
          },
        },
        disposition: { observation_status: 'observed', redacted_count: 2, unavailable_items: [] },
      },
      {
        checkpoint_id: 'chk-explicit-step',
        sequence: 4,
        timing: { monotonic_offset_ms: 120.0, timestamp: '2026-09-11T12:00:00.120Z' },
        correlation: { step_id: 'state-checkpoint-step', step_sequence: 2 },
        state: {
          url: 'https://example.test/#details',
          query_params: null,
          referrer: 'https://google.com/',
          navigation_type: 'navigate',
          cookies: null,
          local_storage: null,
          session_storage: null,
          globals: null,
          dom_queries: null,
        },
        disposition: { observation_status: 'observed', redacted_count: 0, unavailable_items: [] },
      },
    ],
  };

  const mockRuntimeEvents = {
    schema_version: 1,
    plan_id: 'BROWSER-PLAN-ENHANCED-FIXTURE',
    profile_id: 'chromium-enhanced',
    collected_at: '2026-09-11T12:00:00.000Z',
    capture_policy: { enabled: true },
    summary: {
      total_events: 2,
      by_source: { data_layer: 2 },
      by_event_name: { page_view: 1, generate_lead: 1 },
      truncated: false,
      truncation_reason: null,
    },
    events: [
      {
        sequence: 5,
        source_id: 'data_layer',
        event_name: 'page_view',
        occurrence_index: 1,
        timing: { monotonic_offset_ms: 35.0, timestamp: '2026-09-11T12:00:00.035Z' },
        correlation: { step_id: null, step_sequence: null, checkpoint_id: null, attribution_phase: 'initial' },
        payload: { event: 'page_view', page_path: '/' },
        disposition: { capture_status: 'captured', redacted_count: 0, filtered_fields: [] },
      },
      {
        sequence: 6,
        source_id: 'data_layer',
        event_name: 'generate_lead',
        occurrence_index: 1,
        timing: { monotonic_offset_ms: 95.0, timestamp: '2026-09-11T12:00:00.095Z' },
        correlation: { step_id: 'open-details', step_sequence: 1, checkpoint_id: 'chk-after-details', attribution_phase: 'during_step' },
        payload: { event: 'generate_lead', lead_id: 'LD-12345', secret_token: '[REDACTED_SECRET]' },
        disposition: { capture_status: 'redacted', redacted_count: 1, filtered_fields: [] },
      },
    ],
  };

  const result = await observe(root, 'render', {
    input: planFile,
    lookup: publicLookup,
    fetchUrl: async () => ({ body: '<main>Initial response</main>', headers: { 'content-type': 'text/html' } }),
    captureJourney: async (profile) => ({
      final_url: 'https://example.test/#details',
      status: 200,
      browser_version: 'fixture-chromium',
      dom: '<main><h1>Enterprise Platform</h1><details open><summary>Details</summary><p>More info</p></details></main>',
      text: 'Enterprise Platform Details More info',
      accessibility_tree: '- main\n  - heading "Enterprise Platform"',
      screenshot: Buffer.from('screenshot-data'),
      console_errors: [],
      network_failures: [],
      steps: [
        { step_id: 'open-details', action: 'click', status: 'completed', failure: null, screenshot_ref: 'journeys/chromium-enhanced/steps/open-details.png' },
        { step_id: 'state-checkpoint-step', action: 'checkpoint', status: 'completed', failure: null, screenshot_ref: null },
      ],
      step_screenshots: {
        'journeys/chromium-enhanced/steps/open-details.png': Buffer.from('step-screenshot'),
      },
      network_events: mockNetworkEvents,
      state_observations: mockStateObservations,
      runtime_events: mockRuntimeEvents,
    }),
  });

  // Verify run status
  assert.equal(result.manifest.status, 'completed');

  // Verify artifact files were written to the run directory
  const netRel = 'journeys/chromium-enhanced/network-events.json';
  const stateRel = 'journeys/chromium-enhanced/state-observations.json';
  const runtimeRel = 'journeys/chromium-enhanced/runtime-events.json';

  const netFile = path.join(result.dir, netRel);
  const stateFile = path.join(result.dir, stateRel);
  const runtimeFile = path.join(result.dir, runtimeRel);

  assert.ok(fs.existsSync(netFile), 'network-events.json must exist');
  assert.ok(fs.existsSync(stateFile), 'state-observations.json must exist');
  assert.ok(fs.existsSync(runtimeFile), 'runtime-events.json must exist');

  // Verify manifest output_hashes
  assert.equal(result.manifest.output_hashes[netRel], sha256File(netFile));
  assert.equal(result.manifest.output_hashes[stateRel], sha256File(stateFile));
  assert.equal(result.manifest.output_hashes[runtimeRel], sha256File(runtimeFile));

  // Verify checksums.json
  const checksums = readJson(path.join(result.dir, 'checksums.json'));
  assert.equal(checksums[netRel], sha256File(netFile));
  assert.equal(checksums[stateRel], sha256File(stateFile));
  assert.equal(checksums[runtimeRel], sha256File(runtimeFile));

  // Verify observation envelope
  const obs = result.observations[0];
  assert.equal(obs.kind, 'browser_journey');
  assert.equal(obs.state, 'observed');
  assert.equal(obs.data.artifact_refs.network_events, netRel);
  assert.equal(obs.data.artifact_refs.browser_state, stateRel);
  assert.equal(obs.data.artifact_refs.runtime_events, runtimeRel);

  assert.equal(obs.data.network_summary.total_requests, 2);
  assert.equal(obs.data.network_summary.successful_responses, 2);
  assert.equal(obs.data.state_summary.total_checkpoints, 2);
  assert.equal(obs.data.runtime_events_summary.total_events, 2);

  // Schema validation of artifacts read directly from disk
  assert.equal(validateAgainst('browser-network-events.schema.json', readJson(netFile)).valid, true);
  assert.equal(validateAgainst('browser-state-observations.schema.json', readJson(stateFile)).valid, true);
  assert.equal(validateAgainst('browser-runtime-events.schema.json', readJson(runtimeFile)).valid, true);
});

test('enhanced browser journey preserves partial artifacts on failure', async () => {
  const root = fresh();
  const planFile = path.join(OBS, 'browser-plan-enhanced.json');

  const partialNet = {
    schema_version: 1,
    plan_id: 'BROWSER-PLAN-ENHANCED-FIXTURE',
    profile_id: 'chromium-enhanced',
    collected_at: '2026-09-11T12:00:00.000Z',
    capture_policy: { enabled: true },
    summary: { total_requests: 1, successful_responses: 0, failed_requests: 1, filtered_requests: 0, truncated: false, truncation_reason: null, status_codes: {} },
    events: [],
  };

  const result = await observe(root, 'render', {
    input: planFile,
    lookup: publicLookup,
    fetchUrl: async () => ({ body: '<main>Initial</main>', headers: {} }),
    captureJourney: async () => {
      const err = new Error('simulated network crash during step');
      err.steps = [{ step_id: 'open-details', action: 'click', status: 'failed', failure: err.message }];
      err.network_events = partialNet;
      throw err;
    },
  });

  assert.equal(result.manifest.status, 'incomplete');
  assert.equal(result.observations[0].state, 'failed');
  assert.ok(fs.existsSync(path.join(result.dir, 'journeys/chromium-enhanced/network-events.json')));
});
