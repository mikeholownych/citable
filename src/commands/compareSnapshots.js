import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';

/**
 * `citable compare-snapshots [runA runB]` — regression comparison between two audit runs.
 * Defaults to the two most recent runs containing findings.json.
 */
export function compareSnapshots(root, { runA, runB } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('no runs recorded yet');
  const runs = fs.readdirSync(runsDir)
    .filter((r) => fs.existsSync(path.join(runsDir, r, 'findings.json')))
    .sort();
  if (!runA || !runB) {
    if (runs.length < 2) throw new Error(`need two runs with findings to compare; found ${runs.length}`);
    runB = runB ?? runs[runs.length - 1];
    runA = runA ?? runs[runs.length - 2];
  }
  const load = (r) => {
    const dir = path.join(runsDir, r);
    if (!fs.existsSync(path.join(dir, 'findings.json'))) throw new Error(`run ${r} has no findings.json`);
    return {
      findings: readJson(path.join(dir, 'findings.json')),
      manifest: readJson(path.join(dir, 'manifest.json')),
    };
  };
  const a = load(runA);
  const b = load(runB);
  const changedKeys = (left = {}, right = {}) => [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => left[key] !== right[key]);
  const changeDimensions = {
    resource_changed: changedKeys(a.manifest.input_hashes, b.manifest.input_hashes),
    evidence_artifacts_changed: changedKeys(a.manifest.output_hashes, b.manifest.output_hashes),
    detector_set_changed: JSON.stringify(a.manifest.detectors_run) !== JSON.stringify(b.manifest.detectors_run),
    configuration_changed: a.manifest.configuration_hash !== b.manifest.configuration_hash,
    observation_method_changed: a.manifest.command !== b.manifest.command || JSON.stringify(a.manifest.argv) !== JSON.stringify(b.manifest.argv) || a.manifest.target?.kind !== b.manifest.target?.kind,
    tool_changed: a.manifest.tool_version !== b.manifest.tool_version,
    external_system_may_have_changed: a.manifest.target?.kind === 'url' || b.manifest.target?.kind === 'url',
  };
  const key = (f) => `${f.detector_id}|${f.subject.identifier}|${f.observation.summary}`;
  const aKeys = new Map(a.findings.map((f) => [key(f), f]));
  const bKeys = new Map(b.findings.map((f) => [key(f), f]));
  const regressions = [...bKeys.entries()].filter(([k]) => !aKeys.has(k)).map(([, f]) => f);
  const resolved = [...aKeys.entries()].filter(([k]) => !bKeys.has(k)).map(([, f]) => f);
  const persisting = [...bKeys.entries()].filter(([k]) => aKeys.has(k)).map(([, f]) => f);
  return {
    runA, runB,
    baseline_timestamp: a.manifest.timestamp,
    comparison_timestamp: b.manifest.timestamp,
    regressions, resolved, persisting,
    comparability: {
      comparable: !changeDimensions.detector_set_changed && !changeDimensions.configuration_changed && !changeDimensions.observation_method_changed && !changeDimensions.tool_changed,
      change_dimensions: changeDimensions,
      limitation: 'These dimensions identify observed differences between run envelopes; they do not establish what caused a finding change.',
    },
    summary: {
      new_findings: regressions.length,
      resolved_findings: resolved.length,
      persisting_findings: persisting.length,
      regression_critical_or_high: regressions.filter((f) => ['critical', 'high'].includes(f.classification.severity)).length,
    },
  };
}
