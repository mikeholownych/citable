import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from '../shared/io.js';

function observations(dir) {
  const folder = path.join(dir, 'observations');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(folder, f)));
}

function key(item) {
  const d = item.data || {};
  if (item.kind === 'citation') return [item.kind, d.provider, d.product_mode, d.prompt_id, d.run_index].join(':');
  if (item.kind === 'representation_drift') return [item.kind, d.manifest_hash, d.surface_id, d.retrieval_path, d.region, d.request_identity].join(':');
  return [item.kind, d.url || d.citation_url || d.prompt_id || d.timestamp || item.observation_id].join(':');
}

export function monitor(root, { runA, runB } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('no runs available to monitor');
  const candidates = fs.readdirSync(runsDir).filter((r) => fs.existsSync(path.join(runsDir, r, 'observations'))).sort();
  const b = runB || candidates.at(-1), a = runA || candidates.at(-2);
  if (!a || !b) throw new Error('monitor requires two observation runs');
  const before = new Map(observations(path.join(runsDir, a)).map((o) => [key(o), o]));
  const after = new Map(observations(path.join(runsDir, b)).map((o) => [key(o), o]));
  const alerts = [];
  for (const [k, current] of after) {
    const previous = before.get(k);
    if (!previous) alerts.push({ severity: 'informational', type: 'new_observation', key: k, current_state: current.state });
    else if (previous.state !== current.state) alerts.push({ severity: ['failed', 'not_observed'].includes(current.state) ? 'high' : 'medium', type: 'state_change', key: k, previous_state: previous.state, current_state: current.state });
    if (current.kind === 'index' && previous?.data?.indexed === true && current.data.indexed === false) alerts.push({ severity: 'high', type: 'index_loss', key: k });
    if (current.kind === 'canonical_freshness' && previous?.data?.canonical_consensus === true && current.data.canonical_consensus === false) alerts.push({ severity: 'high', type: 'canonical_regression', key: k });
    if (current.kind === 'citation' && previous?.data?.property_cited === true && current.data.property_cited === false) alerts.push({ severity: 'medium', type: 'citation_presence_change', key: k });
    if (current.kind === 'representation_drift' && previous) {
      const from = previous.data.representation_state, to = current.data.representation_state;
      if (from !== 'divergent' && to === 'divergent') alerts.push({ severity: 'high', type: 'representation_divergence_observed', key: k, previous_state: from, current_state: to, authority: 'external_unverified', gates_release_finalization: false });
      if (from === 'divergent' && to === 'consistent') {
        const duration = new Date(current.collected_at) - new Date(previous.collected_at);
        alerts.push({ severity: 'informational', type: 'representation_convergence_observed', key: k, previous_state: from, current_state: to, observed_interval_ms: Number.isFinite(duration) && duration >= 0 ? duration : null, authority: 'external_unverified', gates_release_finalization: false });
      }
    }
  }
  for (const k of before.keys()) if (!after.has(k)) alerts.push({ severity: 'medium', type: 'observation_missing', key: k });
  const result = { generated_at: nowIso(), run_a: a, run_b: b, summary: { alerts: alerts.length, critical_or_high: alerts.filter((x) => ['critical', 'high'].includes(x.severity)).length }, alerts };
  const dir = path.join(root, '.citable', 'monitoring');
  writeJson(path.join(dir, `${a}--${b}.json`), result);
  writeJson(path.join(dir, 'latest.json'), result);
  return { ...result, dir };
}
