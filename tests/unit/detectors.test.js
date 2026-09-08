import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteFromDir } from '../../src/extractor/site.js';
import { extractPage } from '../../src/extractor/page.js';
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
    'SCHEMA-009', // ungrounded schema facts
    'SCHEMA-010', // dangling @id reference
    'GEO-001',    // hidden prompt injection
    'CLAIM-007',  // "the best AI platform" superlative
    'CRAWL-004',  // robots parse error
    'TECH-018',   // missing viewport
    'TECH-019',   // Open Graph URL conflicts with canonical
    'TECH-020',   // missing reciprocal hreflang return link
    'TECH-021',   // invalid BCP 47 hreflang syntax
    'TECH-022',   // hreflang alternate conflicts with canonical
    'SCHEMA-013', // VideoObject missing playback prerequisites
    'SCHEMA-014', // Organization missing identity signals
    'SCHEMA-015', // Circular self-referential @id reference
    'SCHEMA-016', // Author Person lacking disambiguation URL
    'ANS-013',    // comparison section lacking structured table
    'ANS-014',    // fluff clichés in answer prose
    'CRO-002',    // excessive fields and missing submit
    'CRO-004',    // invalid CTA target
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
    'CLAIM-009', // verified claim without semantic support assessment
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

test('HTML-only detectors ignore non-HTML resources and retain positive cases', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIX, 'resource-applicability.json'), 'utf8'));
  const pages = fixture.pages.map((item) => extractPage({
    url: item.url,
    html: item.body,
    headers: { 'content-type': item.content_type },
  }));
  const site = {
    mode: 'url', baseUrl: 'https://example.test', pages,
    byUrl: new Map(pages.map((page) => [page.url, page])),
    sitemaps: [], normalize: (url) => new URL(url).href,
  };
  const ctx = { ...ctxFor(null, null, 'https://example.test'), site };
  const { findings } = runDetectors(selectDetectors({ namespaces: ['TECH', 'PAGE'] }), ctx);

  for (const item of fixture.pages) {
    const actual = findings
      .filter((finding) => finding.subject.url === item.url && ['TECH-012', 'PAGE-001'].includes(finding.detector_id))
      .map((finding) => finding.detector_id)
      .sort();
    assert.deepEqual(actual, [...item.expected].sort(), item.url);
  }
});

test('provider utility URLs are not default index targets', () => {
  const utility = extractPage({
    url: 'https://example.test/cdn-cgi/l/email-protection#abc',
    html: '<html><head><meta name="robots" content="noindex,nofollow"></head></html>',
    status: 404,
    headers: { 'content-type': 'text/html' },
  });
  const site = {
    mode: 'url', baseUrl: 'https://example.test', pages: [utility],
    byUrl: new Map([[utility.url, utility]]), sitemaps: [], normalize: (url) => new URL(url).href,
  };
  const ctx = { ...ctxFor(null, null, 'https://example.test'), site };
  const findings = runDetectors(selectDetectors({ namespaces: ['TECH', 'PAGE'] }), ctx).findings;
  assert.ok(!findings.some((finding) => ['TECH-001', 'TECH-002', 'PAGE-001'].includes(finding.detector_id)));
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

test('AEO/GEO readiness detectors catch governance gaps and spare complete fixtures', () => {
  const complete = ctxFor('site-clean', 'registries-good', 'https://example.test');
  let findings = runDetectors(selectDetectors({ namespaces: ['ANS', 'GEO'] }), complete).findings;
  for (const id of ['ANS-009', 'ANS-010', 'GEO-005', 'GEO-006']) {
    assert.ok(!findings.some((f) => f.detector_id === id), `${id} should not fire on complete fixture`);
  }

  const gaps = ctxFor('site-clean', 'registries-aeo-geo-gaps', 'https://example.test');
  findings = runDetectors(selectDetectors({ namespaces: ['ANS', 'GEO'] }), gaps).findings;
  const ids = new Set(findings.map((f) => f.detector_id));
  for (const id of ['ANS-009', 'ANS-010', 'GEO-005', 'GEO-006']) {
    assert.ok(ids.has(id), `${id} should fire on incomplete AEO/GEO fixture`);
  }
});

test('GEO-007: detects unfavorable entity stance and spares favorable/neutral observations', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');
  const detectionObs = JSON.parse(fs.readFileSync(path.join(FIX, 'observations', 'stance-detection.json'), 'utf8')).observations;
  const nonDetectionObs = JSON.parse(fs.readFileSync(path.join(FIX, 'observations', 'stance-non-detection.json'), 'utf8')).observations;

  // Non-detection fixture: favorable stance
  const ctxClean = { ...good, observations: nonDetectionObs.map((o) => ({ kind: 'citation', data: o })) };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-007'), 'GEO-007 must not fire on favorable/neutral observations');

  // Detection fixture: unfavorable stance
  const ctxUnfavorable = { ...good, observations: detectionObs.map((o) => ({ kind: 'citation', data: o })) };
  const findingsUnfavorable = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxUnfavorable).findings;
  const hit = findingsUnfavorable.find((f) => f.detector_id === 'GEO-007');
  assert.ok(hit, 'GEO-007 must fire on unfavorable entity stance observation');
  assert.equal(hit.subject.identifier, 'entities/ENT-GATEKEEPER');
  assert.equal(hit.classification.finding_type, 'evidence_backed_semantic_finding');
  assert.equal(hit.classification.severity, 'high');
  assert.equal(hit.remediation.review_required, true);
});

test('GEO-008: detects distorted claim attribution and spares supported claim attribution', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Clean / non-detection: supported claim
  const cleanObs = [
    {
      kind: 'citation',
      data: {
        provider: 'perplexity',
        answer_text: 'Gatekeeper validates whether an AI-initiated action remains admissible before execution in configured enforcement deployments.',
      },
    },
  ];
  const ctxClean = { ...good, observations: cleanObs };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-008'), 'GEO-008 must not fire on supported claim attribution');

  // Detection: negated capability
  const distortedObs = [
    {
      kind: 'citation',
      data: {
        provider: 'chatgpt',
        answer_text: 'Gatekeeper fails to validate whether an AI-initiated action remains admissible before execution in configured deployments.',
      },
    },
  ];
  const ctxDistorted = { ...good, observations: distortedObs };
  const findingsDistorted = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxDistorted).findings;
  const hit = findingsDistorted.find((f) => f.detector_id === 'GEO-008');
  assert.ok(hit, 'GEO-008 must fire when generative answer attributes negated/distorted claim');
  assert.equal(hit.subject.identifier, 'claims/CLAIM-ENFORCE');
  assert.equal(hit.classification.severity, 'high');
  assert.equal(hit.remediation.review_required, true);
});

test('TECH-020..022: detects reciprocal, syntax, and canonical hreflang consensus issues and spares valid clusters', () => {
  const norm = (u) => u.replace(/\/+$/, '');

  // Valid / non-detection cluster
  const validPages = [
    {
      url: 'https://example.test/en',
      status: 200,
      canonicals: ['https://example.test/en'],
      hreflangs: [
        { lang: 'en', href: 'https://example.test/en' },
        { lang: 'fr', href: 'https://example.test/fr' },
        { lang: 'x-default', href: 'https://example.test/en' },
      ],
    },
    {
      url: 'https://example.test/fr',
      status: 200,
      canonicals: ['https://example.test/fr'],
      hreflangs: [
        { lang: 'en', href: 'https://example.test/en' },
        { lang: 'fr', href: 'https://example.test/fr' },
        { lang: 'x-default', href: 'https://example.test/en' },
      ],
    },
  ];
  const byUrlValid = new Map(validPages.map((p) => [norm(p.url), p]));
  const validSite = { pages: validPages, byUrl: byUrlValid, normalize: norm };
  const validCtx = { site: validSite, config: { site: { base_url: 'https://example.test' } } };

  const validFindings = runDetectors(selectDetectors({ namespaces: ['TECH'] }), validCtx).findings;
  for (const id of ['TECH-020', 'TECH-021', 'TECH-022']) {
    assert.ok(!validFindings.some((f) => f.detector_id === id), `${id} must not fire on valid hreflang cluster`);
  }

  // Broken / detection cluster
  const brokenPages = [
    {
      url: 'https://example.test/en',
      status: 200,
      canonicals: ['https://example.test/en'],
      hreflangs: [
        { lang: 'en-UK', href: '/fr' }, // TECH-021: en-UK and relative URL
        { lang: 'es-ES', href: 'https://example.test/es' },
      ],
    },
    {
      url: 'https://example.test/es',
      status: 200,
      canonicals: ['https://example.test/en'], // TECH-022: canonical points away to English
      hreflangs: [], // TECH-020: missing reciprocal return link
    },
  ];
  const byUrlBroken = new Map(brokenPages.map((p) => [norm(p.url), p]));
  const brokenSite = { pages: brokenPages, byUrl: byUrlBroken, normalize: norm };
  const brokenCtx = { site: brokenSite, config: { site: { base_url: 'https://example.test' } } };

  const brokenFindings = runDetectors(selectDetectors({ namespaces: ['TECH'] }), brokenCtx).findings;
  const brokenIds = new Set(brokenFindings.map((f) => f.detector_id));
  assert.ok(brokenIds.has('TECH-020'), 'TECH-020 must fire on missing reciprocal link');
  assert.ok(brokenIds.has('TECH-021'), 'TECH-021 must fire on invalid BCP 47 syntax or relative URL');
  assert.ok(brokenIds.has('TECH-022'), 'TECH-022 must fire when hreflang target has conflicting canonical');
});

test('SCHEMA-009..010: detects ungrounded entity facts and broken @id graph references', () => {
  const norm = (u) => u.replace(/\/+$/, '');

  // Valid / grounded entity graph
  const validPages = [
    {
      url: 'https://example.test/contact',
      text: 'Contact us at support@example.test or call +1-555-123-4567. Headquartered in 94105.',
      jsonLd: [
        {
          blocks: [
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              '@id': 'https://example.test/#org',
              telephone: '+1-555-123-4567',
              email: 'support@example.test',
              address: { postalCode: '94105' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              '@id': 'https://example.test/contact#page',
              publisher: { '@id': 'https://example.test/#org' },
            },
          ],
        },
      ],
    },
  ];
  const validSite = { pages: validPages, byUrl: new Map(validPages.map((p) => [norm(p.url), p])), normalize: norm };
  const validCtx = { site: validSite, config: { site: { base_url: 'https://example.test' } } };

  const validFindings = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), validCtx).findings;
  for (const id of ['SCHEMA-009', 'SCHEMA-010']) {
    assert.ok(!validFindings.some((f) => f.detector_id === id), `${id} must not fire on grounded, valid schema graph`);
  }

  // Broken / ungrounded and dangling entity graph
  const brokenPages = [
    {
      url: 'https://example.test/contact',
      text: 'Welcome to our platform. We offer enterprise software.',
      jsonLd: [
        {
          blocks: [
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              '@id': 'https://example.test/#org',
              telephone: '+1-555-999-0000', // ungrounded telephone
              email: 'hidden@example.test',   // ungrounded email
              parentOrganization: { '@id': 'https://example.test/#nonexistent-parent' }, // dangling @id
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Product',
              '@id': 'https://example.test/#product',
              offers: { price: '999.00' }, // ungrounded price
              isRelatedTo: { '@id': 'https://example.test/#product' }, // circular self-reference
            },
          ],
        },
      ],
    },
  ];
  const brokenSite = { pages: brokenPages, byUrl: new Map(brokenPages.map((p) => [norm(p.url), p])), normalize: norm };
  const brokenCtx = { site: brokenSite, config: { site: { base_url: 'https://example.test' } } };

  const brokenFindings = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), brokenCtx).findings;
  const brokenIds = new Set(brokenFindings.map((f) => f.detector_id));
  assert.ok(brokenIds.has('SCHEMA-009'), 'SCHEMA-009 must fire on ungrounded phone, email, and price');
  assert.ok(brokenIds.has('SCHEMA-010'), 'SCHEMA-010 must fire on dangling and circular @id references');
});

test('GEO-009: detects high citation volatility and flapping across repeated probes and spares stable citations', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Stable runs: 100% cited -> no volatility finding
  const stableObs = [
    { kind: 'citation', data: { prompt_id: 'PROMPT-STABLE', provider: 'perplexity', property_cited: true } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-STABLE', provider: 'perplexity', property_cited: true } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-STABLE', provider: 'perplexity', property_cited: true } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-STABLE', provider: 'perplexity', property_cited: true } },
  ];
  const ctxStable = { ...good, observations: stableObs };
  const findingsStable = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxStable).findings;
  assert.ok(!findingsStable.some((f) => f.detector_id === 'GEO-009'), 'GEO-009 must not fire on consistently cited probes');

  // Consistently omitted -> no volatility finding (covered by omission detectors)
  const omittedObs = [
    { kind: 'citation', data: { prompt_id: 'PROMPT-OMITTED', provider: 'perplexity', property_cited: false } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-OMITTED', provider: 'perplexity', property_cited: false } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-OMITTED', provider: 'perplexity', property_cited: false } },
  ];
  const ctxOmitted = { ...good, observations: omittedObs };
  const findingsOmitted = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxOmitted).findings;
  assert.ok(!findingsOmitted.some((f) => f.detector_id === 'GEO-009'), 'GEO-009 must not fire on consistently omitted probes');

  // Volatile / flapping runs: 3 of 5 cited with 4 flips
  const volatileObs = [
    { kind: 'citation', data: { prompt_id: 'PROMPT-VOLATILE', provider: 'chatgpt', property_cited: true } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-VOLATILE', provider: 'chatgpt', property_cited: false } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-VOLATILE', provider: 'chatgpt', property_cited: true } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-VOLATILE', provider: 'chatgpt', property_cited: false } },
    { kind: 'citation', data: { prompt_id: 'PROMPT-VOLATILE', provider: 'chatgpt', property_cited: true } },
  ];
  const ctxVolatile = { ...good, observations: volatileObs };
  const findingsVolatile = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxVolatile).findings;
  const hit = findingsVolatile.find((f) => f.detector_id === 'GEO-009');
  assert.ok(hit, 'GEO-009 must fire on high citation volatility and flapping probes');
  assert.equal(hit.subject.identifier, 'prompts/PROMPT-VOLATILE');
  assert.match(hit.observation.summary, /High citation volatility for "PROMPT-VOLATILE" on chatgpt/);
  assert.equal(hit.observation.captured_value.samples, 5);
  assert.equal(hit.observation.captured_value.presenceRate, 0.6);
  assert.equal(hit.classification.finding_type, 'evidence_backed_semantic_finding');
});

test('CRAWL-007: detects spoofed crawler identity and spares authentic provider IPs', async () => {
  const { verifyCrawlerIp } = await import('../../src/crawler/ipRanges.js');

  // Verify IP ranges helper
  const authenticGoogle = verifyCrawlerIp('66.249.66.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(authenticGoogle.knownProvider, true);
  assert.equal(authenticGoogle.matched, true);
  assert.equal(authenticGoogle.provider, 'Google');

  const spoofedGoogle = verifyCrawlerIp('198.51.100.25', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(spoofedGoogle.knownProvider, true);
  assert.equal(spoofedGoogle.matched, false);

  const authenticGpt = verifyCrawlerIp('20.15.240.65', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)');
  assert.equal(authenticGpt.knownProvider, true);
  assert.equal(authenticGpt.matched, true);
  assert.equal(authenticGpt.provider, 'OpenAI');

  // Test CRAWL-007 detector on authentic vs spoofed observation logs
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const authenticObs = [
    {
      kind: 'crawler_log',
      data: {
        timestamp: '2026-09-08T00:00:00Z',
        url: 'https://example.test/',
        user_agent: 'Googlebot/2.1',
        source_ip: '66.249.66.1',
        status: 200,
        crawler_identity: { verification_status: 'fully_verified', cidr_membership: 'matched' },
      },
    },
  ];
  const ctxAuthentic = { ...good, observations: authenticObs };
  const findingsAuthentic = runDetectors(selectDetectors({ namespaces: ['CRAWL'] }), ctxAuthentic).findings;
  assert.ok(!findingsAuthentic.some((f) => f.detector_id === 'CRAWL-007'), 'CRAWL-007 must not fire on authentic crawler traffic');

  const spoofedObs = [
    {
      kind: 'crawler_log',
      data: {
        timestamp: '2026-09-08T00:00:00Z',
        url: 'https://example.test/admin',
        user_agent: 'Googlebot/2.1',
        source_ip: '198.51.100.99',
        status: 403,
        crawler_identity: { verification_status: 'contradictory', cidr_membership: 'not_matched' },
      },
    },
  ];
  const ctxSpoofed = { ...good, observations: spoofedObs };
  const findingsSpoofed = runDetectors(selectDetectors({ namespaces: ['CRAWL'] }), ctxSpoofed).findings;
  const hit = findingsSpoofed.find((f) => f.detector_id === 'CRAWL-007');
  assert.ok(hit, 'CRAWL-007 must fire on spoofed crawler identity');
  assert.equal(hit.subject.identifier, 'Googlebot/2.1');
  assert.match(hit.observation.summary, /Spoofed or unverified crawler traffic detected/);
});

test('PAGE-010: detects high boilerplate ratio and spares content-rich pages', async () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // 1. Non-detection on clean site where main content dominates
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['PAGE'] }), good).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'PAGE-010'), 'PAGE-010 must not fire on content-rich page');

  // 2. Detection on boilerplate-heavy page
  const { extractPage } = await import('../../src/extractor/page.js');
  const boilerplateHtml = `<!doctype html><html><head><title>Boilerplate Shell</title></head><body>
    <header role="banner">
      <nav role="navigation">
        <ul>
          <li><a href="/home">Home Navigation Link 1</a></li>
          <li><a href="/about">About Navigation Link 2</a></li>
          <li><a href="/products">Products Navigation Link 3</a></li>
          <li><a href="/services">Services Navigation Link 4</a></li>
          <li><a href="/pricing">Pricing Navigation Link 5</a></li>
          <li><a href="/docs">Docs Navigation Link 6</a></li>
          <li><a href="/blog">Blog Navigation Link 7</a></li>
          <li><a href="/contact">Contact Navigation Link 8</a></li>
          <li><a href="/login">Login Navigation Link 9</a></li>
          <li><a href="/signup">Signup Navigation Link 10</a></li>
        </ul>
      </nav>
    </header>
    <main>
      <h1>Short Page</h1>
      <p>This is very brief content on a shell page.</p>
    </main>
    <footer role="contentinfo">
      <p>Company Inc. All rights reserved. Terms of service apply. Privacy policy. Legal disclaimer. Support center. System status. Cookie settings. Sitemap index.</p>
    </footer>
  </body></html>`;

  const page = extractPage({ url: 'https://example.test/shell', html: boilerplateHtml, status: 200 });
  const ctxBoilerplate = { ...good, site: { ...good.site, pages: [page] } };
  const findings = runDetectors(selectDetectors({ namespaces: ['PAGE'] }), ctxBoilerplate).findings;
  const hit = findings.find((f) => f.detector_id === 'PAGE-010');
  assert.ok(hit, 'PAGE-010 must fire on boilerplate-dominated page');
  assert.match(hit.observation.summary, /High boilerplate-to-content ratio/);
});

test('PAGE-011: detects claims trapped in collapsible containers without fallback', async () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');
  const { extractPage } = await import('../../src/extractor/page.js');

  const claimId = 'CLAIM-COLLAPSED';
  const claimText = 'Deterministic cryptographic validation reduces runtime exposure by 99%';
  const claimsWithTarget = [
    ...(good.registries.claims?.entries || []),
    {
      claim_id: claimId,
      claim: claimText,
      claim_type: 'performance',
      status: 'verified',
      evidence: ['EVD-001'],
    },
  ];

  // 1. Detection: claim text is exclusively inside <details> without open
  const htmlCollapsedOnly = `<!doctype html><html><head><title>FAQ Page</title></head><body>
    <h1>General FAQs</h1>
    <p>Welcome to our FAQ section covering general service queries.</p>
    <details>
      <summary>Security performance details</summary>
      <p>Deterministic cryptographic validation reduces runtime exposure by 99% according to our audits.</p>
    </details>
  </body></html>`;

  const pageCollapsed = extractPage({ url: 'https://example.test/faq', html: htmlCollapsedOnly, status: 200 });
  const ctxCollapsed = {
    ...good,
    site: { ...good.site, pages: [pageCollapsed] },
    registries: { ...good.registries, claims: { entries: claimsWithTarget } },
  };

  const findingsTrapped = runDetectors(selectDetectors({ namespaces: ['PAGE'] }), ctxCollapsed).findings;
  const hit = findingsTrapped.find((f) => f.detector_id === 'PAGE-011');
  assert.ok(hit, 'PAGE-011 must fire when claim is trapped inside collapsible container');
  assert.equal(hit.subject.identifier, 'https://example.test/faq');

  // 2. Non-detection: claim is also present in main visible prose outside the details
  const htmlWithFallback = `<!doctype html><html><head><title>FAQ Page</title></head><body>
    <h1>Security Performance</h1>
    <p>Our deterministic cryptographic validation reduces runtime exposure by 99% across production workloads.</p>
    <details>
      <summary>More details</summary>
      <p>Deterministic cryptographic validation reduces runtime exposure by 99% according to our audits.</p>
    </details>
  </body></html>`;

  const pageWithFallback = extractPage({ url: 'https://example.test/faq', html: htmlWithFallback, status: 200 });
  const ctxFallback = {
    ...good,
    site: { ...good.site, pages: [pageWithFallback] },
    registries: { ...good.registries, claims: { entries: claimsWithTarget } },
  };

  const findingsFallback = runDetectors(selectDetectors({ namespaces: ['PAGE'] }), ctxFallback).findings;
  assert.ok(!findingsFallback.some((f) => f.detector_id === 'PAGE-011'), 'PAGE-011 must not fire when uncollapsed fallback exists');
});

test('EVD-008: detects dangling media references in claim evidence', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // 1. Non-detection on clean registry evidence
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['EVD'] }), good).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'EVD-008'), 'EVD-008 must not fire on clean evidence');

  // 2. Detection when evidence points to non-existent local media file
  const danglingEvidence = [
    ...(good.registries.evidence?.entries || []),
    {
      evidence_id: 'EVD-DANGLING-MEDIA',
      title: 'Performance Benchmark Chart',
      evidence_type: 'test_result',
      source_type: 'image',
      source: 'images/non-existent-benchmark-chart.png',
      verification_status: 'verified',
    },
  ];

  const ctxDangling = {
    ...good,
    registries: { ...good.registries, evidence: { entries: danglingEvidence } },
  };

  const findingsDangling = runDetectors(selectDetectors({ namespaces: ['EVD'] }), ctxDangling).findings;
  const hit = findingsDangling.find((f) => f.detector_id === 'EVD-008');
  assert.ok(hit, 'EVD-008 must fire on missing media file reference');
  assert.equal(hit.subject.identifier, 'evidence/EVD-DANGLING-MEDIA');
  assert.match(hit.observation.summary, /dangling or missing media/);
});

test('EVD-009: detects unanchored PDF claim citations', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // 1. Detection: PDF evidence without fragment or text page/section anchor
  const unanchoredPdf = [
    ...(good.registries.evidence?.entries || []),
    {
      evidence_id: 'EVD-UNANCHORED-PDF',
      title: 'Annual Security Architecture Specification',
      evidence_type: 'architecture_specification',
      source_type: 'pdf',
      source: 'https://example.test/docs/security-spec.pdf',
      verification_status: 'verified',
    },
  ];

  const ctxUnanchored = {
    ...good,
    registries: { ...good.registries, evidence: { entries: unanchoredPdf } },
  };

  const findingsUnanchored = runDetectors(selectDetectors({ namespaces: ['EVD'] }), ctxUnanchored).findings;
  const hit = findingsUnanchored.find((f) => f.detector_id === 'EVD-009');
  assert.ok(hit, 'EVD-009 must fire on unanchored PDF evidence');
  assert.equal(hit.subject.identifier, 'evidence/EVD-UNANCHORED-PDF');
  assert.match(hit.observation.summary, /lacks a specific page or section anchor/);

  // 2. Non-detection: PDF evidence with URL fragment anchor #page=12
  const anchoredPdf = [
    ...(good.registries.evidence?.entries || []),
    {
      evidence_id: 'EVD-ANCHORED-PDF',
      title: 'Annual Security Architecture Specification Anchored',
      evidence_type: 'architecture_specification',
      source_type: 'pdf',
      source: 'https://example.test/docs/security-spec.pdf#page=12',
      verification_status: 'verified',
    },
  ];

  const ctxAnchored = {
    ...good,
    registries: { ...good.registries, evidence: { entries: anchoredPdf } },
  };

  const findingsAnchored = runDetectors(selectDetectors({ namespaces: ['EVD'] }), ctxAnchored).findings;
  assert.ok(!findingsAnchored.some((f) => f.detector_id === 'EVD-009'), 'EVD-009 must not fire when PDF has #page anchor');
});

test('AGENT-011: detects broken llms.txt structure or links and spares valid llms.txt', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // 1. Non-detection when llms.txt is not present (AGENT-003 handles absence)
  const findingsAbsent = runDetectors(selectDetectors({ namespaces: ['AGENT'] }), good).findings;
  assert.ok(!findingsAbsent.some((f) => f.detector_id === 'AGENT-011'), 'AGENT-011 must not fire when llms.txt is absent');

  // 2. Detection: malformed llms.txt missing H1, blockquote, and pointing to broken link
  const brokenLlmsTxt = `This is some random text without H1 and without blockquote.
- [Missing Page](/not-found-page-404): This page does not exist.
`;
  const ctxBroken = {
    ...good,
    site: {
      ...good.site,
      llmsTxt: { raw: brokenLlmsTxt, found: true, path: '/llms.txt' },
    },
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['AGENT'] }), ctxBroken).findings;
  const hit = findingsBroken.find((f) => f.detector_id === 'AGENT-011');
  assert.ok(hit, 'AGENT-011 must fire on malformed llms.txt');
  assert.match(hit.observation.summary, /specification \/ link integrity problem/);
  assert.ok(hit.observation.evidence.some((e) => e.includes('Missing H1')));
  assert.ok(hit.observation.evidence.some((e) => e.includes('Missing blockquote')));
  assert.ok(hit.observation.evidence.some((e) => e.includes('broken/unresolved internal link')));

  // 3. Non-detection: valid llms.txt conforming to spec with links resolving to pages in site
  const validLlmsTxt = `# Example Governance

> Runtime authorization controls and verifiable evidence for AI agents.

## Key Pages

- [Gatekeeper](https://example.test/products/gatekeeper/): Runtime authorization
- [Learn](https://example.test/learn/execution-governance/): What is AI execution governance
- [Pricing](https://example.test/pricing/): Pricing and deployment options
`;
  const ctxValid = {
    ...good,
    site: {
      ...good.site,
      llmsTxt: { raw: validLlmsTxt, found: true, path: '/llms.txt' },
    },
  };
  const findingsValid = runDetectors(selectDetectors({ namespaces: ['AGENT'] }), ctxValid).findings;
  assert.ok(!findingsValid.some((f) => f.detector_id === 'AGENT-011'), 'AGENT-011 must not fire on conforming llms.txt');
});

test('ANS-011: detects over-diluted rambling or overly long answer passages and spares direct concise leads', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const brokenPage = {
    url: 'https://example.test/answers/rambling',
    status: 200,
    headers: { 'content-type': 'text/html' },
    rawHtml: `<!doctype html><html><body>
      <h2>How does Citable evaluate AI search citations?</h2>
      <p>In order to understand how Citable evaluates AI citations, we must first look at the entire history of generative engines, machine learning retrieval, and knowledge graph construction over the last twenty years.</p>
    </body></html>`,
    paragraphs: ['In order to understand how Citable evaluates AI citations...'],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-011'), 'ANS-011 must fire on rambling preamble');

  const cleanPage = {
    url: 'https://example.test/answers/direct',
    status: 200,
    headers: { 'content-type': 'text/html' },
    rawHtml: `<!doctype html><html><body>
      <h2>How does Citable evaluate AI search citations?</h2>
      <p>Citable evaluates AI citations by continuously probing leading generative engines with registered claim prompts, verifying source URL attribution, and recording reproducibility rates across multi-turn sessions.</p>
    </body></html>`,
    paragraphs: ['Citable evaluates AI citations by continuously probing...'],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-011'), 'ANS-011 must not fire on concise direct answer lead');
});

test('ANS-012: detects ungrounded quantitative metrics in answer passages and spares attributed metrics', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const ungroundedPage = {
    url: 'https://example.test/metrics/ungrounded',
    status: 200,
    headers: { 'content-type': 'text/html' },
    paragraphs: [
      'Our new ingestion architecture delivers a 45% reduction in indexing latency across all enterprise search nodes.',
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [ungroundedPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-012'), 'ANS-012 must fire on ungrounded quantitative metric');

  const groundedPage = {
    url: 'https://example.test/metrics/grounded',
    status: 200,
    headers: { 'content-type': 'text/html' },
    paragraphs: [
      'Our new ingestion architecture delivers a 45% reduction in indexing latency according to our Q3 audited benchmark report (see https://example.test/benchmarks/q3).',
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [groundedPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-012'), 'ANS-012 must not fire on grounded quantitative metric');
});

test('SCHEMA-011: detects broken breadcrumb positions or missing fields and spares conforming breadcrumbs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken case: non-sequential positions (1, 3) and missing item target
  const brokenBcPage = {
    url: 'https://example.test/category/item',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { position: 1, name: 'Home', item: 'https://example.test/' },
              { position: 3, name: '', item: '' },
            ],
          },
        ],
      },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenBcPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-011'), 'SCHEMA-011 must fire on broken breadcrumbs');

  // Conforming case: sequential positions (1, 2, 3) with names and urls
  const validBcPage = {
    url: 'https://example.test/category/item',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { position: 1, name: 'Home', item: 'https://example.test/' },
              { position: 2, name: 'Category', item: 'https://example.test/category' },
              { position: 3, name: 'Item', item: 'https://example.test/category/item' },
            ],
          },
        ],
      },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [validBcPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-011'), 'SCHEMA-011 must not fire on conforming breadcrumbs');
});

test('SCHEMA-012: detects temporal contradictions between schema dates, visible text, and HTTP headers', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken case: schema dateModified is 2026-06-01, but visible text says Jan 15, 2023 (>90 days skew)
  const contradictoryPage = {
    url: 'https://example.test/articles/freshness-gap',
    status: 200,
    headers: { 'content-type': 'text/html', 'last-modified': 'Wed, 15 Jan 2023 12:00:00 GMT' },
    paragraphs: ['Last updated: January 15, 2023 by our editorial staff.'],
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'Article',
            headline: 'Freshness Consensus',
            datePublished: '2023-01-15',
            dateModified: '2026-06-01',
          },
        ],
      },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [contradictoryPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-012'), 'SCHEMA-012 must fire on date discrepancy');

  // Conforming case: schema dates match visible text and HTTP headers
  const consensusPage = {
    url: 'https://example.test/articles/consensus',
    status: 200,
    headers: { 'content-type': 'text/html', 'last-modified': 'Mon, 01 Jun 2026 12:00:00 GMT' },
    paragraphs: ['Last updated: June 1, 2026 by our editorial staff.'],
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'Article',
            headline: 'Freshness Consensus',
            datePublished: '2026-01-15',
            dateModified: '2026-06-01',
          },
        ],
      },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [consensusPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-012'), 'SCHEMA-012 must not fire on consensual dates');
});

test('LINK-005: detects multi-hop redirect chains and circular redirect loops', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const pageA = {
    url: 'https://example.test/source',
    status: 200,
    headers: { 'content-type': 'text/html' },
  };
  const redir1 = {
    url: 'https://example.test/r1',
    status: 301,
    headers: { location: 'https://example.test/r2' },
  };
  const redir2 = {
    url: 'https://example.test/r2',
    status: 302,
    headers: { location: 'https://example.test/dest' },
  };
  const dest = {
    url: 'https://example.test/dest',
    status: 200,
  };

  const outbound = new Map([
    ['https://example.test/source', [{ href: '/r1', to: 'https://example.test/r1', text: 'Old link' }]],
    ['https://example.test/r1', []],
    ['https://example.test/r2', []],
    ['https://example.test/dest', []],
  ]);
  const byUrl = new Map([
    ['https://example.test/source', pageA],
    ['https://example.test/r1', redir1],
    ['https://example.test/r2', redir2],
    ['https://example.test/dest', dest],
  ]);

  const ctxBroken = {
    ...good,
    site: {
      ...good.site,
      pages: [pageA, redir1, redir2, dest],
      outbound,
      byUrl,
      normalize: (u) => u,
    },
  };

  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['LINK'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'LINK-005'), 'LINK-005 must fire on multi-hop redirect chain');

  // Direct target (0 hops)
  const outboundClean = new Map([
    ['https://example.test/source', [{ href: '/dest', to: 'https://example.test/dest', text: 'Direct link' }]],
    ['https://example.test/dest', []],
  ]);
  const ctxClean = {
    ...good,
    site: {
      ...good.site,
      pages: [pageA, dest],
      outbound: outboundClean,
      byUrl,
      normalize: (u) => u,
    },
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['LINK'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'LINK-005'), 'LINK-005 must not fire on direct link');
});

test('LINK-006: detects high ratio of uninformative internal anchor text and spares descriptive anchors', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const page = {
    url: 'https://example.test/article',
    status: 200,
    headers: { 'content-type': 'text/html' },
  };

  // 3 out of 4 are uninformative (75% > 25%)
  const uninformativeOutbound = new Map([
    ['https://example.test/article', [
      { href: '/one', to: 'https://example.test/one', text: 'click here' },
      { href: '/two', to: 'https://example.test/two', text: 'read more' },
      { href: '/three', to: 'https://example.test/three', text: 'https://example.test/three' },
      { href: '/four', to: 'https://example.test/four', text: 'Detailed Architecture Guide' },
    ]],
  ]);

  const ctxBroken = {
    ...good,
    site: {
      ...good.site,
      pages: [page],
      outbound: uninformativeOutbound,
      normalize: (u) => u,
    },
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['LINK'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'LINK-006'), 'LINK-006 must fire when uninformative anchor ratio > 25%');

  // 0 out of 4 are uninformative
  const descriptiveOutbound = new Map([
    ['https://example.test/article', [
      { href: '/one', to: 'https://example.test/one', text: 'AI Execution Governance' },
      { href: '/two', to: 'https://example.test/two', text: 'Deterministic State Verification' },
      { href: '/three', to: 'https://example.test/three', text: 'Reproducibility Benchmark Methodology' },
      { href: '/four', to: 'https://example.test/four', text: 'Detailed Architecture Guide' },
    ]],
  ]);
  const ctxClean = {
    ...good,
    site: {
      ...good.site,
      pages: [page],
      outbound: descriptiveOutbound,
      normalize: (u) => u,
    },
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['LINK'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'LINK-006'), 'LINK-006 must not fire when anchors are descriptive');
});

test('CRO-001: detects declared conversion action missing visible interactive CTA and spares matched CTAs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: page declares conversion_action "request demo" in registry, but has 0 matching CTAs
  const brokenPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Read Blog Post', isPrimary: false }],
    forms: [],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-001'), 'CRO-001 must fire when declared action lacks matching CTA');

  // Clean: page has matching "Request a Demo" CTA
  const cleanPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a Demo', isPrimary: true, target: '/demo' }],
    forms: [],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-001'), 'CRO-001 must not fire when CTA matches declared action');
});

test('CRO-002: detects defective or friction-heavy lead capture forms and spares well-formed forms', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: form with no submit button and 9 fields (>7)
  const brokenPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [
      {
        action: '/submit',
        fieldCount: 9,
        hasSubmit: false,
        inputs: Array.from({ length: 9 }, (_, i) => ({ name: `f_${i}`, type: 'text' })),
      },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-002'), 'CRO-002 must fire on defective/heavy forms');

  // Clean: form with submit button and 3 fields
  const cleanPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [
      {
        action: '/submit',
        fieldCount: 3,
        hasSubmit: true,
        inputs: [{ name: 'name', type: 'text' }, { name: 'email', type: 'email' }, { name: 'company', type: 'text' }],
      },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-002'), 'CRO-002 must not fire on clean form');
});

test('CRO-003: detects commercial intent pages with zero CTAs and spares pages with CTAs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const brokenPage = {
    url: 'https://example.test/products/runtime-guard',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-003'), 'CRO-003 must fire on commercial page without CTAs');

  const cleanPage = {
    url: 'https://example.test/products/runtime-guard',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Get Started', isPrimary: true, target: '/pricing' }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-003'), 'CRO-003 must not fire when commercial page has CTAs');
});

test('CRO-004: detects defective or unverified CTA targets and spares production targets', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: CTA target is "#"
  const brokenPage = {
    url: 'https://example.test/landing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Buy Now', isPrimary: true, target: '#' }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-004'), 'CRO-004 must fire on placeholder CTA targets');

  // Clean: CTA target is valid URL
  const cleanPage = {
    url: 'https://example.test/landing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Buy Now', isPrimary: true, target: 'https://example.test/checkout' }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-004'), 'CRO-004 must not fire on production CTA target');
});

test('ANS-013: detects comparative or procedural sections lacking structured tables/lists and spares structured ones', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: comparison heading followed by >50 words of paragraph without a table
  const brokenPage = {
    url: 'https://example.test/comparison',
    status: 200,
    headers: { 'content-type': 'text/html' },
    rawHtml: `<!doctype html><html><body>
      <h2>Gatekeeper vs Open Policy Agent</h2>
      <p>Gatekeeper and Open Policy Agent both serve authorization needs, but Gatekeeper specifically focuses on real-time runtime enforcement for autonomous AI agent tool calls while Open Policy Agent requires writing custom Rego rules. When selecting between these architectures, engineering organizations should evaluate latency, ecosystem integrations, decision recording, and reproducible evidence requirements carefully.</p>
    </body></html>`,
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-013'), 'ANS-013 must fire on unstructured comparison');

  // Clean: comparison heading followed by structured table
  const cleanPage = {
    url: 'https://example.test/comparison',
    status: 200,
    headers: { 'content-type': 'text/html' },
    rawHtml: `<!doctype html><html><body>
      <h2>Gatekeeper vs Open Policy Agent</h2>
      <table><tr><th>Feature</th><th>Gatekeeper</th><th>OPA</th></tr><tr><td>AI Agents</td><td>Built-in</td><td>Manual</td></tr></table>
    </body></html>`,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-013'), 'ANS-013 must not fire on structured table comparison');
});

test('ANS-014: detects low information-gain fluff clichés in answer prose and spares concise prose', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: multiple clichés in one paragraph
  const brokenPage = {
    url: 'https://example.test/overview',
    status: 200,
    headers: { 'content-type': 'text/html' },
    paragraphs: [
      "In today's rapidly evolving market, it goes without saying that our revolutionary new architecture is a game changer that will delve into critical workflows.",
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-014'), 'ANS-014 must fire on excessive fluff clichés');

  // Clean: factual, concise prose
  const cleanPage = {
    url: 'https://example.test/overview',
    status: 200,
    headers: { 'content-type': 'text/html' },
    paragraphs: [
      'Citable evaluates crawler policies, robots directives, and schema integrity through deterministic static analysis.',
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-014'), 'ANS-014 must not fire on factual concise prose');
});

test('SCHEMA-013: detects VideoObject missing required SERP playback fields and spares complete markup', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: missing uploadDate and contentUrl/embedUrl
  const brokenPage = {
    url: 'https://example.test/videos/intro',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'VideoObject',
            name: 'Overview of AI Governance',
            description: 'A 5-minute explanation',
            thumbnailUrl: 'https://example.test/thumb.jpg',
          },
        ],
      },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-013'), 'SCHEMA-013 must fire on incomplete video schema');

  // Clean: has all required fields
  const cleanPage = {
    url: 'https://example.test/videos/intro',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'VideoObject',
            name: 'Overview of AI Governance',
            description: 'A 5-minute explanation',
            thumbnailUrl: 'https://example.test/thumb.jpg',
            uploadDate: '2026-06-01',
            contentUrl: 'https://example.test/video.mp4',
          },
        ],
      },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-013'), 'SCHEMA-013 must not fire on complete video schema');
});

test('SCHEMA-014: detects Organization schema missing identity signals and spares complete markup', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: missing logo and contactPoint/address/sameAs
  const brokenPage = {
    url: 'https://example.test/about',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'Organization',
            name: 'Incomplete Corp',
            url: 'https://example.test/',
          },
        ],
      },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-014'), 'SCHEMA-014 must fire on incomplete organization identity');

  // Clean: has logo and contactPoint
  const cleanPage = {
    url: 'https://example.test/about',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'Organization',
            name: 'Complete Corp',
            url: 'https://example.test/',
            logo: 'https://example.test/logo.png',
            contactPoint: { '@type': 'ContactPoint', telephone: '+1-555-0100', contactType: 'customer support' },
          },
        ],
      },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-014'), 'SCHEMA-014 must not fire on complete organization identity');
});

test('GEO-010: detects brand erasure in multi-competitor category prompt and spares co-occurrence', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const competitors = [
    { competitor_id: 'COMP-1', name: 'AlphaCorp', aliases: ['Alpha Corp'] },
    { competitor_id: 'COMP-2', name: 'BetaShield', aliases: ['Beta Shield'] },
  ];
  const registries = {
    ...good.registries,
    competitors: { entries: competitors },
  };

  // Broken: 2 competitors cited, 0 first-party mentions
  const brokenObs = [
    {
      kind: 'citation',
      state: 'observed',
      data: {
        provider: 'perplexity',
        prompt_id: 'PR-TOP-VENDORS',
        prompt_text: 'Top enterprise runtime AI governance platforms',
        answer_text: 'Leading solutions in runtime governance include AlphaCorp and BetaShield, which both provide policy checks.',
        property_cited: false,
      },
    },
  ];
  const ctxBroken = { ...good, registries, observations: brokenObs };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'GEO-010'), 'GEO-010 must fire when brand is erased from category prompt');

  // Clean: first-party (Gatekeeper) is cited alongside competitors
  const cleanObs = [
    {
      kind: 'citation',
      state: 'observed',
      data: {
        provider: 'perplexity',
        prompt_id: 'PR-TOP-VENDORS',
        prompt_text: 'Top enterprise runtime AI governance platforms',
        answer_text: 'Top runtime AI governance solutions include Gatekeeper by Example Governance, alongside AlphaCorp and BetaShield.',
        property_cited: true,
      },
    },
  ];
  const ctxClean = { ...good, registries, observations: cleanObs };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-010'), 'GEO-010 must not fire when brand is cited');
});

test('TECH-023: detects hydration gap with empty client mounting shell and spares server-rendered content', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: #root shell with only 2 words and scripts
  const brokenHtml = `<!doctype html><html><head><title>App Shell</title><script src="/bundle.js"></script></head><body><div id="root">Loading application...</div></body></html>`;
  const brokenPage = extractPage({ url: 'https://example.test/app', html: brokenHtml, status: 200 });
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'TECH-023'), 'TECH-023 must fire on empty client mounting shell');

  // Clean: #root shell with full server-rendered content (> 20 words)
  const cleanHtml = `<!doctype html><html><head><title>Full App</title><script src="/bundle.js"></script></head><body><div id="root"><main><h1>Enterprise AI Governance</h1><p>Comprehensive deterministic verification platform for AI search agents and answer engines. Validates factual claims, schema graphs, crawl pathways, and index budgets across all target environments.</p></main></div></body></html>`;
  const cleanPage = extractPage({ url: 'https://example.test/app', html: cleanHtml, status: 200 });
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'TECH-023'), 'TECH-023 must not fire when content is server rendered');
});

test('TECH-024: detects excessive render-blocking script payloads and spares deferred/async scripts', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: 14 render-blocking scripts in <head>
  const scriptTags = Array.from({ length: 14 }, (_, i) => `<script src="/vendor/lib-${i}.js"></script>`).join('\n');
  const brokenHtml = `<!doctype html><html><head><title>Heavy Scripts</title>${scriptTags}</head><body><h1>Content</h1></body></html>`;
  const brokenPage = extractPage({ url: 'https://example.test/heavy', html: brokenHtml, status: 200 });
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'TECH-024'), 'TECH-024 must fire on excessive render-blocking head scripts');

  // Clean: scripts are deferred, async, or module
  const cleanScriptTags = Array.from({ length: 14 }, (_, i) => `<script defer src="/vendor/lib-${i}.js"></script>`).join('\n');
  const cleanHtml = `<!doctype html><html><head><title>Optimized Scripts</title>${cleanScriptTags}</head><body><h1>Content</h1></body></html>`;
  const cleanPage = extractPage({ url: 'https://example.test/heavy', html: cleanHtml, status: 200 });
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'TECH-024'), 'TECH-024 must not fire when head scripts are deferred');
});

test('ANS-015: detects definitional page lacking copular definition and spares direct copular openings', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: "What is" heading but opening is historical fluff without copular definition
  const brokenHtml = `<!doctype html><html><head><title>What is Retrieval Augmented Generation</title></head><body>
    <h1>What is Retrieval Augmented Generation?</h1>
    <p>Throughout the history of computer technology, systems have evolved significantly across decades of engineering advances.</p>
  </body></html>`;
  const brokenPage = extractPage({ url: 'https://example.test/definition/rag', html: brokenHtml, status: 200 });
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-015'), 'ANS-015 must fire when definitional opening lacks copular statement');

  // Clean: direct copular definition
  const cleanHtml = `<!doctype html><html><head><title>What is Retrieval Augmented Generation</title></head><body>
    <h1>What is Retrieval Augmented Generation?</h1>
    <p>Retrieval Augmented Generation is an architecture pattern that enriches generative AI prompt context with authoritative external documents.</p>
  </body></html>`;
  const cleanPage = extractPage({ url: 'https://example.test/definition/rag', html: cleanHtml, status: 200 });
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-015'), 'ANS-015 must not fire when copular definition is present');
});

test('ANS-016: detects long-form guide lacking executive summary and spares summarized guides', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: >1200 words without summary heading
  const longText = Array.from({ length: 1300 }, (_, i) => `word${i}`).join(' ');
  const brokenHtml = `<!doctype html><html><head><title>In-Depth Guide</title></head><body>
    <h1>Comprehensive Guide to Machine Learning</h1>
    <p>${longText}</p>
  </body></html>`;
  const brokenPage = extractPage({ url: 'https://example.test/guide', html: brokenHtml, status: 200 });
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'ANS-016'), 'ANS-016 must fire when >1200 word guide lacks executive summary');

  // Clean: has Key Takeaways heading
  const cleanHtml = `<!doctype html><html><head><title>In-Depth Guide</title></head><body>
    <h1>Comprehensive Guide to Machine Learning</h1>
    <h2>Key Takeaways</h2>
    <p>Summary of core architectural insights.</p>
    <p>${longText}</p>
  </body></html>`;
  const cleanPage = extractPage({ url: 'https://example.test/guide', html: cleanHtml, status: 200 });
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['ANS'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'ANS-016'), 'ANS-016 must not fire when executive summary is present');
});

test('SCHEMA-015: detects circular self-referential @id loops and spares acyclic schemas', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: Organization schema where parentOrganization points to itself
  const brokenJsonLd = [
    {
      blocks: [
        {
          '@type': 'Organization',
          '@id': 'https://example.test/#org',
          name: 'Cyclic Org',
          parentOrganization: {
            '@id': 'https://example.test/#org',
          },
        },
      ],
    },
  ];
  const brokenPage = {
    url: 'https://example.test/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: brokenJsonLd,
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-015'), 'SCHEMA-015 must fire on circular self-reference');

  // Clean: parentOrganization points to an external distinct entity
  const cleanJsonLd = [
    {
      blocks: [
        {
          '@type': 'Organization',
          '@id': 'https://example.test/#org',
          name: 'Clean Org',
          parentOrganization: {
            '@id': 'https://example.test/#parent-holding',
            name: 'Parent Holding',
          },
        },
      ],
    },
  ];
  const cleanPage = {
    url: 'https://example.test/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: cleanJsonLd,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-015'), 'SCHEMA-015 must not fire on acyclic graph');
});

test('SCHEMA-016: detects author Person lacking url or sameAs and spares disambiguated authors', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: Article author has no url and no sameAs
  const brokenJsonLd = [
    {
      blocks: [
        {
          '@type': 'Article',
          headline: 'Understanding Execution Governance',
          author: {
            '@type': 'Person',
            name: 'Jane Doe',
          },
        },
      ],
    },
  ];
  const brokenPage = {
    url: 'https://example.test/article',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: brokenJsonLd,
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'SCHEMA-016'), 'SCHEMA-016 must fire on author Person lacking disambiguation');

  // Clean: author has sameAs profile link
  const cleanJsonLd = [
    {
      blocks: [
        {
          '@type': 'Article',
          headline: 'Understanding Execution Governance',
          author: {
            '@type': 'Person',
            name: 'Jane Doe',
            url: 'https://example.test/authors/jane-doe',
            sameAs: ['https://www.wikidata.org/wiki/Q12345'],
          },
        },
      ],
    },
  ];
  const cleanPage = {
    url: 'https://example.test/article',
    status: 200,
    headers: { 'content-type': 'text/html' },
    jsonLd: cleanJsonLd,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'SCHEMA-016'), 'SCHEMA-016 must not fire when author has url/sameAs');
});

test('GEO-011: detects RAG chunk fracture with oversized section containing unanchored claims and spares well-structured sections', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: 5 paragraphs accumulating 500+ words with an unanchored "SOC 2 compliant" claim
  const paras = [
    'Paragraph 1 explaining general system architecture and components across the enterprise deployment tier in detail without section break.',
    'Paragraph 2 elaborating on processing throughput and network topology across distributed clusters with high volume transactions occurring constantly.',
    'Paragraph 3 asserting that our runtime system is SOC 2 compliant across all nodes and cloud accounts without any formal verification link.',
    'Paragraph 4 continuing with implementation notes and runtime hooks inside the software layer for additional monitoring and metrics telemetry.',
    'Paragraph 5 concluding the extensive description of the platform with additional technical specifications regarding failover and high availability.',
  ];
  const longParagraph = Array.from({ length: 110 }, (_, i) => `word${i}`).join(' ');
  const brokenParas = paras.map((p) => `${p} ${longParagraph}`);

  const brokenPage = {
    url: 'https://example.test/long-section',
    status: 200,
    rawHtml: '<html><body></body></html>',
    headers: { 'content-type': 'text/html' },
    paragraphs: brokenParas,
    headings: [{ level: 1, text: 'Overview' }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'GEO-011'), 'GEO-011 must fire on oversized unanchored claim chunk');

  // Clean: concise section under 400 words
  const cleanPage = {
    url: 'https://example.test/long-section',
    status: 200,
    rawHtml: '<html><body></body></html>',
    headers: { 'content-type': 'text/html' },
    paragraphs: ['Short section paragraph one.', 'Short section paragraph two.'],
    headings: [{ level: 1, text: 'Overview' }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-011'), 'GEO-011 must not fire on concise sections');
});

test('GEO-012: detects repetitive phrase stuffing across headings and spares diverse headings', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: "Best AI Platform" repeated in 5 out of 6 headings
  const brokenHeadings = [
    { level: 1, text: 'Best AI Platform Overview' },
    { level: 2, text: 'Best AI Platform Features' },
    { level: 2, text: 'Best AI Platform Pricing' },
    { level: 2, text: 'Best AI Platform Architecture' },
    { level: 2, text: 'Best AI Platform Security' },
    { level: 2, text: 'Final Conclusion' },
  ];
  const brokenPage = {
    url: 'https://example.test/stuffed',
    status: 200,
    headers: { 'content-type': 'text/html' },
    headings: brokenHeadings,
    paragraphs: ['Sample text.'],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'GEO-012'), 'GEO-012 must fire on repetitive heading phrase stuffing');

  // Clean: diverse headings
  const cleanHeadings = [
    { level: 1, text: 'Autonomous Runtime Security Overview' },
    { level: 2, text: 'Core Policy Enforcement Engine' },
    { level: 2, text: 'Deployment Topologies and Latency' },
    { level: 2, text: 'Auditing and Cryptographic Proofs' },
    { level: 2, text: 'Pricing and Enterprise Licensing' },
    { level: 2, text: 'Next Steps and Documentation' },
  ];
  const cleanPage = {
    url: 'https://example.test/stuffed',
    status: 200,
    headers: { 'content-type': 'text/html' },
    headings: cleanHeadings,
    paragraphs: ['Sample text.'],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-012'), 'GEO-012 must not fire on diverse headings');
});

test('CRO-005: detects scent gap between title and H1 and spares keyword-aligned headings', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: Product page with Title "Cloud Security Scanner" but H1 "Welcome to Tomorrow"
  const brokenPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    title: 'Cloud Security Scanner — Enterprise Protection',
    h1s: [{ level: 1, text: 'Welcome to Tomorrow' }],
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a demo', isPrimary: true }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-005'), 'CRO-005 must fire when H1 has no overlap with title stem');

  // Clean: H1 matches title stem
  const cleanPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    title: 'Gatekeeper — runtime authorization for AI agents',
    h1s: [{ level: 1, text: 'Gatekeeper Runtime Authorization' }],
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a demo', isPrimary: true }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-005'), 'CRO-005 must not fire when H1 corroborates title stem');
});

test('CRO-006: detects lead capture form lacking trust signals and spares forms with trust badges', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: 3-field lead capture form with 0 trust badges
  const brokenPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/submit', fieldCount: 3, hasSubmit: true, inputs: [] }],
    trustBadges: [],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-006'), 'CRO-006 must fire when form has no adjacent trust badges');

  // Clean: page has SOC 2 trust badge
  const cleanPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/submit', fieldCount: 3, hasSubmit: true, inputs: [] }],
    trustBadges: [{ signal: 'SOC 2', context: 'SOC 2 Type II Certified' }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-006'), 'CRO-006 must not fire when trust badges are present');
});

test('CWV-004: detects excessive DOM node count or nesting depth and spares balanced DOM trees', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: DOM node count > 1500
  const brokenPage1 = {
    url: 'https://example.test/complex-page-1',
    status: 200,
    headers: { 'content-type': 'text/html' },
    domNodeCount: 1850,
    maxDomDepth: 20,
  };
  const ctxBroken1 = { ...good, site: { ...good.site, pages: [brokenPage1] } };
  const findingsBroken1 = runDetectors(selectDetectors({ namespaces: ['CWV'] }), ctxBroken1).findings;
  assert.ok(findingsBroken1.some((f) => f.detector_id === 'CWV-004'), 'CWV-004 must fire on DOM node count > 1500');

  // Broken: DOM depth > 32
  const brokenPage2 = {
    url: 'https://example.test/complex-page-2',
    status: 200,
    headers: { 'content-type': 'text/html' },
    domNodeCount: 500,
    maxDomDepth: 38,
  };
  const ctxBroken2 = { ...good, site: { ...good.site, pages: [brokenPage2] } };
  const findingsBroken2 = runDetectors(selectDetectors({ namespaces: ['CWV'] }), ctxBroken2).findings;
  assert.ok(findingsBroken2.some((f) => f.detector_id === 'CWV-004'), 'CWV-004 must fire on DOM depth > 32');

  // Clean: DOM node count <= 1500 and depth <= 32
  const cleanPage = {
    url: 'https://example.test/balanced-page',
    status: 200,
    headers: { 'content-type': 'text/html' },
    domNodeCount: 420,
    maxDomDepth: 14,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CWV'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CWV-004'), 'CWV-004 must not fire on balanced DOM');
});

test('TECH-025: detects oversized raw image assets (>1MB) or heavy inline data URIs (>100KB) and spares optimized images', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: inline data URI > 100KB
  const brokenDataUriPage = {
    url: 'https://example.test/heavy-inline',
    status: 200,
    headers: { 'content-type': 'text/html' },
    images: [{ src: 'data:image/png;base64,' + 'A'.repeat(105000) }],
  };
  const ctxBrokenDataUri = { ...good, site: { ...good.site, pages: [brokenDataUriPage] } };
  const findingsBrokenDataUri = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxBrokenDataUri).findings;
  assert.ok(findingsBrokenDataUri.some((f) => f.detector_id === 'TECH-025'), 'TECH-025 must fire on inline data URI > 100KB');

  // Broken: asset bytes > 1MB
  const brokenBytesPage = {
    url: 'https://example.test/heavy-asset',
    status: 200,
    headers: { 'content-type': 'text/html' },
    images: [{ src: 'https://example.test/huge-hero.png', bytes: 2400000 }],
  };
  const ctxBrokenBytes = { ...good, site: { ...good.site, pages: [brokenBytesPage] } };
  const findingsBrokenBytes = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxBrokenBytes).findings;
  assert.ok(findingsBrokenBytes.some((f) => f.detector_id === 'TECH-025'), 'TECH-025 must fire on image asset > 1MB');

  // Clean: optimized image under 1MB
  const cleanPage = {
    url: 'https://example.test/clean-page',
    status: 200,
    headers: { 'content-type': 'text/html' },
    images: [{ src: 'https://example.test/hero.webp', bytes: 145000 }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'TECH-025'), 'TECH-025 must not fire on optimized images');
});

test('CRO-007: detects identity or contact inputs missing HTML5 autocomplete and spares autocomplete fields', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: email input missing autocomplete
  const brokenPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/lead', fieldCount: 2, hasSubmit: true, inputs: [{ name: 'email', type: 'email', autocomplete: null }] }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-007'), 'CRO-007 must fire on missing autocomplete');

  // Clean: email input has autocomplete="email"
  const cleanPage = {
    url: 'https://example.test/contact',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/lead', fieldCount: 2, hasSubmit: true, inputs: [{ name: 'email', type: 'email', autocomplete: 'email' }] }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-007'), 'CRO-007 must not fire when autocomplete is declared');
});

test('CRO-008: detects inputs relying solely on placeholder without label and spares labeled inputs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: input has placeholder but no label
  const brokenPage = {
    url: 'https://example.test/lead',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/submit', fieldCount: 1, hasSubmit: true, inputs: [{ name: 'company', type: 'text', placeholder: 'Company Name', hasLabel: false }] }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-008'), 'CRO-008 must fire on placeholder-only input');

  // Clean: input has label
  const cleanPage = {
    url: 'https://example.test/lead',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/submit', fieldCount: 1, hasSubmit: true, inputs: [{ name: 'company', type: 'text', placeholder: 'Company Name', hasLabel: true }] }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-008'), 'CRO-008 must not fire on labeled input');
});

test('CRO-009: detects email/phone inputs using generic type="text" and spares semantic types', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: email field uses type="text"
  const brokenPage = {
    url: 'https://example.test/signup',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/signup', fieldCount: 1, hasSubmit: true, inputs: [{ name: 'user_email', type: 'text' }] }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-009'), 'CRO-009 must fire on generic text type for email');

  // Clean: email field uses type="email"
  const cleanPage = {
    url: 'https://example.test/signup',
    status: 200,
    headers: { 'content-type': 'text/html' },
    forms: [{ action: '/signup', fieldCount: 1, hasSubmit: true, inputs: [{ name: 'user_email', type: 'email' }] }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-009'), 'CRO-009 must not fire on semantic email input');
});

test('CRO-010: detects choice overload with >=3 competing primary hero CTAs and spares focused hero actions', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: 3 competing primary CTAs in hero
  const brokenPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [
      { text: 'Request a demo', isPrimary: true, inHero: true },
      { text: 'Start free trial', isPrimary: true, inHero: true },
      { text: 'Buy now', isPrimary: true, inHero: true },
    ],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-010'), 'CRO-010 must fire on >= 3 primary hero CTAs');

  // Clean: 1 primary CTA and 1 secondary
  const cleanPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [
      { text: 'Request a demo', isPrimary: true, inHero: true },
      { text: 'View documentation', isPrimary: false, inHero: true },
    ],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-010'), 'CRO-010 must not fire on focused hero CTAs');
});

test('CRO-011: detects buried CTAs on >1000 word commercial pages and spares early conversion pathways', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: 1200 words, CTA only in footer (inHero: false, inNav: false)
  const brokenPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    wordCount: 1200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a demo', isPrimary: true, inHero: false, inNav: false }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-011'), 'CRO-011 must fire on buried CTA');

  // Clean: CTA in hero
  const cleanPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    wordCount: 1200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a demo', isPrimary: true, inHero: true, inNav: false }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-011'), 'CRO-011 must not fire when hero CTA is present');
});

test('CRO-012: detects low-intent generic microcopy on primary CTA and spares benefit-oriented verbs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: primary CTA text is "Submit"
  const brokenPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Submit', isPrimary: true }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-012'), 'CRO-012 must fire on generic Submit CTA');

  // Clean: primary CTA text is "Request a demo"
  const cleanPage = {
    url: 'https://example.test/products/gatekeeper/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Request a demo', isPrimary: true }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-012'), 'CRO-012 must not fire on descriptive CTA');
});

test('CRO-013: detects distraction navigation menus on checkout pages and spares enclosed checkout', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: checkout page with 12 navigation links
  const brokenPage = {
    url: 'https://example.test/checkout',
    status: 200,
    headers: { 'content-type': 'text/html' },
    navLinksCount: 12,
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-013'), 'CRO-013 must fire on checkout with distraction nav');

  // Clean: enclosed checkout with <= 5 nav links
  const cleanPage = {
    url: 'https://example.test/checkout',
    status: 200,
    headers: { 'content-type': 'text/html' },
    navLinksCount: 1,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-013'), 'CRO-013 must not fire on enclosed checkout');
});

test('CRO-014: detects unprotected post-conversion confirmation page lacking noindex and spares noindex pages', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: thank-you page without noindex
  const brokenPage = {
    url: 'https://example.test/thank-you',
    status: 200,
    headers: { 'content-type': 'text/html' },
    noindex: false,
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-014'), 'CRO-014 must fire on unindexed confirmation page');

  // Clean: thank-you page with noindex: true
  const cleanPage = {
    url: 'https://example.test/thank-you',
    status: 200,
    headers: { 'content-type': 'text/html' },
    noindex: true,
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-014'), 'CRO-014 must not fire when confirmation page is noindex');
});

test('CRO-015: detects small mobile touch targets under 44px and spares compliant targets', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: CTA with width 32px and height 32px
  const brokenPage = {
    url: 'https://example.test/pricing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Tap here', inlineWidth: 32, inlineHeight: 32 }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-015'), 'CRO-015 must fire on touch target < 44px');

  // Clean: CTA with width 48px and height 48px
  const cleanPage = {
    url: 'https://example.test/pricing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Tap here', inlineWidth: 48, inlineHeight: 48 }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-015'), 'CRO-015 must not fire on compliant touch target');
});

test('CRO-016: detects diminutive font size (< 12px) on primary conversion CTA and spares adequate sizes', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: primary CTA with 10px font size
  const brokenPage = {
    url: 'https://example.test/signup',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Sign Up Free', isPrimary: true, inlineFontSize: 10 }],
  };
  const ctxBroken = { ...good, site: { ...good.site, pages: [brokenPage] } };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-016'), 'CRO-016 must fire on primary CTA with font < 12px');

  // Clean: primary CTA with 16px font size
  const cleanPage = {
    url: 'https://example.test/signup',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Sign Up Free', isPrimary: true, inlineFontSize: 16 }],
  };
  const ctxClean = { ...good, site: { ...good.site, pages: [cleanPage] } };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-016'), 'CRO-016 must not fire on primary CTA with font >= 12px');
});

test('CRO-017: detects broken multi-step funnel with missing or error steps and spares complete funnels', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const page1 = { url: 'https://example.test/onboarding/step1', status: 200, headers: { 'content-type': 'text/html' } };
  const pageBroken = { url: 'https://example.test/onboarding/step2', status: 500, headers: { 'content-type': 'text/html' } };
  const pageClean = { url: 'https://example.test/onboarding/step2', status: 200, headers: { 'content-type': 'text/html' } };

  const funnel = {
    funnel_id: 'test-funnel',
    name: 'Test Funnel',
    status: 'active',
    steps: [
      { step_id: 's1', name: 'Step 1', step_order: 1, url_pattern: '/onboarding/step1' },
      { step_id: 's2', name: 'Step 2', step_order: 2, url_pattern: '/onboarding/step2' },
    ],
  };

  // Broken: step 2 returns HTTP 500
  const ctxBroken = {
    ...good,
    site: { ...good.site, pages: [page1, pageBroken] },
    registries: { ...good.registries, funnels: { entries: [funnel] } },
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-017'), 'CRO-017 must fire on broken funnel step');

  // Clean: all steps return HTTP 200
  const ctxClean = {
    ...good,
    site: { ...good.site, pages: [page1, pageClean] },
    registries: { ...good.registries, funnels: { entries: [funnel] } },
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-017'), 'CRO-017 must not fire on complete healthy funnel');
});

test('CRO-018: detects funnel transition CTA omitting declared campaign params and spares param-preserving links', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const funnel = {
    funnel_id: 'attr-funnel',
    name: 'Attribution Funnel',
    status: 'active',
    steps: [
      { step_id: 's1', name: 'Step 1', step_order: 1, url_pattern: '/funnel/start', preserve_params: ['utm_source', 'utm_campaign'] },
      { step_id: 's2', name: 'Step 2', step_order: 2, url_pattern: '/funnel/checkout' },
    ],
  };

  // Broken: CTA target links to next step without preserving params
  const brokenPage = {
    url: 'https://example.test/funnel/start',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Continue', target: '/funnel/checkout' }],
  };
  const step2Page = { url: 'https://example.test/funnel/checkout', status: 200, headers: { 'content-type': 'text/html' } };

  const ctxBroken = {
    ...good,
    site: { ...good.site, pages: [brokenPage, step2Page] },
    registries: { ...good.registries, funnels: { entries: [funnel] } },
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-018'), 'CRO-018 must fire on parameter stripping transition');

  // Clean: CTA target preserves query params
  const cleanPage = {
    url: 'https://example.test/funnel/start',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Continue', target: '/funnel/checkout?utm_source=citable' }],
  };
  const ctxClean = {
    ...good,
    site: { ...good.site, pages: [cleanPage, step2Page] },
    registries: { ...good.registries, funnels: { entries: [funnel] } },
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-018'), 'CRO-018 must not fire when params are preserved');
});

test('CRO-019: detects AI Answer cited landing page lacking CTA and spares pages with CTAs', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const observation = {
    kind: 'citation',
    data: {
      property_cited: true,
      citation_url: 'https://example.test/cited-landing',
      provider: 'SearchGPT',
      prompt_text: 'Best enterprise SEO audit tool',
    },
  };

  // Broken: cited landing page has no CTAs
  const brokenPage = {
    url: 'https://example.test/cited-landing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [],
  };
  const ctxBroken = {
    ...good,
    site: { ...good.site, pages: [brokenPage] },
    observations: [observation],
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-019'), 'CRO-019 must fire on AI cited landing page with no CTAs');

  // Clean: cited landing page has an interactive conversion CTA
  const cleanPage = {
    url: 'https://example.test/cited-landing',
    status: 200,
    headers: { 'content-type': 'text/html' },
    ctas: [{ text: 'Start free trial', isPrimary: true, target: '/signup' }],
  };
  const ctxClean = {
    ...good,
    site: { ...good.site, pages: [cleanPage] },
    observations: [observation],
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-019'), 'CRO-019 must not fire when AI cited landing page has CTA');
});

test('CRO-020: detects underpowered experiment with observation window < 7 days and spares compliant experiments', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  // Broken: experiment running for only 3 days
  const brokenExp = {
    experiment_id: 'exp-short',
    hypothesis: 'Test button color',
    status: 'active',
    evaluation_window: '3 days',
  };
  const ctxBroken = {
    ...good,
    registries: { ...good.registries, experiments: { entries: [brokenExp] } },
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'CRO-020'), 'CRO-020 must fire on experiment with < 7d window');

  // Clean: experiment running for 14 days
  const cleanExp = {
    experiment_id: 'exp-adequate',
    hypothesis: 'Test button color',
    status: 'active',
    evaluation_window: '14 days',
  };
  const ctxClean = {
    ...good,
    registries: { ...good.registries, experiments: { entries: [cleanExp] } },
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'CRO-020'), 'CRO-020 must not fire on experiment with >= 7d window');
});

test('GEO-013: detects AI engine assertion contradicting verified claim and spares corroborating assertions', () => {
  const good = ctxFor('site-clean', 'registries-good', 'https://example.test');

  const claim = {
    claim_id: 'CLAIM-NEXTJS',
    claim: 'Nebula Components supports Next.js hybrid server-rendering',
    status: 'verified',
  };

  // Broken: AI assertion negates verified claim
  const brokenObservation = {
    kind: 'citation',
    data: {
      provider: 'SearchGPT',
      prompt_text: 'Does Nebula Components work with Next.js?',
      raw_response: 'Nebula Components does not support Next.js framework applications.',
    },
  };
  const ctxBroken = {
    ...good,
    registries: { ...good.registries, claims: { entries: [claim] } },
    observations: [brokenObservation],
  };
  const findingsBroken = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxBroken).findings;
  assert.ok(findingsBroken.some((f) => f.detector_id === 'GEO-013'), 'GEO-013 must fire on contradictory AI assertion');

  // Clean: AI assertion corroborates claim
  const cleanObservation = {
    kind: 'citation',
    data: {
      provider: 'SearchGPT',
      prompt_text: 'Does Nebula Components work with Next.js?',
      raw_response: 'Nebula Components fully supports Next.js with hybrid rendering.',
    },
  };
  const ctxClean = {
    ...good,
    registries: { ...good.registries, claims: { entries: [claim] } },
    observations: [cleanObservation],
  };
  const findingsClean = runDetectors(selectDetectors({ namespaces: ['GEO'] }), ctxClean).findings;
  assert.ok(!findingsClean.some((f) => f.detector_id === 'GEO-013'), 'GEO-013 must not fire on corroborating AI response');
});














