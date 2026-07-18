import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPage } from '../../src/extractor/page.js';
import { parseRobots, isAllowed } from '../../src/crawler/robots.js';
import { parseSitemap } from '../../src/crawler/sitemap.js';

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
