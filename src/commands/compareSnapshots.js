import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';
import { normalizeUrlIdentity } from '../crawler/urlIdentity.js';

export const COMPARISON_STATES = Object.freeze([
  'persisted', 'resolved', 'new', 'changed', 'not_comparable', 'not_reobserved', 'indeterminate',
]);

function subjectIdentity(finding) {
  const subject = finding?.subject || {};
  const raw = subject.url || subject.identifier || subject.source_file || null;
  if (!raw) return null;
  try { return normalizeUrlIdentity(String(raw)); } catch { return String(raw); }
}

function findingKey(finding) {
  return `${finding?.detector_id || ''}|${subjectIdentity(finding) || JSON.stringify(finding?.subject || {})}`;
}

function loadCoverage(dir) {
  const file = path.join(dir, 'coverage.json');
  return fs.existsSync(file) ? readJson(file) : null;
}

function coverageResource(coverage, finding) {
  const identity = subjectIdentity(finding);
  if (!identity || !Array.isArray(coverage?.resources)) return null;
  return coverage.resources.find((resource) => {
    const candidate = resource?.normalized_url || resource?.url;
    if (!candidate) return false;
    try { return normalizeUrlIdentity(String(candidate)) === identity; } catch { return String(candidate) === identity; }
  }) || null;
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
  const aFindings = new Map(a.findings.map((f) => [findingKey(f), f]));
  const bFindings = new Map(b.findings.map((f) => [findingKey(f), f]));
  const result = {
    runA, runB, baseline_timestamp: a.manifest.timestamp, comparison_timestamp: b.manifest.timestamp,
    regressions: [], resolved: [], persisting: [], new: [], changed: [], not_comparable: [], not_reobserved: [], indeterminate: [],
    comparability,
  };
  for (const [key, finding] of bFindings) {
    const prior = aFindings.get(key);
    if (!prior) {
      const item = withState(finding, 'new', 'finding_not_present_in_baseline');
      result.new.push(item); result.regressions.push(item); continue;
    }
    if (!comparability.comparable) result.not_comparable.push(withState(finding, 'not_comparable', 'run_envelopes_not_comparable'));
    else if (JSON.stringify(prior.observation) !== JSON.stringify(finding.observation)) result.changed.push(withState(finding, 'changed', 'finding_observation_changed'));
    else result.persisting.push(withState(finding, 'persisted', 'finding_observation_persisted'));
  }
  for (const [key, finding] of aFindings) {
    if (bFindings.has(key)) continue;
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
