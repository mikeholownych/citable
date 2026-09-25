import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALL_DETECTORS } from '../../src/detectors/index.js';
import {
  buildConditionFromDetector,
  buildConditionRegistry,
  loadConditionRegistry,
  validateConditionRegistry,
  deriveNormativeSources,
} from '../../src/conditions/registry.js';
import { computeSemanticFingerprint } from '../../src/conditions/fingerprint.js';
import {
  NORMATIVE_SOURCE_CLASSES,
  SOURCE_MATURITY,
  EVALUATION_METHODS,
  REVALIDATION_VERDICTS,
} from '../../src/conditions/constants.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';
import { verifyRemediation } from '../../src/commands/verifyRemediation.js';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';

test('B-020: condition registry is a first-class versioned artifact covering all detectors', () => {
  const registry = loadConditionRegistry();

  assert.equal(registry.schema_version, 1);
  assert.equal(registry.total_conditions, ALL_DETECTORS.length);
  assert.equal(registry.conditions.length, ALL_DETECTORS.length);

  const regCheck = validateAgainst('condition-registry.schema.json', registry);
  assert.equal(regCheck.valid, true, `Registry must satisfy schema: ${regCheck.errors?.join('; ')}`);

  for (const cond of registry.conditions) {
    // Required fields per B-020
    assert.ok(cond.condition_id, 'condition_id required');
    assert.ok(Number.isInteger(cond.condition_version) && cond.condition_version >= 1, 'condition_version >= 1 required');
    assert.ok(cond.applicability_rule && typeof cond.applicability_rule === 'object', 'applicability_rule object required');
    assert.ok(cond.applicability_rule.profile_filter, 'applicability_rule.profile_filter required');
    assert.ok(cond.applicability_rule.subject_type, 'applicability_rule.subject_type required');
    assert.ok(Array.isArray(cond.observation_requirements), 'observation_requirements array required');
    assert.ok(Object.values(EVALUATION_METHODS).includes(cond.evaluation_method), 'evaluation_method valid enum required');
    assert.ok(cond.severity_rule && typeof cond.severity_rule === 'object', 'severity_rule required');
    assert.ok(cond.severity_rule.default_severity, 'severity_rule.default_severity required');
    assert.ok(Array.isArray(cond.normative_sources) && cond.normative_sources.length >= 1, 'normative_sources >= 1 required');
    assert.ok(cond.introduced_at, 'introduced_at required');
    assert.ok('deprecated_at' in cond, 'deprecated_at property must exist (null or string)');
    assert.match(cond.semantic_fingerprint, /^[a-f0-9]{64}$/, 'semantic_fingerprint must be 64-char hex');

    const condCheck = validateAgainst('condition.schema.json', cond);
    assert.equal(condCheck.valid, true, `Condition ${cond.condition_id} must satisfy condition.schema.json: ${condCheck.errors?.join('; ')}`);
  }
});

test('B-021: semantic fingerprint detects check logic, threshold, or output shape mutations', () => {
  const detector = ALL_DETECTORS.find((d) => d.id === 'TECH-001');
  assert.ok(detector);

  const baselineFingerprint = computeSemanticFingerprint(detector);
  assert.match(baselineFingerprint, /^[a-f0-9]{64}$/);

  // Mutation 1: check logic change
  const mutatedCheckDetector = {
    ...detector,
    check: (ctx) => [{ subject: { type: 'page', identifier: 'https://example.test' }, summary: 'different check logic' }],
  };
  const mutatedCheckFingerprint = computeSemanticFingerprint(mutatedCheckDetector);
  assert.notEqual(baselineFingerprint, mutatedCheckFingerprint, 'Check logic change must mutate semantic fingerprint');

  // Mutation 2: severity change (output shape)
  const mutatedSeverityDetector = {
    ...detector,
    severity: 'medium',
  };
  const mutatedSeverityFingerprint = computeSemanticFingerprint(mutatedSeverityDetector);
  assert.notEqual(baselineFingerprint, mutatedSeverityFingerprint, 'Severity change must mutate semantic fingerprint');

  // Mutation 3: threshold change
  const mutatedThresholdDetector = {
    ...detector,
    thresholds: { maxLatencyMs: 5000 },
  };
  const mutatedThresholdFingerprint = computeSemanticFingerprint(mutatedThresholdDetector);
  assert.notEqual(baselineFingerprint, mutatedThresholdFingerprint, 'Threshold change must mutate semantic fingerprint');
});

test('B-021: validator fails closed when semantic fingerprint changes without condition_version increment', () => {
  const registry = loadConditionRegistry();
  const target = ALL_DETECTORS.find((d) => d.id === 'TECH-001');

  // Mutated detector check logic with SAME version (v1)
  const modifiedDetector = {
    ...target,
    version: 1,
    check: () => [],
  };

  const detectorsWithUnbumpedMutation = ALL_DETECTORS.map((d) => (d.id === 'TECH-001' ? modifiedDetector : d));

  const failureResult = validateConditionRegistry({
    registry,
    detectors: detectorsWithUnbumpedMutation,
  });

  assert.equal(failureResult.ok, false, 'Must fail closed when fingerprint changes without version bump');
  assert.ok(
    failureResult.errors.some((err) => err.includes('B-021 VIOLATION') && err.includes('TECH-001')),
    'Must report B-021 violation for un-bumped condition'
  );

  // When version is incremented (v2), validation of version bump succeeds
  const bumpedDetector = {
    ...modifiedDetector,
    version: 2,
  };
  const detectorsWithBumpedMutation = ALL_DETECTORS.map((d) => (d.id === 'TECH-001' ? bumpedDetector : d));

  const successResult = validateConditionRegistry({
    registry,
    detectors: detectorsWithBumpedMutation,
  });

  assert.equal(successResult.ok, true, 'Must pass when condition_version is incremented alongside semantic change');
});

test('B-022: verify remediation reports FAIL → PASS only when condition_id and condition_version match; otherwise reports new condition evaluation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-b022-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  init(root);

  // Setup site with missing autocomplete on input
  const siteDir = path.join(root, 'site');
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(
    path.join(siteDir, 'index.html'),
    '<!doctype html><html><head><title>Form</title></head><body><form action="/sub"><input type="email" name="email" /><button>Go</button></form></body></html>'
  );

  // Initial audit produces CRO-007 finding
  const run1 = await audit(root, { target: siteDir, baseUrl: 'https://example.test', refDate: '2026-09-08' });
  const finding = run1.findings.find((f) => f.detector_id === 'CRO-007');
  assert.ok(finding);

  // Fix the page
  fs.writeFileSync(
    path.join(siteDir, 'index.html'),
    '<!doctype html><html><head><title>Form</title></head><body><form action="/sub"><input type="email" name="email" autocomplete="email" /><button>Go</button></form></body></html>'
  );

  // Scenario 1: Same condition version (both v1) -> true FAIL -> PASS
  const resSame = await verifyRemediation(root, {
    run: run1.runId,
    finding: 'CRO-007',
    target: 'site/index.html',
    baseUrl: 'https://example.test',
    refDate: '2026-09-08',
  });

  assert.equal(resSame.status, 'verified');
  assert.equal(resSame.verdict.resolved, true);
  assert.equal(resSame.verdict.revalidation_verdict, REVALIDATION_VERDICTS.FAIL_TO_PASS);
  assert.equal(resSame.verdict.condition_version, 1);

  // Scenario 2: Simulate condition version mismatch in source run (e.g. source run evaluated on v2 while current detector is v1)
  const runDir = path.join(root, '.citable', 'runs', run1.runId);
  const determinationsPath = path.join(runDir, 'determinations.json');
  const determinations = JSON.parse(fs.readFileSync(determinationsPath, 'utf8'));
  for (const det of determinations) {
    if (det.condition_id === 'CRO-007') {
      det.condition_version = 2; // Artificially bump baseline determination to v2
    }
  }
  const newContent = JSON.stringify(determinations, null, 2);
  fs.writeFileSync(determinationsPath, newContent);
  const crypto = await import('node:crypto');
  const newHash = crypto.createHash('sha256').update(newContent).digest('hex');

  const manifestPath = path.join(runDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (mf.output_hashes) mf.output_hashes['determinations.json'] = newHash;
    fs.writeFileSync(manifestPath, JSON.stringify(mf, null, 2));
  }

  const checksumsPath = path.join(runDir, 'checksums.json');
  if (fs.existsSync(checksumsPath)) {
    const cs = JSON.parse(fs.readFileSync(checksumsPath, 'utf8'));
    cs['determinations.json'] = newHash;
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath);
      cs['manifest.json'] = crypto.createHash('sha256').update(manifestContent).digest('hex');
    }
    fs.writeFileSync(checksumsPath, JSON.stringify(cs, null, 2));
  }

  // Re-run verify remediation: source version is 2, recheck detector version is 1
  const resMismatch = await verifyRemediation(root, {
    run: run1.runId,
    finding: 'CRO-007',
    target: 'site/index.html',
    baseUrl: 'https://example.test',
    refDate: '2026-09-08',
  });

  // INVARIANT B-022: Must NOT report resolved/fail_to_pass! Reports new_condition_evaluation!
  assert.equal(resMismatch.status, 'not_comparable');
  assert.equal(resMismatch.verdict.resolved, false);
  assert.equal(resMismatch.verdict.revalidation_verdict, REVALIDATION_VERDICTS.NEW_CONDITION_EVALUATION);
  assert.equal(resMismatch.verdict.source_condition_version, 2);
  assert.equal(resMismatch.verdict.recheck_condition_version, 1);
  assert.ok(resMismatch.limitations.some((l) => l.includes('new condition evaluation')));
});

test('B-023: normative sources link valid classes and maturity; heuristic is NEVER presented as a standard', () => {
  const registry = loadConditionRegistry();
  const validClasses = new Set(Object.values(NORMATIVE_SOURCE_CLASSES));
  const validMaturities = new Set(Object.values(SOURCE_MATURITY));

  for (const cond of registry.conditions) {
    for (const src of cond.normative_sources) {
      assert.ok(validClasses.has(src.source_class), `${cond.condition_id}: unknown source_class ${src.source_class}`);
      assert.ok(validMaturities.has(src.maturity), `${cond.condition_id}: unknown maturity ${src.maturity}`);
      assert.ok(src.title && src.title.length > 0, `${cond.condition_id}: source must have title`);

      // INVARIANT: Heuristic is NEVER presented as a STANDARD
      if (cond.evaluation_method === EVALUATION_METHODS.HEURISTIC) {
        assert.notEqual(
          src.source_class,
          NORMATIVE_SOURCE_CLASSES.STANDARD,
          `${cond.condition_id}: heuristic condition must NEVER present source_class as STANDARD`
        );
      }
    }
  }

  // Schema enforcement proof: Attempting to validate a heuristic condition with source_class STANDARD must FAIL schema validation
  const illegalHeuristic = {
    ...registry.conditions[0],
    evaluation_method: 'heuristic',
    normative_sources: [
      {
        source_class: 'STANDARD',
        maturity: 'MATURE',
        title: 'Fictional Heuristic Standard',
      },
    ],
  };

  const schemaCheck = validateAgainst('condition.schema.json', illegalHeuristic);
  assert.equal(schemaCheck.valid, false, 'Schema must reject heuristic condition claiming source_class STANDARD');
});
