import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { collectSitemapTopology } from '../../src/crawler/sitemapCollector.js';
import { fetchUrl } from '../../src/crawler/fetch.js';
import { buildSiteFromUrl } from '../../src/extractor/site.js';

const ORIGIN = 'https://fixture.test';

function response(url, body, {
  status = 200,
  type = 'application/xml',
  headers = {},
  effectiveUrl = url,
} = {}) {
  return {
    url: effectiveUrl,
    status,
    headers: { 'content-type': type, ...headers },
    body,
    redirectChain: [],
  };
}

function routeFetcher(routes, calls = []) {
  return async (input) => {
    const url = new URL(input).href;
    calls.push(url);
    const route = routes[new URL(url).pathname];
    if (route instanceof Error) throw route;
    return route ?? response(url, 'missing', { status: 404, type: 'text/plain' });
  };
}

test('collectSitemapTopology traverses nested indexes in deterministic queue order', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex>
        <sitemap><loc>${ORIGIN}/first.xml</loc></sitemap>
        <sitemap><loc>${ORIGIN}/nested.xml</loc></sitemap>
      </sitemapindex>`),
    '/first.xml': response(`${ORIGIN}/first.xml`, `
      <urlset><url><loc>${ORIGIN}/first</loc></url></urlset>`),
    '/nested.xml': response(`${ORIGIN}/nested.xml`, `
      <sitemapindex><sitemap><loc>${ORIGIN}/last.xml</loc></sitemap></sitemapindex>`),
    '/last.xml': response(`${ORIGIN}/last.xml`, `
      <urlset><url><loc>${ORIGIN}/last</loc></url></urlset>`),
  }, calls);

  const result = await collectSitemapTopology(`${ORIGIN}/root.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, [
    `${ORIGIN}/root.xml`,
    `${ORIGIN}/first.xml`,
    `${ORIGIN}/nested.xml`,
    `${ORIGIN}/last.xml`,
  ]);
  assert.deepEqual(result.documents.map(({ requested_url, depth, parent_url, status }) => ({
    requested_url, depth, parent_url, status,
  })), [
    { requested_url: `${ORIGIN}/root.xml`, depth: 0, parent_url: null, status: 'fetched' },
    { requested_url: `${ORIGIN}/first.xml`, depth: 1, parent_url: `${ORIGIN}/root.xml`, status: 'fetched' },
    { requested_url: `${ORIGIN}/nested.xml`, depth: 1, parent_url: `${ORIGIN}/root.xml`, status: 'fetched' },
    { requested_url: `${ORIGIN}/last.xml`, depth: 2, parent_url: `${ORIGIN}/nested.xml`, status: 'fetched' },
  ]);
  assert.deepEqual(result.urls.map(({ url, sitemap_url }) => ({ url, sitemap_url })), [
    { url: `${ORIGIN}/first`, sitemap_url: `${ORIGIN}/first.xml` },
    { url: `${ORIGIN}/last`, sitemap_url: `${ORIGIN}/last.xml` },
  ]);
});

test('collectSitemapTopology deduplicates multiple entry documents and listed URLs', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/one.xml': response(`${ORIGIN}/one.xml`, `
      <sitemapindex><sitemap><loc>${ORIGIN}/shared.xml</loc></sitemap></sitemapindex>`),
    '/two.xml': response(`${ORIGIN}/two.xml`, `
      <sitemapindex><sitemap><loc>${ORIGIN}/shared.xml</loc></sitemap></sitemapindex>`),
    '/shared.xml': response(`${ORIGIN}/shared.xml`, `
      <urlset>
        <url><loc>${ORIGIN}/same</loc></url>
        <url><loc>${ORIGIN}/same#fragment</loc></url>
      </urlset>`),
  }, calls);

  const result = await collectSitemapTopology([
    `${ORIGIN}/one.xml`, `${ORIGIN}/two.xml`, `${ORIGIN}/one.xml`,
  ], { fetcher, origin: ORIGIN });

  assert.deepEqual(calls, [`${ORIGIN}/one.xml`, `${ORIGIN}/two.xml`, `${ORIGIN}/shared.xml`]);
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/same`]);
});

test('collectSitemapTopology handles gzip by extension and magic bytes and decodes XML loc entities', async () => {
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex>
        <sitemap><loc>${ORIGIN}/extension.xml.gz</loc></sitemap>
        <sitemap><loc>${ORIGIN}/magic.xml</loc></sitemap>
      </sitemapindex>`),
    '/extension.xml.gz': response(
      `${ORIGIN}/extension.xml.gz`,
      gzipSync(`<urlset><url><loc>${ORIGIN}/search?a=1&amp;b=2</loc></url></urlset>`),
      { type: 'application/gzip' },
    ),
    '/magic.xml': response(
      `${ORIGIN}/magic.xml`,
      gzipSync(`<urlset><url><loc>${ORIGIN}/magic</loc></url></urlset>`),
      { type: 'application/xml' },
    ),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/root.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.documents.map((document) => document.compression), ['none', 'gzip', 'gzip']);
  assert.deepEqual(result.urls.map((entry) => entry.url), [
    `${ORIGIN}/search?a=1&b=2`,
    `${ORIGIN}/magic`,
  ]);
});

test('collectSitemapTopology preserves compressed bytes when using the production fetcher', async () => {
  const compressed = gzipSync(`<urlset><url><loc>${ORIGIN}/binary</loc></url></urlset>`);
  const fetcher = (url, options) => fetchUrl(url, {
    ...options,
    maxRetries: 1,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => new Response(compressed, {
      status: 200,
      headers: { 'content-type': 'application/gzip' },
    }),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/sitemap.xml.gz`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/binary`]);
});

test('collectSitemapTopology does not double-decompress an HTTP gzip body already decoded by fetch', async () => {
  const xml = `<urlset><url><loc>${ORIGIN}/transport-decoded</loc></url></urlset>`;
  const fetcher = (url, options) => fetchUrl(url, {
    ...options,
    maxRetries: 1,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    // Node fetch exposes decompressed response bytes while retaining this header.
    fetchImpl: async () => new Response(xml, {
      status: 200,
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/xml',
      },
    }),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'complete');
  assert.equal(result.documents[0].compression, 'gzip');
  assert.equal(result.documents[0].compression_transport_decoded, true);
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/transport-decoded`]);
});

test('collectSitemapTopology preserves valid entries while reporting malformed and missing loc values', async () => {
  const fetcher = routeFetcher({
    '/sitemap.xml': response(`${ORIGIN}/sitemap.xml`, `
      <urlset>
        <url><loc>${ORIGIN}/valid</loc></url>
        <url><lastmod>2026-09-19</lastmod></url>
        <url><loc>http://[broken</loc></url>
      </urlset>`),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.documents[0].status, 'malformed');
  assert.match(result.documents[0].parse_errors.join('\n'), /missing <loc>/);
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/valid`]);
  assert.ok(result.exclusions.some((entry) => entry.reason === 'malformed_url'));
});

test('collectSitemapTopology marks a document malformed when its only loc value is syntactically invalid', async () => {
  const fetcher = routeFetcher({
    '/sitemap.xml': response(`${ORIGIN}/sitemap.xml`, `
      <urlset><url><loc>http://[broken</loc></url></urlset>`),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.documents[0].status, 'malformed');
  assert.equal(result.documents[0].failure_reason, 'sitemap_parse_error');
  assert.match(result.documents[0].parse_errors.join('\n'), /malformed <loc>/);
});

test('collectSitemapTopology rejects entry-shaped XML without a complete sitemap root', async () => {
  const fetcher = routeFetcher({
    '/sitemap.xml': response(`${ORIGIN}/sitemap.xml`, `
      <url><loc>${ORIGIN}/orphan</loc></url>`),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.documents[0].status, 'malformed');
  assert.match(result.documents[0].parse_errors.join('\n'), /no <urlset>/);
  assert.deepEqual(result.urls, []);
});

test('collectSitemapTopology excludes out-of-origin entries, children, and page URLs without fetching them', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex>
        <sitemap><loc>${ORIGIN}/pages.xml</loc></sitemap>
        <sitemap><loc>https://other.test/child.xml</loc></sitemap>
      </sitemapindex>`),
    '/pages.xml': response(`${ORIGIN}/pages.xml`, `
      <urlset>
        <url><loc>${ORIGIN}/inside</loc></url>
        <url><loc>https://other.test/outside</loc></url>
      </urlset>`),
  }, calls);

  const result = await collectSitemapTopology([
    `${ORIGIN}/root.xml`, 'https://other.test/entry.xml',
  ], { fetcher, origin: ORIGIN });

  assert.deepEqual(calls, [`${ORIGIN}/root.xml`, `${ORIGIN}/pages.xml`]);
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/inside`]);
  assert.equal(result.exclusions.filter((entry) => entry.reason === 'out_of_origin').length, 3);
  assert.equal(result.status, 'indeterminate');
});

test('collectSitemapTopology reports max-depth truncation without fetching deeper children', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex><sitemap><loc>${ORIGIN}/child.xml</loc></sitemap></sitemapindex>`),
    '/child.xml': response(`${ORIGIN}/child.xml`, '<urlset></urlset>'),
  }, calls);

  const result = await collectSitemapTopology(`${ORIGIN}/root.xml`, {
    fetcher, origin: ORIGIN, maxDepth: 0,
  });

  assert.deepEqual(calls, [`${ORIGIN}/root.xml`]);
  assert.equal(result.status, 'truncated');
  assert.deepEqual(result.stop_reasons, ['max_depth_exceeded']);
  assert.match(result.limitations[0], /maximum depth of 0/);
});

test('collectSitemapTopology reports max-document truncation and leaves queued documents unfetched', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex>
        <sitemap><loc>${ORIGIN}/one.xml</loc></sitemap>
        <sitemap><loc>${ORIGIN}/two.xml</loc></sitemap>
      </sitemapindex>`),
    '/one.xml': response(`${ORIGIN}/one.xml`, '<urlset></urlset>'),
    '/two.xml': response(`${ORIGIN}/two.xml`, '<urlset></urlset>'),
  }, calls);

  const result = await collectSitemapTopology(`${ORIGIN}/root.xml`, {
    fetcher, origin: ORIGIN, maxDocuments: 2,
  });

  assert.deepEqual(calls, [`${ORIGIN}/root.xml`, `${ORIGIN}/one.xml`]);
  assert.equal(result.documents.length, 2);
  assert.equal(result.status, 'truncated');
  assert.deepEqual(result.stop_reasons, ['max_documents_exceeded']);
});

test('collectSitemapTopology fails closed when gzip output exceeds the uncompressed limit', async () => {
  const fetcher = routeFetcher({
    '/bomb.xml.gz': response(
      `${ORIGIN}/bomb.xml.gz`,
      gzipSync(`<urlset>${' '.repeat(4096)}</urlset>`),
      { type: 'application/gzip' },
    ),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/bomb.xml.gz`, {
    fetcher, origin: ORIGIN, maxUncompressedBytes: 128,
  });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.documents[0].status, 'failed');
  assert.equal(result.documents[0].failure_reason, 'max_uncompressed_bytes_exceeded');
  assert.equal(result.documents[0].compression, 'gzip');
  assert.deepEqual(result.urls, []);
});

test('collectSitemapTopology rejects nonsensical traversal bounds before fetching', async () => {
  let fetched = false;
  const fetcher = async () => {
    fetched = true;
    return response(`${ORIGIN}/sitemap.xml`, '<urlset></urlset>');
  };

  await assert.rejects(
    collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN, maxDocuments: 0 }),
    /maxDocuments/,
  );
  await assert.rejects(
    collectSitemapTopology(`${ORIGIN}/sitemap.xml`, { fetcher, origin: ORIGIN, maxDepth: -1 }),
    /maxDepth/,
  );
  assert.equal(fetched, false);
});

test('collectSitemapTopology keeps a successful sibling when another child fetch fails', async () => {
  const fetcher = routeFetcher({
    '/root.xml': response(`${ORIGIN}/root.xml`, `
      <sitemapindex>
        <sitemap><loc>${ORIGIN}/failed.xml</loc></sitemap>
        <sitemap><loc>${ORIGIN}/ok.xml</loc></sitemap>
      </sitemapindex>`),
    '/failed.xml': new Error('connection reset'),
    '/ok.xml': response(`${ORIGIN}/ok.xml`, `
      <urlset><url><loc>${ORIGIN}/survivor</loc></url></urlset>`),
  });

  const result = await collectSitemapTopology(`${ORIGIN}/root.xml`, { fetcher, origin: ORIGIN });

  assert.equal(result.status, 'indeterminate');
  assert.deepEqual(result.documents.map((document) => document.status), ['fetched', 'failed', 'fetched']);
  assert.deepEqual(result.urls.map((entry) => entry.url), [`${ORIGIN}/survivor`]);
});

test('URL collection fetches all robots sitemap declarations before pages and adds sitemap-only pages to the frontier', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/robots.txt': response(`${ORIGIN}/robots.txt`, `
      User-agent: *
      Sitemap: ${ORIGIN}/one.xml
      Sitemap: ${ORIGIN}/two.xml`, { type: 'text/plain' }),
    '/one.xml': response(`${ORIGIN}/one.xml`, `
      <urlset><url><loc>${ORIGIN}/only-one</loc></url></urlset>`),
    '/two.xml': response(`${ORIGIN}/two.xml`, `
      <urlset><url><loc>${ORIGIN}/only-two</loc></url></urlset>`),
    '/': response(`${ORIGIN}/`, '<a href="/linked">Linked</a>', { type: 'text/html' }),
    '/only-one': response(`${ORIGIN}/only-one`, '<h1>One</h1>', { type: 'text/html' }),
    '/only-two': response(`${ORIGIN}/only-two`, '<h1>Two</h1>', { type: 'text/html' }),
    '/linked': response(`${ORIGIN}/linked`, '<h1>Linked</h1>', { type: 'text/html' }),
  }, calls);

  const site = await buildSiteFromUrl(`${ORIGIN}/`, { fetcher, maxPages: 10 });

  assert.deepEqual(calls, [
    `${ORIGIN}/robots.txt`, `${ORIGIN}/one.xml`, `${ORIGIN}/two.xml`,
    `${ORIGIN}/`, `${ORIGIN}/only-one`, `${ORIGIN}/only-two`, `${ORIGIN}/linked`,
  ]);
  assert.deepEqual(site.pages.map((page) => new URL(page.url).pathname), ['/', '/only-one', '/only-two', '/linked']);
  assert.equal(site.pages.find((page) => page.url.endsWith('/only-one')).discoverySource, 'sitemap');
  assert.equal(site.sitemaps.length, 2);
  assert.ok(site.sitemaps.every((sitemap) => sitemap.parsed.urls.length === 1));
  assert.equal(site.sitemapTopology.status, 'complete');
});

test('URL collection uses /sitemap.xml when robots has no sitemap declaration', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/robots.txt': response(`${ORIGIN}/robots.txt`, 'User-agent: *\nAllow: /', { type: 'text/plain' }),
    '/sitemap.xml': response(`${ORIGIN}/sitemap.xml`, '<urlset></urlset>'),
    '/': response(`${ORIGIN}/`, '<h1>Home</h1>', { type: 'text/html' }),
  }, calls);

  const site = await buildSiteFromUrl(`${ORIGIN}/`, { fetcher });

  assert.deepEqual(calls, [`${ORIGIN}/robots.txt`, `${ORIGIN}/sitemap.xml`, `${ORIGIN}/`]);
  assert.equal(site.sitemapTopology.status, 'complete');
});

test('URL collection keeps valid entries from a partially malformed sitemap in legacy site.sitemaps', async () => {
  const fetcher = routeFetcher({
    '/robots.txt': response(`${ORIGIN}/robots.txt`, `Sitemap: ${ORIGIN}/partial.xml`, { type: 'text/plain' }),
    '/partial.xml': response(`${ORIGIN}/partial.xml`, `
      <urlset>
        <url><loc>${ORIGIN}/valid</loc></url>
        <url><lastmod>2026-09-19</lastmod></url>
      </urlset>`),
    '/': response(`${ORIGIN}/`, '<h1>Home</h1>', { type: 'text/html' }),
    '/valid': response(`${ORIGIN}/valid`, '<h1>Valid</h1>', { type: 'text/html' }),
  });

  const site = await buildSiteFromUrl(`${ORIGIN}/`, { fetcher });

  assert.equal(site.sitemapTopology.status, 'indeterminate');
  assert.equal(site.sitemapTopology.documents[0].status, 'malformed');
  assert.match(site.sitemapTopology.documents[0].parse_errors.join('\n'), /missing <loc>/);
  assert.equal(site.sitemaps.length, 1);
  assert.equal(site.sitemaps[0].status, 'malformed');
  assert.deepEqual(site.sitemaps[0].parsed.urls.map((entry) => entry.loc), [`${ORIGIN}/valid`]);
  assert.match(site.sitemaps[0].parsed.errors.join('\n'), /missing <loc>/);
});

test('page budget counts sitemap-discovered pages and exposes the remaining sitemap frontier', async () => {
  const calls = [];
  const fetcher = routeFetcher({
    '/robots.txt': response(`${ORIGIN}/robots.txt`, `Sitemap: ${ORIGIN}/sitemap.xml`, { type: 'text/plain' }),
    '/sitemap.xml': response(`${ORIGIN}/sitemap.xml`, `
      <urlset>
        <url><loc>${ORIGIN}/one</loc></url>
        <url><loc>${ORIGIN}/two</loc></url>
        <url><loc>${ORIGIN}/three</loc></url>
      </urlset>`),
    '/': response(`${ORIGIN}/`, '<h1>Home</h1>', { type: 'text/html' }),
    '/one': response(`${ORIGIN}/one`, '<h1>One</h1>', { type: 'text/html' }),
  }, calls);

  const site = await buildSiteFromUrl(`${ORIGIN}/`, { fetcher, maxPages: 2 });

  assert.deepEqual(calls, [
    `${ORIGIN}/robots.txt`, `${ORIGIN}/sitemap.xml`, `${ORIGIN}/`, `${ORIGIN}/one`,
  ]);
  assert.equal(site.crawl.stopReason, 'page_budget_exhausted');
  assert.deepEqual(site.crawl.pendingUrls, [`${ORIGIN}/two`, `${ORIGIN}/three`]);
  assert.equal(site.crawl.pendingUrlCount, 2);
});

test('whole-run time exhaustion during topology collection truncates topology and prevents page scheduling', async () => {
  let elapsedMs = 0;
  const calls = [];
  const fetcher = async (input) => {
    const url = new URL(input).href;
    calls.push(url);
    const pathname = new URL(url).pathname;
    if (pathname === '/robots.txt') {
      return response(url, `Sitemap: ${ORIGIN}/root.xml`, { type: 'text/plain' });
    }
    if (pathname === '/root.xml') {
      elapsedMs = 1000;
      return response(url, `
        <sitemapindex><sitemap><loc>${ORIGIN}/child.xml</loc></sitemap></sitemapindex>`);
    }
    return response(url, '<urlset></urlset>');
  };

  const site = await buildSiteFromUrl(`${ORIGIN}/`, {
    fetcher,
    timeBudgetSeconds: 1,
    now: () => elapsedMs,
  });

  assert.deepEqual(calls, [`${ORIGIN}/robots.txt`, `${ORIGIN}/root.xml`]);
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.equal(site.crawl.truncated, true);
  assert.equal(site.sitemapTopology.status, 'truncated');
  assert.deepEqual(site.sitemapTopology.stop_reasons, ['time_budget_exhausted']);
});
