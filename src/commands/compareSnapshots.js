import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';
import { normalizeUrlIdentity } from '../crawler/urlIdentity.js';

export const COMPARISON_STATES = Object.freeze([
  'persisted', 'resolved', 'new', 'changed', 'not_comparable', 'not_reobserved', 'indeterminate',
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
    return { findings: readJson(path.join(dir, 'findings.json')), manifest: readJson(path.join(dir, 'manifest.json')), coverage: loadCoverage(dir) };
  };
  const a = load(runA); const b = load(runB);
  const comparability = comparabilityFor(a, b);
  const aFindings = a.findings;
  const bFindings = b.findings;
  const matchedA = new Set();
  const result = {
    runA, runB, baseline_timestamp: a.manifest.timestamp, comparison_timestamp: b.manifest.timestamp,
    regressions: [], resolved: [], persisting: [], new: [], changed: [], not_comparable: [], not_reobserved: [], indeterminate: [],
    comparability,
  };
  for (const finding of bFindings) {
    const priorIndex = aFindings.findIndex((candidate, index) => !matchedA.has(index)
      && candidate.detector_id === finding.detector_id && sameResourceIdentity(candidate, finding));
    const prior = priorIndex >= 0 ? aFindings[priorIndex] : null;
    if (priorIndex >= 0) matchedA.add(priorIndex);
    if (!prior) {
      const item = withState(finding, 'new', 'finding_not_present_in_baseline');
      result.new.push(item); result.regressions.push(item); continue;
    }
    if (!comparability.comparable) result.not_comparable.push(withState(finding, 'not_comparable', 'run_envelopes_not_comparable'));
    else if (JSON.stringify(prior.observation) !== JSON.stringify(finding.observation)) result.changed.push(withState(finding, 'changed', 'finding_observation_changed'));
    else result.persisting.push(withState(finding, 'persisted', 'finding_observation_persisted'));
  }
  for (let index = 0; index < aFindings.length; index += 1) {
    const finding = aFindings[index];
    if (matchedA.has(index)) continue;
    if (!comparability.comparable) { result.not_comparable.push(withState(finding, 'not_comparable', 'run_envelopes_not_comparable')); continue; }
    const state = assessReobservation(finding, b.coverage);
    const item = withState(finding, state.state, state.reason, {
      resource: state.resource?.normalized_url || null, comparison_coverage_status: b.coverage?.coverage_status || 'not_available',
    });
    if (state.state === 'resolved') result.resolved.push(item);
    else if (state.state === 'indeterminate') result.indeterminate.push(item);
    else result.not_reobserved.push(item);
  }
  result.summary = {
    new_findings: result.new.length, changed_findings: result.changed.length, resolved_findings: result.resolved.length,
    persisting_findings: result.persisting.length, not_comparable_findings: result.not_comparable.length,
    not_reobserved_findings: result.not_reobserved.length, indeterminate_findings: result.indeterminate.length,
    regression_critical_or_high: result.regressions.filter((f) => ['critical', 'high'].includes(f.classification?.severity)).length,
  };
  return result;
}
