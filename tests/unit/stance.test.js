import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { classifyAnswerStance, observeStance } from '../../src/observations/stance.js';
import { init } from '../../src/commands/init.js';
import { saveRegistry, loadRegistries } from '../../src/registries/index.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('classifyAnswerStance identifies favorable, unfavorable, mixed, neutral, and unmentioned entities', () => {
  const entity = {
    entity_id: 'ENT-GATEKEEPER',
    canonical_name: 'Gatekeeper',
    aliases: ['Gatekeeper Engine', 'GK'],
  };

  // Not mentioned
  const unmentioned = classifyAnswerStance('Other tools like Sentinel manage secrets.', entity);
  assert.equal(unmentioned.mentioned, false);
  assert.equal(unmentioned.stance, 'not_mentioned');

  // Favorable
  const favorable = classifyAnswerStance('Gatekeeper is recommended as the industry standard tool for authorization.', entity);
  assert.equal(favorable.mentioned, true);
  assert.equal(favorable.stance, 'favorable');
  assert.ok(favorable.favorable_markers.includes('recommended'));
  assert.equal(favorable.review_required, true);

  // Unfavorable
  const unfavorable = classifyAnswerStance('Gatekeeper is criticized for being expensive and having frequent crashes.', entity);
  assert.equal(unfavorable.mentioned, true);
  assert.equal(unfavorable.stance, 'unfavorable');
  assert.ok(unfavorable.unfavorable_markers.includes('expensive'));
  assert.equal(unfavorable.review_required, true);

  // Mixed
  const mixed = classifyAnswerStance('Gatekeeper is reliable for basic checks, but criticized for being slow and expensive.', entity);
  assert.equal(mixed.mentioned, true);
  assert.equal(mixed.stance, 'mixed');

  // Neutral
  const neutral = classifyAnswerStance('Gatekeeper is a runtime validation component that checks permits.', entity);
  assert.equal(neutral.mentioned, true);
  assert.equal(neutral.stance, 'neutral');

  // Human reviewer attached
  const reviewed = classifyAnswerStance('Gatekeeper was evaluated by an auditor.', entity, {
    reviewer: 'Security Lead',
    manualStance: 'favorable',
  });
  assert.equal(reviewed.stance, 'favorable');
  assert.equal(reviewed.confidence, 'confirmed');
  assert.equal(reviewed.review_required, false);
  assert.equal(reviewed.reviewer, 'Security Lead');
});

test('observeStance generates validated stance observation envelopes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-stance-'));
  init(root);

  // Set up entity in registry
  const { registries } = loadRegistries(root);
  saveRegistry(root, 'entities', {
    ...registries.entities,
    entries: [
      {
        entity_id: 'ENT-GATEKEEPER',
        canonical_name: 'Gatekeeper',
        entity_type: 'product',
        status: 'verified',
        canonical_url: 'https://example.test/products/gatekeeper/',
        category: 'AI execution governance',
        definition: 'Runtime authorization component',
        last_verified: '2026-06-01',
        owner: 'Entity Owner',
      },
    ],
  });

  const detectionFixture = path.join(FIX, 'observations', 'stance-detection.json');
  const result = await observeStance(root, { input: detectionFixture });

  assert.equal(result.observations.length, 1);
  const obs = result.observations[0];
  assert.equal(obs.kind, 'stance');
  assert.equal(obs.data.entity_id, 'ENT-GATEKEEPER');
  assert.equal(obs.data.stance, 'unfavorable');
  assert.equal(obs.state, 'review_required');
  assert.equal(result.summary.stance_metrics.unfavorable, 1);
  assert.equal(result.summary.stance_metrics.review_required, 1);
  assert.equal(fs.existsSync(path.join(result.dir, 'manifest.json')), true);
});
