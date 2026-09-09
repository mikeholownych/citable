import { safePath } from '../detectors/framework.js';

/**
 * Enterprise Scope Admissibility Gate
 *
 * Filters raw SEO, AEO, GEO, SERP, and CRO findings into contractually admissible
 * work packages, explicitly refusing findings that are exploratory, unverified,
 * economically unjustified, out of organizational boundary, or lack testable acceptance.
 */
export function evaluateScopeAdmissibility(findings = [], {
  inScopeProperties = [],
  minIceScore = 8.0,
  allowedDisciplines = ['seo', 'aeo', 'geo', 'technical', 'schema', 'entity', 'cro'],
  allowExperimental = false,
  excludedDetectors = [],
} = {}) {
  const admitted = [];
  const refused = [];

  let reqIndex = 1;
  let testIndex = 1;

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const detectorId = f.detector_id || `FINDING-${i + 1}`;
    const subject = f.subject?.identifier || f.subject?.url || '/';
    const severity = f.classification?.severity || 'medium';
    const confidence = f.classification?.confidence || 'observed';
    const evidenceList = f.observation?.evidence || [];
    const remediation = f.remediation?.preferred || '';

    // Gate 1: Excluded detectors / explicitly blacklisted checks
    if (excludedDetectors.includes(detectorId)) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'excluded_detector',
        refusal_code: 'REFUSE-EXCLUDED',
        refusal_rationale: `Detector ${detectorId} is explicitly excluded from contracted SOW delivery scope.`,
        suggested_handling: 'Track in internal backlog; execute under separate advisory engagement.',
      });
      continue;
    }

    // Gate 2: Evidence Maturity Gate
    if (!allowExperimental && (confidence === 'experimental' || f.classification?.finding_type === 'experimental')) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'evidence_maturity',
        refusal_code: 'REFUSE-EXPERIMENTAL',
        refusal_rationale: 'Finding is experimental and lacks deterministic, reproducible evidence. Enterprise SOW requires established empirical certainty.',
        suggested_handling: 'Run controlled observation probes before considering for contractual obligation.',
      });
      continue;
    }

    if (evidenceList.length === 0) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'evidence_maturity',
        refusal_code: 'REFUSE-NO-EVIDENCE',
        refusal_rationale: 'Finding contains no documented supporting evidence in audit package. Cannot contract work without verifiable evidence.',
        suggested_handling: 'Re-audit target with full evidence collection enabled.',
      });
      continue;
    }

    // Gate 3: Scope Boundary Gate
    if (inScopeProperties.length > 0) {
      const isInScope = inScopeProperties.some((prop) => {
        const pStem = prop.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
        const sStem = subject.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
        return sStem.includes(pStem) || pStem.includes(sStem);
      });

      if (!isInScope) {
        refused.push({
          finding_id: detectorId,
          subject,
          gate_failed: 'scope_boundary',
          refusal_code: 'REFUSE-OUT-OF-SCOPE',
          refusal_rationale: `Subject "${subject}" is outside declared contractual in-scope properties (${inScopeProperties.join(', ')}).`,
          suggested_handling: 'Submit Scope Change Request (SCR) to expand in-scope property boundary.',
        });
        continue;
      }
    }

    // Gate 4: Technical Feasibility & Remediation Safety
    if (!remediation || remediation.toLowerCase().includes('consult external legal') || remediation.toLowerCase().includes('out of scope')) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'technical_feasibility',
        refusal_code: 'REFUSE-UNFEASIBLE-REMEDIATION',
        refusal_rationale: 'Finding requires external legal advice or lacks defined engineering remediation method.',
        suggested_handling: 'Refer to customer legal counsel; exclude from engineering delivery.',
      });
      continue;
    }

    // Gate 5: Commercial Materiality & ICE-BV Gate
    // High & critical severity are automatically material; medium/low must meet ICE threshold or be key conversion/vitals defects
    const isCoreSeverity = ['critical', 'high'].includes(severity);
    const isVitalsOrFunnel = ['TECH-001', 'TECH-002', 'CRO-001', 'CRO-002', 'CRO-005', 'CRO-006', 'CRO-007', 'CRO-013', 'CRO-021', 'SCHEMA-001'].includes(detectorId);
    const iceScore = f.ice_score || (isCoreSeverity ? 12 : 6);

    if (!isCoreSeverity && !isVitalsOrFunnel && iceScore < minIceScore) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'commercial_materiality',
        refusal_code: 'REFUSE-LOW-MATERIALITY',
        refusal_rationale: `Finding has low severity (${severity}) and ICE score (${iceScore} < ${minIceScore}), failing economic justification threshold for core SOW fee envelope.`,
        suggested_handling: 'Defer to customer internal operations backlog or future optimization phase.',
      });
      continue;
    }

    // Gate 6: Objectively Testable Acceptance Gate
    const rerunDetector = f.verification?.detector_to_rerun || detectorId;
    if (!rerunDetector && !f.verification?.method) {
      refused.push({
        finding_id: detectorId,
        subject,
        gate_failed: 'measurable_acceptance',
        refusal_code: 'REFUSE-UNVERIFIABLE',
        refusal_rationale: 'Finding lacks an automated verification rerun detector or objective pass/fail validation method.',
        suggested_handling: 'Define deterministic verification criteria before adding to contractual scope.',
      });
      continue;
    }

    // Passed All 6 Gates -> Admitted to Contractual SOW Scope
    const discipline = (f.discipline?.[0] || detectorId.split('-')[0] || 'TECH').toUpperCase();
    let wpId = 'WP-TECH-01';
    let wpName = 'Technical Search & Performance Infrastructure';
    let deliverableId = 'DELIV-01';
    let owner = 'Supplier Engineering Lead';

    if (discipline === 'CRO' || detectorId.startsWith('CRO-')) {
      wpId = 'WP-CRO-02';
      wpName = 'Conversion Funnel & Offer Architecture Optimization';
      deliverableId = 'DELIV-02';
      owner = 'Supplier CRO Architect';
    } else if (discipline === 'AEO' || discipline === 'GEO' || discipline === 'ANS') {
      wpId = 'WP-AEO-03';
      wpName = 'Answer-Engine (AEO) & Generative Search Extraction';
      deliverableId = 'DELIV-03';
      owner = 'Supplier Discovery Specialist';
    } else if (discipline === 'SCHEMA' || discipline === 'ENTITY') {
      wpId = 'WP-SCHEMA-04';
      wpName = 'Structured Data & Entity Knowledge Graph Architecture';
      deliverableId = 'DELIV-04';
      owner = 'Supplier Data Engineer';
    }

    const sowReqId = `REQ-SOW-${String(reqIndex++).padStart(3, '0')}`;
    const accTestId = `ACC-TEST-${String(testIndex++).padStart(3, '0')}`;
    const evidenceId = evidenceList[0] || `EVD-OBS-${detectorId}`;

    admitted.push({
      finding_id: detectorId,
      sow_requirement_id: sowReqId,
      work_package_id: wpId,
      work_package_name: wpName,
      deliverable_id: deliverableId,
      acceptance_test_id: accTestId,
      subject,
      severity,
      confidence,
      recommendation: remediation,
      acceptance_test: `Execute closed-loop verification: citable verify remediation --finding ${detectorId} --target ${subject} (Expect status: RESOLVED, zero regressions)`,
      owner,
      evidence_id: evidenceId,
      commercial_priority: isCoreSeverity ? 'P1_CRITICAL' : 'P2_HIGH_VALUE',
      ice_bv_score: iceScore,
    });
  }

  return {
    fact_status: 'admissibility_gate_evaluated',
    summary: {
      total_evaluated: findings.length,
      admitted_count: admitted.length,
      refused_count: refused.length,
      admissibility_rate_pct: findings.length > 0 ? Math.round((admitted.length / findings.length) * 100) : 0,
    },
    admitted_requirements: admitted,
    refusal_log: refused,
  };
}
