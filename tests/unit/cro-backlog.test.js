import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExperimentBacklog, formatBacklogMarkdown } from '../../src/commands/croBacklog.js';

test('generateExperimentBacklog creates prioritized hypotheses with statistical blueprints and guardrails', () => {
  const findings = [
    {
      detector_id: 'CRO-002',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/signup' },
      observation: { summary: 'Form has 9 input fields inducing high cognitive load' },
      classification: { severity: 'high', deterministic: true },
    },
    {
      detector_id: 'CRO-007',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/checkout' },
      observation: { summary: '3 inputs missing HTML5 autocomplete' },
      classification: { severity: 'medium', deterministic: true },
    },
    {
      detector_id: 'CRO-010',
      discipline: ['cro'],
      subject: { identifier: 'https://example.com/' },
      observation: { summary: '3 competing primary CTAs above fold' },
      classification: { severity: 'high', deterministic: false },
    },
  ];

  const backlog = generateExperimentBacklog(findings, { dailyVisitors: 1000, baselineRate: 0.03 });
  assert.equal(backlog.fact_status, 'experiment_backlog_projection');
  assert.equal(backlog.total_experiments, 3);
  assert.ok(backlog.experiments.length === 3);

  const expForm = backlog.experiments.find((e) => e.detector_id === 'CRO-002');
  assert.ok(expForm);
  assert.equal(expForm.target_page, 'https://example.com/signup');
  assert.ok(expForm.hypothesis.startsWith('If we'));
  assert.ok(expForm.hypothesis.includes('lead_submission_rate will increase by at least 20%'));
  assert.equal(expForm.statistical_setup.confidence_level_pct, 95);
  assert.equal(expForm.statistical_setup.power_pct, 80);
  assert.ok(expForm.statistical_setup.sample_size_per_variant > 100);
  assert.ok(expForm.guardrails.some((g) => g.includes('SEO Retention')));
  assert.ok(expForm.stopping_criteria.some((s) => s.includes('Sample Ratio Mismatch')));

  const markdown = formatBacklogMarkdown(backlog);
  assert.ok(markdown.includes('# Conversion Experimentation Backlog & Hypothesis Register'));
  assert.ok(markdown.includes('EXP-CRO-'));
  assert.ok(markdown.includes('Falsifiable Hypothesis'));
});

test('generateExperimentBacklog filters out non-CRO findings and handles empty findings', () => {
  const nonCroFindings = [
    {
      detector_id: 'TECH-001',
      discipline: ['technical'],
      subject: { identifier: 'https://example.com/' },
      observation: { summary: 'Slow server response' },
    },
  ];
  const emptyBacklog = generateExperimentBacklog(nonCroFindings);
  assert.equal(emptyBacklog.total_experiments, 0);
  assert.equal(emptyBacklog.experiments.length, 0);
});
