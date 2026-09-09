import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScopeAdmissibility } from '../../src/sow/admissibilityGate.js';

test('evaluateScopeAdmissibility admits qualified enterprise findings and refuses non-qualifying findings across 6 gates', () => {
  const sampleFindings = [
    // 1. Fully qualified TECH finding -> Admitted
    {
      detector_id: 'TECH-001',
      discipline: ['technical'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://example.com/pricing' },
      observation: { evidence: ['EVD-CWV-001'] },
      remediation: { preferred: 'Defer render-blocking CSS/JS and specify explicit image dimensions.' },
      verification: { detector_to_rerun: 'TECH-001' },
      ice_score: 14.5,
    },
    // 2. Fully qualified CRO finding -> Admitted
    {
      detector_id: 'CRO-001',
      discipline: ['cro'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://example.com/checkout' },
      observation: { evidence: ['EVD-CRO-001'] },
      remediation: { preferred: 'Add Express Checkout payment wallet options above the fold.' },
      verification: { detector_to_rerun: 'CRO-001' },
      ice_score: 18.0,
    },
    // 3. Fully qualified AEO/GEO finding -> Admitted
    {
      detector_id: 'AEO-001',
      discipline: ['aeo'],
      classification: { severity: 'medium', confidence: 'observed' },
      subject: { identifier: 'https://example.com/faq' },
      observation: { evidence: ['EVD-AEO-001'] },
      remediation: { preferred: 'Structure question-and-answer pairs into direct answer paragraphs.' },
      verification: { detector_to_rerun: 'AEO-001' },
      ice_score: 12.0,
    },
    // 4. Fully qualified SCHEMA finding -> Admitted
    {
      detector_id: 'SCHEMA-001',
      discipline: ['schema'],
      classification: { severity: 'medium', confidence: 'observed' },
      subject: { identifier: 'https://example.com/about' },
      observation: { evidence: ['EVD-SCHEMA-001'] },
      remediation: { preferred: 'Add Organization structured data with sameAs social bindings.' },
      verification: { detector_to_rerun: 'SCHEMA-001' },
      ice_score: 9.5,
    },
    // Gate 1 Failure: Excluded detector
    {
      detector_id: 'TECH-999',
      discipline: ['technical'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://example.com/blog' },
      observation: { evidence: ['EVD-999'] },
      remediation: { preferred: 'Refactor code' },
      verification: { detector_to_rerun: 'TECH-999' },
    },
    // Gate 2 Failure: Experimental confidence
    {
      detector_id: 'GEO-EXP-01',
      discipline: ['geo'],
      classification: { severity: 'high', confidence: 'experimental' },
      subject: { identifier: 'https://example.com/docs' },
      observation: { evidence: ['EVD-EXP-01'] },
      remediation: { preferred: 'Experiment with latent semantic layout' },
      verification: { detector_to_rerun: 'GEO-EXP-01' },
    },
    // Gate 2 Failure: Missing evidence
    {
      detector_id: 'TECH-003',
      discipline: ['technical'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://example.com/' },
      observation: { evidence: [] },
      remediation: { preferred: 'Fix unverified performance issue' },
      verification: { detector_to_rerun: 'TECH-003' },
    },
    // Gate 3 Failure: Out of scope boundary
    {
      detector_id: 'TECH-004',
      discipline: ['technical'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://other-unrelated-domain.com/landing' },
      observation: { evidence: ['EVD-004'] },
      remediation: { preferred: 'Fix external site' },
      verification: { detector_to_rerun: 'TECH-004' },
    },
    // Gate 4 Failure: Legal / Unfeasible remediation
    {
      detector_id: 'CLAIM-001',
      discipline: ['claims'],
      classification: { severity: 'high', confidence: 'observed' },
      subject: { identifier: 'https://example.com/terms' },
      observation: { evidence: ['EVD-CLM-01'] },
      remediation: { preferred: 'Consult external legal counsel regarding trademark claims.' },
      verification: { detector_to_rerun: 'CLAIM-001' },
    },
    // Gate 5 Failure: Low materiality and low ICE score (< 8.0)
    {
      detector_id: 'TECH-099',
      discipline: ['technical'],
      classification: { severity: 'low', confidence: 'observed' },
      subject: { identifier: 'https://example.com/contact' },
      observation: { evidence: ['EVD-099'] },
      remediation: { preferred: 'Minor whitespace trim in head tags.' },
      verification: { detector_to_rerun: 'TECH-099' },
      ice_score: 3.5,
    },
  ];

  const result = evaluateScopeAdmissibility(sampleFindings, {
    inScopeProperties: ['https://example.com'],
    minIceScore: 8.0,
    excludedDetectors: ['TECH-999'],
  });

  assert.equal(result.fact_status, 'admissibility_gate_evaluated');
  assert.equal(result.summary.total_evaluated, 10);
  assert.equal(result.summary.admitted_count, 4);
  assert.equal(result.summary.refused_count, 6);
  assert.equal(result.summary.admissibility_rate_pct, 40);

  // Check admitted requirements
  const admittedIds = result.admitted_requirements.map((r) => r.finding_id);
  assert.deepEqual(admittedIds, ['TECH-001', 'CRO-001', 'AEO-001', 'SCHEMA-001']);

  // Check traceability on admitted requirements
  for (const req of result.admitted_requirements) {
    assert.ok(req.sow_requirement_id.startsWith('REQ-SOW-'));
    assert.ok(req.work_package_id.startsWith('WP-'));
    assert.ok(req.deliverable_id.startsWith('DELIV-'));
    assert.ok(req.acceptance_test_id.startsWith('ACC-TEST-'));
    assert.ok(req.owner.length > 0);
    assert.ok(req.evidence_id.length > 0);
    assert.ok(req.acceptance_test.includes('citable verify remediation'));
  }

  // Check refusal codes
  const refusalCodes = result.refusal_log.map((r) => r.refusal_code);
  assert.ok(refusalCodes.includes('REFUSE-EXCLUDED'));
  assert.ok(refusalCodes.includes('REFUSE-EXPERIMENTAL'));
  assert.ok(refusalCodes.includes('REFUSE-NO-EVIDENCE'));
  assert.ok(refusalCodes.includes('REFUSE-OUT-OF-SCOPE'));
  assert.ok(refusalCodes.includes('REFUSE-UNFEASIBLE-REMEDIATION'));
  assert.ok(refusalCodes.includes('REFUSE-LOW-MATERIALITY'));
});

test('evaluateScopeAdmissibility handles empty findings gracefully', () => {
  const result = evaluateScopeAdmissibility([]);
  assert.equal(result.summary.total_evaluated, 0);
  assert.equal(result.summary.admitted_count, 0);
  assert.equal(result.summary.refused_count, 0);
  assert.equal(result.summary.admissibility_rate_pct, 0);
  assert.deepEqual(result.admitted_requirements, []);
  assert.deepEqual(result.refusal_log, []);
});
