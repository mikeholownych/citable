import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCro } from '../../src/commands/inspectCro.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('inspectCro evaluates page conversion readiness and extracts CTAs, forms, and trust badges', async () => {
  const root = path.join(FIX, 'site-clean');
  const res = await inspectCro(root, '/products/gatekeeper/', {
    target: path.join(FIX, 'site-clean'),
    baseUrl: 'https://example.test',
  });

  assert.ok(res.url);
  assert.equal(res.status, 200);
  assert.ok(res.conversion_status);
  assert.ok(Array.isArray(res.ctas));
  assert.ok(Array.isArray(res.forms));
  assert.ok(Array.isArray(res.trustBadges));
  assert.ok(Array.isArray(res.findings));
  assert.equal(typeof res.hero_cta_count, 'number');
  assert.equal(typeof res.has_choice_overload, 'boolean');
  assert.equal(typeof res.analytics_installed, 'boolean');
  assert.equal(typeof res.nav_links_count, 'number');
});
