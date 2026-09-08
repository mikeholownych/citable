import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCiWorkflow, formatPrReviewComment } from '../../src/commands/ciWorkflow.js';

test('generateCiWorkflow generates valid GitHub Actions YAML workflow', () => {
  const yaml = generateCiWorkflow();
  assert.ok(yaml.includes('name: Citable CRO Funnel Sentinel'));
  assert.ok(yaml.includes('pull_request:'));
  assert.ok(yaml.includes('npx @nebulacomponents/citable lint components src/'));
  assert.ok(yaml.includes('npx @nebulacomponents/citable audit cro --strict'));
});

test('formatPrReviewComment formats findings and clean states for PR comments', () => {
  const cleanComment = formatPrReviewComment([]);
  assert.ok(cleanComment.includes('All conversion funnels and components verified clean'));

  const brokenComment = formatPrReviewComment([
    { detector_id: 'CRO-007', severity: 'medium', summary: 'Missing autocomplete tokens', remediation: 'Add autocomplete' },
  ]);
  assert.ok(brokenComment.includes('Friction Detected in Pull Request'));
  assert.ok(brokenComment.includes('[CRO-007]'));
  assert.ok(brokenComment.includes('npx @nebulacomponents/citable remediate'));
});
