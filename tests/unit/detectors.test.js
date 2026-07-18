import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteFromDir } from '../../src/extractor/site.js';
import { ALL_DETECTORS, detectorsByNamespace, selectDetectors } from '../../src/detectors/index.js';
import { runDetectors } from '../../src/detectors/framework.js';
import { loadRegistries } from '../../src/registries/index.js';
import fs from 'node:fs';
import os from 'node:os';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function ctxFor(siteFixture, registryFixture, baseUrl) {
  let registries = null;
  if (registryFixture) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-det-'));
    fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
    for (const f of fs.readdirSync(path.join(FIX, registryFixture))) {
      fs.copyFileSync(path.join(FIX, registryFixture, f), path.join(dir, '.citable', f));
    }
    registries = loadRegistries(dir).registries;
  } else {
    registries = loadRegistries(fs.mkdtempSync(path.join(os.tmpdir(), 'citable-empty-'))).registries;
  }
  const site = siteFixture ? buildSiteFromDir(path.join(FIX, siteFixture), { baseUrl }) : null;
  return { site, registries, config: { site: { base_url: baseUrl }, audit: {} }, refDate: new Date('2026-07-18'), runId: 'test', timestamp: '2026-07-18T00:00:00Z' };
}

test('at least 60 detectors are defined with unique ids across all namespaces', () => {
  assert.ok(ALL_DETECTORS.length >= 60, `expected >= 60, got ${ALL_DETECTORS.length}`);
  const ns = detectorsByNamespace();
  for (const want of ['TECH', 'CRAWL', 'ARCH', 'PAGE', 'ANS', 'ENTITY', 'CLAIM', 'EVD', 'SCHEMA', 'LINK', 'EXT', 'GEO', 'RECO', 'LIFE', 'MEAS']) {
    assert.ok(ns[want]?.length >= 1, `namespace ${want} has no detectors`);
  }
});

test('every detector declares remediation, verification, and requirement lineage', () => {
  for (const d of ALL_DETECTORS) {
    assert.ok(d.remediation.length > 10, `${d.id} remediation too thin`);
    assert.ok(d.verification.length > 5, `${d.id} verification missing`);
    assert.ok(d.discipline.length >= 1, `${d.id} discipline missing`);
  }
});

test('clean site + good registries produce no critical findings (negative fixture)', () => {
  const ctx = ctxFor('site-clean', 'registries-good', 'https://example.test');
  const { findings, errors } = runDetectors(ALL_DETECTORS, ctx);
  assert.deepEqual(errors, []);
  const critical = findings.filter((f) => f.classification.severity === 'critical');
  assert.deepEqual(critical.map((f) => `${f.detector_id}: ${f.observation.summary}`), []);
});

test('a detector that flags every page is defective: clean site page count sanity', () => {
  const ctx = ctxFor('site-clean', 'registries-good', 'https://example.test');
  const { findings } = runDetectors(ALL_DETECTORS, ctx);
  // No single detector may flag every page of the clean fixture
  const byDetector = new Map();
  for (const f of findings) byDetector.set(f.detector_id, (byDetector.get(f.detector_id) || 0) + 1);
  for (const [id, n] of byDetector) {
    assert.ok(n < ctx.site.pages.length, `${id} flagged ${n}/${ctx.site.pages.length} clean pages`);
  }
});

test('broken site triggers expected TECH/PAGE/ANS/SCHEMA/GEO detectors (positive fixture)', () => {
  const ctx = ctxFor('site-broken', null, 'https://broken.test');
  const { findings } = runDetectors(ALL_DETECTORS, ctx);
  const ids = new Set(findings.map((f) => f.detector_id));
  for (const expected of [
    'TECH-002',   // hidden/ noindex without registry intent
    'TECH-004',   // two canonicals on index
    'TECH-008',   // sitemap contains redirect
    'TECH-010',   // sitemap lists /gone/ 404
    'PAGE-002',   // duplicate titles (index + orphan)
    'PAGE-003',   // missing meta description
    'PAGE-005',   // two H1s on index
    'PAGE-006',   // orphan page starts at h3
    'ANS-001',    // "in today's rapidly evolving"
    'ANS-002',    // question headings without prose
    'ANS-004',    // "as shown above"
    'ANS-005',    // 3x faster / 70% reduction without baseline
    'ARCH-001',   // orphan page
    'LINK-001',   // /missing-page/ broken link
    'LINK-003',   // click here / read more
    'SCHEMA-001', // invalid JSON-LD
    'SCHEMA-005', // aggregateRating without visible reviews
    'SCHEMA-007', // FAQ schema questions not visible
    'SCHEMA-008', // same @id two names
    'GEO-001',    // hidden prompt injection
    'CLAIM-007',  // "the best AI platform" superlative
    'CRAWL-004',  // robots parse error
    'TECH-018',   // missing viewport
  ]) {
    assert.ok(ids.has(expected), `expected ${expected} to fire on broken fixture; fired: ${[...ids].sort().join(', ')}`);
  }
});

test('governance registries trigger CLAIM/EVD/LIFE/MEAS/CRAWL detectors', () => {
  const ctx = ctxFor(null, 'registries-bad', 'https://broken.test');
  const { findings } = runDetectors(ALL_DETECTORS, ctx);
  const ids = new Set(findings.map((f) => f.detector_id));
  for (const expected of [
    'CLAIM-001', // verified without evidence
    'CLAIM-002', // verified with only expired evidence
    'CLAIM-003', // active after expiry
    'CLAIM-005', // opinion marked verified
    'CLAIM-006', // security claim without review
    'EVD-001',   // evidence past validity
    'EVD-002',   // benchmark without methodology
    'EVD-003',   // dangling evidence reference
    'EVD-004',   // security claim only secondary evidence
    'EVD-007',   // inaccessible evidence supporting active claim
    'LIFE-001',  // no content owner
    'LIFE-002',  // claims without factual reviewer
    'LIFE-003',  // review overdue
    'LIFE-004',  // unclassified lifecycle
    'LIFE-005',  // regulatory page without jurisdiction
    'MEAS-002',  // definitive accuracy from zero observations
    'MEAS-003',  // causal conclusion without controls
    'CRAWL-002', // no training decision for allowed search vendor? (not present here)
  ].filter((x) => x !== 'CRAWL-002')) {
    assert.ok(ids.has(expected), `expected ${expected}; fired: ${[...ids].sort().join(', ')}`);
  }
});

test('deterministic reruns produce identical finding ids', () => {
  const ctx1 = ctxFor('site-broken', 'registries-bad', 'https://broken.test');
  const ctx2 = ctxFor('site-broken', 'registries-bad', 'https://broken.test');
  const r1 = runDetectors(ALL_DETECTORS, ctx1).findings.map((f) => f.finding_id).sort();
  const r2 = runDetectors(ALL_DETECTORS, ctx2).findings.map((f) => f.finding_id).sort();
  assert.deepEqual(r1, r2);
  assert.ok(r1.length > 0);
});

test('detectors requiring missing context are skipped, not errored', () => {
  const ctx = ctxFor(null, 'registries-good', 'https://example.test');
  const { detectorsSkipped, errors } = runDetectors(ALL_DETECTORS, ctx);
  assert.deepEqual(errors, []);
  assert.ok(detectorsSkipped.some((s) => s.detector_id.startsWith('TECH-')), 'site-dependent detectors skipped');
});

test('selectDetectors scope filters work', () => {
  assert.ok(selectDetectors({ scope: 'technical' }).every((d) => ['TECH', 'CRAWL', 'LINK'].includes(d.namespace)));
  assert.ok(selectDetectors({ scope: 'aeo' }).every((d) => d.discipline.includes('aeo')));
  assert.ok(selectDetectors({ scope: 'claims' }).every((d) => d.namespace === 'CLAIM'));
});

test('CRAWL-001/002: robots vs registry policy conflicts', () => {
  const ctx = ctxFor('site-clean', 'registries-good', 'https://example.test');
  // registry says allow OAI-SearchBot; robots allows all → no conflict
  let { findings } = runDetectors(selectDetectors({ namespaces: ['CRAWL'] }), ctx);
  assert.ok(!findings.some((f) => f.detector_id === 'CRAWL-001'));
  // flip decision to block → conflict must fire
  ctx.registries.crawlers.entries.find((c) => c.crawler_id === 'CRAWLER-OAI-SEARCHBOT').decision = 'block';
  findings = runDetectors(selectDetectors({ namespaces: ['CRAWL'] }), ctx).findings;
  assert.ok(findings.some((f) => f.detector_id === 'CRAWL-001'), 'CRAWL-001 fires on decision/robots divergence');
  // remove GPTBot training entry → CRAWL-002 fires for OpenAI
  ctx.registries.crawlers.entries = ctx.registries.crawlers.entries.filter((c) => c.crawler_id !== 'CRAWLER-GPTBOT');
  ctx.registries.crawlers.entries.find((c) => c.crawler_id === 'CRAWLER-OAI-SEARCHBOT').decision = 'allow';
  findings = runDetectors(selectDetectors({ namespaces: ['CRAWL'] }), ctx).findings;
  assert.ok(findings.some((f) => f.detector_id === 'CRAWL-002'), 'CRAWL-002 fires when training decision missing');
});
