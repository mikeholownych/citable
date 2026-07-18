import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPage } from '../../src/extractor/page.js';
import { parseRobots, isAllowed } from '../../src/crawler/robots.js';
import { parseSitemap } from '../../src/crawler/sitemap.js';
import { fetchUrl } from '../../src/crawler/fetch.js';

test('extractPage captures title, canonical, robots, headings, links, jsonld', () => {
  const html = `<!doctype html><html lang="en"><head><title>T</title>
    <meta name="description" content="D"><meta name="robots" content="noindex, nosnippet">
    <link rel="canonical" href="https://x.test/a/">
    <script type="application/ld+json">{"@type":"Organization","name":"X"}</script>
    </head><body><h1>H</h1><h2>Sub</h2><p>Hello world text.</p><a href="/b/">to b</a>
    <div style="display:none">hidden secret</div></body></html>`;
  const p = extractPage({ url: 'https://x.test/a/', html });
  assert.equal(p.title, 'T');
  assert.equal(p.metaDescription, 'D');
  assert.equal(p.noindex, true);
  assert.equal(p.nosnippet, true);
  assert.deepEqual(p.canonicals, ['https://x.test/a/']);
  assert.equal(p.h1s.length, 1);
  assert.equal(p.links.length, 1);
  assert.equal(p.jsonLd.length, 1);
  assert.equal(p.jsonLd[0].blocks[0].name, 'X');
  assert.ok(p.hiddenTexts.includes('hidden secret'));
  assert.ok(p.wordCount > 0);
});

test('extractPage reports JSON-LD parse errors without throwing', () => {
  const p = extractPage({ url: 'https://x.test/', html: `<html><head><script type="application/ld+json">{oops</script></head><body></body></html>` });
  assert.equal(p.jsonLd.length, 1);
  assert.ok(p.jsonLd[0].parseError);
});

test('x-robots-tag header contributes to noindex', () => {
  const p = extractPage({ url: 'https://x.test/', html: '<html><head><title>t</title></head><body></body></html>', headers: { 'x-robots-tag': 'noindex' } });
  assert.equal(p.noindex, true);
});

test('robots parser: group matching and longest-rule precedence', () => {
  const r = parseRobots(`User-agent: Googlebot\nDisallow: /private/\nAllow: /private/ok/\n\nUser-agent: *\nDisallow: /tmp/\nSitemap: https://x.test/sitemap.xml`);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.sitemaps, ['https://x.test/sitemap.xml']);
  assert.equal(isAllowed(r, 'Googlebot', '/private/x').allowed, false);
  assert.equal(isAllowed(r, 'Googlebot', '/private/ok/y').allowed, true);
  assert.equal(isAllowed(r, 'Googlebot', '/tmp/z').allowed, true); // specific group wins, no /tmp rule there
  assert.equal(isAllowed(r, 'SomeOtherBot', '/tmp/z').allowed, false);
  assert.equal(isAllowed(r, 'SomeOtherBot', '/fine').allowed, true);
});

test('robots parser records unknown directives as errors', () => {
  const r = parseRobots('User-agent: *\nWeird-directive: nonsense');
  assert.equal(r.errors.length, 1);
});

test('sitemap parser: urlset and index', () => {
  const s = parseSitemap(`<?xml version="1.0"?><urlset><url><loc>https://x.test/</loc><lastmod>2026-01-01</lastmod></url></urlset>`);
  assert.equal(s.isIndex, false);
  assert.equal(s.urls.length, 1);
  assert.equal(s.urls[0].lastmod, '2026-01-01');
  const i = parseSitemap(`<sitemapindex><sitemap><loc>https://x.test/a.xml</loc></sitemap></sitemapindex>`);
  assert.equal(i.isIndex, true);
  assert.equal(i.children.length, 1);
});

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }];

test('fetchUrl refuses redirects outside the audited origin', async () => {
  const fetchImpl = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://other.example/next' },
  });
  await assert.rejects(
    fetchUrl('https://audit.example/', { fetchImpl, lookup: publicLookup }),
    /redirect.*origin/i,
  );
});

test('fetchUrl refuses private and loopback destinations', async () => {
  await assert.rejects(
    fetchUrl('http://127.0.0.1/private', { fetchImpl: globalThis.fetch }),
    /private|loopback/i,
  );
  await assert.rejects(
    fetchUrl('http://[::1]/private', { fetchImpl: globalThis.fetch }),
    /private|loopback/i,
  );
});

test('fetchUrl rejects response bodies above the configured byte limit', async () => {
  const fetchImpl = async () => new Response('x'.repeat(32));
  await assert.rejects(
    fetchUrl('https://audit.example/', { fetchImpl, lookup: publicLookup, maxBodyBytes: 16 }),
    /body.*16 bytes/i,
  );
});

test('fetchUrl applies a fresh timeout to every retry attempt', async () => {
  let attempts = 0;
  const fetchImpl = async (_url, { signal }) => {
    attempts += 1;
    if (attempts === 1) throw new TypeError('transient network failure');
    return await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  await assert.rejects(
    fetchUrl('https://audit.example/', {
      fetchImpl,
      lookup: publicLookup,
      maxRetries: 2,
      retryDelayMs: 0,
      timeoutMs: 10,
    }),
    /abort|timeout/i,
  );
  assert.equal(attempts, 2);
});
