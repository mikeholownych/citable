import test from 'node:test';
import assert from 'node:assert/strict';
import { StateCollector } from '../../src/observations/browser/stateCollector.js';
import { CorrelationTracker } from '../../src/observations/browser/correlation.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

test('StateCollector observes governed checkpoints and validates schema', async () => {
  const tracker = new CorrelationTracker();
  const collector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['initial', 'step', 'final'],
      capture_url: true,
      allowed_query_params: ['utm_source', 'session_token'],
      capture_referrer: true,
      capture_navigation: true,
      cookies: {
        allowed_names: ['consent_given', 'auth_session'],
        mode: 'allowlist_values',
      },
      local_storage: {
        allowed_keys: ['theme', 'cart_id', 'user_token'],
        mode: 'allowlist_values',
      },
      session_storage: {
        allowed_keys: ['checkout_step'],
        mode: 'presence_only',
      },
      globals: [
        { name: 'app_version', expression: 'window.APP_CONFIG.version', mode: 'scalar_value' },
        { name: 'missing_global', expression: 'window.NOT_THERE', mode: 'presence_only' },
      ],
      dom_queries: [
        { name: 'hero_title', selector: 'h1', property: 'text_content' },
        { name: 'cta_btn', selector: 'button.submit', property: 'visible' },
      ],
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-STATE-TEST',
    profileId: 'chromium-desktop',
  });

  const mockPage = {
    url: () => 'https://example.test/checkout?utm_source=newsletter&session_token=bearer_secret123&unallowed=skip',
    evaluate: async (fn, arg) => {
      if (typeof fn === 'function') {
        return fn(arg);
      }
      return null;
    },
    locator: (selector) => ({
      first: () => ({
        count: async () => 1,
        isVisible: async () => true,
        innerText: async () => (selector === 'h1' ? 'Checkout Order' : 'Submit'),
        getAttribute: async () => null,
      }),
    }),
  };

  // Provide mock evaluate implementations
  mockPage.evaluate = async (fn, arg) => {
    const fnStr = fn.toString();
    if (fnStr.includes('document.referrer')) {
      return { referrer: 'https://referrer.test/', navType: 'navigate' };
    }
    if (fnStr.includes('localStorage')) {
      return {
        theme: 'dark',
        cart_id: 'cart-12345',
        user_token: 'secret_jwt_token',
      };
    }
    if (fnStr.includes('sessionStorage')) {
      return {
        checkout_step: '2',
      };
    }
    if (arg === 'window.APP_CONFIG.version') {
      return { exists: true, type: 'string', value: '2.5.0' };
    }
    if (arg === 'window.NOT_THERE') {
      return { exists: false };
    }
    return {};
  };

  const mockContext = {
    cookies: async () => [
      { name: 'consent_given', value: 'yes' },
      { name: 'auth_session', value: 'token-abc-xyz' },
      { name: 'unallowed_cookie', value: 'never-reveal' },
    ],
  };

  // Capture checkpoint at initial
  await collector.observeCheckpoint(mockPage, mockContext, 'initial_landing', 'initial');

  // Capture checkpoint during step
  tracker.startStep({ step_id: 'view_cart' }, 1);
  await collector.observeCheckpoint(mockPage, mockContext, 'post_view_cart', 'step');
  tracker.endStep({ step_id: 'view_cart' }, 1);

  const artifact = collector.toArtifact();

  // Validate against browser-state-observations schema
  const check = validateAgainst('browser-state-observations.schema.json', artifact);
  assert.equal(check.valid, true, `Schema validation failed: ${check.errors.join('; ')}`);

  assert.equal(artifact.summary.total_checkpoints, 2);
  assert.equal(artifact.summary.total_observations, 2);
  assert.equal(artifact.summary.truncated, false);

  const cp1 = artifact.checkpoints[0];
  assert.equal(cp1.checkpoint_id, 'initial_landing');
  assert.equal(cp1.state.query_params.utm_source, 'newsletter');
  assert.equal(cp1.state.query_params.session_token, '[REDACTED_SECRET]');
  assert.equal(cp1.state.query_params.unallowed, undefined);
  assert.equal(cp1.state.referrer, 'https://referrer.test/');
  assert.equal(cp1.state.navigation_type, 'navigate');

  // Cookies: only allowed names, secret redacted
  assert.equal(cp1.state.cookies.consent_given.value, 'yes');
  assert.equal(cp1.state.cookies.auth_session.value, '[REDACTED_SECRET]');
  assert.equal(cp1.state.cookies.unallowed_cookie, undefined);

  // Local storage: secret redacted
  assert.equal(cp1.state.local_storage.theme.value, 'dark');
  assert.equal(cp1.state.local_storage.user_token.value, '[REDACTED_SECRET]');

  // Session storage: presence mode
  assert.equal(cp1.state.session_storage.checkout_step.exists, true);
  assert.equal(cp1.state.session_storage.checkout_step.value, undefined);

  // Globals
  assert.equal(cp1.state.globals.app_version.value, '2.5.0');
  assert.equal(cp1.state.globals.missing_global.exists, false);

  // DOM queries
  assert.equal(cp1.state.dom_queries.hero_title.text, 'Checkout Order');
  assert.equal(cp1.state.dom_queries.cta_btn.visible, true);
});

test('StateCollector bounds observation count and flags truncation', async () => {
  const tracker = new CorrelationTracker();
  const collector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['step'],
      max_observations: 2,
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-STATE-BOUNDS',
    profileId: 'chromium-desktop',
  });

  const mockPage = {
    url: () => 'https://example.test/',
    evaluate: async () => ({}),
  };
  const mockContext = { cookies: async () => [] };

  await collector.observeCheckpoint(mockPage, mockContext, 'cp-1', 'step');
  await collector.observeCheckpoint(mockPage, mockContext, 'cp-2', 'step');
  const cp3 = await collector.observeCheckpoint(mockPage, mockContext, 'cp-3', 'step');

  assert.equal(cp3, null);
  const artifact = collector.toArtifact();
  assert.equal(artifact.summary.total_checkpoints, 2);
  assert.equal(artifact.summary.truncated, true);
  assert.equal(artifact.summary.truncation_reason, 'max_observations_exceeded');
});

test('StateCollector rejects unsafe global expressions fail-closed', async () => {
  const tracker = new CorrelationTracker();
  const collector = new StateCollector({
    statePolicy: {
      enabled: true,
      checkpoints: ['initial'],
      globals: [
        { name: 'evil_exec', expression: 'window.eval("alert(1)")', mode: 'scalar_value' },
      ],
    },
    correlationTracker: tracker,
    planId: 'BROWSER-PLAN-STATE-EXPR',
    profileId: 'chromium-desktop',
  });

  const mockPage = {
    url: () => 'https://example.test/',
    evaluate: async () => ({}),
  };
  const mockContext = { cookies: async () => [] };

  const cp = await collector.observeCheckpoint(mockPage, mockContext, 'cp-init', 'initial');
  assert.ok(cp.disposition.unavailable_items.includes('global:evil_exec:unsafe_expression'));
  assert.equal(cp.disposition.observation_status, 'partially_observed');
});

