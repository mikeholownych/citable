import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { evaluateExperiment, requiredSamplePerVariant } from '../../src/commands/experimentGuardrails.js';
import { checkExperiment } from '../../src/commands/experimentGuardrails.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

const baseExperiment = {
  experiment_id: 'EXP-TEST-1',
  hypothesis: 'Replacing the hero increases primary CTA conversion rate.',
  primary_metric: 'conversion_rate',
  status: 'active',
  evaluation_window: '14d',
  baseline_rate: 0.02,
  mde: 0.1,
};

test('required sample math is consistent with the plan experiment engine', async () => {
  const { planExperiment } = await import('../../src/commands/planExperiment.js');
  const planned = await planExperiment(process.cwd(), { baselineRate: 0.02, mde: 0.10 });
  assert.equal(requiredSamplePerVariant(0.02, 0.10), planned.sample_size_per_variant);
  assert.ok(requiredSamplePerVariant(0.02, 0.10) > requiredSamplePerVariant(0.02, 0.20), 'smaller MDE needs more sample');
});

test('sample-ratio mismatch is detected at the standard alpha and clean ratios pass', () => {
  const srm = evaluateExperiment(baseExperiment, { control: 5200, variant: 4800 });
  assert.equal(srm.lifecycle, 'inconclusive');
  assert.ok(srm.findings.some((f) => f.guardrail_id === 'EXP-SRM-DETECTED' && f.severity === 'critical'));

  const clean = evaluateExperiment(baseExperiment, { control: 5000, variant: 5000, days_running: 14, p_value: 0.02 });
  assert.ok(!clean.findings.some((f) => f.guardrail_id === 'EXP-SRM-DETECTED'));
});

test('stopping early is flagged and running experiments without observations fail closed', () => {
  const early = evaluateExperiment(baseExperiment, { control: 100, variant: 100, days_running: 3 });
  assert.ok(early.findings.some((f) => f.guardrail_id === 'EXP-STOPPING-EARLY'));
  assert.equal(early.lifecycle, 'running');

  const noObs = evaluateExperiment(baseExperiment, {});
  assert.ok(noObs.findings.some((f) => f.guardrail_id === 'EXP-OBSERVATIONS-MISSING' && f.severity === 'blocked'));
  assert.match(noObs.findings.find((f) => f.guardrail_id === 'EXP-OBSERVATIONS-MISSING').summary, /fail closed/i);
});

test('underpowered samples are labeled; full-sample significant results validate', () => {
  const under = evaluateExperiment(baseExperiment, { control: 1000, variant: 1000, days_running: 14 });
  const pow = under.findings.find((f) => f.guardrail_id === 'EXP-UNDERPOWERED');
  assert.ok(pow, 'underpowered sample must be flagged');
  assert.match(pow.summary, /not decision-grade/);
  assert.equal(under.lifecycle, 'running');

  const validated = evaluateExperiment(baseExperiment, {
    control: 81000, variant: 81000, days_running: 14, p_value: 0.01,
  });
  assert.equal(validated.lifecycle, 'validated');
  assert.match(validated.lifecycle_definition, /never a conversion or revenue guarantee/);

  const inconclusive = evaluateExperiment(baseExperiment, {
    control: 81000, variant: 81000, days_running: 14, p_value: 0.4,
  });
  assert.equal(inconclusive.lifecycle, 'inconclusive');
  assert.match(inconclusive.lifecycle_definition, /absence of evidence is not evidence of absence/);
});

test('revenue attribution without a concluded SRM-clean experiment is flagged as modeled, not measured', () => {
  const flagged = evaluateExperiment({ ...baseExperiment, primary_metric: 'revenue_per_visitor' }, { control: 5000, variant: 5000 });
  assert.ok(flagged.findings.some((f) => f.guardrail_id === 'EXP-REVENUE-UNSUPPORTED'));

  const claimed = evaluateExperiment(baseExperiment, { control: 5000, variant: 5000, revenue_claimed: true });
  assert.ok(claimed.findings.some((f) => f.guardrail_id === 'EXP-REVENUE-UNSUPPORTED'));
});

test('contamination and variant collisions with other active experiments are detected', () => {
  const r = evaluateExperiment(
    { ...baseExperiment, target_page: '/pricing', variant_ids: ['control', 'variant_nebula'] },
    {
      control: 5000, variant: 5000,
      other_active_experiments: [
        { experiment_id: 'EXP-OTHER', target_page: '/pricing', variant_ids: ['variant_nebula'] },
      ],
    }
  );
  assert.ok(r.findings.some((f) => f.guardrail_id === 'EXP-CONTAMINATION'));
  assert.ok(r.findings.some((f) => f.guardrail_id === 'EXP-VARIANT-COLLISION'));
  assert.ok(r.findings.filter((f) => f.severity === 'high').length >= 2);
});

test('planned experiments with missing baseline fail closed instead of computing garbage', () => {
  const r = evaluateExperiment({ ...baseExperiment, baseline_rate: undefined, mde: undefined }, {});
  assert.ok(r.findings.some((f) => f.guardrail_id === 'EXP-BASELINE-MISSING' && f.severity === 'blocked'));
  assert.ok(r.findings.find((f) => f.guardrail_id === 'EXP-BASELINE-MISSING').required_input.includes('baseline_rate'));
});

test('check experiment loads the registry and reports unknown ids', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-exp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  init(dir);
  for (const f of fs.readdirSync(path.join(FIX, 'registries-good'))) {
    fs.copyFileSync(path.join(FIX, 'registries-good', f), path.join(dir, '.citable', f));
  }
  await assert.rejects(() => checkExperiment(dir, { experimentId: 'EXP-NOPE' }), /not found in experiments.yaml/);
});
