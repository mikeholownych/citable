import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPageCro } from '../../src/analysis/croAudit.js';

test('auditPageCro evaluates ATF clarity, message match, trust signals, and offer architecture', () => {
  const page = {
    url: 'https://example.com/pricing',
    title: 'Enterprise Pricing & ROI Calculator | Example Platform',
    status: 200,
    headings: [
      { level: 1, text: 'Enterprise Pricing & Flexible Subscription Plans' },
      { level: 2, text: 'Frequently Asked Questions About Our Pricing' },
    ],
    paragraphs: [
      'Transparent pricing designed for high-scale engineering teams with dedicated SLA guarantees.',
      'All plans include enterprise single sign-on, audit logs, and 24/7 dedicated support.',
    ],
    ctas: [
      { text: 'Start Free 14-Day Trial', tag: 'button', isPrimary: true, inHero: true, target: '/signup' },
      { text: 'Schedule a Demo', tag: 'a', isPrimary: false, inHero: true, target: '/demo' },
    ],
    forms: [
      {
        fieldCount: 2,
        hasSubmit: true,
        inputs: [
          { type: 'email', name: 'work_email', autocomplete: 'email' },
          { type: 'text', name: 'full_name', autocomplete: 'name' },
        ],
      },
    ],
    trustBadges: [
      { signal: 'SOC-2 Type II Certified' },
      { signal: 'Over 10,000 engineering teams' },
    ],
    text: `Enterprise Pricing & Flexible Subscription Plans.
           Transparent pricing designed for high-scale engineering teams with dedicated SLA guarantees.
           Trusted by over 10,000 engineering teams worldwide.
           SOC-2 Type II Certified and GDPR compliant.
           Start your 14-day free trial today. No credit card required. Cancel anytime.
           Frequently Asked Questions About Our Pricing: What payment methods do you accept?`,
  };

  const result = auditPageCro(page);
  assert.equal(result.fact_status, 'modeled_cro_evaluation');
  assert.ok(result.conversion_readiness_score >= 80, `Expected >= 80, got ${result.conversion_readiness_score}`);

  // ATF Clarity
  assert.ok(result.atf_clarity.score >= 80);
  assert.equal(result.atf_clarity.scent_match, true);
  assert.equal(result.atf_clarity.h1_headline, 'Enterprise Pricing & Flexible Subscription Plans');

  // Trust & Credibility
  assert.ok(result.trust_and_credibility.score >= 75);
  assert.equal(result.trust_and_credibility.social_proof_detected, true);
  assert.equal(result.trust_and_credibility.security_badges_detected, true);
  assert.equal(result.trust_and_credibility.risk_reversal_detected, true);
  assert.equal(result.trust_and_credibility.objection_handling_detected, true);

  // Cognitive Load & Friction
  assert.equal(result.cognitive_load_and_friction.load_assessment, 'minimal');
  assert.equal(result.cognitive_load_and_friction.keystroke_effort.inputs_with_autocomplete, 2);

  // Offer Architecture
  assert.equal(result.offer_architecture.cta_hierarchy.primary_ctas, 1);
  assert.equal(result.offer_architecture.cta_hierarchy.hierarchy_status, 'optimal');
});

test('auditPageCro flags scent gap, excessive form friction, choice overload, and lack of trust proof', () => {
  const highFrictionPage = {
    url: 'https://example.com/checkout',
    title: 'Instant Cloud Deployment Tool',
    status: 200,
    headings: [
      { level: 1, text: 'Submit Your Complete Information Here' }, // Scent gap with title
    ],
    paragraphs: [
      'Please fill out all required fields below to register for an enterprise account.',
    ],
    ctas: [
      { text: 'Submit', tag: 'button', isPrimary: true, inHero: true }, // Generic copy + primary 1
      { text: 'Click Here', tag: 'button', isPrimary: true, inHero: true }, // Choice overload: primary 2
    ],
    forms: [
      {
        fieldCount: 10, // Excessive form fields
        hasSubmit: false, // Missing submit mechanism
        inputs: Array.from({ length: 10 }).map((_, i) => ({ type: 'text', name: `field_${i}`, autocomplete: null })),
      },
    ],
    trustBadges: [],
    text: 'Submit Your Complete Information Here. Please fill out all required fields.',
    navLinksCount: 25, // Leaks out of checkout
  };

  const result = auditPageCro(highFrictionPage);
  assert.ok(result.conversion_readiness_score < 50);
  assert.equal(result.atf_clarity.scent_match, false);
  assert.ok(result.cognitive_load_and_friction.issues.some((i) => i.type === 'form_length'));
  assert.ok(result.cognitive_load_and_friction.issues.some((i) => i.type === 'missing_submit'));
  assert.ok(result.cognitive_load_and_friction.issues.some((i) => i.type === 'funnel_leak'));
  assert.equal(result.offer_architecture.cta_hierarchy.hierarchy_status, 'choice_overload');
  assert.ok(result.offer_architecture.cta_hierarchy.generic_microcopy_count >= 1);
});
