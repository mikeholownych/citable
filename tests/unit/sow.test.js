import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateSow, renderSowMarkdown, renderSowHtml, exportSow } from '../../src/sow/generateSow.js';
import { sowCommand } from '../../src/commands/sowCmd.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const ROOT = process.cwd();

test('generateSow creates enterprise-grade SOW satisfying schemas/sow.schema.json and all 25 pillars', async () => {
  const sow = await generateSow(ROOT, {
    client: 'Starlight Enterprises',
    clientContact: 'procurement@starlight.test',
    supplier: 'Nebula Advisory Group',
    supplierContact: 'practice@nebula.test',
    budget: 65000,
    termDays: 90,
  });

  // 1. Validate JSON Schema contract
  const validation = validateAgainst('sow.schema.json', sow);
  assert.equal(validation.valid, true, `Schema validation failed: ${validation.errors.join(', ')}`);

  // 2. Verify Header & Client Details
  assert.ok(sow.sow_id.startsWith('SOW-'));
  assert.equal(sow.client.name, 'Starlight Enterprises');
  assert.equal(sow.supplier.name, 'Nebula Advisory Group');
  assert.equal(sow.term_days, 90);

  // 3. Verify All 25 Pillars
  assert.ok(sow.executive_scope.business_objective.length > 0); // Pillar 1
  assert.ok(sow.admissibility_gate.admitted_count > 0); // Pillar 2
  assert.ok(sow.assumptions_and_constraints.assumptions.length > 0); // Pillar 3
  assert.ok(sow.work_packages.length > 0); // Pillar 4
  assert.ok(sow.deliverables.length > 0); // Pillar 5
  assert.ok(sow.technical_requirements.supported_frameworks.length > 0); // Pillar 6
  assert.ok(sow.acceptance_criteria.length > 0); // Pillar 7
  assert.ok(sow.baseline_and_target_metrics.metrics.length > 0); // Pillar 8
  assert.ok(sow.experiment_specifications.guardrails.length > 0); // Pillar 9
  assert.ok(sow.raci_matrix.length > 0); // Pillar 10
  assert.ok(sow.customer_obligations.length > 0); // Pillar 11
  assert.ok(sow.delivery_schedule.milestones.length > 0); // Pillar 12
  assert.ok(sow.change_control_process.procedure.length > 0); // Pillar 13
  assert.ok(sow.risk_register.length > 0); // Pillar 14
  assert.ok(sow.data_governance.authorized_sources.length > 0); // Pillar 15
  assert.ok(sow.security_requirements.length > 0); // Pillar 16
  assert.ok(sow.platform_dependencies.length > 0); // Pillar 17
  assert.ok(sow.qa_plan.methodology.length > 0); // Pillar 18
  assert.ok(sow.governance_model.weekly_sync.length > 0); // Pillar 19
  assert.equal(sow.commercial_terms.total_fixed_fee_usd, 65000); // Pillar 20
  assert.ok(sow.out_of_scope.length > 0); // Pillar 21
  assert.ok(sow.warranty_terms.warranty_window_days > 0); // Pillar 22
  assert.ok(sow.completion_and_handoff.handoff_assets.length > 0); // Pillar 23
  assert.ok(sow.termination_provisions.convenience.length > 0); // Pillar 24
  assert.ok(sow.traceability_matrix.length > 0); // Pillar 25

  // 4. Verify Strict 7-Column Traceability Matrix
  for (const row of sow.traceability_matrix) {
    assert.ok(row.finding_id, 'Traceability row must have finding_id');
    assert.ok(row.recommendation, 'Traceability row must have recommendation');
    assert.ok(row.sow_requirement_id.startsWith('REQ-SOW-'), 'Must have REQ-SOW- ID');
    assert.ok(row.deliverable_id.startsWith('DELIV-'), 'Must have DELIV- ID');
    assert.ok(row.acceptance_test_id.startsWith('ACC-TEST-'), 'Must have ACC-TEST- ID');
    assert.ok(row.owner, 'Traceability row must specify owner');
    assert.ok(row.evidence_id, 'Traceability row must specify evidence_id');
  }
});

test('renderSowMarkdown and renderSowHtml render complete formatted documents', async () => {
  const sow = await generateSow(ROOT, {
    client: 'Apollo Technologies',
    budget: 50000,
  });

  const md = renderSowMarkdown(sow);
  assert.ok(md.includes('Statement of Work'));
  assert.ok(md.includes('Apollo Technologies'));
  assert.ok(md.toLowerCase().includes('traceability matrix'));
  assert.ok(md.includes('| Finding ID | Recommendation | SOW Req ID | Deliverable ID | Acceptance Test ID | Responsible Owner | Source Evidence |'));
  assert.ok(md.includes('Contract Execution & Authorization'));

  const html = renderSowHtml(sow);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Statement of Work'));
  assert.ok(html.includes('Apollo Technologies'));
  assert.ok(html.includes('25. The Final Traceability Matrix'));
  assert.ok(html.includes('<table>'));
});

test('exportSow writes deliverables to disk and returns content', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sow-export-'));
  const mdFile = path.join(tmpDir, 'SOW.md');
  const htmlFile = path.join(tmpDir, 'SOW.html');
  const jsonFile = path.join(tmpDir, 'SOW.json');

  // Export Markdown
  const mdRes = await exportSow(ROOT, { format: 'markdown', output: mdFile });
  assert.equal(mdRes.format, 'markdown');
  assert.equal(fs.existsSync(mdFile), true);
  assert.ok(fs.readFileSync(mdFile, 'utf8').includes('Statement of Work'));

  // Export HTML
  const htmlRes = await exportSow(ROOT, { format: 'html', output: htmlFile });
  assert.equal(htmlRes.format, 'html');
  assert.equal(fs.existsSync(htmlFile), true);
  assert.ok(fs.readFileSync(htmlFile, 'utf8').includes('<!DOCTYPE html>'));

  // Export JSON
  const jsonRes = await exportSow(ROOT, { format: 'json', output: jsonFile });
  assert.equal(jsonRes.format, 'json');
  assert.equal(fs.existsSync(jsonFile), true);
  const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.ok(parsed.sow_id.startsWith('SOW-'));
});

test('sowCommand CLI generates and validates SOW artifact', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sow-cmd-'));
  const jsonFile = path.join(tmpDir, 'test-sow.json');

  // 1. Generate JSON SOW via CLI
  await sowCommand(['--format', 'json', '--output', jsonFile, '--budget', '75000'], ROOT);
  assert.equal(fs.existsSync(jsonFile), true);

  // 2. Validate JSON SOW via CLI
  const valResult = await sowCommand(['validate', jsonFile], ROOT);
  assert.equal(valResult.command, 'sow validate');
  assert.equal(valResult.valid, true);
  assert.deepEqual(valResult.errors, []);
  assert.ok(valResult.message.includes('strictly to schemas/sow.schema.json contract'));
});
