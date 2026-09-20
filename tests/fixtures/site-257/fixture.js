import { gzipSync } from 'node:zlib';

export const SPECIAL = Object.freeze({
  49: 'finding-a',
  50: 'finding-b',
  51: 'finding-c',
  99: 'redirect',
  100: 'finding-d',
  101: 'soft-404',
  149: 'timeout-then-success',
  150: 'permanent-timeout',
  199: 'unexpected-mime',
  200: 'finding-e',
  201: 'child-sitemap-only',
  249: 'canonical-duplicate',
  256: 'bot-challenge',
  257: 'finding-f',
});

const ORIGIN = 'https://site-257.test';

function pageUrl(number) {
  return `${ORIGIN}/${number}`;
}

function normalPage(number, { finding = false, canonical = null } = {}) {
  const noindex = finding ? '<meta name="robots" content="noindex">' : '';
  const canonicalTag = canonical ? `<link rel="canonical" href="${canonical}">` : '';
  return `<!doctype html><html><head><title>Fixture page ${number}</title>${noindex}${canonicalTag}</head><body><h1>Fixture page ${number}</h1><p>This is substantive deterministic fixture content for page ${number}, collected to prove bounded semantic coverage.</p></body></html>`;
}

function sitemapUrlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
}

function sitemapIndex(locations) {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join('')}</sitemapindex>`;
}

function ok(url, body, contentType = 'text/html', extra = {}) {
  return { url, status: 200, headers: { 'content-type': contentType, ...(extra.headers || {}) }, body, redirectChain: extra.redirectChain || [], attempts: extra.attempts || [] };
}

function attempt(attemptNumber, url, outcome, errorCode = null) {
  return { attempt: attemptNumber, url, startedAtMs: attemptNumber * 10, endedAtMs: attemptNumber * 10 + 1, elapsedMs: 1, outcome, status: outcome === 'response' ? 200 : null, errorCode, retryDecision: outcome === 'response' ? 'complete' : 'retry' };
}

function timeoutError(url, permanent = false) {
  const error = new Error(`fixture timeout for ${url}`);
  error.code = 'ETIMEDOUT';
  error.attempts = [1, 2, 3].map((n) => attempt(n, url, 'error', 'ETIMEDOUT'));
  if (!permanent) error.attempts.push(attempt(4, url, 'error', 'ETIMEDOUT'));
  return error;
}

/**
 * A deterministic, network-free site model used to prove that collection
 * limits and retrieval failures remain visible to every downstream consumer.
 */
export function createSite257({ failChildSitemap = true, failPage200 = false } = {}) {
  const mainUrls = Array.from({ length: 257 }, (_, i) => i + 1)
    .filter((number) => number !== 201)
    .map(pageUrl);
  const childUrl = `${ORIGIN}/sitemap-child.xml.gz`;
  const failedChildUrl = `${ORIGIN}/sitemap-failed.xml`;
  const indexUrl = `${ORIGIN}/sitemap-index.xml`;
  const mainUrl = `${ORIGIN}/sitemap-main.xml`;
  const childXml = sitemapUrlset([pageUrl(201), pageUrl(201), pageUrl(249)]);
  const rootXml = sitemapIndex([mainUrl, childUrl, failedChildUrl]);
  const mainXml = sitemapUrlset(mainUrls);
  const calls = new Map();

  const fetcher = async (url) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    calls.set(pathname, (calls.get(pathname) || 0) + 1);
    if (pathname === '/robots.txt') {
      return ok(url, `User-agent: *\nAllow: /\nSitemap: ${indexUrl}\nSitemap: ${mainUrl}\n`, 'text/plain');
    }
    if (pathname === '/sitemap.xml' || pathname === '/sitemap-index.xml') return ok(url, rootXml, 'application/xml');
    if (pathname === '/sitemap-main.xml') return ok(url, mainXml, 'application/xml');
    if (pathname === '/sitemap-child.xml.gz') {
      return { ...ok(url, gzipSync(childXml), 'application/xml', { headers: { 'content-encoding': 'gzip' } }), bodyBytes: gzipSync(childXml) };
    }
    if (pathname === '/sitemap-failed.xml') {
      if (failChildSitemap) return { url, status: 503, headers: { 'content-type': 'application/xml' }, body: '<error>child unavailable</error>', redirectChain: [] };
      return ok(url, '<not-a-sitemap>', 'application/xml');
    }
    const number = Number(pathname.slice(1));
    if (!Number.isInteger(number) || number < 1 || number > 257) return { url, status: 404, headers: { 'content-type': 'text/html' }, body: '<h1>Not found</h1>', redirectChain: [] };
    if (number === 150) throw timeoutError(url, true);
    if (number === 200 && failPage200) throw timeoutError(url, true);
    if (number === 99) return { url, status: 301, headers: { location: pageUrl(100), 'content-type': 'text/html' }, body: normalPage(100), redirectChain: [{ url, status: 301, location: pageUrl(100) }] };
    if (number === 101) return ok(url, '<!doctype html><html><head><title>Page not found</title></head><body><h1>Page not found</h1><p>The page you requested does not exist.</p></body></html>');
    if (number === 199) return ok(url, '%PDF-1.7 fixture bytes', 'application/pdf');
    if (number === 256) return ok(url, '<!doctype html><html><head><title>Just a moment</title></head><body><h1>Checking your browser</h1><p>Complete the security check to continue.</p></body></html>');
    if (number === 249) return ok(url, normalPage(number, { canonical: pageUrl(248) }));
    const finding = [49, 50, 51, 100, 200, 257].includes(number);
    const attempts = number === 149
      ? [attempt(1, url, 'error', 'ETIMEDOUT'), attempt(2, url, 'response')]
      : [];
    return ok(url, normalPage(number, { finding }), 'text/html', { attempts });
  };

  return {
    origin: ORIGIN,
    startUrl: pageUrl(1),
    fetcher,
    calls,
    expected: {
      special: SPECIAL,
      allPages: 257,
      childOnly: pageUrl(201),
      failedChild: failedChildUrl,
    },
  };
}

export { pageUrl };
