import test from 'node:test';
import assert from 'node:assert/strict';
import { CorrelationTracker } from '../../src/observations/browser/correlation.js';

test('CorrelationTracker produces monotonically increasing sequences and positive offsets', async () => {
  const tracker = new CorrelationTracker();
  assert.equal(tracker.nextSequence(), 1);
  assert.equal(tracker.nextSequence(), 2);
  assert.equal(tracker.nextSequence(), 3);

  const t1 = tracker.timing();
  await new Promise((r) => setTimeout(r, 10));
  const t2 = tracker.timing();
  assert.ok(t2.monotonic_offset_ms >= t1.monotonic_offset_ms);
  assert.ok(typeof t1.timestamp === 'string');
});

test('CorrelationTracker attributes phases accurately across journey steps', () => {
  const tracker = new CorrelationTracker();

  // Initial phase before any step
  const c1 = tracker.getCorrelation();
  assert.equal(c1.step_id, null);
  assert.equal(c1.step_sequence, null);
  assert.equal(c1.attribution_phase, 'initial');

  // Step 1 starts
  tracker.startStep({ step_id: 'step-one', checkpoint_id: 'chk-1' }, 1);
  const c2 = tracker.getCorrelation();
  assert.equal(c2.step_id, 'step-one');
  assert.equal(c2.step_sequence, 1);
  assert.equal(c2.checkpoint_id, 'chk-1');
  assert.equal(c2.attribution_phase, 'during_step');

  // Step 1 completes
  tracker.endStep({ step_id: 'step-one' }, 1);
  const c3 = tracker.getCorrelation();
  assert.equal(c3.step_id, 'step-one');
  assert.equal(c3.step_sequence, 1);
  assert.equal(c3.attribution_phase, 'between_steps');

  // Journey finishes
  tracker.finishJourney();
  const c4 = tracker.getCorrelation();
  assert.equal(c4.attribution_phase, 'post_journey');
});

test('CorrelationTracker marks asynchronous responses completing across boundaries as ambiguous_async', () => {
  const tracker = new CorrelationTracker();

  tracker.startStep({ step_id: 'step-one' }, 1);
  const reqCorrelation = tracker.getCorrelation();
  assert.equal(reqCorrelation.attribution_phase, 'during_step');

  // Response completes within the same step
  const respCorrelationSame = tracker.correlateCompletion(reqCorrelation);
  assert.equal(respCorrelationSame.attribution_phase, 'during_step');

  // Response completes after step finished
  tracker.endStep({ step_id: 'step-one' }, 1);
  const respCorrelationAfter = tracker.correlateCompletion(reqCorrelation);
  assert.equal(respCorrelationAfter.attribution_phase, 'ambiguous_async');

  // Request from step 1 completes during step 2
  tracker.startStep({ step_id: 'step-two' }, 2);
  const respCorrelationNext = tracker.correlateCompletion(reqCorrelation);
  assert.equal(respCorrelationNext.attribution_phase, 'ambiguous_async');
});
