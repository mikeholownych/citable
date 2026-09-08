import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, nowIso } from '../shared/io.js';
import { buildSiteFromDir } from '../extractor/site.js';
import { runDetectors } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { calculateVisualSaliency } from '../analysis/saliency.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * `citable corpus benchmark` — golden-benchmark evaluation of deterministic
 * CRO detectors over a versioned, anonymized, labeled page corpus.
 *
 * Labels are page-level: expect_findings (must fire), expect_clean (must not
 * fire), saliency bounds for the modeled conspicuity index. Output carries
 * per-detector true/false positive/negative counts, precision, recall, and
 * F1, plus an explicit pass/fail gate against the manifest thresholds.
 *
 * The benchmark evaluates detectors against synthetic fixtures; it is not
 * evidence about real-world accuracy, and it never becomes a visibility or
 * conversion claim.
 */
export async function runGoldenBenchmark(root, { corpusDir = null, writeReport = null } = {}) {
  const resolvedCorpus = corpusDir
    ? path.resolve(root, corpusDir)
    : path.join(MODULE_DIR, '..', '..', 'tests', 'fixtures', 'golden-corpus');
  const manifestPath = path.join(resolvedCorpus, 'MANIFEST.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`golden corpus manifest not found: ${manifestPath}`);
  }
  const manifest = readYaml(manifestPath);
  const namespaces = manifest.namespaces || ['CRO'];
  const detectors = selectDetectors({ namespaces });
  const thresholds = manifest.thresholds || { recall_min: 1.0, precision_min: 1.0 };

  // per-detector confusion counters
  const tally = new Map();
  for (const d of detectors) {
    tally.set(d.id, { detector_id: d.id, deterministic: d.deterministic, true_positives: 0, false_positives: 0, false_negatives: 0, true_negatives: 0 });
  }
  const pageResults = [];
  const saliencyResults = [];

  for (const [siteName, site] of Object.entries(manifest.sites || {})) {
    const siteDir = path.join(resolvedCorpus, siteName);
    if (!fs.existsSync(siteDir)) throw new Error(`corpus site directory missing: ${siteDir}`);
    const built = buildSiteFromDir(siteDir, { baseUrl: `https://${siteName}.corpus.test` });
    for (const page of built.pages) {
      const relPage = path.relative(siteDir, page.sourceFile).split(path.sep).join('/');
      const labels = (site.pages || {})[relPage] || {};
      const expected = new Set(labels.expect_findings || []);
      const expectClean = new Set(labels.expect_clean || []);

      const scoped = { site: { ...built, pages: [page] }, registries: null, observations: null };
      const { findings } = runDetectors(detectors, scoped);
      const fired = new Set(findings.map((f) => f.detector_id));

      for (const d of detectors) {
        const t = tally.get(d.id);
        const isExpected = expected.has(d.id);
        const didFire = fired.has(d.id);
        if (isExpected && didFire) t.true_positives++;
        else if (isExpected && !didFire) t.false_negatives++;
        else if (!isExpected && didFire) t.false_positives++;
        else t.true_negatives++;
      }

      const violations = [];
      for (const id of expected) {
        if (!fired.has(id)) violations.push({ kind: 'false_negative', detector_id: id });
      }
      for (const id of fired) {
        if (!expected.has(id)) {
          violations.push({ kind: expectClean.has(id) ? 'labeled_clean_violation' : 'unexpected_finding', detector_id: id, summary: findings.find((f) => f.detector_id === id)?.observation?.summary });
        }
      }

      pageResults.push({
        site: siteName,
        kind: site.kind,
        page: relPage,
        url: page.url,
        expected: [...expected],
        fired: [...fired],
        violations,
      });

      if (labels.saliency) {
        const sal = calculateVisualSaliency({
          ctas: page.ctas.map((c) => ({ ...c })),
          headings: (page.h1s || []).map((h) => ({ level: 1, text: h.text })),
          forms: page.forms.map((f) => ({ fieldCount: f.fieldCount })),
        });
        const pciMin = labels.saliency.pci_min;
        const pass = pciMin === undefined ? true : sal.primary_cta_conspicuity_index >= pciMin;
        saliencyResults.push({
          site: siteName,
          page: relPage,
          primary_cta_conspicuity_index: sal.primary_cta_conspicuity_index,
          pci_min_label: pciMin ?? null,
          passed: pass,
          methodology: 'PCI is a modeled heuristic index over DOM geometry labels, not observed user attention',
        });
      }
    }
  }

  const perDetector = [...tally.values()].map((t) => {
    const precision = (t.true_positives + t.false_positives) > 0 ? t.true_positives / (t.true_positives + t.false_positives) : null;
    const recall = (t.true_positives + t.false_negatives) > 0 ? t.true_positives / (t.true_positives + t.false_negatives) : null;
    const f1 = precision !== null && recall !== null && (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : null;
    return { ...t, precision, recall, f1 };
  });

  const exercised = perDetector.filter((d) => d.true_positives + d.false_negatives > 0);
  const violations = pageResults.flatMap((p) => p.violations.map((v) => ({ site: p.site, page: p.page, ...v })));
  const recallFailures = exercised.filter((d) => d.recall < thresholds.recall_min);
  const precisionFailures = perDetector.filter((d) => d.precision !== null && d.precision < thresholds.precision_min);

  const result = {
    benchmark: 'golden-corpus',
    corpus_version: manifest.corpus_version,
    corpus_dir: path.relative(root, resolvedCorpus) || resolvedCorpus,
    anonymized: Boolean(manifest.anonymized),
    timestamp: nowIso(),
    tool_version: JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
    thresholds,
    sites_evaluated: Object.keys(manifest.sites || {}).length,
    pages_evaluated: pageResults.length,
    per_detector: perDetector,
    saliency: saliencyResults,
    violations,
    gate: {
      ok: recallFailures.length === 0 && precisionFailures.length === 0 && violations.length === 0,
      recall_failures: recallFailures.map((d) => d.detector_id),
      precision_failures: precisionFailures.map((d) => d.detector_id),
      violation_count: violations.length,
    },
    limitations: [
      'Synthetic fixture benchmark: measures consistency with labels, not real-world accuracy.',
      'Registry-dependent detectors (funnels, experiments) are not exercised by this corpus.',
      'Saliency bounds evaluate a modeled heuristic index, not observed user attention.',
    ],
  };

  if (writeReport) {
    const outFull = path.resolve(root, writeReport);
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    fs.writeFileSync(outFull, JSON.stringify(result, null, 2) + '\n', 'utf8');
    result.report_path = outFull;
  }
  return result;
}
