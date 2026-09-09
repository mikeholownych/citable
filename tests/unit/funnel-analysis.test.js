import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConversionFunnel } from '../../src/analysis/funnelAnalysis.js';

test('analyzeConversionFunnel auto-discovers conversion paths and evaluates continuity', () => {
  const pages = [
    {
      url: 'https://example.com/',
      status: 200,
      ctas: [{ text: 'View Pricing', target: 'https://example.com/pricing' }],
      forms: [],
      navLinksCount: 5,
    },
    {
      url: 'https://example.com/pricing',
      status: 200,
      ctas: [{ text: 'Sign Up', target: 'https://example.com/signup' }],
      forms: [],
      navLinksCount: 4,
    },
    {
      url: 'https://example.com/signup',
      status: 200,
      ctas: [{ text: 'Complete Registration', target: 'https://example.com/thank-you' }],
      forms: [{ fieldCount: 3 }],
      navLinksCount: 2,
    },
    {
      url: 'https://example.com/thank-you',
      status: 200,
      ctas: [],
      forms: [],
      robotsDirectives: new Set(['noindex', 'nofollow']),
      navLinksCount: 1,
    },
  ];

  const result = analyzeConversionFunnel(pages);
  assert.equal(result.status, 'healthy');
  assert.equal(result.funnel_health_score, 100);
  assert.equal(result.total_steps, 4);
  assert.equal(result.leaks.length, 0);
  assert.equal(result.steps[0].continuity_intact, true);
  assert.equal(result.steps[0].drop_off_risk, 'low');
});

test('analyzeConversionFunnel detects broken continuity, attribution loss, and unprotected confirmation pages', () => {
  const declaredFunnel = {
    funnel_id: 'DEMO-FUNNEL',
    name: 'B2B Demo Request Funnel',
    steps: [
      { step_id: 'STEP-1', name: 'Landing', url_pattern: 'https://example.com/landing', role: 'landing' },
      { step_id: 'STEP-2', name: 'Checkout', url_pattern: 'https://example.com/checkout', role: 'checkout' },
      { step_id: 'STEP-3', name: 'Thank You', url_pattern: 'https://example.com/thank-you', role: 'confirmation' },
    ],
  };

  const pages = [
    {
      url: 'https://example.com/landing',
      status: 200,
      // CTA points somewhere else - missing next step link
      ctas: [{ text: 'Read Blog', target: 'https://example.com/blog' }],
      forms: [],
    },
    {
      url: 'https://example.com/checkout',
      status: 200,
      ctas: [{ text: 'Submit', target: 'https://example.com/thank-you?token=123' }], // Missing utm_ param preservation
      forms: [{ fieldCount: 8 }], // High form friction
      navLinksCount: 20, // Distraction leak
    },
    {
      url: 'https://example.com/thank-you',
      status: 200,
      ctas: [],
      forms: [],
      robotsDirectives: new Set([]), // Unprotected confirmation page
    },
  ];

  const result = analyzeConversionFunnel(pages, declaredFunnel);
  assert.equal(result.funnel_id, 'DEMO-FUNNEL');
  assert.ok(result.funnel_health_score < 60, `Expected < 60, got ${result.funnel_health_score}`);
  assert.equal(result.status, 'critical_leaks');

  const missingNext = result.leaks.find((l) => l.type === 'missing_next_step_cta');
  assert.ok(missingNext);
  assert.equal(missingNext.step_id, 'STEP-1');

  const paramLoss = result.leaks.find((l) => l.type === 'attribution_parameter_loss');
  assert.ok(paramLoss);

  const leakCheckout = result.leaks.find((l) => l.type === 'enclosed_checkout_leak');
  assert.ok(leakCheckout);

  const unprotected = result.leaks.find((l) => l.type === 'unprotected_conversion_page');
  assert.ok(unprotected);
});

test('analyzeConversionFunnel returns insufficient_steps when fewer than 2 steps can be established', () => {
  const pages = [
    { url: 'https://example.com/about', status: 200 },
  ];
  const result = analyzeConversionFunnel(pages);
  assert.equal(result.status, 'insufficient_steps');
  assert.equal(result.steps.length, 0);
});
