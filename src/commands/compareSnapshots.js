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
    summary: {
      new_findings: regressions.length,
      resolved_findings: resolved.length,
      persisting_findings: persisting.length,
      regression_critical_or_high: regressions.filter((f) => ['critical', 'high'].includes(f.classification.severity)).length,
    },
  };
}
