import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';
import { loadVerifiedRun } from '../shared/verifiedRunLoader.js';
import { normalizeUrlIdentity } from '../crawler/urlIdentity.js';
import { TRANSITION_TYPES, DETERMINATION_STATUS } from '../conditions/constants.js';
import { compareScoreEnvelopes } from '../conditions/scoring.js';

export const COMPARISON_STATES = Object.freeze([
  'persisted', 'resolved', 'new', 'changed', 'not_comparable', 'not_reobserved', 'indeterminate',
  'new_failure', 'regression', 'unchanged_failure', 'newly_applicable', 'no_longer_applicable',
]);

function normalizeCandidate(value) {
  if (!value) return null;
  try { return normalizeUrlIdentity(String(value)); } catch { return String(value); }
}

/** Keep effective/requested identity distinct; canonical is never fetch identity. */
export function resourceIdentityFor(findingOrPage) {
  const subject = findingOrPage?.subject || findingOrPage || {};
  const identity = subject.urlIdentity || subject.url_identity || {};
  const ids = new Set([
    subject.resource_id, identity.resource_id,
    subject.classification?.resource_id, subject.evaluation?.resource_id,
    ...(findingOrPage?.evidence_scope?.resource_ids || []),
  ].filter(Boolean).map(String));
  const requested = normalizeCandidate(identity.requested?.normalized_url || identity.requested?.url || subject.requested_url);
  const effective = normalizeCandidate(identity.effective?.normalized_url || identity.effective?.url
    || subject.effective_url || subject.normalized_url || subject.url || subject.identifier);
  const canonical = normalizeCandidate(identity.canonical?.normalized_url || identity.canonical?.url || subject.canonical_url);
  const fallback = new Set([requested, effective, normalizeCandidate(subject.url || subject.identifier)].filter(Boolean));
  return { resourceIds: ids, requested, effective, canonical, fallbackUrls: fallback };
}

export function sameResourceIdentity(left, right) {
  const a = resourceIdentityFor(left); const b = resourceIdentityFor(right);
  if (a.resourceIds.size && b.resourceIds.size) {
    return [...a.resourceIds].some((id) => b.resourceIds.has(id));
  }
  if (a.effective && b.effective) return a.effective === b.effective;
  if (a.requested && b.requested) return a.requested === b.requested;
  // URL fallback is allowed only when each side has exactly one candidate.
  return a.fallbackUrls.size === 1 && b.fallbackUrls.size === 1
    && [...a.fallbackUrls][0] === [...b.fallbackUrls][0];
}

function findingKey(finding) {
  const identity = resourceIdentityFor(finding);
  const id = identity.resourceIds.size ? [...identity.resourceIds].sort().join(',')
    : identity.effective || identity.requested || (identity.fallbackUrls.size === 1 ? [...identity.fallbackUrls][0] : JSON.stringify(finding?.subject || {}));
  return `${finding?.detector_id || ''}|${id}`;
}

function loadCoverage(dir) {
  const file = path.join(dir, 'coverage.json');
  return fs.existsSync(file) ? readJson(file) : null;
}

function coverageResource(coverage, finding) {
  if (!Array.isArray(coverage?.resources)) return null;
  const target = resourceIdentityFor(finding);
  const byId = coverage.resources.filter((resource) => {
    const ids = resourceIdentityFor(resource).resourceIds;
    return [...target.resourceIds].some((id) => ids.has(id));
  });
  if (target.resourceIds.size) return byId.length === 1 ? byId[0] : null;
  const byUrl = coverage.resources.filter((resource) => sameResourceIdentity(finding, resource));
  return byUrl.length === 1 ? byUrl[0] : null;
}

export function assessReobservation(finding, coverage) {
  if (!coverage) return { state: 'not_reobserved', reason: 'comparison_run_has_no_coverage_artifact' };
  const resource = coverageResource(coverage, finding);
  if (!resource) return { state: 'not_reobserved', reason: 'resource_not_reobserved_in_comparison_run' };
  if (['failed', 'indeterminate', 'unvisited', 'valid_but_unevaluated'].includes(resource.state)) {
    return { state: resource.state === 'indeterminate' ? 'indeterminate' : 'not_reobserved', reason: `resource_state_${resource.state}`, resource };
  }
  if (resource.state !== 'evaluated') return { state: 'not_reobserved', reason: `resource_state_${resource.state || 'unknown'}`, resource };
  if (finding?.evidence_scope?.requirement === 'exhaustive_requested_scope' && coverage.coverage_status !== 'complete') {
    return { state: 'indeterminate', reason: 'exhaustive_scope_coverage_incomplete', resource };
  }
  return { state: 'resolved', reason: 'resource_reobserved_with_sufficient_coverage', resource };
}

function changedKeys(left = {}, right = {}) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => left[key] !== right[key]);
}

function comparabilityFor(a, b) {
  const changeDimensions = {
    resource_changed: changedKeys(a.manifest.input_hashes, b.manifest.input_hashes),
    evidence_artifacts_changed: changedKeys(a.manifest.output_hashes, b.manifest.output_hashes),
    detector_set_changed: JSON.stringify(a.manifest.detectors_run) !== JSON.stringify(b.manifest.detectors_run),
    configuration_changed: a.manifest.configuration_hash !== b.manifest.configuration_hash,
    observation_method_changed: a.manifest.command !== b.manifest.command
      || JSON.stringify(a.manifest.argv) !== JSON.stringify(b.manifest.argv)
      || a.manifest.target?.kind !== b.manifest.target?.kind,
    tool_changed: a.manifest.tool_version !== b.manifest.tool_version,
    external_system_may_have_changed: a.manifest.target?.kind === 'url' || b.manifest.target?.kind === 'url',
  };
  return {
    comparable: !changeDimensions.detector_set_changed
      && !changeDimensions.configuration_changed
      && !changeDimensions.observation_method_changed
      && !changeDimensions.tool_changed,
    change_dimensions: changeDimensions,
    limitation: 'These dimensions identify observed differences between run envelopes; they do not establish what caused a finding change.',
  };
}

function safePath(url, base = 'https://example.test') {
  try {
    return new URL(url, base).pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

function findMatchingDetermination(determinations = [], detectorId, subject) {
  if (!Array.isArray(determinations) || !determinations.length) return null;
  let match = determinations.find((d) =>
    (d.condition_id === detectorId || d.detector_id === detectorId) &&
    d.subject?.identifier === subject?.identifier
  );
  if (match) return match;

  match = determinations.find((d) =>
    (d.condition_id === detectorId || d.detector_id === detectorId) &&
    sameResourceIdentity(d.subject, subject)
  );
  if (match) return match;

  if (subject?.type === 'site') {
    match = determinations.find((d) =>
      (d.condition_id === detectorId || d.detector_id === detectorId) &&
      d.subject?.type === 'site'
    );
    if (match) return match;
  }

  const subjPath = safePath(subject?.url || subject?.identifier);
  if (subjPath) {
    match = determinations.find((d) =>
      (d.condition_id === detectorId || d.detector_id === detectorId) &&
      safePath(d.subject?.url || d.subject?.identifier) === subjPath
    );
    if (match) return match;
  }

  return null;
}

function withState(finding, state, reason, extra = {}) {
  return { ...finding, comparison_state: state, comparison_provenance: { reason, ...extra } };
}

/** Compare findings only after checking that their responsible resource was reobserved. */
export function compareSnapshots(root, { runA, runB } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('no runs recorded yet');
  const runs = fs.readdirSync(runsDir).filter((r) => fs.existsSync(path.join(runsDir, r, 'findings.json'))).sort();
  if (!runA || !runB) {
    if (runs.length < 2) throw new Error(`need two runs with findings to compare; found ${runs.length}`);
    runB = runB ?? runs[runs.length - 1];
    runA = runA ?? runs[runs.length - 2];
  }
  const load = (runId) => {
    const dir = path.join(runsDir, runId);
    if (!fs.existsSync(path.join(dir, 'findings.json'))) throw new Error(`run ${runId} has no findings.json`);
    const loaded = loadVerifiedRun(dir, { requireCompletedExecution: false, allowLegacy: true, requireCoverage: false });
    const determinationsFile = path.join(dir, 'determinations.json');
    const determinations = fs.existsSync(determinationsFile) ? readJson(determinationsFile) : null;
    return {
      findings: loaded.findings,
      manifest: loaded.manifest,
      coverage: loaded.coverage,
      determinations,
      summary: loaded.summary,
    };
  };
  const a = load(runA); const b = load(runB);
  const comparability = comparabilityFor(a, b);
  const aFindings = a.findings;
  const bFindings = b.findings;

  const aDets = new Map();
  if (Array.isArray(a.determinations)) {
    for (const d of a.determinations) {
      aDets.set(`${d.condition_id || d.detector_id}::${d.subject?.identifier ?? ''}`, d);
    }
  }

  const bDets = new Map();
  if (Array.isArray(b.determinations)) {
    for (const d of b.determinations) {
      bDets.set(`${d.condition_id || d.detector_id}::${d.subject?.identifier ?? ''}`, d);
    }
  }

  const matchedA = new Set();
  const result = {
    runA, runB, baseline_timestamp: a.manifest.timestamp, comparison_timestamp: b.manifest.timestamp,
    regressions: [], resolved: [], persisting: [], new: [], changed: [], not_comparable: [], not_reobserved: [], indeterminate: [],
    new_failures: [], unchanged_failures: [], newly_applicable: [], no_longer_applicable: [], transitions: [],
    comparability,
  };

  for (const finding of bFindings) {
    const priorIndex = aFindings.findIndex((candidate, index) => !matchedA.has(index)
      && candidate.detector_id === finding.detector_id && sameResourceIdentity(candidate, finding));
    const prior = priorIndex >= 0 ? aFindings[priorIndex] : null;
    if (priorIndex >= 0) matchedA.add(priorIndex);

    const detKey = `${finding.detector_id}::${finding.subject?.identifier ?? ''}`;
    const detA = aDets.get(detKey) || findMatchingDetermination(a.determinations, finding.detector_id, finding.subject);
    const detB = bDets.get(detKey) || findMatchingDetermination(b.determinations, finding.detector_id, finding.subject);
    const statusB = detB ? detB.status : (finding.classification?.severity === 'warning' ? DETERMINATION_STATUS.WARNING : DETERMINATION_STATUS.FAIL);

    if (!prior) {
      // Finding was not present in baseline
      let transitionType;
      let reason;
      if (detA) {
        if (detA.status === DETERMINATION_STATUS.PASS) {
          transitionType = TRANSITION_TYPES.REGRESSION;
          reason = 'condition_passed_in_baseline_now_failing';
        } else if (detA.status === DETERMINATION_STATUS.NOT_APPLICABLE) {
          transitionType = TRANSITION_TYPES.NEWLY_APPLICABLE;
          reason = 'condition_not_applicable_in_baseline_now_failing';
        } else {
          transitionType = TRANSITION_TYPES.NEW_FAILURE;
          reason = `condition_status_${detA.status.toLowerCase()}_in_baseline`;
        }
      } else {
        // Reconstruct from coverage
        const resourceInA = coverageResource(a.coverage, finding);
        if (resourceInA && resourceInA.state === 'evaluated') {
          transitionType = TRANSITION_TYPES.REGRESSION;
          reason = 'condition_evaluated_without_finding_in_baseline';
        } else {
          transitionType = TRANSITION_TYPES.NEW_FAILURE;
          reason = 'finding_not_present_in_baseline';
        }
      }

      const item = withState(finding, transitionType.toLowerCase(), reason, { transition_type: transitionType });
      result.new.push(item);
      result.transitions.push({
        condition_id: finding.detector_id,
        detector_id: finding.detector_id,
        subject: finding.subject,
        from_status: detA ? detA.status : 'NOT_TESTED',
        to_status: statusB,
        transition_type: transitionType,
      });

      if (transitionType === TRANSITION_TYPES.REGRESSION) {
        result.regressions.push(item);
      } else if (transitionType === TRANSITION_TYPES.NEWLY_APPLICABLE) {
        result.newly_applicable.push(item);
      } else {
        result.new_failures.push(item);
      }
      continue;
    }

    // Finding was present in both runs -> UNCHANGED_FAILURE
    const fromStatus = detA ? detA.status : DETERMINATION_STATUS.FAIL;
    const transitionType = TRANSITION_TYPES.UNCHANGED_FAILURE;
    const item = withState(finding, 'unchanged_failure', 'finding_observation_persisted', { transition_type: transitionType });
    result.unchanged_failures.push(item);
    result.transitions.push({
      condition_id: finding.detector_id,
      detector_id: finding.detector_id,
      subject: finding.subject,
      from_status: fromStatus,
      to_status: statusB,
      transition_type: transitionType,
    });

    if (!comparability.comparable) {
      result.not_comparable.push(withState(finding, 'not_comparable', 'run_envelopes_not_comparable'));
    } else if (JSON.stringify(prior.observation) !== JSON.stringify(finding.observation)) {
      result.changed.push(withState(finding, 'changed', 'finding_observation_changed'));
    } else {
      result.persisting.push(withState(finding, 'persisted', 'finding_observation_persisted'));
    }
  }

  for (let index = 0; index < aFindings.length; index += 1) {
    const finding = aFindings[index];
    if (matchedA.has(index)) continue;
    if (!comparability.comparable) {
      result.not_comparable.push(withState(finding, 'not_comparable', 'run_envelopes_not_comparable'));
      continue;
    }

    const detKey = `${finding.detector_id}::${finding.subject?.identifier ?? ''}`;
    const detB = bDets.get(detKey) || findMatchingDetermination(b.determinations, finding.detector_id, finding.subject);

    if (detB && detB.status === DETERMINATION_STATUS.NOT_APPLICABLE) {
      const item = withState(finding, 'no_longer_applicable', 'condition_became_not_applicable', {
        transition_type: TRANSITION_TYPES.NO_LONGER_APPLICABLE,
      });
      result.no_longer_applicable.push(item);
      result.transitions.push({
        condition_id: finding.detector_id,
        detector_id: finding.detector_id,
        subject: finding.subject,
        from_status: DETERMINATION_STATUS.FAIL,
        to_status: DETERMINATION_STATUS.NOT_APPLICABLE,
        transition_type: TRANSITION_TYPES.NO_LONGER_APPLICABLE,
      });
      continue;
    }

    const state = assessReobservation(finding, b.coverage);
    const item = withState(finding, state.state, state.reason, {
      resource: state.resource?.normalized_url || null,
      comparison_coverage_status: b.coverage?.coverage_status || 'not_available',
      transition_type: state.state === 'resolved' ? TRANSITION_TYPES.RESOLVED : null,
    });
    if (state.state === 'resolved') {
      result.resolved.push(item);
      result.transitions.push({
        condition_id: finding.detector_id,
        detector_id: finding.detector_id,
        subject: finding.subject,
        from_status: DETERMINATION_STATUS.FAIL,
        to_status: DETERMINATION_STATUS.PASS,
        transition_type: TRANSITION_TYPES.RESOLVED,
      });
    } else if (state.state === 'indeterminate') {
      result.indeterminate.push(item);
    } else {
      result.not_reobserved.push(item);
    }
  }

  // Check for conditions that became NO_LONGER_APPLICABLE
  if (Array.isArray(b.determinations)) {
    for (const detB of b.determinations) {
      if (detB.status === DETERMINATION_STATUS.NOT_APPLICABLE) {
        const alreadyRecorded = result.transitions.some(
          (t) => (t.condition_id === detB.condition_id || t.detector_id === detB.detector_id)
            && t.subject?.identifier === detB.subject?.identifier
            && t.transition_type === TRANSITION_TYPES.NO_LONGER_APPLICABLE
        );
        if (alreadyRecorded) continue;

        const key = `${detB.condition_id || detB.detector_id}::${detB.subject?.identifier ?? ''}`;
        const detA = aDets.get(key) || findMatchingDetermination(a.determinations, detB.condition_id || detB.detector_id, detB.subject);
        if (detA && (detA.status === DETERMINATION_STATUS.FAIL || detA.status === DETERMINATION_STATUS.WARNING || detA.status === DETERMINATION_STATUS.PASS)) {
          const item = {
            condition_id: detB.condition_id,
            detector_id: detB.detector_id,
            subject: detB.subject,
            transition_type: TRANSITION_TYPES.NO_LONGER_APPLICABLE,
            comparison_state: 'no_longer_applicable',
            from_status: detA.status,
            to_status: detB.status,
          };
          result.no_longer_applicable.push(item);
          result.transitions.push({
            condition_id: detB.condition_id,
            detector_id: detB.detector_id,
            subject: detB.subject,
            from_status: detA.status,
            to_status: detB.status,
            transition_type: TRANSITION_TYPES.NO_LONGER_APPLICABLE,
          });
        }
      }
    }
  }

  // Scoring comparison (Wave 1: B-013)
  const scoreA = a.summary?.applicability_scoring;
  const scoreB = b.summary?.applicability_scoring;
  if (scoreA && scoreB) {
    result.scoring_comparison = compareScoreEnvelopes(scoreA, scoreB);
  }

  result.summary = {
    new_findings: result.new.length,
    new_failures: result.new_failures.length,
    regressions: result.regressions.length,
    changed_findings: result.changed.length,
    resolved_findings: result.resolved.length,
    persisting_findings: result.persisting.length,
    unchanged_failures: result.unchanged_failures.length,
    newly_applicable: result.newly_applicable.length,
    no_longer_applicable: result.no_longer_applicable.length,
    not_comparable_findings: result.not_comparable.length,
    not_reobserved_findings: result.not_reobserved.length,
    indeterminate_findings: result.indeterminate.length,
    regression_critical_or_high: result.regressions.filter((f) => ['critical', 'high'].includes(f.classification?.severity)).length,
  };
  return result;
}
