import test from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../../src/commands/demo.js';

test('demo runs offline against the bundled fixture, never claims a live target', async () => {
  const r = await demo();
  assert.equal(r.manifest.target.kind, 'built_output');
  assert.ok(!/^https?:\/\//.test(r.manifest.target.location));
  assert.ok(r.summary.total > 0);
  assert.ok(Object.keys(r.summary.by_namespace).length > 0);
  assert.equal(r.fixture, 'bundled synthetic example site — offline, not fetched, not a real company');
});

test('demo is deterministic across repeated runs (pinned ref-date)', async () => {
  const a = await demo();
  const b = await demo();
  assert.deepEqual(a.summary.by_namespace, b.summary.by_namespace);
  assert.equal(a.summary.total, b.summary.total);
});

test('demo reports the fixture\'s known curated findings (detection) and stays clean of ones it should not trigger (non-detection)', async () => {
  const r = await demo();
  // Detection: the fixture deliberately allows Google's search crawler with no recorded
  // model-training decision for the vendor — CRAWL-002's exact public-vs-training gap.
  assert.equal(r.summary.by_namespace.CRAWL, 1);
  // Detection: the demo pages are deliberately short (thin-content heuristics).
  assert.equal(r.summary.by_namespace.PAGE, 3);
  // Non-detection: the fixture's one claim is verified, evidenced, unexpired, AND carries
  // a named support_assessment — so no CLAIM detector (e.g. CLAIM-009) should fire.
  assert.equal(r.summary.by_namespace.CLAIM ?? 0, 0);
});
