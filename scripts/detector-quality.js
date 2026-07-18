#!/usr/bin/env node
/**
 * Generate the detector-quality report by exercising every detector against the
 * positive (seeded-defect) and negative (clean) fixture corpora.
 *
 * Honesty rules encoded here:
 * - precision/recall stay null until production evaluation data exists;
 *   fixture counts alone do not establish either.
 * - production_pages_evaluated is 0 until real runs are recorded.
 * - known_blind_spots come from each detector's declared false-positive and
 *   false-negative conditions.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ALL_DETECTORS } from '../src/detectors/index.js';
import { runDetectors } from '../src/detectors/framework.js';
import { buildSiteFromDir } from '../src/extractor/site.js';
import { loadRegistries } from '../src/registries/index.js';
import { validateAgainst } from '../src/shared/schemaValidator.js';
import { writeYaml, nowIso } from '../src/shared/io.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures');

function registriesFrom(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-dq-'));
  fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
  if (fixture) {
    for (const f of fs.readdirSync(path.join(FIX, fixture))) {
      fs.copyFileSync(path.join(FIX, fixture, f), path.join(dir, '.citable', f));
    }
  }
  return loadRegistries(dir).registries;
}

const positiveCtx = {
  site: buildSiteFromDir(path.join(FIX, 'site-broken'), { baseUrl: 'https://broken.test' }),
  registries: registriesFrom('registries-bad'),
  config: { site: { base_url: 'https://broken.test' }, audit: {} },
  refDate: new Date('2026-07-18'), runId: 'dq-pos', timestamp: '2026-07-18T00:00:00Z',
};
const negativeCtx = {
  site: buildSiteFromDir(path.join(FIX, 'site-clean'), { baseUrl: 'https://example.test' }),
  registries: registriesFrom('registries-good'),
  config: { site: { base_url: 'https://example.test' }, audit: {} },
  refDate: new Date('2026-07-18'), runId: 'dq-neg', timestamp: '2026-07-18T00:00:00Z',
};

const pos = runDetectors(ALL_DETECTORS, positiveCtx).findings;
const neg = runDetectors(ALL_DETECTORS, negativeCtx).findings;
const count = (findings, id) => findings.filter((f) => f.detector_id === id).length;

const report = {
  generated_at: nowIso(),
  corpus: {
    positive_fixtures: ['tests/fixtures/site-broken', 'tests/fixtures/registries-bad'],
    negative_fixtures: ['tests/fixtures/site-clean', 'tests/fixtures/registries-good'],
    production_sites_evaluated: 0,
  },
  detectors: ALL_DETECTORS.map((d) => ({
    detector_id: d.id,
    deterministic: d.deterministic,
    fixtures_positive: count(pos, d.id),
    fixtures_negative: count(neg, d.id),
    exercised_by_fixtures: count(pos, d.id) > 0,
    production_pages_evaluated: 0,
    true_positives: null,
    false_positives: null,
    false_negatives: null,
    precision: null,
    recall: null,
    known_blind_spots: [...(d.false_positive_conditions || []), ...(d.false_negative_conditions || [])],
  })),
};

const { valid, errors } = validateAgainst('detector-quality.schema.json', report);
if (!valid) {
  console.error('report violates schema:\n' + errors.join('\n'));
  process.exit(1);
}
const out = path.join(ROOT, 'docs', 'detectors', 'quality-report.yaml');
writeYaml(out, report);

const exercised = report.detectors.filter((d) => d.exercised_by_fixtures).length;
const noisy = report.detectors.filter((d) => d.fixtures_negative > 0);
console.log(`detector quality report → ${path.relative(ROOT, out)}`);
console.log(`exercised by positive fixtures: ${exercised}/${report.detectors.length}`);
console.log(`firing on clean corpus (investigate): ${noisy.length ? noisy.map((d) => d.detector_id).join(', ') : 'none'}`);
console.log('precision/recall: not measured (0 production sites evaluated) — fixture counts are coverage, not accuracy');
