/**
 * Executive reporting suite — unit tests
 *
 * Covers: kpi, variance, outcomes, risk, executive-review, board-report,
 * decision-memo, assumption-audit, scenario, prioritize, competitive-intel,
 * executive (router).
 *
 * Pattern: node:test + assert/strict, tmpProject helper, no network calls.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// --- helpers -----------------------------------------------------------

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-exec-test-'));
  fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
  return dir;
}

function write(dir, file, obj) {
  const yaml = objToYaml(obj);
  fs.writeFileSync(path.join(dir, '.citable', file), yaml, 'utf8');
}

// Minimal YAML serializer — sufficient for flat/nested test fixtures
function objToYaml(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map(v => `${pad}- ${typeof v === 'object' ? objToYaml(v, indent + 2).trimStart() : JSON.stringify(v)}`).join('\n');
  }
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  return Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'object' && v !== null && !Array.isArray(v))
      return `${pad}${k}:\n${objToYaml(v, indent + 2)}`;
    if (Array.isArray(v))
      return `${pad}${k}: ${objToYaml(v, indent + 2)}`;
    return `${pad}${k}: ${JSON.stringify(v)}`;
  }).join('\n');
}

// --- imports -----------------------------------------------------------

import { kpiCommand } from '../../src/commands/kpi.js';
import { varianceCommand } from '../../src/commands/variance.js';
import { outcomesCommand, OUTCOME_STAGES } from '../../src/commands/outcomes.js';
import { riskCommand } from '../../src/commands/risk.js';
import { executiveReviewCommand } from '../../src/commands/executiveReview.js';
import { boardReportCommand } from '../../src/commands/boardReport.js';
import { decisionMemoCommand } from '../../src/commands/decisionMemo.js';
import { assumptionAuditCommand } from '../../src/commands/assumptionAudit.js';
import { scenarioCommand } from '../../src/commands/scenario.js';
import { prioritizeCommand } from '../../src/commands/prioritize.js';
import { competitiveIntelCommand } from '../../src/commands/competitiveIntel.js';
import { executiveCommand } from '../../src/commands/executive.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

// =======================================================================
// KPI
// =======================================================================
describe('kpiCommand', () => {
  test('list returns empty message when no kpis.yaml', async () => {
    const root = tmpProject();
    const r = await kpiCommand(['list'], root);
    assert.ok(r.message || r.kpis);
  });

  test('list returns kpi summary when file present', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', {
      version: 1, kind: 'kpis', entries: [{
        metric_id: 'ARR', name: 'Annual Recurring Revenue', owner: 'CEO',
        reporting_cadence: 'monthly', target: 100000,
        restatement_policy: 'restate prior period', known_limitations: ['estimated from invoices'],
        comparison_required: true, comparison_basis: 'prior_quarter',
        executive_definition: 'Total ARR from active subscriptions',
        calculation: 'sum of monthly recurring charges × 12',
        numerator: 'active_mrr', denominator: '1', unit: 'USD',
        source_system: 'stripe', source_query: 'mrr_report',
        warning_threshold: 90000, critical_threshold: 70000,
      }]
    });
    const r = await kpiCommand(['list'], root);
    assert.equal(r.total, 1);
    assert.equal(r.kpis[0].metric_id, 'ARR');
  });

  test('validate detects missing known_limitations', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', {
      version: 1, kind: 'kpis', entries: [{
        metric_id: 'MRR', name: 'MRR', owner: 'CEO',
        reporting_cadence: 'monthly', target: 10000,
        restatement_policy: 'restate prior period', known_limitations: [],
        comparison_required: false,
        executive_definition: 'MRR', calculation: 'sum mrr', numerator: 'mrr',
        denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'q',
        warning_threshold: 8000, critical_threshold: 5000,
      }]
    });
    const r = await kpiCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /known_limitations/i.test(p)));
  });

  test('show returns error for unknown id', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [] });
    const r = await kpiCommand(['show', 'MISSING'], root);
    assert.ok(r.error);
  });
});

// =======================================================================
// VARIANCE
// =======================================================================
describe('varianceCommand', () => {
  test('list returns empty when no file', async () => {
    const root = tmpProject();
    const r = await varianceCommand(['list'], root);
    assert.equal(r.total, 0);
  });

  test('validate rejects vague primary_driver', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', {
      version: 1, kind: 'variances', entries: [{
        variance_id: 'V-001', metric_id: 'ARR', period: '2026-06',
        actual: 85000, target: 100000, variance_amount: -15000, variance_pct: -15,
        materiality: 'material', primary_driver: 'market conditions',
        controllable: false, evidence: ['Q2-report.pdf'], owner: 'CEO',
        confidence: 'medium',
      }]
    });
    const r = await varianceCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /non-cause/i.test(p)));
  });

  test('validate rejects material variance without management_response', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', {
      version: 1, kind: 'variances', entries: [{
        variance_id: 'V-002', metric_id: 'ARR', period: '2026-06',
        actual: 85000, target: 100000, variance_amount: -15000, variance_pct: -15,
        materiality: 'critical', primary_driver: 'enterprise deal slipped to Q3 due to procurement freeze',
        controllable: false, evidence: ['deal-notes.pdf'], owner: 'CEO',
        confidence: 'high',
      }]
    });
    const r = await varianceCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /management_response/i.test(p)));
  });

  test('validate passes clean record', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', {
      version: 1, kind: 'variances', entries: [{
        variance_id: 'V-003', metric_id: 'ARR', period: '2026-06',
        actual: 95000, target: 100000, variance_amount: -5000, variance_pct: -5,
        materiality: 'watch', primary_driver: 'two trials did not convert in June',
        controllable: true, evidence: ['crm-export.csv'], owner: 'CEO',
        confidence: 'high', management_response: 'nurture sequence activated',
      }]
    });
    const r = await varianceCommand(['validate'], root);
    assert.equal(r.valid, true);
    assert.equal(r.problems.length, 0);
  });

  test('material filter returns only material/critical', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', {
      version: 1, kind: 'variances', entries: [
        { variance_id: 'V-A', metric_id: 'ARR', period: '2026-06', actual: 99000, target: 100000, variance_amount: -1000, variance_pct: -1, materiality: 'immaterial', primary_driver: 'rounding', controllable: true, evidence: ['e.pdf'], owner: 'CEO', confidence: 'high' },
        { variance_id: 'V-B', metric_id: 'MRR', period: '2026-06', actual: 80000, target: 100000, variance_amount: -20000, variance_pct: -20, materiality: 'critical', primary_driver: 'churn spike from outage', controllable: true, evidence: ['e.pdf'], owner: 'CEO', confidence: 'high', management_response: 'outage post-mortem complete' },
      ]
    });
    const r = await varianceCommand(['material'], root);
    assert.equal(r.total, 1);
    assert.equal(r.variances[0].variance_id, 'V-B');
  });
});

// =======================================================================
// OUTCOMES
// =======================================================================
describe('outcomesCommand', () => {
  test('OUTCOME_STAGES exports correct progression', () => {
    assert.equal(OUTCOME_STAGES[0], 'finding_produced');
    assert.equal(OUTCOME_STAGES[OUTCOME_STAGES.length - 1], 'causal_relationship_established');
  });

  test('validate rejects strong causal confidence without evidence', async () => {
    const root = tmpProject();
    write(root, 'customer-outcomes.yaml', {
      version: 1, kind: 'customer-outcomes', entries: [{
        outcome_id: 'OUT-001', customer: 'AcmeCo', property: 'acme.com',
        baseline: 'no AI citations', intervention: 'citable audit + remediation',
        observed_change: 'appeared in Perplexity results',
        measurement_window: '30d', evidence_package: [],
        customer_confirmed: true, causal_confidence: 'strong',
        outcome_stage: 'answer_engine_changed',
      }]
    });
    const r = await outcomesCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /evidence_package/i.test(p)));
  });

  test('validate rejects independently_verified without customer_confirmed', async () => {
    const root = tmpProject();
    write(root, 'customer-outcomes.yaml', {
      version: 1, kind: 'customer-outcomes', entries: [{
        outcome_id: 'OUT-002', customer: 'BetaCo', property: 'beta.io',
        baseline: 'no citations', intervention: 'schema fix',
        observed_change: 'cited in ChatGPT',
        measurement_window: '14d', evidence_package: ['screenshot.png'],
        customer_confirmed: false, independently_verified: true,
        causal_confidence: 'partial', outcome_stage: 'answer_engine_changed',
      }]
    });
    const r = await outcomesCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /independently_verified/i.test(p)));
  });

  test('validate rejects commercial_value at wrong stage', async () => {
    const root = tmpProject();
    write(root, 'customer-outcomes.yaml', {
      version: 1, kind: 'customer-outcomes', entries: [{
        outcome_id: 'OUT-003', customer: 'GammaCo', property: 'gamma.com',
        baseline: 'baseline', intervention: 'fix', observed_change: 'finding found',
        measurement_window: '7d', evidence_package: ['e.pdf'],
        customer_confirmed: true, causal_confidence: 'weak',
        outcome_stage: 'finding_produced', commercial_value: '$5000 uplift',
      }]
    });
    const r = await outcomesCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /commercial_value/i.test(p)));
  });

  test('summary warns when all outcomes at finding_produced', async () => {
    const root = tmpProject();
    write(root, 'customer-outcomes.yaml', {
      version: 1, kind: 'customer-outcomes', entries: [
        { outcome_id: 'OUT-004', customer: 'X', property: 'x.com', baseline: 'b', intervention: 'i', observed_change: 'c', measurement_window: '7d', evidence_package: ['e.pdf'], customer_confirmed: false, causal_confidence: 'none', outcome_stage: 'finding_produced' },
      ]
    });
    const r = await outcomesCommand(['summary'], root);
    assert.ok(r.warning);
    assert.match(r.warning, /finding_produced/);
  });
});

// =======================================================================
// RISK
// =======================================================================
describe('riskCommand', () => {
  test('top returns risks sorted by residual_exposure descending', async () => {
    const root = tmpProject();
    write(root, 'risks.yaml', {
      version: 1, kind: 'risks', entries: [
        { risk_id: 'R-001', title: 'Low risk', category: 'operational_capacity', cause: 'c', event: 'e', consequence: 'q', likelihood: 'rare', impact: 'negligible', gross_exposure: 'low', controls: [], control_owner: 'ops', control_effectiveness: 'adequate', residual_exposure: 'low', key_risk_indicators: ['kri1'], trigger_threshold: '> 5 failures/day', response: 'monitor', response_owner: 'ops', review_date: '2027-01-01', trend: 'stable', board_visibility: false },
        { risk_id: 'R-002', title: 'Critical risk', category: 'platform_dependency', cause: 'c', event: 'e', consequence: 'q', likelihood: 'possible', impact: 'major', gross_exposure: 'critical', controls: ['c1'], control_owner: 'CTO', control_effectiveness: 'partial', residual_exposure: 'critical', key_risk_indicators: ['kri1'], trigger_threshold: 'crawler blocked', response: 'switch provider', response_owner: 'CTO', review_date: '2027-01-01', trend: 'deteriorating', board_visibility: true },
      ]
    });
    const r = await riskCommand(['top'], root);
    assert.equal(r.top_risks[0].risk_id, 'R-002');
    assert.equal(r.top_risks[0].residual_exposure, 'critical');
  });

  test('validate flags high residual without KRIs', async () => {
    const root = tmpProject();
    write(root, 'risks.yaml', {
      version: 1, kind: 'risks', entries: [{
        risk_id: 'R-003', title: 'High risk no KRI', category: 'commercial', cause: 'c', event: 'e', consequence: 'q', likelihood: 'likely', impact: 'major', gross_exposure: 'high', controls: [], control_owner: 'CEO', control_effectiveness: 'none', residual_exposure: 'high', key_risk_indicators: [], trigger_threshold: '', response: 'monitor', response_owner: 'CEO', review_date: '2027-01-01', trend: 'stable', board_visibility: false,
      }]
    });
    const r = await riskCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /key_risk_indicators/i.test(p)));
  });

  test('validate flags board-visible risk without trigger_threshold', async () => {
    const root = tmpProject();
    write(root, 'risks.yaml', {
      version: 1, kind: 'risks', entries: [{
        risk_id: 'R-004', title: 'Board risk no trigger', category: 'reputational', cause: 'c', event: 'e', consequence: 'q', likelihood: 'possible', impact: 'moderate', gross_exposure: 'medium', controls: ['c1'], control_owner: 'CEO', control_effectiveness: 'adequate', residual_exposure: 'medium', key_risk_indicators: ['kri1'], trigger_threshold: '', response: 'comms plan', response_owner: 'CEO', review_date: '2027-01-01', trend: 'stable', board_visibility: true,
      }]
    });
    const r = await riskCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /trigger_threshold/i.test(p)));
  });
});

// =======================================================================
// EXECUTIVE REVIEW
// =======================================================================
describe('executiveReviewCommand', () => {
  test('returns ungoverned_warning when no kpis registered', async () => {
    const root = tmpProject();
    const r = await executiveReviewCommand(['--period', '2026-06'], root);
    assert.ok(r.ungoverned_warning || (typeof r === 'string' && r.includes('BLOCKED')));
  });

  test('--json returns report with ledger and four_act_required', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', {
      version: 1, kind: 'kpis', entries: [{
        metric_id: 'ARR', name: 'ARR', owner: 'CEO', reporting_cadence: 'monthly',
        target: 100000, restatement_policy: 'restate', known_limitations: ['est'],
        comparison_required: false,
        executive_definition: 'ARR', calculation: 'mrr*12', numerator: 'mrr',
        denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'q',
        warning_threshold: 90000, critical_threshold: 70000,
      }]
    });
    const r = await executiveReviewCommand(['--period', '2026-06', '--json'], root);
    assert.equal(r.report_type, 'executive-operating-review');
    assert.ok(r.ledger);
    assert.ok(r.four_act_required);
    assert.equal(r.ledger.governed_metrics, 1);
  });
});

// =======================================================================
// BOARD REPORT
// =======================================================================
describe('boardReportCommand', () => {
  test('refuses_sections when missing kpis, outcomes, risks', async () => {
    const root = tmpProject();
    const r = await boardReportCommand(['--quarter', '2026-Q2', '--json'], root);
    assert.ok(r.refused_sections);
    assert.match(r.refused_sections, /kpis/);
  });

  test('--json returns board report structure with all 9 sections', async () => {
    const root = tmpProject();
    // Provide minimal governed data to avoid refusal
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'ARR', name: 'ARR', owner: 'CEO', reporting_cadence: 'quarterly', target: 400000, restatement_policy: 'restate', known_limitations: ['est'], comparison_required: false, executive_definition: 'ARR', calculation: 'mrr*12', numerator: 'mrr', denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'q', warning_threshold: 300000, critical_threshold: 200000 }] });
    write(root, 'customer-outcomes.yaml', { version: 1, kind: 'customer-outcomes', entries: [{ outcome_id: 'O1', customer: 'X', property: 'x.com', baseline: 'b', intervention: 'i', observed_change: 'c', measurement_window: '7d', evidence_package: ['e.pdf'], customer_confirmed: true, causal_confidence: 'partial', outcome_stage: 'finding_accepted' }] });
    write(root, 'risks.yaml', { version: 1, kind: 'risks', entries: [{ risk_id: 'R1', title: 'R', category: 'commercial', cause: 'c', event: 'e', consequence: 'q', likelihood: 'unlikely', impact: 'minor', gross_exposure: 'low', controls: [], control_owner: 'CEO', control_effectiveness: 'none', residual_exposure: 'low', key_risk_indicators: [], trigger_threshold: '', response: 'monitor', response_owner: 'CEO', review_date: '2027-01-01', trend: 'stable', board_visibility: false }] });
    const r = await boardReportCommand(['--quarter', '2026-Q2', '--json'], root);
    assert.equal(r.report_type, 'board-report');
    assert.ok(r.sections.management_assessment);
    assert.ok(r.sections.customer_outcomes);
    assert.ok(r.sections.material_risks);
    assert.ok(r.sections.board_decisions_and_asks);
    assert.equal(r.refused_sections, null);
  });
});

// =======================================================================
// DECISION MEMO
// =======================================================================
describe('decisionMemoCommand', () => {
  test('validate rejects decision without consulted parties', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', {
      version: 1, kind: 'decisions', entries: [{
        decision_id: 'DEC-001', title: 'Open-source boundary', owner: 'CEO',
        consulted: [], deadline: '2026-09-01', reversibility: 'reversible',
        options: [{ label: 'A', description: 'desc', trade_offs: ['cost'] }],
        recommendation: 'Option A',
        supporting_evidence: ['customer-survey.pdf'],
        contradicting_evidence: [], assumptions: [],
        what_would_change_recommendation: ['If enterprise inbound exceeds 5/month'],
        cost_of_delay: '$10k MRR monthly', reopen_conditions: [], status: 'open',
      }]
    });
    const r = await decisionMemoCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /consulted/i.test(p)));
  });

  test('validate rejects missing what_would_change_recommendation', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', {
      version: 1, kind: 'decisions', entries: [{
        decision_id: 'DEC-002', title: 'Pricing model', owner: 'CEO',
        consulted: ['CFO', 'CTO'], deadline: '2026-09-01', reversibility: 'reversible',
        options: [{ label: 'A', description: 'desc', trade_offs: ['cost'] }],
        recommendation: 'Option A', supporting_evidence: ['data.pdf'],
        contradicting_evidence: [], assumptions: [],
        what_would_change_recommendation: [],
        cost_of_delay: 'delay costs $5k/mo', reopen_conditions: [], status: 'open',
      }]
    });
    const r = await decisionMemoCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /what_would_change_recommendation/i.test(p)));
  });

  test('validate rejects one-way decision without reopen_conditions', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', {
      version: 1, kind: 'decisions', entries: [{
        decision_id: 'DEC-003', title: 'Acquire dataset', owner: 'CEO',
        consulted: ['Legal', 'CTO'], deadline: '2026-10-01',
        reversibility: 'effectively_one_way',
        options: [{ label: 'Buy', description: 'acquire', trade_offs: ['cost', 'lock-in'] }],
        recommendation: 'Buy', supporting_evidence: ['analysis.pdf'],
        contradicting_evidence: [], assumptions: [],
        what_would_change_recommendation: ['if dataset quality < 80%'],
        cost_of_delay: '$20k', reopen_conditions: [], status: 'open',
      }]
    });
    const r = await decisionMemoCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /reopen_conditions/i.test(p)));
  });

  test('new creates a stub decision — dry-run by default (no file written)', async () => {
    const root = tmpProject();
    const r = await decisionMemoCommand(['new', '--title', 'Test decision'], root);
    assert.ok(r.preview, 'should be a preview/dry-run result');
    assert.ok(r.id, 'should return a decision id');
    assert.match(r.id, /DEC-/);
    // File must NOT exist — dry-run does not persist
    const file = path.join(root, '.citable', 'decisions.yaml');
    assert.ok(!fs.existsSync(file), 'dry-run must not write a file');
  });

  test('new --write uses schema-valid reversibility value (not "REQUIRED")', async () => {
    const root = tmpProject();
    const r = await decisionMemoCommand(['new', '--title', 'Test decision', '--write'], root);
    assert.ok(r.created, 'should return created id');
    // The resulting registry must pass schema validation
    const validateResult = await decisionMemoCommand(['validate'], root);
    const schemaErrors = (validateResult.problems ?? []).filter(p => p.includes('reversibility'));
    assert.equal(schemaErrors.length, 0, `Schema-invalid reversibility should not appear: ${schemaErrors.join(', ')}`);
  });

  test('show formats memo structure', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', {
      version: 1, kind: 'decisions', entries: [{
        decision_id: 'DEC-010', title: 'Test', owner: 'CEO',
        consulted: ['CTO'], deadline: '2026-12-01', reversibility: 'reversible',
        options: [], recommendation: 'go', supporting_evidence: ['e.pdf'],
        contradicting_evidence: [], assumptions: [],
        what_would_change_recommendation: ['x'], cost_of_delay: 'low',
        reopen_conditions: [], status: 'open',
      }]
    });
    const r = await decisionMemoCommand(['show', 'DEC-010'], root);
    assert.ok(r.memo);
    assert.equal(r.memo.id, 'DEC-010');
    assert.equal(r.memo.reversibility, 'reversible');
  });
});

// =======================================================================
// ASSUMPTION AUDIT
// =======================================================================
describe('assumptionAuditCommand', () => {
  test('validate requires evidence_for on validated status', async () => {
    const root = tmpProject();
    write(root, 'assumptions.yaml', {
      version: 1, kind: 'assumptions', entries: [{
        assumption_id: 'ASM-001',
        statement: 'Customers pay for defensible evidence',
        category: 'commercial', owner: 'CEO', importance: 'critical',
        evidence_for: [], evidence_against: [],
        current_status: 'validated_within_scope', confidence: 'high',
      }]
    });
    const r = await assumptionAuditCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /evidence_for/i.test(p)));
  });

  test('validate requires next_test for critical importance', async () => {
    const root = tmpProject();
    write(root, 'assumptions.yaml', {
      version: 1, kind: 'assumptions', entries: [{
        assumption_id: 'ASM-002',
        statement: 'Agencies will install local', category: 'commercial',
        owner: 'CEO', importance: 'critical', evidence_for: [], evidence_against: [],
        current_status: 'untested', confidence: 'low',
      }]
    });
    const r = await assumptionAuditCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /next_test/i.test(p)));
  });

  test('expired returns only past-expiry assumptions', async () => {
    const root = tmpProject();
    write(root, 'assumptions.yaml', {
      version: 1, kind: 'assumptions', entries: [
        { assumption_id: 'ASM-A', statement: 'Past', category: 'commercial', owner: 'CEO', importance: 'medium', evidence_for: [], evidence_against: [], current_status: 'untested', confidence: 'low', expiry: '2020-01-01' },
        { assumption_id: 'ASM-B', statement: 'Future', category: 'commercial', owner: 'CEO', importance: 'medium', evidence_for: [], evidence_against: [], current_status: 'untested', confidence: 'low', expiry: '2099-01-01' },
      ]
    });
    const r = await assumptionAuditCommand(['expired'], root);
    assert.equal(r.total, 1);
    assert.equal(r.expired[0].assumption_id, 'ASM-A');
  });
});

// =======================================================================
// SCENARIO
// =======================================================================
describe('scenarioCommand', () => {
  test('validate rejects scenario without cascade_analysis', async () => {
    const root = tmpProject();
    write(root, 'scenarios.yaml', {
      version: 1, kind: 'scenarios', entries: [{
        scenario_id: 'SCN-001', title: 'Platform restriction',
        variables: [{ variable: 'Google citation visibility', driver: 'algorithm change' }],
        domain_impact: { commercial: 'reduced demand' },
        cascade_analysis: [],
        states: { base: 'citations stable', stress: 'citations reduced 30%', severe: 'citations eliminated' },
        early_warning_triggers: ['citation share drops >10%'],
        hedges: [{ action: 'diversify channels', cost: '$5k', impact: 'medium', owner: 'CEO', deadline: '2026-09-01' }],
        owner: 'CEO',
      }]
    });
    const r = await scenarioCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /cascade_analysis/i.test(p)));
  });

  test('validate rejects hedge without deadline', async () => {
    const root = tmpProject();
    write(root, 'scenarios.yaml', {
      version: 1, kind: 'scenarios', entries: [{
        scenario_id: 'SCN-002', title: 'Quality failure',
        variables: [{ variable: 'false positive rate', driver: 'new framework' }],
        domain_impact: { reputational: 'trust damage' },
        cascade_analysis: ['false positive published → customer complaint → press coverage'],
        states: { base: 'FP < 1%', stress: 'FP 5%', severe: 'FP > 10%' },
        early_warning_triggers: ['FP report from customer'],
        hedges: [{ action: 'manual review queue', cost: '$2k/mo', impact: 'high', owner: 'QA' }], // missing deadline
        owner: 'CTO',
      }]
    });
    const r = await scenarioCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /deadline/i.test(p)));
  });

  test('triggers returns flat list of early warnings', async () => {
    const root = tmpProject();
    write(root, 'scenarios.yaml', {
      version: 1, kind: 'scenarios', entries: [{
        scenario_id: 'SCN-003', title: 'Supply chain',
        variables: [{ variable: 'npm compromise', driver: 'supply chain attack' }],
        domain_impact: { security: 'payload distributed' },
        cascade_analysis: ['compromise → agent installs → customer data at risk'],
        states: { base: 'no compromise', stress: 'package flagged', severe: 'confirmed compromise' },
        early_warning_triggers: ['npm audit flag', 'unusual install spike'],
        hedges: [{ action: 'code signing', cost: '$1k', impact: 'high', owner: 'CTO', deadline: '2026-08-01' }],
        owner: 'CTO',
      }]
    });
    const r = await scenarioCommand(['triggers'], root);
    assert.equal(r.triggers.length, 2);
    assert.equal(r.triggers[0].scenario_id, 'SCN-003');
  });
});

// =======================================================================
// PRIORITIZE
// =======================================================================
describe('prioritizeCommand', () => {
  test('rank returns transparent score with method field', async () => {
    const root = tmpProject();
    write(root, 'initiatives.yaml', {
      version: 1, kind: 'initiatives', entries: [
        { initiative_id: 'INI-001', title: 'Browser-rendered truth', customer_demand: 'high', revenue_potential: 'high', strategic_differentiation: 'high', evidence_strength: 'validated', engineering_cost: 'high', reversibility: 'reversible', status: 'proposed', owner: 'CTO' },
        { initiative_id: 'INI-002', title: 'WordPress integration', customer_demand: 'medium', revenue_potential: 'medium', strategic_differentiation: 'medium', evidence_strength: 'anecdote', engineering_cost: 'low', reversibility: 'reversible', status: 'proposed', owner: 'CTO' },
      ]
    });
    const r = await prioritizeCommand(['rank'], root);
    assert.ok(r.ranked);
    assert.ok(r.scoring_method);
    assert.ok(r.weights);
    assert.equal(r.ranked.length, 2);
    // Both should have a numeric score
    assert.equal(typeof r.ranked[0].score, 'number');
  });

  test('validate rejects transformative revenue with assumption evidence', async () => {
    const root = tmpProject();
    write(root, 'initiatives.yaml', {
      version: 1, kind: 'initiatives', entries: [{
        initiative_id: 'INI-003', title: 'Live generative-engine observation',
        customer_demand: 'low', revenue_potential: 'transformative',
        strategic_differentiation: 'critical', evidence_strength: 'assumption',
        engineering_cost: 'very_high', reversibility: 'reversible',
        status: 'proposed', owner: 'CTO',
      }]
    });
    const r = await prioritizeCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /evidence_strength/i.test(p)));
  });
});

// =======================================================================
// COMPETITIVE INTEL
// =======================================================================
describe('competitiveIntelCommand', () => {
  test('validate rejects claim without observation_date', async () => {
    const root = tmpProject();
    write(root, 'competitors.yaml', {
      version: 1, kind: 'competitors', entries: [{
        competitor_id: 'COMP-001', name: 'AuditBot', category: 'seo-audit',
        claims: [{ claim_type: 'competitor_claim', text: 'We detect 500 issues', source: 'auditbot.com/features' }],
      }]
    });
    const r = await competitiveIntelCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /observation_date/i.test(p)));
  });

  test('validate rejects claim from unreliable source without independent verification', async () => {
    const root = tmpProject();
    write(root, 'competitors.yaml', {
      version: 1, kind: 'competitors', entries: [{
        competitor_id: 'COMP-002', name: 'RankMaster', category: 'seo-audit',
        claims: [{
          claim_type: 'competitor_claim',
          text: 'Best in class', source: 'g2.com review',
          observation_date: '2026-06-01',
        }],
      }]
    });
    const r = await competitiveIntelCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(p => /unreliable source/i.test(p)));
  });

  test('stale returns competitors older than cutoff', async () => {
    const root = tmpProject();
    write(root, 'competitors.yaml', {
      version: 1, kind: 'competitors', entries: [
        { competitor_id: 'C-A', name: 'OldCo', last_updated: '2020-01-01', claims: [] },
        { competitor_id: 'C-B', name: 'NewCo', last_updated: '2099-01-01', claims: [] },
      ]
    });
    const r = await competitiveIntelCommand(['stale', '--days', '90'], root);
    assert.equal(r.total, 1);
    assert.equal(r.stale_competitors[0].competitor_id, 'C-A');
  });
});

// =======================================================================
// EXECUTIVE ROUTER
// =======================================================================
describe('executiveCommand', () => {
  test('routes "board report" to board-report', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['board report Q2 2026'], root);
    assert.equal(r.routed_to, 'board-report');
  });

  test('routes "monthly operating review" to executive-review', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['monthly operating review'], root);
    assert.equal(r.routed_to, 'executive-review');
  });

  test('routes "decision needed" to decision-memo', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['decision needed on pricing'], root);
    assert.equal(r.routed_to, 'decision-memo');
  });

  test('returns unresolved for unknown request', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['random unrecognised request xyz'], root);
    assert.ok(r.unresolved);
    assert.ok(Array.isArray(r.available_commands));
  });

  test('--route forces specific command', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['--route', 'kpi'], root);
    assert.equal(r.routed_to, 'kpi');
  });

  test('--log returns log (empty on fresh project)', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['--log'], root);
    assert.ok(Array.isArray(r.log));
  });

  test('logs routing decisions to executive-log.yaml', async () => {
    const root = tmpProject();
    await executiveCommand(['risk register top risks'], root);
    const logFile = path.join(root, '.citable', 'executive-log.yaml');
    assert.ok(fs.existsSync(logFile));
  });
});

// =======================================================================
// ISSUE 2 — Reports must block sections when entries fail schema validation
// =======================================================================
describe('reports reject invalid registry entries as governed evidence', () => {
  test('board-report refuses commercial section when all KPI entries are schema-invalid', async () => {
    const root = tmpProject();
    // Write a KPI entry missing 6 required fields
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [
      { metric_id: 'ARR', name: 'ARR' } // missing owner, executive_definition, known_limitations, etc.
    ]});
    write(root, 'customer-outcomes.yaml', { version: 1, kind: 'customer-outcomes', entries: [{ outcome_id: 'O1', customer: 'X', property: 'x.com', baseline: 'b', intervention: 'i', observed_change: 'c', measurement_window: '7d', evidence_package: ['e.pdf'], customer_confirmed: true, causal_confidence: 'partial', outcome_stage: 'finding_accepted' }] });
    write(root, 'risks.yaml', { version: 1, kind: 'risks', entries: [{ risk_id: 'R1', title: 'R', category: 'commercial', cause: 'c', event: 'e', consequence: 'q', likelihood: 'unlikely', impact: 'minor', gross_exposure: 'low', controls: [], control_owner: 'CEO', control_effectiveness: 'none', residual_exposure: 'low', key_risk_indicators: [], trigger_threshold: '', response: 'monitor', response_owner: 'CEO', review_date: '2027-01-01', trend: 'stable', board_visibility: false }] });
    const r = await boardReportCommand(['--quarter', '2026-Q2', '--json'], root);
    // After filtering invalids, kpis.length === 0 → refused_sections must fire
    assert.ok(r.refused_sections, 'must refuse when all KPIs fail schema validation');
    assert.match(r.refused_sections, /kpis/);
    assert.ok(r.invalid_entries_excluded, 'must report excluded invalid entries');
  });

  test('executive-review excludes invalid KPI entries from governed_metrics count', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [
      { metric_id: 'ARR', name: 'ARR' } // invalid — missing required fields
    ]});
    const r = await executiveReviewCommand(['--period', '2026-06', '--json'], root);
    // Invalid entry must not inflate governed_metrics
    assert.equal(r.ledger.governed_metrics, 0, 'invalid KPI must not count as governed');
    assert.ok(r.ungoverned_warning, 'must warn when no valid KPIs');
    assert.ok(r.invalid_entries_excluded > 0, 'must report excluded count');
  });
});

// =======================================================================
// ISSUE 3 — Every board-report statement must carry full provenance contract
// =======================================================================
describe('board-report statement provenance contract', () => {
  test('every factual statement in sections carries statement_id and owner', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'ARR', name: 'ARR', owner: 'CEO', reporting_cadence: 'quarterly', target: 400000, restatement_policy: 'restate', known_limitations: ['est'], comparison_required: false, executive_definition: 'ARR', calculation: 'mrr*12', numerator: 'mrr', denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'q', warning_threshold: 300000, critical_threshold: 200000 }] });
    write(root, 'customer-outcomes.yaml', { version: 1, kind: 'customer-outcomes', entries: [{ outcome_id: 'O1', customer: 'X', property: 'x.com', baseline: 'b', intervention: 'i', observed_change: 'c', measurement_window: '7d', evidence_package: ['e.pdf'], customer_confirmed: true, causal_confidence: 'partial', outcome_stage: 'finding_accepted' }] });
    write(root, 'risks.yaml', { version: 1, kind: 'risks', entries: [{ risk_id: 'R1', title: 'R', category: 'commercial', cause: 'c', event: 'e', consequence: 'q', likelihood: 'unlikely', impact: 'minor', gross_exposure: 'low', controls: [], control_owner: 'CEO', control_effectiveness: 'none', residual_exposure: 'low', key_risk_indicators: [], trigger_threshold: '', response: 'monitor', response_owner: 'CEO', review_date: '2027-01-01', trend: 'stable', board_visibility: false }] });
    const r = await boardReportCommand(['--quarter', '2026-Q2', '--json'], root);

    // governed_metrics in management_assessment is now a statement object
    const stmt = r.sections.management_assessment.governed_metrics;
    assert.ok(stmt.statement_id, 'governed_metrics must carry statement_id');
    assert.ok(stmt.owner,        'governed_metrics must carry owner');
    assert.ok(stmt.statement_type, 'governed_metrics must carry statement_type');
    assert.ok(stmt.source_records, 'governed_metrics must carry source_records');
    assert.ok(stmt.period,       'governed_metrics must carry period');

    // Each statement_id must be unique within the report
    const allStmtIds = [];
    function collectIds(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.statement_id) allStmtIds.push(obj.statement_id);
      for (const v of Object.values(obj)) collectIds(v);
    }
    collectIds(r.sections);
    const unique = new Set(allStmtIds);
    assert.equal(unique.size, allStmtIds.length, 'all statement_ids must be unique');
  });
});

// =======================================================================
// ISSUE 4 — Cross-registry referential integrity
// =======================================================================
describe('checkReferentialIntegrity — executive suite cross-registry', () => {
  test('valid cross-registry references produce no problems', async () => {
    const { checkReferentialIntegrity, loadRegistries } = await import('../../src/registries/index.js');
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'KPI-ARR', name: 'ARR', owner: 'CEO', reporting_cadence: 'quarterly', target: 400000, restatement_policy: 'restate', known_limitations: ['est'], comparison_required: false, executive_definition: 'ARR', calculation: 'mrr*12', numerator: 'mrr', denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'q', warning_threshold: 300000, critical_threshold: 200000 }] });
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [{ variance_id: 'VAR-001', metric_id: 'KPI-ARR', period: '2026-04', target: 100, actual: 90, delta: -10, delta_pct: -10, materiality: 'immaterial', primary_driver: 'slower deal close', management_response: 'monitoring' }] });
    const { registries } = loadRegistries(root);
    const problems = checkReferentialIntegrity(registries);
    const varProblems = problems.filter(p => p.startsWith('variances/'));
    assert.equal(varProblems.length, 0, `valid metric_id should produce no ref problems: ${varProblems.join(', ')}`);
  });

  test('dangling variance metric_id produces a referential integrity problem', async () => {
    const { checkReferentialIntegrity, loadRegistries } = await import('../../src/registries/index.js');
    const root = tmpProject();
    // No KPIs written — variance references a nonexistent KPI
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [{ variance_id: 'VAR-001', metric_id: 'KPI-NONEXISTENT', period: '2026-04', target: 100, actual: 90, delta: -10, delta_pct: -10, materiality: 'immaterial', primary_driver: 'slower deal close', management_response: 'monitoring' }] });
    const { registries } = loadRegistries(root);
    const problems = checkReferentialIntegrity(registries);
    const varProblems = problems.filter(p => p.includes('KPI-NONEXISTENT'));
    assert.ok(varProblems.length > 0, `dangling metric_id must produce ref integrity failure: ${JSON.stringify(problems)}`);
  });

  test('dangling decision supporting_evidence (outcome ref) produces problem', async () => {
    const { checkReferentialIntegrity, loadRegistries } = await import('../../src/registries/index.js');
    const root = tmpProject();
    write(root, 'decisions.yaml', { version: 1, kind: 'decisions', entries: [{
      decision_id: 'DEC-001', title: 'T', owner: 'CEO', consulted: ['CFO'],
      deadline: '2027-01-01', reversibility: 'reversible', options: [],
      recommendation: 'yes', supporting_evidence: ['OUT-GHOST'],
      contradicting_evidence: [], assumptions: [],
      what_would_change_recommendation: ['counterevidence'], cost_of_delay: 'high',
      reopen_conditions: [], status: 'open',
    }]});
    const { registries } = loadRegistries(root);
    const problems = checkReferentialIntegrity(registries);
    const refProblems = problems.filter(p => p.includes('OUT-GHOST'));
    assert.ok(refProblems.length > 0, `dangling OUT- reference must fail: ${JSON.stringify(problems)}`);
  });
});

// =======================================================================
// ISSUE 5 — Temporal reproducibility via --as-of
// =======================================================================
describe('--as-of flag produces deterministic temporal evaluation', () => {
  test('decision validate with --as-of flags past deadline relative to that date', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', { version: 1, kind: 'decisions', entries: [{
      decision_id: 'DEC-001', title: 'T', owner: 'CEO', consulted: ['CFO'],
      deadline: '2025-01-01', reversibility: 'reversible', options: [],
      recommendation: 'yes', supporting_evidence: ['data.csv'],
      contradicting_evidence: [], assumptions: [],
      what_would_change_recommendation: ['counterevidence'], cost_of_delay: 'high',
      reopen_conditions: [], status: 'open',
    }]});
    // With as-of 2025-06-01 the deadline 2025-01-01 is past → flag it
    const r = await decisionMemoCommand(['validate', '--as-of', '2025-06-01'], root);
    assert.ok(r.problems.some(p => /deadline.*past/i.test(p)), `should flag past deadline: ${JSON.stringify(r.problems)}`);
    // With as-of 2024-12-01 the deadline is in the future → no deadline problem
    const r2 = await decisionMemoCommand(['validate', '--as-of', '2024-12-01'], root);
    assert.ok(!r2.problems.some(p => /deadline.*past/i.test(p)), `should not flag future deadline at earlier as-of: ${JSON.stringify(r2.problems)}`);
  });

  test('executive-review records as_of field in output', async () => {
    const root = tmpProject();
    const r = await executiveReviewCommand(['--period', '2026-06', '--json', '--as-of', '2026-06-30'], root);
    assert.equal(r.as_of, '2026-06-30', 'as_of must be recorded in output for reproducibility');
  });
});

describe('second PR review regressions', () => {
  test('executive router forwards downstream report flags', async () => {
    const root = tmpProject();
    const r = await executiveCommand(['board report', '--quarter', '2025-Q1', '--as-of', '2025-03-31', '--json'], root);
    assert.equal(r.result.quarter, '2025-Q1');
    assert.equal(r.result.as_of, '2025-03-31');
  });

  test('variance list honors --period', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [
      { variance_id: 'V1', metric_id: 'K1', period: '2026-01' },
      { variance_id: 'V2', metric_id: 'K1', period: '2026-02' },
    ]});
    const r = await varianceCommand(['list', '--period', '2026-02'], root);
    assert.deepEqual(r.variances.map(v => v.variance_id), ['V2']);
  });

  test('shared registry loader reports malformed YAML without throwing', async () => {
    const root = tmpProject();
    fs.writeFileSync(path.join(root, '.citable', 'variances.yaml'), 'entries: [unterminated', 'utf8');
    const r = await varianceCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(problem => /YAML parse failure/.test(problem)));
  });

  test('shared registry loader rejects primitive YAML shape without throwing', async () => {
    const root = tmpProject();
    fs.writeFileSync(path.join(root, '.citable', 'variances.yaml'), 'foo', 'utf8');
    const r = await varianceCommand(['validate'], root);
    assert.equal(r.valid, false);
    assert.ok(r.problems.some(problem => /expected registry shape/.test(problem)));
  });

  test('decision new does not consume --write as a missing title', async () => {
    const r = await decisionMemoCommand(['new', '--write'], tmpProject());
    assert.equal(r.error, '--title required');
  });

  test('critical strategic differentiation outranks high', async () => {
    const root = tmpProject();
    const base = { customer_demand: 'medium', revenue_potential: 'medium', evidence_strength: 'verified', engineering_cost: 'low', reversibility: 'reversible', status: 'proposed', owner: 'CEO' };
    write(root, 'initiatives.yaml', { version: 1, kind: 'initiatives', entries: [
      { ...base, initiative_id: 'HIGH', title: 'High', strategic_differentiation: 'high' },
      { ...base, initiative_id: 'CRITICAL', title: 'Critical', strategic_differentiation: 'critical' },
    ]});
    const r = await prioritizeCommand(['rank'], root);
    assert.equal(r.ranked[0].initiative_id, 'CRITICAL');
    assert.ok(r.ranked[0].benefit > r.ranked[1].benefit);
  });

  test('kpi add message does not advertise unimplemented input paths', async () => {
    const r = await kpiCommand(['add'], tmpProject());
    assert.match(r.error, /not yet implemented/);
    assert.doesNotMatch(r.error, /--from-json|interactively/);
  });

  test('decision new --write awaits persistence failure', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', { version: 1, kind: 'decisions', entries: [{ decision_id: 'DEC-001', title: 'invalid' }] });
    await assert.rejects(
      () => decisionMemoCommand(['new', '--title', 'Must fail', '--write'], root),
      /refusing to save invalid decisions registry/,
    );
  });

  test('decision IDs use max sequence and guidance matches schema', async () => {
    const root = tmpProject();
    write(root, 'decisions.yaml', { version: 1, kind: 'decisions', entries: [{ decision_id: 'DEC-009', title: 'existing' }] });
    const r = await decisionMemoCommand(['new', '--title', 'next'], root);
    assert.equal(r.id, 'DEC-010');
    assert.deepEqual(r.reversibility_options, ['reversible', 'costly_to_reverse', 'effectively_one_way']);
  });

  test('out-of-period valid variances are not counted invalid', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'KPI-ARR', name: 'ARR', owner: 'CEO', reporting_cadence: 'monthly', target: 100, restatement_policy: 'restate', known_limitations: [], comparison_required: false, executive_definition: 'ARR', calculation: 'sum', numerator: 'arr', denominator: '1', unit: 'USD', source_system: 'ledger', source_query: 'ledger:arr', warning_threshold: 80, critical_threshold: 60 }] });
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [{ variance_id: 'VAR-001', metric_id: 'KPI-ARR', period: '2026-01', target: 100, actual: 90, variance_amount: -10, variance_pct: -10, materiality: 'immaterial', primary_driver: 'timing', controllable: false, evidence: ['ledger.csv'], owner: 'CFO', management_response: 'monitor' }] });
    const board = await boardReportCommand(['--quarter', '2026-Q3', '--json', '--as-of', '2026-09-30'], root);
    const review = await executiveReviewCommand(['--period', '2026-07', '--json', '--as-of', '2026-07-31'], root);
    assert.equal(board.invalid_entries_excluded?.variances ?? 0, 0);
    assert.equal(review.invalid_entries_excluded ?? 0, 0);
  });

  test('reports exclude schema-valid records with dangling references', async () => {
    const root = tmpProject();
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [{ variance_id: 'VAR-001', metric_id: 'KPI-MISSING', period: '2026-01', target: 100, actual: 90, variance_amount: -10, variance_pct: -10, materiality: 'material', primary_driver: 'Observed campaign conversion fell 10%', controllable: false, evidence: ['ledger.csv'], management_response: 'Revise campaign', owner: 'CEO' }] });
    const r = await boardReportCommand(['--quarter', '2026-Q1', '--json', '--as-of', '2026-03-31'], root);
    assert.equal(r.sections.management_assessment.variances_this_quarter.value, 0);
    assert.equal(r.invalid_entries_excluded.variances, 1);
  });

  test('duplicate governed IDs are excluded from board values', async () => {
    const root = tmpProject();
    const decision = { decision_id: 'DEC-1', title: 'Duplicate', owner: 'CEO', consulted: ['CFO'], deadline: '2026-09-01', reversibility: 'reversible', options: [{ label: 'A', description: 'desc', trade_offs: ['cost'] }], recommendation: 'A', supporting_evidence: ['memo.pdf'], contradicting_evidence: [], assumptions: [], what_would_change_recommendation: ['new evidence'], cost_of_delay: '$1k', reopen_conditions: [], status: 'open' };
    const initiative = { initiative_id: 'INIT-1', title: 'Duplicate', customer_demand: 'high', revenue_potential: 'high', strategic_differentiation: 'high', evidence_strength: 'validated', engineering_cost: 'low', reversibility: 'reversible', status: 'approved', owner: 'CTO' };
    write(root, 'decisions.yaml', { version: 1, kind: 'decisions', entries: [decision, { ...decision }] });
    write(root, 'initiatives.yaml', { version: 1, kind: 'initiatives', entries: [initiative, { ...initiative }] });
    const r = await boardReportCommand(['--quarter', '2026-Q3', '--json', '--as-of', '2026-09-30'], root);
    assert.equal(r.sections.board_decisions_and_asks.open_decisions.value, 0);
    assert.equal(r.sections.next_quarter_commitments.approved_initiatives.value, 0);
    assert.equal(r.invalid_entries_excluded.decisions, 2);
    assert.equal(r.invalid_entries_excluded.initiatives, 2);
  });

  test('references to schema-invalid targets are excluded', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'KPI-BAD', name: 'Invalid target' }] });
    write(root, 'variances.yaml', { version: 1, kind: 'variances', entries: [{ variance_id: 'VAR-1', metric_id: 'KPI-BAD', period: '2026-01', target: 100, actual: 90, variance_amount: -10, variance_pct: -10, materiality: 'material', primary_driver: 'Observed conversion fell 10%', controllable: false, evidence: ['ledger.csv'], management_response: 'Revise campaign', owner: 'CEO' }] });
    const r = await executiveReviewCommand(['--period', '2026-01', '--json', '--as-of', '2026-01-31'], root);
    assert.equal(r.ledger.governed_metrics, 0);
    assert.equal(r.ledger.variances_this_period, 0);
    assert.equal(r.invalid_entries_excluded, 2);
  });

  test('board statement IDs are stable and text output contains values', async () => {
    const root = tmpProject();
    write(root, 'kpis.yaml', { version: 1, kind: 'kpis', entries: [{ metric_id: 'MRR', name: 'Monthly Recurring Revenue', owner: 'CEO', reporting_cadence: 'monthly', target: 10000, restatement_policy: 'restate', known_limitations: [], comparison_required: false, executive_definition: 'MRR', calculation: 'sum', numerator: 'mrr', denominator: '1', unit: 'USD', source_system: 'stripe', source_query: 'stripe:mrr', warning_threshold: 8000, critical_threshold: 6000 }] });
    const a = await boardReportCommand(['--quarter', '2026-Q3', '--json', '--as-of', '2026-09-30'], root);
    const b = await boardReportCommand(['--quarter', '2026-Q3', '--json', '--as-of', '2026-09-30'], root);
    assert.equal(a.sections.commercial_position.metrics[0].statement_id, b.sections.commercial_position.metrics[0].statement_id);
    const text = await boardReportCommand(['--quarter', '2026-Q3', '--as-of', '2026-09-30'], root);
    assert.match(text, /Monthly Recurring Revenue/);
    assert.match(text, /10000/);
  });

  test('initiative links and scenario variable_id are schema-reachable', () => {
    const initiative = { version: 1, kind: 'initiatives', entries: [{ initiative_id: 'INIT-1', title: 'T', customer_demand: 'high', revenue_potential: 'high', strategic_differentiation: 'high', evidence_strength: 'validated', engineering_cost: 'low', reversibility: 'reversible', owner: 'CEO', linked_kpis: ['KPI-ARR'], linked_outcomes: ['OUT-1'], linked_risks: ['RISK-1'], linked_decisions: ['DEC-1'] }] };
    const scenario = { version: 1, kind: 'scenarios', entries: [{ scenario_id: 'SCN-1', title: 'T', variables: [{ variable: 'ARR', driver: 'd', variable_id: 'KPI-ARR' }], domain_impact: {}, cascade_analysis: [], states: { base: 'b', stress: 's', severe: 'v' }, early_warning_triggers: [], hedges: [], owner: 'CEO' }] };
    assert.equal(validateAgainst('initiative.schema.json', initiative).valid, true);
    assert.equal(validateAgainst('scenario.schema.json', scenario).valid, true);
  });

  test('strict --as-of rejects impossible dates and board records it', async () => {
    const root = tmpProject();
    await assert.rejects(() => boardReportCommand(['--as-of', '2026-02-31', '--json'], root), /YYYY-MM-DD/);
    const r = await boardReportCommand(['--as-of', '2026-09-30', '--json'], root);
    assert.equal(r.as_of, '2026-09-30');
  });

  test('risk, assumption, and competitor staleness honor --as-of', async () => {
    const root = tmpProject();
    write(root, 'risks.yaml', { version: 1, kind: 'risks', entries: [{ risk_id: 'R1', title: 'R', category: 'commercial', cause: 'c', event: 'e', consequence: 'q', likelihood: 'unlikely', impact: 'minor', gross_exposure: 'low', controls: [], control_owner: 'CEO', control_effectiveness: 'none', residual_exposure: 'low', key_risk_indicators: [], trigger_threshold: '', response: 'monitor', response_owner: 'CEO', review_date: '2026-02-01', trend: 'stable', board_visibility: false }] });
    write(root, 'assumptions.yaml', { version: 1, kind: 'assumptions', entries: [{ assumption_id: 'ASMP-1', statement: 'S', category: 'commercial', importance: 'low', current_status: 'untested', confidence: 'low', evidence_for: [], evidence_against: [], owner: 'CEO', expiry: '2026-02-01' }] });
    write(root, 'competitors.yaml', { version: 1, kind: 'competitors', entries: [{ competitor_id: 'C1', name: 'C', updated: '2026-01-01' }] });
    assert.equal((await riskCommand(['validate', '--as-of', '2026-01-15'], root)).problems.some(p => /review overdue/.test(p)), false);
    assert.equal((await riskCommand(['validate', '--as-of', '2026-03-01'], root)).problems.some(p => /review overdue/.test(p)), true);
    assert.equal((await assumptionAuditCommand(['expired', '--as-of', '2026-01-15'], root)).total, 0);
    assert.equal((await assumptionAuditCommand(['expired', '--as-of', '2026-03-01'], root)).total, 1);
    assert.equal((await competitiveIntelCommand(['stale', '--days', '30', '--as-of', '2026-01-15'], root)).total, 0);
    assert.equal((await competitiveIntelCommand(['stale', '--days', '30', '--as-of', '2026-03-01'], root)).total, 1);
  });
});
