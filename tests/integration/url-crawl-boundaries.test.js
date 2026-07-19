import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteFromUrl } from '../../src/extractor/site.js';
import { runDetectors } from '../../src/detectors/framework.js';
import { selectDetectors } from '../../src/detectors/index.js';

function fetcherFor(routes) {
  return async (input) => {
    const url = new URL(input);
    const route = routes[url.pathname] || { status: 404, type: 'text/html', body: 'missing' };
    return { url: url.href, status: route.status, headers: { 'content-type': route.type }, body: route.body, redirectChain: [] };
  };
}

test('URL discovery preserves utility links without crawling them as pages', async () => {
  const origin = 'https://fixture.test';
  const fetcher = fetcherFor({
    '/': { status: 200, type: 'text/html', body: '<a href="/page-2">Page</a><a href="/cdn-cgi/l/email-protection#abc">Email</a>' },
    '/page-2': { status: 200, type: 'text/html', body: '<title>Page 2</title><h1>Page 2</h1>' },
    '/robots.txt': { status: 200, type: 'text/plain', body: 'User-agent: *\nAllow: /' },
  });
  const site = await buildSiteFromUrl(origin, { maxPages: 10, fetcher });
    assert.deepEqual(site.pages.map((page) => new URL(page.url).pathname).sort(), ['/', '/page-2']);
  assert.ok(site.outbound.get(`${origin}/`).some((link) => link.to.includes('/cdn-cgi/l/email-protection')));
});

test('crawl ceiling records incomplete coverage instead of TECH-010 sitemap errors', async () => {
  const origin = 'https://fixture.test';
  const fetcher = fetcherFor({
    '/': { status: 200, type: 'text/html', body: '<a href="/page-2">Page 2</a>' },
    '/robots.txt': { status: 200, type: 'text/plain', body: `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml` },
    '/sitemap.xml': { status: 200, type: 'application/xml', body: `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/page-2</loc></url></urlset>` },
  });
  const site = await buildSiteFromUrl(origin, { maxPages: 1, fetcher });
    assert.equal(site.crawl.truncated, true);
    assert.equal(site.crawl.pendingUrlCount, 1);
    const ctx = { site, registries: { pages: { entries: [] } }, config: { audit: {} }, refDate: new Date('2026-07-19'), runId: 'test', timestamp: '2026-07-19T00:00:00Z' };
    const findings = runDetectors(selectDetectors({ namespaces: ['TECH'] }), ctx).findings;
    assert.ok(!findings.some((finding) => finding.detector_id === 'TECH-010'));
});
