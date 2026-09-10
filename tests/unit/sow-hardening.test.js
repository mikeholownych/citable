import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateSow,
  exportSow,
  allocateMilestoneFees,
  parseCommercialBudget,
  getCanonicalRunTimestamp,
  sortRunCandidatesChronologically,
  validateSowInvariants,
  renderSowMarkdown,
  renderSowHtml,
  SOW_CURRENCY,
  SOW_CURRENCY_MINOR_EXPONENT,
  SowError,
  RunNotFoundError,
  FindingsMissingError,
  FindingsInvalidError,
  LiveInspectionFailedError,
  NoFindingsError,
  NoAdmissibleRequirementsError,
  BudgetCalculationError,
  SowInvariantError,
} from '../../src/sow/generateSow.js';
import {
  evaluateScopeAdmissibility,
  checkScopeBoundary,
  DEFAULT_ROLE_MAPPINGS,
} from '../../src/sow/admissibilityGate.js';
import { sowCommand } from '../../src/commands/sowCmd.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const ROOT = process.cwd();

// Helper to construct a valid admissible finding
function makeFinding(overrides = {}) {
  return {
    finding_id: 'F-TECH-001-A',
    detector_id: 'TECH-001',
    discipline: ['technical'],
    classification: { severity: 'critical', confidence: 'deterministic' },
    subject: { identifier: 'https://example.test/page1', url: 'https://example.test/page1' },
    observation: { summary: 'Render-blocking bundle', evidence: ['EVD-001', 'EVD-002'] },
    remediation: { preferred: 'Load async scripts', owner: 'Engineering Lead' },
    verification: { detector_to_rerun: 'TECH-001', method: 'Static AST check' },
    ice_score: 14.0,
    ...overrides,
  };
}

test('allocateMilestoneFees distributes integer budget deterministically without remainder leaks', () => {
  // $100 across 3 milestones -> 34, 33, 33
  const f1 = allocateMilestoneFees(100, 3);
  assert.deepEqual(f1, [34, 33, 33]);
  assert.equal(f1.reduce((a, b) => a + b, 0), 100);

  // $10,000 across 3 milestones -> 3334, 3333, 3333
  const f2 = allocateMilestoneFees(10000, 3);
  assert.deepEqual(f2, [3334, 3333, 3333]);
  assert.equal(f2.reduce((a, b) => a + b, 0), 10000);

  // $45,000 across 4 milestones -> 11250 each
  const f3 = allocateMilestoneFees(45000, 4);
  assert.deepEqual(f3, [11250, 11250, 11250, 11250]);
  assert.equal(f3.reduce((a, b) => a + b, 0), 45000);

  // Edge cases & validation errors
  assert.throws(() => allocateMilestoneFees(-500, 3), BudgetCalculationError);
  assert.throws(() => allocateMilestoneFees(100.5, 3), BudgetCalculationError);
  assert.throws(() => allocateMilestoneFees(1000, 0), BudgetCalculationError);
  assert.throws(() => allocateMilestoneFees(1000, -1), BudgetCalculationError);
});

test('checkScopeBoundary accurately enforces origin, host, subdomain, path, and resource bounds', () => {
  const props = ['https://example.test'];

  // Default: HOST_AND_SUBDOMAINS
  assert.equal(checkScopeBoundary('https://example.test', props), true);
  assert.equal(checkScopeBoundary('https://sub.example.test', props), true);
  assert.equal(checkScopeBoundary('https://deep.sub.example.test/path', props), true);
  assert.equal(checkScopeBoundary('/relative/path', props), true);

  // Adversarial spoofing attacks must fail
  assert.equal(checkScopeBoundary('https://example.test.attacker.com', props), false);
  assert.equal(checkScopeBoundary('https://notexample.test', props), false);
  assert.equal(checkScopeBoundary('https://attacker-example.test', props), false);
  assert.equal(checkScopeBoundary('https://unrelated.test', props), false);

  // HOST scope mode: exact host only, no subdomains
  assert.equal(checkScopeBoundary('https://example.test', props, 'HOST'), true);
  assert.equal(checkScopeBoundary('https://sub.example.test', props, 'HOST'), false);

  // EXACT_ORIGIN scope mode: exact scheme, host, port
  assert.equal(checkScopeBoundary('https://example.test', props, 'EXACT_ORIGIN'), true);
  assert.equal(checkScopeBoundary('http://example.test', props, 'EXACT_ORIGIN'), false);

  // PATH_PREFIX scope mode:
  const pathProps = ['https://example.test/checkout'];
  assert.equal(checkScopeBoundary('https://example.test/checkout/step1', pathProps, 'PATH_PREFIX'), true);
  assert.equal(checkScopeBoundary('https://example.test/account', pathProps, 'PATH_PREFIX'), false);

  // EXACT_RESOURCE scope mode:
  assert.equal(checkScopeBoundary('https://example.test/checkout', pathProps, 'EXACT_RESOURCE'), true);
  assert.equal(checkScopeBoundary('https://example.test/checkout/step1', pathProps, 'EXACT_RESOURCE'), false);
});

test('evaluateScopeAdmissibility enforces all 8 refusal gates with standardized refusal codes', () => {
  // Gate 1: Excluded detector
  const r1 = evaluateScopeAdmissibility([makeFinding({ detector_id: 'TECH-001' })], {
    excludedDetectors: ['TECH-001'],
  });
  assert.equal(r1.refusal_log.length, 1);
  assert.equal(r1.refusal_log[0].refusal_code, 'REFUSE-EXCLUDED');

  // Gate 2: Discipline not authorized
  const r2 = evaluateScopeAdmissibility([makeFinding({ discipline: ['social_media'] })], {
    allowedDisciplines: ['technical', 'cro'],
  });
  assert.equal(r2.refusal_log.length, 1);
  assert.equal(r2.refusal_log[0].refusal_code, 'REFUSE-DISCIPLINE-NOT-AUTHORIZED');

  // Gate 3: Experimental maturity
  const r3 = evaluateScopeAdmissibility([makeFinding({
    classification: { severity: 'high', confidence: 'experimental' },
  })], { allowExperimental: false });
  assert.equal(r3.refusal_log.length, 1);
  assert.equal(r3.refusal_log[0].refusal_code, 'REFUSE-EXPERIMENTAL');

  // Gate 3b: Missing evidence
  const r3b = evaluateScopeAdmissibility([makeFinding({
    observation: { summary: 'No evidence recorded', evidence: [] },
  })]);
  assert.equal(r3b.refusal_log.length, 1);
  assert.equal(r3b.refusal_log[0].refusal_code, 'REFUSE-NO-EVIDENCE');

  // Gate 4: Out of scope property
  const r4 = evaluateScopeAdmissibility([makeFinding({
    subject: { identifier: 'https://attacker.test/phish' },
  })], { inScopeProperties: ['https://example.test'] });
  assert.equal(r4.refusal_log.length, 1);
  assert.equal(r4.refusal_log[0].refusal_code, 'REFUSE-OUT-OF-SCOPE');

  // Gate 5: Technical feasibility / remediation safety
  const r5 = evaluateScopeAdmissibility([makeFinding({
    remediation: { preferred: 'Consult external legal counsel for GDPR determination' },
  })]);
  assert.equal(r5.refusal_log.length, 1);
  assert.equal(r5.refusal_log[0].refusal_code, 'REFUSE-UNFEASIBLE-REMEDIATION');

  // Gate 6: Commercial materiality & ICE threshold
  const r6 = evaluateScopeAdmissibility([makeFinding({
    detector_id: 'CUSTOM-099',
    classification: { severity: 'low', confidence: 'deterministic' },
    ice_score: 3.5,
  })], { minIceScore: 8.0 });
  assert.equal(r6.refusal_log.length, 1);
  assert.equal(r6.refusal_log[0].refusal_code, 'REFUSE-LOW-MATERIALITY');

  // Gate 7: Objectively testable acceptance
  const r7 = evaluateScopeAdmissibility([makeFinding({
    verification: null,
  })]);
  assert.equal(r7.refusal_log.length, 1);
  assert.equal(r7.refusal_log[0].refusal_code, 'REFUSE-UNVERIFIABLE');

  // Gate 8: Ownership clarity
  const r8 = evaluateScopeAdmissibility([makeFinding({
    remediation: { preferred: 'Valid fix', owner: 'UNRESOLVED' },
    delivery_owner: 'UNRESOLVED',
    owner: 'UNRESOLVED',
  })], { roleMapping: { TECH: 'UNRESOLVED', TECHNICAL: 'UNRESOLVED' } });
  assert.equal(r8.refusal_log.length, 1);
  assert.equal(r8.refusal_log[0].refusal_code, 'REFUSE-OWNER-UNRESOLVED');
});

test('evaluateScopeAdmissibility preserves evidence_ids and distinguishes finding_id from detector_id', () => {
  const f1 = makeFinding({
    finding_id: 'F-001',
    detector_id: 'CRO-007',
    subject: { identifier: 'https://example.test/cart' },
    observation: { evidence: ['EVD-A', 'EVD-B'] },
  });
  const f2 = makeFinding({
    finding_id: 'F-002',
    detector_id: 'CRO-007',
    subject: { identifier: 'https://example.test/checkout' },
    observation: { evidence: ['EVD-C', 'EVD-D', 'EVD-E'] },
  });

  const res = evaluateScopeAdmissibility([f1, f2]);
  assert.equal(res.admitted_requirements.length, 2);

  // Check identity separation: finding_id must NOT simply be detector_id
  assert.equal(res.admitted_requirements[0].finding_id, 'F-001');
  assert.equal(res.admitted_requirements[0].detector_id, 'CRO-007');
  assert.equal(res.admitted_requirements[1].finding_id, 'F-002');
  assert.equal(res.admitted_requirements[1].detector_id, 'CRO-007');

  // Check evidence preservation: full array intact
  assert.deepEqual(res.admitted_requirements[0].evidence_ids, ['EVD-A', 'EVD-B']);
  assert.equal(res.admitted_requirements[0].evidence_id, 'EVD-A');
  assert.deepEqual(res.admitted_requirements[1].evidence_ids, ['EVD-C', 'EVD-D', 'EVD-E']);
  assert.equal(res.admitted_requirements[1].evidence_id, 'EVD-C');

  // Check ownership provenance
  assert.ok(res.admitted_requirements[0].owner);
  assert.ok(res.admitted_requirements[0].owner_source);
  assert.ok(res.admitted_requirements[0].owner_mapping_version);
});

test('generateSow fails closed without findings and without sample mode (NoFindingsError)', async () => {
  const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-empty-'));
  await assert.rejects(
    async () => generateSow(emptyTmp),
    (err) => err instanceof NoFindingsError && err.code === 'NO_FINDINGS',
  );
});

test('generateSow fails closed on non-existent --run (RunNotFoundError)', async () => {
  await assert.rejects(
    async () => generateSow(ROOT, { runId: '20990101T000000-nonexistent-run' }),
    (err) => err instanceof RunNotFoundError && err.code === 'RUN_NOT_FOUND',
  );
});

test('generateSow fails closed when run directory lacks findings.json (FindingsMissingError)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-norun-'));
  const runDir = path.join(tmpDir, '.citable', 'runs', 'test-run-empty');
  fs.mkdirSync(runDir, { recursive: true });

  await assert.rejects(
    async () => generateSow(tmpDir, { runId: 'test-run-empty' }),
    (err) => err instanceof FindingsMissingError && err.code === 'FINDINGS_MISSING',
  );
});

test('generateSow fails closed on malformed findings.json (FindingsInvalidError)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-badrun-'));
  const runDir = path.join(tmpDir, '.citable', 'runs', 'test-run-bad');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'findings.json'), 'NOT_JSON');

  await assert.rejects(
    async () => generateSow(tmpDir, { runId: 'test-run-bad' }),
    (err) => err instanceof FindingsInvalidError && err.code === 'FINDINGS_INVALID',
  );
});

test('generateSow fails closed when all findings are refused by admissibility gate (NoAdmissibleRequirementsError)', async () => {
  const inadmissibleFindings = [
    makeFinding({
      observation: { evidence: [] }, // Fails Gate 3: No evidence
    }),
  ];

  await assert.rejects(
    async () => generateSow(ROOT, { findings: inadmissibleFindings }),
    (err) => err instanceof NoAdmissibleRequirementsError && err.code === 'NO_ADMISSIBLE_REQUIREMENTS',
  );
});

test('generateSow generates CONTRACTUAL SOW with machine-readable provenance and validates against schema', async () => {
  const findings = [
    makeFinding({
      finding_id: 'F-PROD-001',
      detector_id: 'TECH-001',
      discipline: ['technical'],
      subject: { identifier: 'https://example.test/' },
      observation: { summary: 'Bundle issue', evidence: ['EVD-001'] },
      remediation: { preferred: 'Load async', owner: 'Lead Dev' },
      verification: { detector_to_rerun: 'TECH-001', method: 'Static check' },
    }),
    makeFinding({
      finding_id: 'F-PROD-002',
      detector_id: 'CRO-007',
      discipline: ['cro'],
      subject: { identifier: 'https://example.test/checkout' },
      observation: { summary: 'Missing autocomplete', evidence: ['EVD-002'] },
      remediation: { preferred: 'Inject autocomplete', owner: 'CRO Architect' },
      verification: { detector_to_rerun: 'CRO-007', method: 'DOM check' },
    }),
  ];

  const sow = await generateSow(ROOT, {
    findings,
    client: 'Acme Enterprise',
    budget: 50000,
    termDays: 60,
  });

  // Verify generation mode
  assert.equal(sow.generation_mode, 'CONTRACTUAL');
  assert.equal(sow.synthetic_evidence, false);

  // Verify machine-readable provenance
  assert.ok(sow.generation_provenance);
  assert.equal(sow.generation_provenance.generator_version, '1.18.2');
  assert.equal(sow.generation_provenance.generation_mode, 'CONTRACTUAL');
  assert.equal(sow.generation_provenance.synthetic_evidence, false);
  assert.equal(sow.generation_provenance.source_findings_count, 2);

  // Validate strict schema conformance
  const val = validateAgainst('sow.schema.json', sow);
  assert.equal(val.valid, true, `Schema validation failed: ${val.errors.join('; ')}`);
});

test('generateSow with draft: true generates DRAFT SOW', async () => {
  const findings = [makeFinding()];
  const sow = await generateSow(ROOT, { findings, draft: true });

  assert.equal(sow.generation_mode, 'DRAFT');
  assert.ok(sow.title.includes('[DRAFT]'));
  assert.equal(sow.synthetic_evidence, false);
});

test('validateSowInvariants catches commercial arithmetic drift and missing evidence', () => {
  const validSow = {
    generation_mode: 'CONTRACTUAL',
    synthetic_evidence: false,
    currency: 'USD',
    currency_minor_unit_exponent: 2,
    commercial_total_fee_minor: 1000000,
    commercial_total_fee_usd: 10000,
    delivery_schedule: {
      milestones: [{ milestone_id: 'M1', fee_minor: 1000000, fee_usd: 10000 }],
    },
    work_packages: [{ work_package_id: 'WP-1', requirements: [{}] }],
    deliverables: [{ deliverable_id: 'DELIV-1' }],
    traceability_matrix: [{
      sow_requirement_id: 'REQ-1',
      work_package_id: 'WP-1',
      deliverable_id: 'DELIV-1',
      evidence_ids: ['EVD-1'],
    }],
    admissibility_gate: {
      total_findings_evaluated: 2,
      admitted_count: 1,
      refused_count: 1,
    },
  };

  assert.equal(validateSowInvariants(validSow), true);

  // Milestone fee drift in minor units
  assert.throws(
    () => validateSowInvariants({ ...validSow, commercial_total_fee_minor: 1200000 }),
    SowInvariantError,
  );

  // Currency mismatch
  assert.throws(
    () => validateSowInvariants({ ...validSow, currency: 'EUR' }),
    SowInvariantError,
  );

  // Synthetic evidence in contractual mode
  assert.throws(
    () => validateSowInvariants({ ...validSow, synthetic_evidence: true }),
    SowInvariantError,
  );

  // Gate count balance mismatch
  assert.throws(
    () => validateSowInvariants({
      ...validSow,
      admissibility_gate: { total_findings_evaluated: 5, admitted_count: 1, refused_count: 1 },
    }),
    SowInvariantError,
  );
});

test('sortRunCandidatesChronologically enforces max(canonical run timestamp) with deterministic tie-breaker', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-runs-sort-'));
  const runsDir = path.join(tmpDir, '.citable', 'runs');
  fs.mkdirSync(runsDir, { recursive: true });

  // Create 3 runs where lexicographical name is opposite to chronological order:
  // 1. zzz-old-run: older timestamp in manifest.json (2026-09-01)
  const runOld = path.join(runsDir, 'zzz-old-run');
  fs.mkdirSync(runOld);
  fs.writeFileSync(path.join(runOld, 'manifest.json'), JSON.stringify({ timestamp: '2026-09-01T10:00:00Z' }));
  fs.writeFileSync(path.join(runOld, 'findings.json'), '[]');

  // 2. aaa-new-run: newer timestamp in manifest.json (2026-09-10)
  const runNew = path.join(runsDir, 'aaa-new-run');
  fs.mkdirSync(runNew);
  fs.writeFileSync(path.join(runNew, 'manifest.json'), JSON.stringify({ timestamp: '2026-09-10T15:00:00Z' }));
  fs.writeFileSync(path.join(runNew, 'findings.json'), '[]');

  // 3. mmm-tie-1 and mmm-tie-2: identical timestamps, broken by deterministic secondary key
  const runTie1 = path.join(runsDir, 'mmm-tie-1');
  fs.mkdirSync(runTie1);
  fs.writeFileSync(path.join(runTie1, 'manifest.json'), JSON.stringify({ timestamp: '2026-09-05T12:00:00Z' }));
  fs.writeFileSync(path.join(runTie1, 'findings.json'), '[]');

  const runTie2 = path.join(runsDir, 'mmm-tie-2');
  fs.mkdirSync(runTie2);
  fs.writeFileSync(path.join(runTie2, 'manifest.json'), JSON.stringify({ timestamp: '2026-09-05T12:00:00Z' }));
  fs.writeFileSync(path.join(runTie2, 'findings.json'), '[]');

  const candidates = ['zzz-old-run', 'aaa-new-run', 'mmm-tie-1', 'mmm-tie-2'];
  const sorted = sortRunCandidatesChronologically(runsDir, candidates);

  // aaa-new-run (2026-09-10) MUST be first despite 'aaa' sorting before 'zzz' lexicographically
  assert.equal(sorted[0], 'aaa-new-run');
  // Ties on 2026-09-05 sort deterministically with secondary key (mmm-tie-2 before mmm-tie-1)
  assert.equal(sorted[1], 'mmm-tie-2');
  assert.equal(sorted[2], 'mmm-tie-1');
  // zzz-old-run (2026-09-01) MUST be last despite 'zzz' being lexicographically greatest
  assert.equal(sorted[3], 'zzz-old-run');
});

test('parseCommercialBudget and generateSow enforce exact integer minor-unit currency arithmetic and USD formatting', async () => {
  // 1. Exact budget parsing into cents
  const b1 = parseCommercialBudget({ budget: 100 });
  assert.equal(b1.feeMinor, 10000);
  assert.equal(b1.feeUsd, 100);
  assert.equal(b1.currency, 'USD');
  assert.equal(b1.minorUnitExponent, 2);

  // 2. Budget with cents
  const b2 = parseCommercialBudget({ budget: 49.99 });
  assert.equal(b2.feeMinor, 4999);
  assert.equal(b2.feeUsd, 49.99);

  // 3. Reject fractional sub-cents
  assert.throws(() => parseCommercialBudget({ budget: 100.001 }), BudgetCalculationError);
  assert.throws(() => parseCommercialBudget({ budget: -50 }), BudgetCalculationError);

  // 4. Generate SOW with $100 budget across 3 work packages:
  // Expects 10,000 cents split into: 3334, 3333, 3333 cents ($33.34, $33.33, $33.33)
  const findings = [
    makeFinding({ finding_id: 'F-1', detector_id: 'TECH-001', discipline: ['technical'] }),
    makeFinding({ finding_id: 'F-2', detector_id: 'CRO-001', discipline: ['cro'] }),
    makeFinding({ finding_id: 'F-3', detector_id: 'AEO-001', discipline: ['aeo'] }),
  ];

  const sow = await generateSow(ROOT, {
    findings,
    budget: 100,
    termDays: 30,
  });

  // Verify root currency metadata
  assert.equal(sow.currency, 'USD');
  assert.equal(sow.currency_minor_unit_exponent, 2);
  assert.equal(sow.commercial_total_fee_minor, 10000);
  assert.equal(sow.commercial_total_fee_usd, 100);

  // Verify milestone fee distribution in minor units and USD
  const milestones = sow.delivery_schedule.milestones;
  assert.equal(milestones.length, 3);
  assert.deepEqual(milestones.map((m) => m.fee_minor), [3334, 3333, 3333]);
  assert.deepEqual(milestones.map((m) => m.fee_usd), [33.34, 33.33, 33.33]);
  assert.equal(milestones.reduce((acc, m) => acc + m.fee_minor, 0), 10000);
  assert.equal(milestones.reduce((acc, m) => acc + m.fee_usd, 0), 100);

  // Verify commercial_terms match root exactly
  assert.equal(sow.commercial_terms.total_fixed_fee_minor, 10000);
  assert.equal(sow.commercial_terms.total_fixed_fee_usd, 100);
  assert.equal(sow.commercial_terms.currency, 'USD');

  // Verify markdown and HTML rendering format cents cleanly
  const md = renderSowMarkdown(sow);
  assert.ok(md.includes('$33.34'));
  assert.ok(md.includes('$33.33'));

  const html = renderSowHtml(sow);
  assert.ok(html.includes('$33.34 USD'));
  assert.ok(html.includes('$33.33 USD'));

  // Strict schema validation must pass
  const val = validateAgainst('sow.schema.json', sow);
  assert.equal(val.valid, true, `Schema validation failed: ${val.errors?.join('; ')}`);
});

test('schemas/sow.schema.json rejects unknown properties (additionalProperties: false)', () => {
  const validFinding = makeFinding();
  const res = evaluateScopeAdmissibility([validFinding]);
  const matrixItem = res.admitted_requirements[0];

  // Modify traceability matrix with an unauthorized rogue property
  const rogueItem = { ...matrixItem, rogue_extra_property: 'MALICIOUS_INJECTION' };
  const val = validateAgainst('sow.schema.json', {
    traceability_matrix: [rogueItem],
  });
  assert.equal(val.valid, false);
});
