import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testFunnel } from '../../src/commands/testFunnel.js';
import { planExperiment } from '../../src/commands/planExperiment.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function tmpProject(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-funnel-test-'));
  fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, '.citable', f));
    }
  }
  return dir;
}

test('planExperiment calculates sample size and statistical power accurately', async () => {
  const res = await planExperiment(process.cwd(), {
    baselineRate: 0.02,
    mde: 0.10,
    dailyVisitors: 1000,
  });

  assert.equal(res.baseline_conversion_rate, 0.02);
  assert.equal(res.target_conversion_rate, 0.022);
  assert.equal(res.minimum_detectable_effect_relative, 0.10);
  assert.ok(res.sample_size_per_variant > 10000, 'sample size should be substantial for 10% MDE on 2% baseline');
  assert.equal(res.total_sample_size, res.sample_size_per_variant * 2);
  assert.ok(res.estimated_duration_days > 0);
  assert.ok(Array.isArray(res.recommendations));
});

test('testFunnel verifies multi-step conversion funnel steps against audited site', async () => {
  const root = tmpProject('registries-good');
  const res = await testFunnel(root, 'FUNNEL-PRIMARY-DEMO', {
    target: path.join(FIX, 'site-clean'),
    baseUrl: 'https://example.test',
  });

  assert.equal(res.funnel_id, 'FUNNEL-PRIMARY-DEMO');
  assert.equal(res.total_steps, 2);
  assert.equal(res.steps[0].found, true);
  assert.equal(res.steps[1].found, true);
});
