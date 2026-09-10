import fs from 'node:fs';
import path from 'node:path';
import { buildContext } from '../commands/context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, indexTargets } from '../detectors/framework.js';
import { evaluateScopeAdmissibility } from './admissibilityGate.js';
import { readJson, nowIso, sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import {
  resolveEvidenceSource,
  getCanonicalRunTimestamp,
  sortRunCandidatesChronologically,
} from '../shared/evidenceSourceResolver.js';
import {
  escapeHtml,
  escapeHtmlAttr,
  sanitizeUrl,
  escapeMarkdownTableCell,
  sanitizeForMarkdown,
} from '../shared/htmlEscape.js';

/**
 * Typed SOW Domain Errors
 */
export class SowError extends Error {
  constructor(message, code = 'SOW_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class RunNotFoundError extends SowError {
  constructor(runId) {
    super(`Specified run not found: ${runId}`, 'RUN_NOT_FOUND');
    this.runId = runId;
  }
}

export class FindingsMissingError extends SowError {
  constructor(runId, filePath) {
    super(`Run ${runId} is missing findings.json at ${filePath}`, 'FINDINGS_MISSING');
    this.runId = runId;
    this.filePath = filePath;
  }
}

export class FindingsInvalidError extends SowError {
  constructor(runId, message) {
    super(`Run ${runId} contains malformed or invalid findings: ${message}`, 'FINDINGS_INVALID');
    this.runId = runId;
  }
}

export class LiveInspectionFailedError extends SowError {
  constructor(target, reason) {
    super(`Live target inspection failed for ${target}: ${reason}`, 'LIVE_INSPECTION_FAILED');
    this.target = target;
  }
}

export class NoFindingsError extends SowError {
  constructor(source) {
    super(`No audit findings available from ${source}. Production SOW generation requires authoritative findings. (Use --sample to generate non-contractual demonstration SOW)`, 'NO_FINDINGS');
  }
}

export class NoAdmissibleRequirementsError extends SowError {
  constructor(totalEvaluated, refusalCount) {
    super(`Scope admissibility gate refused all ${totalEvaluated} findings (${refusalCount} refused). Zero contractable requirements remain.`, 'NO_ADMISSIBLE_REQUIREMENTS');
  }
}

export class BudgetCalculationError extends SowError {
  constructor(message) {
    super(message, 'INVALID_COMMERCIAL_TERMS');
  }
}

export class SowInvariantError extends SowError {
  constructor(message) {
    super(`SOW invariant failure: ${message}`, 'INVARIANT_VIOLATION');
  }
}

export const SOW_CURRENCY = 'USD';
export const SOW_CURRENCY_MINOR_EXPONENT = 2;

/**
 * Parse commercial budget into integer minor units (cents) and major units (USD).
 * Ensures money units are unambiguous and rejects invalid, negative, or sub-cent fractional budgets.
 */
export function parseCommercialBudget({ budget = 45000, budgetMinor = null } = {}) {
  if (budgetMinor !== null && budgetMinor !== undefined) {
    if (!Number.isInteger(budgetMinor) || budgetMinor < 0) {
      throw new BudgetCalculationError(`budgetMinor must be a non-negative integer (cents), got: ${budgetMinor}`);
    }
    const feeUsd = Number((budgetMinor / 100).toFixed(2));
    return {
      feeMinor: budgetMinor,
      feeUsd,
      currency: SOW_CURRENCY,
      minorUnitExponent: SOW_CURRENCY_MINOR_EXPONENT,
    };
  }

  const num = Number(budget);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    throw new BudgetCalculationError(`Commercial budget must be a non-negative number, got: ${budget}`);
  }

  const minorUnits = Math.round(num * 100);
  if (Math.abs(num * 100 - minorUnits) > 1e-6) {
    throw new BudgetCalculationError(`Commercial budget cannot contain fractional minor units (sub-cents): ${budget}`);
  }

  const feeUsd = Number((minorUnits / 100).toFixed(2));
  return {
    feeMinor: minorUnits,
    feeUsd,
    currency: SOW_CURRENCY,
    minorUnitExponent: SOW_CURRENCY_MINOR_EXPONENT,
  };
}

/**
 * Exact integer milestone fee allocation distributing remainder deterministically.
 * Allocates integer currency units (such as minor units / cents) across work packages without remainder leaks.
 */
export function allocateMilestoneFees(totalUnits, count) {
  if (!Number.isInteger(totalUnits) || totalUnits < 0) {
    throw new BudgetCalculationError(`Commercial budget units must be a non-negative integer, got: ${totalUnits}`);
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new BudgetCalculationError(`Cannot allocate milestone fees across ${count} work packages`);
  }
  const base = Math.floor(totalUnits / count);
  const remainder = totalUnits - (base * count);
  const fees = [];
  for (let i = 0; i < count; i++) {
    fees.push(base + (i < remainder ? 1 : 0));
  }
  const sum = fees.reduce((acc, f) => acc + f, 0);
  if (sum !== totalUnits) {
    throw new BudgetCalculationError(`Milestone fee sum (${sum}) does not equal total units (${totalUnits})`);
  }
  return fees;
}

export { getCanonicalRunTimestamp, sortRunCandidatesChronologically };

/**
 * Verify cross-object runtime invariants before SOW export
 */
export function validateSowInvariants(sow) {
  if (!sow || typeof sow !== 'object') {
    throw new SowInvariantError('SOW root must be an object');
  }
  if (!['CONTRACTUAL', 'DRAFT', 'NON_CONTRACTUAL_SAMPLE'].includes(sow.generation_mode)) {
    throw new SowInvariantError(`Invalid generation_mode: ${sow.generation_mode}`);
  }
  if (sow.generation_mode === 'CONTRACTUAL' && sow.synthetic_evidence) {
    throw new SowInvariantError('Contractual SOW cannot contain synthetic evidence');
  }
  if (sow.currency !== 'USD') {
    throw new SowInvariantError(`Currency must be 'USD', got: ${sow.currency}`);
  }
  if (sow.currency_minor_unit_exponent !== 2) {
    throw new SowInvariantError(`Minor unit exponent must be 2, got: ${sow.currency_minor_unit_exponent}`);
  }
  if (typeof sow.commercial_total_fee_minor !== 'number' || !Number.isInteger(sow.commercial_total_fee_minor)) {
    throw new SowInvariantError(`commercial_total_fee_minor must be an integer, got: ${sow.commercial_total_fee_minor}`);
  }
  if (typeof sow.commercial_total_fee_usd !== 'number' || sow.commercial_total_fee_usd < 0) {
    throw new SowInvariantError(`commercial_total_fee_usd must be a non-negative number, got: ${sow.commercial_total_fee_usd}`);
  }
  if (sow.commercial_total_fee_minor !== Math.round(sow.commercial_total_fee_usd * 100)) {
    throw new SowInvariantError(`commercial_total_fee_minor (${sow.commercial_total_fee_minor}) does not match commercial_total_fee_usd (${sow.commercial_total_fee_usd})`);
  }
  if (!Array.isArray(sow.work_packages) || sow.work_packages.length === 0) {
    throw new SowInvariantError('SOW must contain at least one work package');
  }
  if (!Array.isArray(sow.deliverables) || sow.deliverables.length === 0) {
    throw new SowInvariantError('SOW must contain at least one deliverable');
  }
  if (sow.work_packages.length !== sow.deliverables.length) {
    throw new SowInvariantError(`Work packages count (${sow.work_packages.length}) must match deliverables count (${sow.deliverables.length})`);
  }
  if (!Array.isArray(sow.traceability_matrix) || sow.traceability_matrix.length === 0) {
    throw new SowInvariantError('SOW must contain at least one traceability matrix requirement');
  }
  const wpIds = new Set(sow.work_packages.map((wp) => wp.work_package_id));
  const delivIds = new Set(sow.deliverables.map((d) => d.deliverable_id));
  const seenReqIds = new Set();
  const seenFindingKeys = new Set();
  for (const row of sow.traceability_matrix) {
    if (!wpIds.has(row.work_package_id)) {
      throw new SowInvariantError(`Traceability matrix references unknown work package: ${row.work_package_id}`);
    }
    if (!delivIds.has(row.deliverable_id)) {
      throw new SowInvariantError(`Traceability matrix references unknown deliverable: ${row.deliverable_id}`);
    }
    if (!Array.isArray(row.evidence_ids) || row.evidence_ids.length === 0) {
      throw new SowInvariantError(`Traceability matrix row ${row.sow_requirement_id} lacks supporting evidence_ids`);
    }
    if (seenReqIds.has(row.sow_requirement_id)) {
      throw new SowInvariantError(`Duplicate sow_requirement_id in traceability matrix: ${row.sow_requirement_id}`);
    }
    seenReqIds.add(row.sow_requirement_id);
    const findingKey = `${row.finding_id}:${row.target_subject || ''}`;
    if (seenFindingKeys.has(findingKey)) {
      throw new SowInvariantError(`Duplicate finding_id and subject in traceability matrix: ${findingKey}`);
    }
    seenFindingKeys.add(findingKey);
  }

  const milestones = sow.delivery_schedule?.milestones || [];
  const milestoneMinorSum = milestones.reduce((sum, m) => sum + m.fee_minor, 0);
  if (milestoneMinorSum !== sow.commercial_total_fee_minor) {
    throw new SowInvariantError(`Milestone minor fees sum (${milestoneMinorSum}) does not match total minor fee (${sow.commercial_total_fee_minor})`);
  }
  const milestoneUsdSum = Number(milestones.reduce((sum, m) => sum + m.fee_usd, 0).toFixed(2));
  if (milestoneUsdSum !== sow.commercial_total_fee_usd) {
    throw new SowInvariantError(`Milestone USD fees sum (${milestoneUsdSum}) does not match total fee USD (${sow.commercial_total_fee_usd})`);
  }
  for (const m of milestones) {
    if (m.fee_minor !== Math.round(m.fee_usd * 100)) {
      throw new SowInvariantError(`Milestone ${m.milestone_id} fee_minor (${m.fee_minor}) does not match fee_usd (${m.fee_usd})`);
    }
  }

  const gate = sow.admissibility_gate;
  if (gate.total_findings_evaluated !== gate.admitted_count + gate.refused_count) {
    throw new SowInvariantError(`Admissibility gate numbers do not balance: ${gate.total_findings_evaluated} != ${gate.admitted_count} + ${gate.refused_count}`);
  }
  return true;
}

/**
 * Standard synthetic baseline findings used strictly for sample mode (--sample / --demo)
 */
export function getSampleBaselineFindings() {
  return [
    {
      finding_id: 'F-TECH-CWV-001',
      detector_id: 'TECH-001',
      discipline: ['technical'],
      classification: { severity: 'critical', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/', url: 'https://example.test/' },
      observation: { summary: 'Render-blocking JavaScript bundle degrades Mobile LCP to 4.2s', evidence: ['EVD-CWV-001'] },
      remediation: { preferred: 'Implement asynchronous resource loading and preconnect headers' },
      verification: { detector_to_rerun: 'TECH-001', method: 'Static CWV inspection and HTTP header probe' },
      ice_score: 14.5,
    },
    {
      finding_id: 'F-CRO-AUTO-007',
      detector_id: 'CRO-007',
      discipline: ['cro'],
      classification: { severity: 'high', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/checkout', url: 'https://example.test/checkout' },
      observation: { summary: 'Checkout form inputs lack HTML5 autocomplete attributes, increasing manual mobile entry by 68%', evidence: ['EVD-CRO-007'] },
      remediation: { preferred: 'Inject standard autocomplete attributes (autocomplete="email", autocomplete="name", autocomplete="tel")' },
      verification: { detector_to_rerun: 'CRO-007', method: 'DOM inspection and AST patch verification' },
      ice_score: 18.0,
    },
    {
      finding_id: 'F-CRO-DIST-013',
      detector_id: 'CRO-013',
      discipline: ['cro'],
      classification: { severity: 'high', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/checkout', url: 'https://example.test/checkout' },
      observation: { summary: 'Dedicated checkout funnel contains 14 external header navigation links creating distraction leaks', evidence: ['EVD-CRO-013'] },
      remediation: { preferred: 'Deploy enclosed distraction-free checkout layout stripping non-essential navigation' },
      verification: { detector_to_rerun: 'CRO-013', method: 'Navigation link count verification' },
      ice_score: 12.0,
    },
    {
      finding_id: 'F-ANS-PRIC-001',
      detector_id: 'ANS-001',
      discipline: ['aeo'],
      classification: { severity: 'high', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/saas/pricing.html', url: 'https://example.test/saas/pricing.html' },
      observation: { summary: 'Commercial pricing questions lack direct-extract definition passages under 75 words', evidence: ['EVD-ANS-001'] },
      remediation: { preferred: 'Restructure FAQ headings with immediate concise copular answer passages' },
      verification: { detector_to_rerun: 'ANS-001', method: 'Passage length and question-answer extraction test' },
      ice_score: 11.0,
    },
    {
      finding_id: 'F-SCHEMA-FAQ-001',
      detector_id: 'SCHEMA-001',
      discipline: ['schema'],
      classification: { severity: 'medium', confidence: 'deterministic' },
      subject: { identifier: 'https://example.test/pricing', url: 'https://example.test/pricing' },
      observation: { summary: 'Commercial FAQ content lacks FAQPage JSON-LD schema markup', evidence: ['EVD-SCH-001'] },
      remediation: { preferred: 'Deploy validated Schema.org FAQPage structured data' },
      verification: { detector_to_rerun: 'SCHEMA-001', method: 'JSON-LD schema validation gate' },
      ice_score: 9.5,
    },
    {
      finding_id: 'F-EXP-GEO-999',
      detector_id: 'EXP-GEO-999',
      discipline: ['geo'],
      classification: { severity: 'low', confidence: 'experimental', finding_type: 'experimental' },
      subject: { identifier: 'https://unrelated-blog.test/post-1', url: 'https://unrelated-blog.test/post-1' },
      observation: { summary: 'Speculative model hallucination on third-party forum', evidence: [] },
      remediation: { preferred: 'Consult external legal counsel regarding public forum sentiment' },
      ice_score: 2.0,
    },
  ];
}

/**
 * Generate an Enterprise-Grade Statement of Work (SOW) from SEO, AEO, GEO, SERP, and CRO findings.
 * Forces strict downward traceability: Evidence -> Obligation -> Acceptance Test.
 */
export async function generateSow(root, {
  target,
  baseUrl,
  refDate,
  runId,
  live = false,
  sample = false,
  demo = false,
  draft = false,
  findings: inputFindings = null,
  client = 'Acme Corporation',
  clientContact = 'client-procurement@acme.test',
  supplier = 'Nebula Components & Citable Practice',
  supplierContact = 'advisory@nebulacomponents.test',
  budget = 45000,
  budgetMinor = null,
  termDays = 90,
  inScopeProperties = [],
  scopeMode = 'HOST_AND_SUBDOMAINS',
  minIceScore = 8.0,
  allowedDisciplines = ['seo', 'aeo', 'geo', 'technical', 'schema', 'entity', 'cro'],
  allowExperimental = false,
  excludedDetectors = [],
  roleMapping = null,
  sowId = null,
} = {}) {
  const generatedAt = nowIso();
  const sowIdentifier = sowId || `SOW-${Date.now().toString(36).toUpperCase()}`;
  const isSample = Boolean(sample || demo);
  const isDraft = Boolean(draft);
  const generationMode = isSample ? 'NON_CONTRACTUAL_SAMPLE' : (isDraft ? 'DRAFT' : 'CONTRACTUAL');

  let findings = [];
  let sourceProvenance = {
    source_type: null,
    source_identifier: null,
    findings_count: 0,
    integrity_hash: null,
  };

  let resolved;
  try {
    resolved = await resolveEvidenceSource(root, {
      findings: inputFindings,
      runId,
      target,
      live,
      baseUrl,
      refDate,
      sample,
      demo,
      draft,
      scopes: ['technical', 'seo', 'aeo', 'geo', 'schema', 'entity', 'cro'],
    });
  } catch (err) {
    if (err.code === 'RUN_NOT_FOUND') {
      throw new RunNotFoundError(runId);
    }
    if (err.code === 'FINDINGS_MISSING') {
      throw new FindingsMissingError(runId, err.details?.filePath);
    }
    if (err.code === 'FINDINGS_INVALID') {
      throw new FindingsInvalidError(runId, err.message);
    }
    if (err.code === 'LIVE_INSPECTION_FAILED') {
      throw new LiveInspectionFailedError(target, err.message);
    }
    if (err.code === 'NO_FINDINGS') {
      const srcDesc = target ? `live target "${target}"` : (runId ? `run "${runId}"` : 'local workspace');
      throw new NoFindingsError(srcDesc);
    }
    throw err;
  }

  findings = resolved.findings;
  sourceProvenance = {
    source_type: resolved.source_type,
    source_identifier: resolved.source_identifier,
    findings_count: resolved.findings_count,
    integrity_hash: resolved.integrity_hash,
  };

  // If no findings were discovered:
  if (!Array.isArray(findings) || findings.length === 0) {
    if (isSample) {
      findings = getSampleBaselineFindings();
      sourceProvenance.source_type = 'SAMPLE_BASELINE';
      sourceProvenance.source_identifier = 'citable://samples/enterprise-baseline';
      sourceProvenance.findings_count = findings.length;
    } else {
      const srcDesc = target ? `live target "${target}"` : (runId ? `run "${runId}"` : 'local workspace');
      throw new NoFindingsError(srcDesc);
    }
  }

  if (generationMode === 'CONTRACTUAL') {
    if (!client || typeof client !== 'string' || client.trim() === '') {
      throw new SowError('Contractual SOW requires explicit client name', 'INVALID_COMMERCIAL_TERMS');
    }
    if (budget === null && budgetMinor === null) {
      throw new SowError('Contractual SOW requires explicit budget or budgetMinor', 'INVALID_COMMERCIAL_TERMS');
    }
    if (!termDays || termDays <= 0 || !Number.isFinite(termDays)) {
      throw new SowError('Contractual SOW requires positive finite termDays', 'INVALID_COMMERCIAL_TERMS');
    }
  }

  let effectiveScopeProps = inScopeProperties.length > 0 ? [...inScopeProperties] : [];
  if (effectiveScopeProps.length === 0) {
    if (baseUrl) {
      effectiveScopeProps.push(baseUrl);
    } else if (target && typeof target === 'string' && target.startsWith('http')) {
      effectiveScopeProps.push(target);
    } else if (isSample) {
      effectiveScopeProps.push('https://example.test');
    } else {
      // Derive from finding subjects
      for (const f of findings) {
        const s = f.subject?.identifier || f.subject?.url || (typeof f.subject === 'string' ? f.subject : null);
        if (s) {
          try {
            const u = new URL(s.includes('://') ? s : `https://${s}`);
            if (!effectiveScopeProps.includes(u.origin)) {
              effectiveScopeProps.push(u.origin);
            }
          } catch {}
        }
      }
    }
  }

  if (generationMode === 'CONTRACTUAL' && effectiveScopeProps.length === 0) {
    throw new SowError('Contractual SOW requires explicit inScopeProperties or derivable target properties', 'SCOPE_REQUIRED');
  }

  // -------------------------------------------------------------
  // THE ADMISSIBILITY GATE (Filter findings into contractual scope)
  // -------------------------------------------------------------
  const gateResult = evaluateScopeAdmissibility(findings, {
    inScopeProperties: effectiveScopeProps,
    scopeMode,
    minIceScore,
    allowedDisciplines,
    allowExperimental,
    excludedDetectors,
    roleMapping,
    rejectTemplateDefaultOwner: generationMode === 'CONTRACTUAL',
  });

  const admitted = gateResult.admitted_requirements;
  if (admitted.length === 0) {
    throw new NoAdmissibleRequirementsError(findings.length, gateResult.refusal_log.length);
  }

  // Group admitted requirements into Work Packages
  const wpMap = new Map();
  for (const item of admitted) {
    if (!wpMap.has(item.work_package_id)) {
      wpMap.set(item.work_package_id, {
        work_package_id: item.work_package_id,
        name: item.work_package_name,
        deliverable_id: item.deliverable_id,
        owner: item.owner,
        requirements: [],
      });
    }
    wpMap.get(item.work_package_id).requirements.push(item);
  }
  const workPackages = Array.from(wpMap.values());

  // 25. THE FINAL TRACEABILITY MATRIX
  // Mapping Finding -> Recommendation -> SOW Requirement -> Deliverable -> Acceptance Test -> Owner -> Evidence
  const traceabilityMatrix = admitted.map((item) => ({
    finding_id: item.finding_id,
    detector_id: item.detector_id,
    recommendation: item.recommendation,
    sow_requirement_id: item.sow_requirement_id,
    work_package_id: item.work_package_id,
    deliverable_id: item.deliverable_id,
    acceptance_test_id: item.acceptance_test_id,
    owner: item.owner,
    owner_source: item.owner_source,
    owner_mapping_version: item.owner_mapping_version,
    evidence_id: item.evidence_id,
    evidence_ids: item.evidence_ids,
    severity: item.severity,
    target_subject: item.subject,
    acceptance_criteria: item.acceptance_test,
    acceptance_basis: item.acceptance_basis || 'automated_detector_rerun',
  }));

  // Deliverables definitions
  const deliverables = workPackages.map((wp) => ({
    deliverable_id: wp.deliverable_id,
    work_package_id: wp.work_package_id,
    title: `${wp.name} Implementation & Verification Package`,
    artifact_type: 'Code Patches, AST Snapshots, and Evidence Package',
    format: 'Git Pull Request + JSON Verification Receipt',
    owner: wp.owner,
    delivery_criteria: `All ${wp.requirements.length} requirements must pass automated verification (exit code 0) with zero regressions on Core Web Vitals.`,
  }));

  // Acceptance criteria definitions
  const acceptanceCriteria = admitted.map((item) => ({
    acceptance_test_id: item.acceptance_test_id,
    sow_requirement_id: item.sow_requirement_id,
    test_description: item.acceptance_test,
    validation_method: 'citable verify remediation closed-loop command',
    pass_threshold: '100% detector defect resolution on audited surface',
    evidence_required: `Deterministic before-and-after observation JSON matching ${item.evidence_id}`,
  }));

  // Commercial structure with deterministic integer minor-unit arithmetic
  const { feeMinor, feeUsd, currency, minorUnitExponent } = parseCommercialBudget({ budget, budgetMinor });
  const milestoneFeesMinor = allocateMilestoneFees(feeMinor, workPackages.length);
  const milestoneFeesUsd = milestoneFeesMinor.map((m) => Number((m / 100).toFixed(2)));
  const commercialMilestones = workPackages.map((wp, idx) => ({
    milestone_id: `MILESTONE-0${idx + 1}`,
    work_package_id: wp.work_package_id,
    name: wp.name,
    fee_minor: milestoneFeesMinor[idx],
    fee_usd: milestoneFeesUsd[idx],
    billing_trigger: `Successful customer acceptance sign-off of Deliverable ${wp.deliverable_id}`,
    target_delivery_week: (idx + 1) * 3,
  }));

  const sowTitle = isSample
    ? 'Statement of Work: Enterprise Search & Conversion Intelligence Engineering [DEMONSTRATION SAMPLE]'
    : (isDraft
      ? 'Statement of Work: Enterprise Search & Conversion Intelligence Engineering [DRAFT]'
      : 'Statement of Work: Enterprise Search & Conversion Intelligence Engineering');

  const sow = {
    $schema: 'citable://schemas/sow.schema.json',
    sow_id: sowIdentifier,
    version: '1.0.0',
    generation_mode: generationMode,
    title: sowTitle,
    synthetic_evidence: isSample,
    client: { name: client, contact: clientContact },
    supplier: { name: supplier, contact: supplierContact },
    effective_date: generatedAt.split('T')[0],
    term_days: termDays,
    currency,
    currency_minor_unit_exponent: minorUnitExponent,
    commercial_total_fee_minor: feeMinor,
    commercial_total_fee_usd: feeUsd,

    // Pillar 1: Executive Scope Statement
    executive_scope: {
      business_objective: 'Eliminate deterministic technical search and conversion friction, establish AEO/GEO answer extraction architecture, and deploy governed CRO design remediations with verifiable evidence.',
      in_scope_properties: effectiveScopeProps,
      in_scope_systems: ['Web Front-End Codebase', 'CMS Rendering Layer', 'Search & Conversion Analytics (GSC, GA4, PostHog)', 'Edge Middleware / Reverse Proxy'],
      channels: ['Organic Search (Google, Bing)', 'AI Answer Engines (Perplexity, ChatGPT, Copilot)', 'Direct Conversion Funnels'],
      geographies: ['Global', 'North America (US/CA)', 'European Union (GDPR-compliant surfaces)'],
      organizational_boundaries: 'Applies strictly to customer-owned digital production surfaces; excludes third-party partner portals and non-contracted subdomains.',
    },

    // Pillar 2: Evidence-to-Work Traceability & Admissibility Gate
    admissibility_gate: {
      total_findings_evaluated: gateResult.summary.total_evaluated,
      admitted_count: gateResult.summary.admitted_count,
      refused_count: gateResult.summary.refused_count,
      admissibility_rate_pct: gateResult.summary.admissibility_rate_pct,
      refusal_log: gateResult.refusal_log,
      methodology: 'Admissibility Gate evaluates findings against 6 strict tests: Evidence Maturity, Scope Boundary, Technical Feasibility, Commercial Materiality, Measurable Acceptance, and Ownership Clarity.',
    },

    // Pillar 3: Explicit Assumptions, Dependencies, Exclusions & Constraints
    assumptions_and_constraints: {
      assumptions: [
        'Customer maintains active version control via GitHub or GitLab with standard pull-request workflow.',
        'Staging environment provides parity with production infrastructure for pre-release verification testing.',
        'Audited search and conversion telemetry represents normal operating seasonality.',
      ],
      dependencies: [
        'Customer delivers read-only credentials to Google Search Console and GA4 within 5 business days of effective date.',
        'Customer engineering performs technical reviews and merges approved pull requests within 48 hours of verification receipt.',
      ],
      exclusions: [
        'Paid media ad buy management or advertising budget spend.',
        'Complete brand identity overhaul or custom creative video production.',
        'Legal, privacy, or regulatory compliance counsel (medical, financial, GDPR legal defense).',
        'Refactoring core backend transactional databases or proprietary billing engines.',
      ],
      constraints: [
        'Zero deployment downtime allowed during production release windows.',
        'Zero regression permitted on Core Web Vitals (Mobile LCP <= 2.5s, CLS <= 0.10, INP <= 200ms).',
      ],
      unresolved_unknowns: [
        'In-memory citation query volume from ChatGPT search (requires server-side log ingestion phase).',
        'Post-cookie-consent degradation on regional EU mobile conversions.',
      ],
    },

    // Pillar 4: Prioritized Work Packages
    work_packages: workPackages,

    // Pillar 5: Detailed Deliverables
    deliverables,

    // Pillar 6: Technical Implementation Requirements
    technical_requirements: {
      supported_frameworks: ['React', 'Next.js', 'Vue', 'Nuxt', 'HTML5/Tailwind', 'Astro'],
      git_branching_model: 'citable/remediation-<finding-id>',
      rollback_mechanism: 'Automated atomic snapshot generated in .citable/remediation/snapshots/ prior to file modification',
      access_requirements: ['Read-only git repository access', 'Read-only GSC/GA4 analytics access', 'Staging deploy preview access'],
    },

    // Pillar 7: Acceptance Criteria
    acceptance_criteria: acceptanceCriteria,

    // Pillar 8: Baseline & Target-State Metrics
    baseline_and_target_metrics: {
      disclaimer: 'Metrics represent technical readiness, friction eradication, and modeled index targets. In adherence to Citable governance, this SOW never warrants guaranteed ranking or revenue volumes.',
      metrics: [
        { metric: 'Core Web Vitals Render-Blockers', baseline: '1 blocker', target: '0 blockers', validation: 'Lighthouse / static CWV sweep' },
        { metric: 'HTML5 Autocomplete Form Coverage', baseline: '32%', target: '100%', validation: 'AST form field inspection' },
        { metric: 'AEO Direct Answer Extraction Score', baseline: '58 / 100', target: '>= 80 / 100', validation: 'citable inspect readiness' },
        { metric: 'Checkout Distraction Leaks', baseline: '14 header links', target: '0 links (Enclosed)', validation: 'DOM link count' },
      ],
    },

    // Pillar 9: Experiment Specifications
    experiment_specifications: {
      standard: 'Two-tailed hypothesis testing (alpha = 0.05, 80% statistical power)',
      stopping_criteria: 'Minimum 14 calendar days lock; mandatory daily Sample Ratio Mismatch (SRM) Chi-Square check (p < 0.001 terminates test)',
      guardrails: [
        'SEO Retention: Variant must preserve all canonical tags, JSON-LD structured data, and meta robots tags',
        'Performance Guardrail: Mobile LCP must not degrade by > 250ms; CLS must remain <= 0.10',
      ],
    },

    // Pillar 10: Roles & RACI Matrix
    raci_matrix: [
      { role: 'Customer Executive Sponsor', r: 'Approve SOW, sign off commercial milestones, resolve executive escalations', raci: 'Accountable (A)' },
      { role: 'Customer Lead Engineer', r: 'Review code pull requests, grant repository access, execute production deploy', raci: 'Responsible (R)' },
      { role: 'Supplier Principal Architect', r: 'Design AST patches, author verification receipts, direct technical delivery', raci: 'Responsible (R)' },
      { role: 'Supplier QA & Governance Lead', r: 'Execute admissibility gate, validate acceptance criteria, maintain evidence packages', raci: 'Consulted (C)' },
    ],

    // Pillar 11: Customer Obligations
    customer_obligations: [
      'Provide authorized read-only API access to required search and analytics tools within 5 business days.',
      'Review and respond to delivered Pull Requests and verification packages within 48 business hours.',
      'Maintain staging environment availability for automated closed-loop verification probes.',
    ],

    // Pillar 12: Delivery Sequencing & Milestone Schedule
    delivery_schedule: {
      total_duration_weeks: Math.ceil(termDays / 7),
      milestones: commercialMilestones,
    },

    // Pillar 13: Scope Change-Control Process
    change_control_process: {
      procedure: 'Any expansion of in-scope systems, addition of new domains, or changes to accepted requirements requires a written Scope Change Request (SCR).',
      authorization: 'SCR must be signed by Customer Executive Sponsor and Supplier Practice Lead before work begins.',
      superceding_rules: 'Superseded requirements are archived in .citable/sow/history/ with reason code and date.',
    },

    // Pillar 14: Risk Register
    risk_register: [
      { id: 'RISK-01', category: 'deployment', description: 'Customer deployment freeze during holiday quarter delays PR merges', mitigation: 'Schedule staging verification ahead of freeze; stage patches in feature flags' },
      { id: 'RISK-02', category: 'platform', description: 'Search engine or AI answer engine algorithmic updates shift third-party citation UI', mitigation: 'Focus on deterministic schema and direct entity corroboration rather than transient UI exploits' },
      { id: 'RISK-03', category: 'srm_contamination', description: 'Paid ad campaign sudden burst contaminates running A/B test cohort', mitigation: 'Enforce UTM parameter isolation and SRM daily monitoring' },
    ],

    // Pillar 15: Data Governance Requirements
    data_governance: {
      authorized_sources: ['Audited customer DOM', 'Search Console telemetry', 'Public AI search observation endpoints'],
      retention_period: '90 days post-completion, followed by immutable archive',
      processing_purpose: 'Exclusively for fulfilling contracted SOW engineering and verification obligations',
      deletion_upon_termination: 'Supplier will delete all customer source code clones within 14 calendar days of contract completion',
    },

    // Pillar 16: Security & Privacy Requirements
    security_requirements: [
      'Zero plaintext credentials stored; all authentication managed via environment variable tokens (credential_env).',
      'Least privilege: Supplier requires only read-only repository and analytics access.',
      'No customer PII (personally identifiable customer data) will be stored, processed, or logged.',
      'Incident notification: Any suspected security anomaly reported to customer security within 24 hours.',
    ],

    // Pillar 17: Platform & Third-Party Dependency Statement
    platform_dependencies: [
      'Customer acknowledges that third-party search engines (Google, Bing) and AI platforms (OpenAI, Anthropic, Perplexity) operate autonomously. Supplier cannot control, and does not warrant, unilateral external algorithm modifications.',
    ],

    // Pillar 18: Quality Assurance & Validation Plan
    qa_plan: {
      methodology: 'Three-tier verification: (1) Static AST patch linting, (2) Closed-loop detector rerun, (3) Visual screenshot layout regression check.',
      evidence_package: 'Every accepted deliverable includes a cryptographic SHA-256 hash-locked verification envelope.',
    },

    // Pillar 19: Reporting Cadence & Governance Model
    governance_model: {
      weekly_sync: '30-minute sprint progress and blocker resolution call',
      written_reports: 'Bi-weekly status dashboard and updated traceability matrix',
      decision_logging: 'All material technical decisions logged to .citable/decisions/',
    },

    // Pillar 20: Commercial Structure
    commercial_terms: {
      total_fixed_fee_minor: feeMinor,
      total_fixed_fee_usd: feeUsd,
      currency,
      payment_terms: 'Net 30 upon verified deliverable acceptance',
      milestones: commercialMilestones,
    },

    // Pillar 21: Out-of-Scope Section
    out_of_scope: [
      'Writing bespoke corporate PR press releases or off-site guest blogging.',
      'Modifying legacy subdomains not explicitly enumerated in Executive Scope.',
      'Purchasing media ad credits, paid backlinks, or advertising inventory.',
      'Providing legal counsel regarding privacy regulations or intellectual property.',
    ],

    // Pillar 22: Warranty & Remediation Terms
    warranty_terms: {
      warranty_window_days: 30,
      defect_definition: 'A defect is strictly defined as a failure of an accepted deliverable to satisfy its explicit Acceptance Criteria test upon rerun under unchanged baseline conditions.',
      exclusion: 'Defects caused by subsequent customer code modifications, third-party library updates, or external platform outages are excluded.',
    },

    // Pillar 23: Completion & Operational Handoff
    completion_and_handoff: {
      handoff_assets: [
        'Merged and verified Git Pull Requests',
        'Signed Acceptance Certificates for each Work Package',
        'Immutable Evidence Package and Cryptographic Verification Envelope',
        'Developer Documentation & Runbook for ongoing automated maintenance',
      ],
      operational_signoff: 'Final operational transfer completed upon customer tech lead sign-off.',
    },

    // Pillar 24: Exit & Termination Provisions
    termination_provisions: {
      convenience: 'Either party may terminate upon 14 calendar days written notice.',
      compensation: 'Customer shall compensate Supplier for all completed and accepted deliverables plus pro-rata work in progress up to notice date.',
      asset_transfer: 'Supplier delivers all completed patches and evidence packages generated up to the termination effective date.',
    },

    // Pillar 25: The Final Traceability Matrix
    traceability_matrix: traceabilityMatrix,

    // Machine-readable Provenance Envelope
    generation_provenance: {
      generated_at: generatedAt,
      generator_version: '1.18.2',
      generation_mode: generationMode,
      source_type: sourceProvenance.source_type || 'UNKNOWN',
      source_identifier: sourceProvenance.source_identifier || null,
      source_findings_count: sourceProvenance.findings_count,
      findings_integrity_hash: sourceProvenance.integrity_hash || null,
      synthetic_evidence: isSample,
    },
  };

  validateSowInvariants(sow);

  return sow;
}

/**
 * Render Statement of Work as GitHub-flavored Markdown
 */
export function renderSowMarkdown(sow) {
  const modeBanner = sow.generation_mode === 'NON_CONTRACTUAL_SAMPLE'
    ? '> ⚠️ **NON-CONTRACTUAL DEMONSTRATION SAMPLE**: This document was generated with synthetic audit baseline findings for evaluation and demonstration purposes. It does NOT represent a binding contractual obligation or live audit evidence.'
    : (sow.generation_mode === 'DRAFT'
      ? '> 📝 **DRAFT STATEMENT OF WORK**: This preliminary draft contains unfinalized engagement terms and requirements. Final executive approval required prior to signature.'
      : '> **Contractual Principle**: This Statement of Work forces strict downward traceability from documented audit evidence to contractual obligation, and from obligation to verifiable acceptance. Findings are admitted strictly through a formal Admissibility Gate. In adherence to Citable governance principles, **no search rankings, AI citations, or conversion revenues are guaranteed**; fees are tied exclusively to objective deliverable acceptance.');

  const lines = [
    `# ${sow.title}`,
    `====================================================================`,
    `- **SOW ID**: \`${sow.sow_id}\` | **Version**: \`${sow.version}\` | **Mode**: \`${sow.generation_mode}\``,
    `- **Client**: **${sow.client.name}** (${sow.client.contact})`,
    `- **Supplier**: **${sow.supplier.name}** (${sow.supplier.contact})`,
    `- **Effective Date**: \`${sow.effective_date}\` | **Term**: \`${sow.term_days} calendar days\``,
    `- **Commercial Total**: **$${sow.commercial_total_fee_usd.toLocaleString('en-US', { minimumFractionDigits: (sow.commercial_total_fee_minor % 100 === 0) ? 0 : 2, maximumFractionDigits: 2 })} USD**`,
    `- **Audit Source**: \`${sow.generation_provenance.source_type}\` (${sow.generation_provenance.source_identifier || 'N/A'}) | **Generator**: \`v${sow.generation_provenance.generator_version}\``,
    ``,
    modeBanner,
    ``,
    `---`,
    `## 1. Executive Scope Statement`,
    `- **Core Business Objective**: ${sow.executive_scope.business_objective}`,
    `- **In-Scope Digital Properties**: ${sow.executive_scope.in_scope_properties.join(', ')}`,
    `- **In-Scope Systems**: ${sow.executive_scope.in_scope_systems.join('; ')}`,
    `- **Contracted Channels**: ${sow.executive_scope.channels.join(', ')}`,
    `- **Geographies & Jurisdictions**: ${sow.executive_scope.geographies.join(', ')}`,
    `- **Organizational Boundary**: ${sow.executive_scope.organizational_boundaries}`,
    ``,
    `## 2. Scope Admissibility Gate (Evidence-to-Work Filter)`,
    `- **Total Audit Findings Evaluated**: ${sow.admissibility_gate.total_findings_evaluated}`,
    `- **Admitted Contractual Requirements**: **${sow.admissibility_gate.admitted_count}** (${sow.admissibility_gate.admissibility_rate_pct}% admission rate)`,
    `- **Refused / Excluded Findings**: **${sow.admissibility_gate.refused_count}** (preventing unverified or exploratory creep)`,
    ``,
    `### Refused & Deferred Findings Log:`,
    `| Finding ID | Subject | Gate Failed | Refusal Code | Contractual Rationale |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...(sow.admissibility_gate.refusal_log.length > 0
      ? sow.admissibility_gate.refusal_log.map((r) => `| \`${r.finding_id}\` | \`${r.subject}\` | \`${r.gate_failed}\` | \`${r.refusal_code}\` | ${r.refusal_rationale.slice(0, 75)}... |`)
      : ['| None | N/A | N/A | N/A | All evaluated findings met strict admissibility criteria |']),
    ``,
    `## 3. Assumptions, Dependencies, Exclusions & Constraints`,
    `### Explicit Assumptions:`,
    ...sow.assumptions_and_constraints.assumptions.map((a) => `- ${a}`),
    `### Key Dependencies:`,
    ...sow.assumptions_and_constraints.dependencies.map((d) => `- ${d}`),
    `### Known Constraints:`,
    ...sow.assumptions_and_constraints.constraints.map((c) => `- ${c}`),
    `### Unresolved Unknowns:`,
    ...sow.assumptions_and_constraints.unresolved_unknowns.map((u) => `- [?] ${u}`),
    ``,
    `## 4. Prioritized Work Packages (Derived from ICE-BV)`,
    ...sow.work_packages.map((wp) => `### ${wp.work_package_id}: ${wp.name}\n- **Owner**: \`${wp.owner}\`\n- **Deliverable Binding**: \`${wp.deliverable_id}\`\n- **Requirements Count**: ${wp.requirements.length} requirement(s)`),
    ``,
    `## 5. Detailed Deliverables & Delivery Criteria`,
    `| Deliverable ID | Title | Artifact Type | Format | Delivery & Acceptance Criteria |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.deliverables.map((d) => `| **${d.deliverable_id}** | ${d.title} | \`${d.artifact_type}\` | ${d.format} | ${d.delivery_criteria} |`),
    ``,
    `## 6. Technical Implementation Requirements`,
    `- **Supported Frameworks**: ${sow.technical_requirements.supported_frameworks.join(', ')}`,
    `- **Branching Model**: \`${sow.technical_requirements.git_branching_model}\``,
    `- **Rollback Safeguard**: ${sow.technical_requirements.rollback_mechanism}`,
    ``,
    `## 7. Acceptance Criteria & Objective Verification Methods`,
    `| Test ID | SOW Requirement | Validation Method | Pass / Fail Threshold | Required Evidence |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.acceptance_criteria.map((a) => `| **${a.acceptance_test_id}** | \`${a.sow_requirement_id}\` | \`${a.validation_method}\` | ${a.pass_threshold} | ${a.evidence_required} |`),
    ``,
    `## 8. Baseline & Target-State Metrics (Non-Guarantee Disclosure)`,
    `> *${sow.baseline_and_target_metrics.disclaimer}*`,
    ``,
    `| Dimension | Baseline State | Contracted Target State | Objective Verification |`,
    `| :--- | :--- | :--- | :--- |`,
    ...sow.baseline_and_target_metrics.metrics.map((m) => `| ${m.metric} | **${m.baseline}** | **${m.target}** | \`${m.validation}\` |`),
    ``,
    `## 9. Governed Experiment Specifications`,
    `- **Statistical Standard**: ${sow.experiment_specifications.standard}`,
    `- **Stopping & Guardrails**: ${sow.experiment_specifications.stopping_criteria}`,
    ...sow.experiment_specifications.guardrails.map((g) => `- ${g}`),
    ``,
    `## 10. Roles & RACI Matrix`,
    `| Role | Responsibility Description | RACI Designation |`,
    `| :--- | :--- | :--- |`,
    ...sow.raci_matrix.map((r) => `| **${r.role}** | ${r.r} | **${r.raci}** |`),
    ``,
    `## 11. Customer Obligations & SLAs`,
    ...sow.customer_obligations.map((o) => `- ${o}`),
    ``,
    `## 12. Delivery Sequencing & Milestone Schedule`,
    `| Milestone | Work Package | Target Week | Fee (USD) | Acceptance Trigger |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.delivery_schedule.milestones.map((m) => `| **${m.milestone_id}** | \`${m.work_package_id}\` | Week ${m.target_delivery_week} | **$${m.fee_usd.toLocaleString('en-US', { minimumFractionDigits: (m.fee_minor % 100 === 0) ? 0 : 2, maximumFractionDigits: 2 })}** | ${m.billing_trigger} |`),
    ``,
    `## 13. Scope Change-Control Process`,
    `- **Procedure**: ${sow.change_control_process.procedure}`,
    `- **Authorization**: ${sow.change_control_process.authorization}`,
    `- **Superseded Controls**: ${sow.change_control_process.superceding_rules}`,
    ``,
    `## 14. Risk & Dependency Register`,
    `| Risk ID | Category | Risk Description | Planned Mitigation |`,
    `| :--- | :--- | :--- | :--- |`,
    ...sow.risk_register.map((r) => `| **${r.id}** | \`${r.category}\` | ${r.description} | ${r.mitigation} |`),
    ``,
    `## 15. Data Governance & Information Handling`,
    `- **Authorized Sources**: ${sow.data_governance.authorized_sources.join(', ')}`,
    `- **Retention & Purging**: ${sow.data_governance.retention_period}; ${sow.data_governance.deletion_upon_termination}`,
    ``,
    `## 16. Security & Privacy Safeguards`,
    ...sow.security_requirements.map((s) => `- ${s}`),
    ``,
    `## 17. Platform & Third-Party Dependency Disclosures`,
    ...sow.platform_dependencies.map((p) => `> ${p}`),
    ``,
    `## 18. Quality Assurance & Validation Plan`,
    `- **QA Methodology**: ${sow.qa_plan.methodology}`,
    `- **Evidence Integrity**: ${sow.qa_plan.evidence_package}`,
    ``,
    `## 19. Governance Cadence & Reporting Model`,
    `- **Weekly Sync**: ${sow.governance_model.weekly_sync}`,
    `- **Status Reports**: ${sow.governance_model.written_reports}`,
    `- **Decision Records**: ${sow.governance_model.decision_logging}`,
    ``,
    `## 20. Commercial Terms & Payment Schedule`,
    `- **Total Contract Value**: **$${sow.commercial_terms.total_fixed_fee_usd.toLocaleString('en-US', { minimumFractionDigits: (sow.commercial_terms.total_fixed_fee_minor % 100 === 0) ? 0 : 2, maximumFractionDigits: 2 })} USD**`,
    `- **Terms**: ${sow.commercial_terms.payment_terms}`,
    ``,
    `## 21. Explicit Out-of-Scope Declarations`,
    ...sow.out_of_scope.map((item) => `- [x] **OUT OF SCOPE**: ${item}`),
    ``,
    `## 22. Warranty & Remediation Terms`,
    `- **Warranty Period**: **${sow.warranty_terms.warranty_window_days} calendar days** following written deliverable acceptance.`,
    `- **Defect Standard**: ${sow.warranty_terms.defect_definition}`,
    `- **Warranty Exclusions**: ${sow.warranty_terms.exclusion}`,
    ``,
    `## 23. Completion & Operational Handoff`,
    `### Required Deliverable Handoff Assets:`,
    ...sow.completion_and_handoff.handoff_assets.map((h) => `- [x] ${h}`),
    ``,
    `## 24. Exit, Transition & Termination Provisions`,
    `- **Termination for Convenience**: ${sow.termination_provisions.convenience}`,
    `- **Accrued Compensation**: ${sow.termination_provisions.compensation}`,
    `- **Asset Return**: ${sow.termination_provisions.asset_transfer}`,
    ``,
    `---`,
    `## 25. THE FINAL TRACEABILITY MATRIX`,
    `### Finding → Recommendation → SOW Requirement → Deliverable → Acceptance Test → Owner → Evidence`,
    ``,
    `| Finding ID | Recommendation | SOW Req ID | Deliverable ID | Acceptance Test ID | Responsible Owner | Source Evidence |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
    ...sow.traceability_matrix.map((t) => `| **\`${t.finding_id}\`** | ${t.recommendation.slice(0, 45)}... | **\`${t.sow_requirement_id}\`** | \`${t.deliverable_id}\` | \`${t.acceptance_test_id}\` | ${t.owner} | \`${t.evidence_ids?.join(', ') || t.evidence_id}\` |`),
    ``,
    `---`,
    `### Contract Execution & Authorization`,
    ``,
    `| On Behalf of Customer: ${sow.client.name} | On Behalf of Supplier: ${sow.supplier.name} |`,
    `| :--- | :--- |`,
    `| Signature: __________________________________ | Signature: __________________________________ |`,
    `| Name: _____________________________________ | Name: _____________________________________ |`,
    `| Title: ______________________________________ | Title: ______________________________________ |`,
    `| Date: _______________________________________ | Date: _______________________________________ |`,
  ];

  return lines.join('\n');
}

/**
 * Render Statement of Work as Standalone Enterprise HTML
 */
export function renderSowHtml(sow) {
  const isSample = sow.generation_mode === 'NON_CONTRACTUAL_SAMPLE';
  const isDraft = sow.generation_mode === 'DRAFT';
  const badgeColor = isSample ? 'var(--warning)' : (isDraft ? 'var(--accent)' : 'var(--success)');
  const modeNotice = isSample
    ? '<div class="disclosure" style="border-left-color:var(--warning); background:rgba(210,153,34,0.15);"><strong style="color:var(--warning);">DEMONSTRATION SAMPLE NOTICE:</strong> This Statement of Work contains synthetic audit baseline findings for evaluation and demonstration purposes. It does NOT represent a binding contractual obligation or live audit evidence.</div>'
    : (isDraft
      ? '<div class="disclosure"><strong style="color:var(--accent);">DRAFT ENGAGEMENT NOTICE:</strong> This document represents a preliminary draft with unfinalized commercial parameters. Final executive sign-off required prior to contract binding.</div>'
      : '<div class="disclosure"><strong>Enterprise Statement of Work Governance Notice:</strong> This agreement binds supplier fees exclusively to verified deliverable acceptance and closed-loop test execution. In compliance with Citable governance standards, <strong>no search engine ranking, AI citation presence, or commercial conversion revenue outcomes are guaranteed</strong>.</div>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(sow.title)} - ${escapeHtml(sow.sow_id)}</title>
  <style>
    :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --accent: #58a6ff; --danger: #f85149; --warning: #d29922; --success: #3fb950; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; margin: 0; padding: 40px 20px; }
    .container { max-width: 1180px; margin: 0 auto; }
    header { border-bottom: 2px solid var(--border); padding-bottom: 24px; margin-bottom: 32px; }
    h1 { font-size: 28px; margin: 0 0 10px 0; color: #fff; }
    .sow-badge { background: ${badgeColor}; color: #000; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: bold; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 18px; }
    .card-val { font-size: 26px; font-weight: bold; color: #fff; margin-top: 4px; }
    .disclosure { background: rgba(56, 139, 253, 0.1); border-left: 4px solid var(--accent); padding: 14px 18px; border-radius: 4px; font-size: 13px; margin: 24px 0; }
    .section-title { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 36px 0 16px 0; color: #fff; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: var(--card); border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { background: #21262d; color: #8b949e; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-admit { background: rgba(63, 185, 80, 0.2); color: var(--success); }
    .badge-refuse { background: rgba(248, 81, 73, 0.2); color: var(--danger); }
    .code-ref { font-family: monospace; color: var(--accent); background: rgba(88, 166, 255, 0.15); padding: 2px 5px; border-radius: 3px; }
    .sig-table { margin-top: 40px; }
    .sig-table td { height: 60px; vertical-align: top; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h1>${escapeHtml(sow.title)}</h1>
        <div>
          <span class="sow-badge">${escapeHtml(sow.generation_mode)}</span>
          <span class="sow-badge" style="background:#1f6feb; color:#fff; margin-left:8px;">${escapeHtml(sow.sow_id)}</span>
        </div>
      </div>
      <div style="color:#8b949e; font-size:14px; margin-top:8px;">
        Client: <strong>${escapeHtml(sow.client.name)}</strong> &nbsp;|&nbsp; Supplier: <strong>${escapeHtml(sow.supplier.name)}</strong> &nbsp;|&nbsp; Term: <strong>${escapeHtml(String(sow.term_days))} Days</strong> &nbsp;|&nbsp; Effective: <strong>${escapeHtml(sow.effective_date)}</strong> &nbsp;|&nbsp; Source: <strong>${escapeHtml(sow.generation_provenance.source_type)}</strong>
      </div>
    </header>

    ${modeNotice}

    <div class="meta-grid">
      <div class="card"><div>Total Contract Fee</div><div class="card-val">$${sow.commercial_total_fee_usd.toLocaleString('en-US', { minimumFractionDigits: (sow.commercial_total_fee_minor % 100 === 0) ? 0 : 2, maximumFractionDigits: 2 })}</div></div>
      <div class="card"><div>Admitted SOW Requirements</div><div class="card-val">${sow.admissibility_gate.admitted_count}</div></div>
      <div class="card"><div>Refused / Excluded Scope</div><div class="card-val" style="color:var(--danger);">${sow.admissibility_gate.refused_count}</div></div>
      <div class="card"><div>Contracted Work Packages</div><div class="card-val">${sow.work_packages.length}</div></div>
    </div>

    <h2 class="section-title">1. Executive Scope Statement</h2>
    <div class="card">
      <p><strong>Objective:</strong> ${escapeHtml(sow.executive_scope.business_objective)}</p>
      <p><strong>In-Scope Properties:</strong> <code>${escapeHtml(sow.executive_scope.in_scope_properties.join(', '))}</code></p>
      <p><strong>In-Scope Systems:</strong> ${escapeHtml(sow.executive_scope.in_scope_systems.join('; '))}</p>
      <p><strong>Boundaries:</strong> ${escapeHtml(sow.executive_scope.organizational_boundaries)}</p>
    </div>

    <h2 class="section-title">2. Scope Admissibility Gate & Excluded Findings Log</h2>
    <table>
      <thead>
        <tr><th>Finding ID</th><th>Subject</th><th>Gate Failed</th><th>Refusal Code</th><th>Contractual Refusal Rationale</th></tr>
      </thead>
      <tbody>
        ${sow.admissibility_gate.refusal_log.map((r) => `
          <tr>
            <td><span class="code-ref">${escapeHtml(r.finding_id)}</span></td>
            <td>${escapeHtml(r.subject)}</td>
            <td><code>${escapeHtml(r.gate_failed)}</code></td>
            <td><span class="badge badge-refuse">${escapeHtml(r.refusal_code)}</span></td>
            <td>${escapeHtml(r.refusal_rationale)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">3. Contracted Deliverables & Milestone Payment Schedule</h2>
    <table>
      <thead>
        <tr><th>Milestone</th><th>Work Package</th><th>Deliverable ID</th><th>Delivery Criteria</th><th>Milestone Fee</th></tr>
      </thead>
      <tbody>
        ${sow.delivery_schedule.milestones.map((m) => `
          <tr>
            <td><strong>${escapeHtml(m.milestone_id)}</strong></td>
            <td>${escapeHtml(m.name)}</td>
            <td><span class="code-ref">${escapeHtml(m.work_package_id)}</span></td>
            <td>${escapeHtml(m.billing_trigger)}</td>
            <td style="font-weight:bold; color:var(--success);">$${m.fee_usd.toLocaleString('en-US', { minimumFractionDigits: (m.fee_minor % 100 === 0) ? 0 : 2, maximumFractionDigits: 2 })} USD</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">25. The Final Traceability Matrix</h2>
    <p style="color:#8b949e; font-size:13px;">Proving exactly why work is performed, what must be delivered, who owns it, how it will be validated, and what evidence justifies it.</p>
    <table>
      <thead>
        <tr><th>Finding ID</th><th>Recommendation</th><th>SOW Req ID</th><th>Deliverable</th><th>Acceptance Test ID</th><th>Responsible Owner</th><th>Source Evidence</th></tr>
      </thead>
      <tbody>
        ${sow.traceability_matrix.map((t) => `
          <tr>
            <td><span class="code-ref">${escapeHtml(t.finding_id)}</span></td>
            <td>${escapeHtml(t.recommendation)}</td>
            <td><strong>${escapeHtml(t.sow_requirement_id)}</strong></td>
            <td>${escapeHtml(t.deliverable_id)}</td>
            <td><code>${escapeHtml(t.acceptance_test_id)}</code></td>
            <td>${escapeHtml(t.owner)}</td>
            <td><span class="code-ref">${escapeHtml(t.evidence_ids?.join(', ') || t.evidence_id)}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">Signatures & Contractual Authorization</h2>
    <table class="sig-table">
      <thead>
        <tr><th>For Customer: ${escapeHtml(sow.client.name)}</th><th>For Supplier: ${escapeHtml(sow.supplier.name)}</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <br>Signature: _______________________________<br><br>
            Name: __________________________________<br><br>
            Title: ___________________________________<br><br>
            Date: ____________________________________
          </td>
          <td>
            <br>Signature: _______________________________<br><br>
            Name: __________________________________<br><br>
            Title: ___________________________________<br><br>
            Date: ____________________________________
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Export SOW deliverable to filesystem or string with strict schema validation
 */
export async function exportSow(root, options = {}) {
  const sow = await generateSow(root, options);
  const validation = validateAgainst('sow.schema.json', sow);
  if (!validation.valid) {
    throw new SowError(`Generated SOW violates schemas/sow.schema.json: ${validation.errors.join('; ')}`, 'SCHEMA_VALIDATION_FAILED');
  }

  const format = options.format || 'markdown';
  let content = '';

  if (format === 'html' || format === 'html-brief') {
    content = renderSowHtml(sow);
  } else if (format === 'json') {
    content = JSON.stringify(sow, null, 2);
  } else {
    content = renderSowMarkdown(sow);
  }

  let outputPath = null;
  if (options.output) {
    outputPath = path.resolve(root, options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
  }

  return {
    sow_id: sow.sow_id,
    title: sow.title,
    client: sow.client,
    supplier: sow.supplier,
    format,
    output_path: outputPath,
    content,
    data: sow,
  };
}
