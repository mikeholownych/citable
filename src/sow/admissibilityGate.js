/**
 * Enterprise Scope Admissibility Gate
 *
 * Filters raw SEO, AEO, GEO, SERP, and CRO findings into contractually admissible
 * work packages, explicitly refusing findings that are exploratory, unverified,
 * economically unjustified, out of organizational boundary, or lack testable acceptance.
 */

export const DEFAULT_ROLE_MAPPINGS = {
  TECH: 'Supplier Engineering Lead',
  TECHNICAL: 'Supplier Engineering Lead',
  CRO: 'Supplier CRO Architect',
  AEO: 'Supplier Discovery Specialist',
  ANS: 'Supplier Discovery Specialist',
  GEO: 'Supplier Discovery Specialist',
  SCHEMA: 'Supplier Data Engineer',
  ENTITY: 'Supplier Data Engineer',
  SEO: 'Supplier Search Strategist',
};

/**
 * Check whether a target subject falls within declared in-scope properties.
 *
 * Supported scope modes:
 * - 'HOST_AND_SUBDOMAINS' (default): matches host and any subdomains
 * - 'HOST': matches exact host only
 * - 'EXACT_ORIGIN': matches exact scheme + host + port
 * - 'PATH_PREFIX': matches host/subdomain and path prefix
 * - 'EXACT_RESOURCE': matches exact host and path
 */
export function checkScopeBoundary(subject, inScopeProperties = [], scopeMode = 'HOST_AND_SUBDOMAINS') {
  if (!inScopeProperties || inScopeProperties.length === 0) return true;
  if (!subject) return false;

  const subjectStr = typeof subject === 'string' ? subject : (subject.url || subject.identifier || '');
  if (!subjectStr) return false;

  const isRelative = !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|^\/\//.test(subjectStr);

  for (const prop of inScopeProperties) {
    let propUrl;
    try {
      propUrl = new URL(prop.includes('://') ? prop : `https://${prop}`);
    } catch {
      continue;
    }
    const propHost = propUrl.hostname.toLowerCase();
    const propPath = propUrl.pathname.replace(/\/+$/, '');

    if (isRelative) {
      if (scopeMode === 'PATH_PREFIX') {
        const normSubj = subjectStr.startsWith('/') ? subjectStr : `/${subjectStr}`;
        if (normSubj.startsWith(propPath || '/')) return true;
      } else if (scopeMode === 'EXACT_RESOURCE') {
        const normSubj = subjectStr.startsWith('/') ? subjectStr : `/${subjectStr}`;
        if (normSubj === (propPath || '/')) return true;
      } else {
        return true;
      }
      continue;
    }

    let subjUrl;
    try {
      subjUrl = new URL(subjectStr);
    } catch {
      continue;
    }

    const subjHost = subjUrl.hostname.toLowerCase();
    const subjPath = subjUrl.pathname.replace(/\/+$/, '');

    switch (scopeMode) {
      case 'EXACT_ORIGIN':
        if (subjUrl.origin.toLowerCase() === propUrl.origin.toLowerCase()) return true;
        break;
      case 'HOST':
        if (subjHost === propHost) return true;
        break;
      case 'HOST_AND_SUBDOMAINS':
        if (subjHost === propHost || subjHost.endsWith(`.${propHost}`)) return true;
        break;
      case 'PATH_PREFIX':
        if ((subjHost === propHost || subjHost.endsWith(`.${propHost}`)) &&
            (subjPath === propPath || subjPath.startsWith(`${propPath}/`))) return true;
        break;
      case 'EXACT_RESOURCE':
        if (subjHost === propHost && subjPath === propPath) return true;
        break;
      default:
        if (subjHost === propHost || subjHost.endsWith(`.${propHost}`)) return true;
    }
  }

  return false;
}

export function evaluateScopeAdmissibility(findings = [], {
  inScopeProperties = [],
  scopeMode = 'HOST_AND_SUBDOMAINS',
  minIceScore = 8.0,
  allowedDisciplines = ['seo', 'aeo', 'geo', 'technical', 'schema', 'entity', 'cro'],
  allowExperimental = false,
  excludedDetectors = [],
  roleMapping = null,
  ownerMappingVersion = '1.0',
  rejectTemplateDefaultOwner = false,
} = {}) {
  const admitted = [];
  const refused = [];

  let reqIndex = 1;
  let testIndex = 1;
  const seenFindingIds = new Map();

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const subject = f.subject?.identifier || f.subject?.url || (typeof f.subject === 'string' ? f.subject : '/');
    const detectorId = f.detector_id || (f.finding_id ? f.finding_id.replace(/^F-/, '') : `FINDING-${i + 1}`);

    const rawFindingId = f.finding_id || f.id || f.detector_id || `FINDING-${i + 1}`;
    let findingId = rawFindingId;
    if (seenFindingIds.has(rawFindingId)) {
      const count = seenFindingIds.get(rawFindingId) + 1;
      seenFindingIds.set(rawFindingId, count);
      findingId = `${rawFindingId}:${subject || count}`;
    } else {
      seenFindingIds.set(rawFindingId, 1);
    }

    const severity = f.classification?.severity || 'medium';
    const confidence = f.classification?.confidence || 'observed';
    const evidenceList = f.observation?.evidence || [];
    const remediation = f.remediation?.preferred || (typeof f.remediation === 'string' ? f.remediation : '');

    // Gate 1: Excluded detectors / explicitly blacklisted checks
    if (excludedDetectors.includes(detectorId) || excludedDetectors.includes(findingId)) {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
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
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'evidence_maturity',
        refusal_code: 'REFUSE-EXPERIMENTAL',
        refusal_rationale: 'Finding is experimental and lacks deterministic, reproducible evidence. Enterprise SOW requires established empirical certainty.',
        suggested_handling: 'Run controlled observation probes before considering for contractual obligation.',
      });
      continue;
    }

    if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'evidence_maturity',
        refusal_code: 'REFUSE-NO-EVIDENCE',
        refusal_rationale: 'Finding contains no documented supporting evidence in audit package. Cannot contract work without verifiable evidence.',
        suggested_handling: 'Re-audit target with full evidence collection enabled.',
      });
      continue;
    }

    // Gate 4: Scope Boundary Gate
    if (inScopeProperties.length > 0) {
      const inScope = checkScopeBoundary(f.subject || subject, inScopeProperties, scopeMode);
      if (!inScope) {
        refused.push({
          finding_id: findingId,
          detector_id: detectorId,
          subject,
          gate_failed: 'scope_boundary',
          refusal_code: 'REFUSE-OUT-OF-SCOPE',
          refusal_rationale: `Subject "${subject}" is outside declared contractual in-scope properties (${inScopeProperties.join(', ')}).`,
          suggested_handling: 'Submit Scope Change Request (SCR) to expand in-scope property boundary.',
        });
        continue;
      }
    }

    // Gate 5: Technical Feasibility & Remediation Safety
    const remLower = remediation.toLowerCase();
    if (!remediation || remLower.includes('consult external legal') || remLower.includes('out of scope') || remLower.includes('unfeasible')) {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'technical_feasibility',
        refusal_code: 'REFUSE-UNFEASIBLE-REMEDIATION',
        refusal_rationale: 'Finding requires external legal advice, lacks defined engineering remediation method, or is declared technically unfeasible.',
        suggested_handling: 'Refer to customer legal counsel or appropriate third party; exclude from engineering delivery.',
      });
      continue;
    }

    // Gate 6: Commercial Materiality & ICE-BV Gate
    const isCoreSeverity = ['critical', 'high'].includes(severity.toLowerCase());
    const isVitalsOrFunnel = ['TECH-001', 'TECH-002', 'CRO-001', 'CRO-002', 'CRO-005', 'CRO-006', 'CRO-007', 'CRO-013', 'CRO-021', 'SCHEMA-001'].includes(detectorId);
    const iceScore = typeof f.ice_score === 'number' ? f.ice_score : (isCoreSeverity ? 12 : 6);

    if (!isCoreSeverity && !isVitalsOrFunnel && iceScore < minIceScore) {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'commercial_materiality',
        refusal_code: 'REFUSE-LOW-MATERIALITY',
        refusal_rationale: `Finding has low severity (${severity}) and ICE score (${iceScore} < ${minIceScore}), failing economic justification threshold for core SOW fee envelope.`,
        suggested_handling: 'Defer to customer internal operations backlog or future optimization phase.',
      });
      continue;
    }

    // Gate 7: Objectively Testable Acceptance Gate
    const hasVerification = Boolean(
      f.verification?.detector_to_rerun ||
      f.verification?.method ||
      f.verification?.acceptance_test
    );

    if (!hasVerification) {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'measurable_acceptance',
        refusal_code: 'REFUSE-UNVERIFIABLE',
        refusal_rationale: 'Finding lacks an automated verification rerun detector or objective pass/fail validation method.',
        suggested_handling: 'Define deterministic verification criteria before adding to contractual scope.',
      });
      continue;
    }

    // Gate 8: Ownership Clarity Gate
    const effectiveRoles = { ...DEFAULT_ROLE_MAPPINGS, ...(roleMapping || {}) };
    const disciplineKey = (f.discipline?.[0] || detectorId.split('-')[0] || 'TECH').toUpperCase();

    let resolvedOwner = null;
    let ownerSource = null;

    if (f.delivery_owner && f.delivery_owner !== 'UNRESOLVED') {
      resolvedOwner = f.delivery_owner;
      ownerSource = 'finding.delivery_owner';
    } else if (f.remediation?.owner && f.remediation.owner !== 'UNRESOLVED') {
      resolvedOwner = f.remediation.owner;
      ownerSource = 'finding.remediation.owner';
    } else if (f.owner && f.owner !== 'UNRESOLVED') {
      resolvedOwner = f.owner;
      ownerSource = 'finding.owner';
    } else if (roleMapping && (roleMapping[disciplineKey] || roleMapping[detectorId])) {
      resolvedOwner = roleMapping[disciplineKey] || roleMapping[detectorId];
      ownerSource = 'engagement_role_mapping';
    } else if (effectiveRoles[disciplineKey] && effectiveRoles[disciplineKey] !== 'UNRESOLVED') {
      resolvedOwner = effectiveRoles[disciplineKey];
      ownerSource = 'built_in_template_default';
    } else if (effectiveRoles[detectorId] && effectiveRoles[detectorId] !== 'UNRESOLVED') {
      resolvedOwner = effectiveRoles[detectorId];
      ownerSource = 'built_in_template_default';
    }

    if (!resolvedOwner || resolvedOwner === 'UNRESOLVED' || resolvedOwner.toLowerCase() === 'unassigned') {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'ownership_clarity',
        refusal_code: 'REFUSE-OWNER-UNRESOLVED',
        refusal_rationale: `Responsible delivery owner could not be resolved for finding ${findingId} (discipline: ${disciplineKey}).`,
        suggested_handling: 'Specify delivery_owner on finding or map discipline to accountable delivery role in SOW configuration.',
      });
      continue;
    }

    if (rejectTemplateDefaultOwner && ownerSource === 'built_in_template_default') {
      refused.push({
        finding_id: findingId,
        detector_id: detectorId,
        subject,
        gate_failed: 'ownership_clarity',
        refusal_code: 'REFUSE-TEMPLATE-DEFAULT-OWNER',
        refusal_rationale: `Responsible delivery owner for finding ${findingId} relies on built-in template default. Contractual SOW requires an explicit finding owner or engagement role mapping.`,
        suggested_handling: 'Specify delivery_owner on finding or map discipline in engagement role mapping.',
      });
      continue;
    }

    // Gate 8b: Discipline Authorization Gate
    const rawDisciplines = Array.isArray(f.discipline)
      ? f.discipline
      : (f.discipline ? [f.discipline] : [detectorId.split('-')[0]]);
    const findingDisciplines = rawDisciplines.map((d) => String(d).toLowerCase());

    if (allowedDisciplines && allowedDisciplines.length > 0) {
      const normAllowed = allowedDisciplines.map((d) => String(d).toLowerCase());
      const isAuthorized = findingDisciplines.some((d) => normAllowed.includes(d));
      if (!isAuthorized) {
        refused.push({
          finding_id: findingId,
          detector_id: detectorId,
          subject,
          gate_failed: 'discipline_authorization',
          refusal_code: 'REFUSE-DISCIPLINE-NOT-AUTHORIZED',
          refusal_rationale: `Discipline (${findingDisciplines.join(', ')}) is not authorized under contracted delivery disciplines (${allowedDisciplines.join(', ')}).`,
          suggested_handling: 'Expand authorized disciplines in SOW engagement terms or contract under separate statement of work.',
        });
        continue;
      }
    }

    // Passed all gates -> Admitted to Contractual SOW Scope
    let wpId = 'WP-TECH-01';
    let wpName = 'Technical Search & Performance Infrastructure';
    let deliverableId = 'DELIV-01';

    if (disciplineKey === 'CRO' || detectorId.startsWith('CRO-')) {
      wpId = 'WP-CRO-02';
      wpName = 'Conversion Funnel & Offer Architecture Optimization';
      deliverableId = 'DELIV-02';
    } else if (disciplineKey === 'AEO' || disciplineKey === 'GEO' || disciplineKey === 'ANS') {
      wpId = 'WP-AEO-03';
      wpName = 'Answer-Engine (AEO) & Generative Search Extraction';
      deliverableId = 'DELIV-03';
    } else if (disciplineKey === 'SCHEMA' || disciplineKey === 'ENTITY') {
      wpId = 'WP-SCHEMA-04';
      wpName = 'Structured Data & Entity Knowledge Graph Architecture';
      deliverableId = 'DELIV-04';
    }

    const sowReqId = `REQ-SOW-${String(reqIndex++).padStart(3, '0')}`;
    const accTestId = `ACC-TEST-${String(testIndex++).padStart(3, '0')}`;
    const evidenceId = evidenceList[0];
    const detectorToRerun = f.verification?.detector_to_rerun || detectorId;

    admitted.push({
      finding_id: findingId,
      detector_id: detectorId,
      sow_requirement_id: sowReqId,
      work_package_id: wpId,
      work_package_name: wpName,
      deliverable_id: deliverableId,
      acceptance_test_id: accTestId,
      subject,
      severity,
      confidence,
      recommendation: remediation,
      acceptance_test: f.verification?.acceptance_test || `Execute closed-loop verification: citable verify remediation --finding ${detectorToRerun} --target ${subject} (Expect status: RESOLVED, zero regressions)`,
      acceptance_basis: f.verification?.method ? 'empirical_verification_method' : (f.verification?.detector_to_rerun ? 'automated_detector_rerun' : 'deterministic_remediation_test'),
      owner: resolvedOwner,
      owner_source: ownerSource,
      owner_mapping_version: ownerMappingVersion,
      evidence_id: evidenceId,
      evidence_ids: [...evidenceList],
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
