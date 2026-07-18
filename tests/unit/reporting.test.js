import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/reporting/report.js';

function finding(detector, discipline, severity = 'medium') {
  return {
    detector_id: detector,
    discipline,
    classification: { severity, deterministic: true },
  };
}

test('summary keeps retrieval, source suitability, and observed citation separate', () => {
  const summary = summarize([
    finding('TECH-001', ['seo'], 'high'),
    finding('ANS-010', ['aeo', 'geo'], 'medium'),
  ], {
    detectorsRun: ['TECH-001', 'ANS-010'],
    incompleteChecks: ['No controlled citation observations supplied.'],
  });
  assert.equal(summary.posture.retrieval_eligibility.result, 'fail');
  assert.equal(summary.posture.source_extraction_and_support.result, 'partial');
  assert.equal(summary.posture.observed_citation_behavior.result, 'not_evidenced');
  assert.equal(summary.posture.observed_citation_behavior.finding_count, 0);
});

test('posture is not established when its deterministic checks were skipped', () => {
  const summary = summarize([], {
    detectorsRun: [],
    detectorsSkipped: [{ detector_id: 'TECH-001', reason: 'missing site' }],
  });
  assert.equal(summary.posture.retrieval_eligibility.result, 'not_established');
  assert.equal(summary.posture.source_extraction_and_support.result, 'not_established');
});
