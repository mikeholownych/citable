import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observe } from '../../src/commands/observe.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/claim-diff');

function tmpRootWithRegistries() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-claim-diff-'));
  fs.mkdirSync(path.join(root, '.citable'), { recursive: true });
  for (const f of fs.readdirSync(path.join(FIX, 'registries'))) {
    fs.copyFileSync(path.join(FIX, 'registries', f), path.join(root, '.citable', f));
  }
  return root;
}

test('answer-engine gotcha check classifies confirmed/contradicted/stale/unsupported against the owner\'s own registry', async () => {
  const root = tmpRootWithRegistries();
  const r = await observe(root, 'citations', {
    input: path.join(FIX, 'observations/citations-claim-diff.json'),
    target: 'https://example.test', refDate: '2026-07-18',
  });
  const statuses = r.observations.filter((o) => o.kind === 'citation_review').map((o) => o.data.claim_diff.status);
  assert.deepEqual(statuses.sort(), ['confirmed', 'contradicted', 'stale', 'unsupported', 'unsupported']);
  assert.deepEqual(r.summary.citation_metrics.claim_diff, { confirmed: 1, contradicted: 1, stale: 1, unsupported: 2, not_checked: 0 });
});

test('gracefully degrades to unsupported with no registry at all, no crash, no live-query or "AI is wrong" claim', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-claim-diff-empty-'));
  const r = await observe(root, 'citations', {
    input: path.join(FIX, 'observations/citations-claim-diff.json'),
    target: 'https://example.test', refDate: '2026-07-18',
  });
  const reviews = r.observations.filter((o) => o.kind === 'citation_review');
  assert.ok(reviews.every((o) => o.data.claim_diff.status === 'unsupported'));
  const serialized = JSON.stringify(reviews.map((o) => o.data.claim_diff));
  assert.doesNotMatch(serialized, /the AI is wrong|incorrect|false/i);
  assert.match(serialized, /your registry|not.*checked/i);
});
