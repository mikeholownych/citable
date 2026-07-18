import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../evidence/run.js';
import { nowIso, readJson, sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

export function readInput(input) {
  if (!input) throw new Error('--input <json> is required for this collector');
  if (!fs.existsSync(input)) throw new Error(`input not found: ${input}`);
  return { raw: fs.readFileSync(input, 'utf8'), value: readJson(input), file: path.resolve(input) };
}

export function envelope(kind, data, { method, source, state = 'observed', confidence = 'confirmed', limitations = [], raw } = {}) {
  const evidence = raw ?? JSON.stringify(data);
  const item = {
    observation_id: `OBS-${kind.toUpperCase()}-${sha256(evidence).slice(0, 16)}`,
    kind, state, collected_at: nowIso(), collection_method: method,
    confidence, source, evidence_hash: sha256(evidence), data, limitations,
  };
  const check = validateAgainst('observation.schema.json', item);
  if (!check.valid) throw new Error(`observation violates contract: ${check.errors.join('; ')}`);
  return item;
}

export function observationRun(root, command, target, observations, { rawInputs = {}, incomplete = [], warnings = [], artifacts = {} } = {}) {
  const kind = /^https?:\/\//.test(target) ? 'url' : 'source';
  const run = createRun(root, { command, argv: process.argv.slice(2), target: { kind, location: target, environment: 'local' } });
  for (const [name, raw] of Object.entries(rawInputs)) run.addInput(name, raw);
  observations.forEach((item, i) => run.writeArtifact(`observations/${String(i + 1).padStart(4, '0')}-${item.kind}.json`, item));
  for (const [name, value] of Object.entries(artifacts)) run.writeArtifact(name, value);
  run.writeArtifact('summary.json', summarizeObservations(observations));
  run.manifest.incomplete_checks.push(...incomplete);
  run.manifest.warnings.push(...warnings);
  const status = run.manifest.errors.length ? 'completed_with_warnings' : incomplete.length ? 'incomplete' : 'completed';
  return { runId: run.runId, dir: run.finalize(status), observations, summary: summarizeObservations(observations), manifest: run.manifest };
}

export function summarizeObservations(items) {
  const byKind = {}, byState = {};
  for (const item of items) { byKind[item.kind] = (byKind[item.kind] || 0) + 1; byState[item.state] = (byState[item.state] || 0) + 1; }
  const citations = items.filter((item) => item.kind === 'citation');
  const reviews = items.filter((item) => item.kind === 'citation_review');
  const providers = {};
  for (const item of citations) {
    const provider = item.data.provider || 'unknown';
    providers[provider] ||= { runs: 0, property_cited: 0 };
    providers[provider].runs++;
    if (item.data.property_cited) providers[provider].property_cited++;
  }
  return {
    total: items.length, by_kind: byKind, by_state: byState,
    citation_metrics: citations.length ? {
      runs: citations.length,
      citation_presence_rate: citations.filter((x) => x.data.property_cited).length / citations.length,
      supported_citation_rate: reviews.length ? reviews.filter((x) => x.data.support_status === 'supported').length / reviews.length : null,
      review_required: reviews.filter((x) => x.state === 'review_required').length,
      provider_results: providers,
      competitive_domains: [...new Set(reviews.filter((x) => !x.data.first_party).map((x) => { try { return new URL(x.data.canonical_url).hostname; } catch { return null; } }).filter(Boolean))].sort(),
    } : null,
  };
}
