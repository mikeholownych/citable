import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBehavioralTelemetry } from '../../src/analysis/behavioral.js';

test('analyzeBehavioralTelemetry identifies mobile cohort gap, buried CTA, rage clicks, and form drop-off', () => {
  const telemetry = {
    cohorts: {
      mobile: { conversion_rate: 0.012 },
      desktop: { conversion_rate: 0.038 },
    },
    interactions: {
      scroll_depth_p50_pct: 45,
      primary_cta_vertical_pct: 75,
      rage_clicks_count: 12,
      dead_clicks_count: 24,
      form_field_abandonment: [
        { field_name: 'phone_number', abandon_count: 85 },
        { field_name: 'company_size', abandon_count: 32 },
      ],
    },
    funnel: [
      { name: 'Landing Page', visitors: 10000 },
      { name: 'Pricing Page', visitors: 2200 },
      { name: 'Signup Page', visitors: 1800 },
      { name: 'Confirmation', visitors: 900 },
    ],
  };

  const result = analyzeBehavioralTelemetry(telemetry);
  assert.equal(result.fact_status, 'observed_behavioral_telemetry');
  assert.equal(result.summary.cohort_divergence.mobile_to_desktop_ratio, 0.32);
  assert.ok(result.friction_indicators.length >= 4);

  const mobileGap = result.friction_indicators.find((i) => i.type === 'mobile_conversion_gap');
  assert.ok(mobileGap);
  assert.equal(mobileGap.severity, 'high');

  const buriedCta = result.friction_indicators.find((i) => i.type === 'buried_cta');
  assert.ok(buriedCta);

  const rage = result.friction_indicators.find((i) => i.type === 'rage_clicks');
  assert.ok(rage);

  const formDrop = result.friction_indicators.find((i) => i.type === 'form_field_bottleneck');
  assert.ok(formDrop);
  assert.ok(formDrop.evidence.includes('phone_number'));

  const funnelLeak = result.friction_indicators.find((i) => i.type === 'steep_funnel_leak');
  assert.ok(funnelLeak);
  assert.ok(funnelLeak.evidence.includes('78% abandon rate'));
});

test('analyzeBehavioralTelemetry handles empty or balanced telemetry gracefully', () => {
  const balanced = {
    cohorts: {
      mobile: { conversion_rate: 0.035 },
      desktop: { conversion_rate: 0.038 },
    },
    interactions: {
      scroll_depth_p50_pct: 70,
      primary_cta_vertical_pct: 35,
      rage_clicks_count: 0,
      dead_clicks_count: 0,
    },
    funnel: [
      { name: 'Step 1', visitors: 1000 },
      { name: 'Step 2', visitors: 800 },
    ],
  };

  const result = analyzeBehavioralTelemetry(balanced);
  assert.equal(result.friction_indicators.length, 0);
  assert.equal(result.summary.critical_indicators, 0);
  assert.equal(result.summary.high_indicators, 0);
  assert.equal(result.funnel_drop_offs.length, 1);
  assert.equal(result.funnel_drop_offs[0].drop_off_pct, 20);
});
