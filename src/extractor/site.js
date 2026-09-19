import fs from 'node:fs';
import path from 'node:path';
import { extractPage } from './page.js';
import { parseRobots } from '../crawler/robots.js';
import { parseSitemap } from '../crawler/sitemap.js';
import { collectSitemapTopology } from '../crawler/sitemapCollector.js';
import { fetchUrl } from '../crawler/fetch.js';
import { classifyResource } from '../crawler/resourceValidity.js';
import { createUrlIdentity } from '../crawler/urlIdentity.js';
import { createCoverageLedger } from '../evidence/coverage.js';

const MAX_PAGE_FETCH_ATTEMPTS = 100;
const SAFE_FETCH_ERROR_CODES = new Set([
  'FETCH_ABORTED', 'FETCH_BODY_LIMIT', 'FETCH_ERROR', 'FETCH_REDIRECT_INVALID',
  'FETCH_REDIRECT_LIMIT', 'FETCH_REDIRECT_ORIGIN', 'FETCH_TIMEOUT',
  'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
  'ENOTFOUND', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
]);

function sanitizeEvidenceUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    url.hash = '';
    if (url.search) url.search = '?[REDACTED]';
    return url.href;
  } catch {
    return '[invalid-url]';
  }
}

function safeErrorCode(value, fallback = 'FETCH_ERROR') {
  return typeof value === 'string' && SAFE_FETCH_ERROR_CODES.has(value) ? value : fallback;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeFetchAttempts(attempts) {
  if (!Array.isArray(attempts)) return { attempts: [], truncated: false };
  const bounded = attempts.slice(0, MAX_PAGE_FETCH_ATTEMPTS).map((rawAttempt, index) => {
    const attempt = rawAttempt && typeof rawAttempt === 'object' ? rawAttempt : {};
    const outcome = attempt.outcome === 'response' ? 'response' : 'error';
    return {
      attempt: Number.isInteger(attempt.attempt) && attempt.attempt > 0 ? attempt.attempt : index + 1,
      url: sanitizeEvidenceUrl(attempt.url),
      startedAtMs: finiteNonNegative(attempt.startedAtMs),
      endedAtMs: finiteNonNegative(attempt.endedAtMs),
      elapsedMs: finiteNonNegative(attempt.elapsedMs),
      outcome,
      status: Number.isInteger(attempt.status) && attempt.status >= 100 && attempt.status <= 599
        ? attempt.status
        : null,
      errorCode: outcome === 'error' ? safeErrorCode(attempt.errorCode) : null,
      retryDecision: ['retry', 'stop', 'redirect', 'complete'].includes(attempt.retryDecision)
        ? attempt.retryDecision
        : 'stop',
    };
  });
  return { attempts: bounded, truncated: attempts.length > MAX_PAGE_FETCH_ATTEMPTS };
}

function sanitizedFetchError(rawUrl, error) {
  const attempts = sanitizeFetchAttempts(error?.attempts).attempts;
  const reason = safeErrorCode(error?.code, attempts.at(-1)?.errorCode ?? 'FETCH_ERROR');
  return `${sanitizeEvidenceUrl(rawUrl)}: ${reason}`;
}

function sanitizedSitemapError(error) {
  const reason = typeof error?.reason === 'string' && /^[a-z0-9_]{1,80}$/.test(error.reason)
    ? error.reason
    : 'sitemap_error';
  return `${sanitizeEvidenceUrl(error?.url)}: ${reason}`;
}

function attachResourceMetadata(page, {
  requestedUrl,
  bodyComplete = true,
  fetchAttempts = [],
} = {}) {
  const effectiveUrl = page.url;
  const declaredCanonicalUrl = page.canonicals[0] ?? null;
  page.requestedUrl = requestedUrl ?? effectiveUrl;
  page.bodyComplete = bodyComplete === true;
  const sanitizedAttempts = sanitizeFetchAttempts(fetchAttempts);
  page.fetchAttempts = sanitizedAttempts.attempts;
  page.fetchAttemptsTruncated = sanitizedAttempts.truncated;
  page.resourceValidity = classifyResource({
    status: page.status,
    headers: page.headers,
    body: page.rawHtml,
    bodyComplete: page.bodyComplete,
    requestedUrl: page.requestedUrl,
    effectiveUrl,
  });
  page.urlIdentity = createUrlIdentity({
    requestedUrl: page.requestedUrl,
    effectiveUrl,
    redirectChain: page.redirectChain,
    declaredCanonicalUrl,
  });
  return page;
}

/**
 * Build a SiteModel from a directory of built/static HTML output.
 *
 * Transport metadata (status codes, headers, redirects) that only a server knows
 * can be declared in an optional `_citable-transport.json` sidecar:
 *   { "/old/": { "status": 301, "redirect_to": "/new/" }, "/x/": { "headers": { "x-robots-tag": "noindex" } } }
 */
export function buildSiteFromDir(dir, { baseUrl = 'https://example.test' } = {}) {
  const transportFile = path.join(dir, '_citable-transport.json');
  const transport = fs.existsSync(transportFile) ? JSON.parse(fs.readFileSync(transportFile, 'utf8')) : {};

  const pages = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.html?$/.test(name)) {
        const rel = path.relative(dir, p).split(path.sep).join('/');
        let urlPath = '/' + rel;
        if (urlPath.endsWith('/index.html')) urlPath = urlPath.slice(0, -'index.html'.length);
        const t = transport['/' + rel] || transport[urlPath] || {};
        const page = extractPage({
          url: new URL(urlPath, baseUrl).href,
          html: fs.readFileSync(p, 'utf8'),
          status: t.status ?? 200,
          headers: { 'content-type': 'text/html', ...(t.headers || {}) },
          sourceFile: p,
          redirectChain: [],
        });
        pages.push(attachResourceMetadata(page, { requestedUrl: page.url }));
      }
    }
  };
  walk(dir);

  const robotsPath = path.join(dir, 'robots.txt');
  const robotsText = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : null;

  const llmsPath = path.join(dir, 'llms.txt');
  const llmsText = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : null;
  const llmsFullPath = path.join(dir, 'llms-full.txt');
  const llmsFullText = fs.existsSync(llmsFullPath) ? fs.readFileSync(llmsFullPath, 'utf8') : null;

  const sitemaps = [];
  for (const f of fs.readdirSync(dir)) {
    if (/sitemap.*\.xml$/i.test(f)) {
      sitemaps.push({ source: f, parsed: parseSitemap(fs.readFileSync(path.join(dir, f), 'utf8')) });
    }
  }

  return assembleSite({ baseUrl, pages, robotsText, sitemaps, transport, mode: 'built_output', location: dir, llmsText, llmsFullText });
}

/** Build a SiteModel by fetching a deployed URL set (target URL + same-origin discovery, bounded). */
export async function buildSiteFromUrl(startUrl, {
  maxPages = 500, timeBudgetSeconds = 1800, userAgent, pageMaxBytes = 5 * 1024 * 1024,
  robotsMaxBytes = 512 * 1024, sitemapMaxBytes = 5 * 1024 * 1024,
  sitemapMaxDepth = 4, sitemapMaxDocuments = 1000,
  sitemapMaxUncompressedBytes = 20 * 1024 * 1024,
  sitemapMaxTotalUncompressedBytes = 100 * 1024 * 1024,
  sitemapMaxDiscoveredUrls = 50_000, sitemapMaxQueuedDocuments = 1000,
  sitemapMaxRawEntries = 100_000, sitemapMaxXmlTokens = 500_000,
  fetcher = fetchUrl,
  now = () => performance.now(),
} = {}) {
  const origin = new URL(startUrl).origin;
  const coverageLedger = createCoverageLedger({ startUrl, maxPages, timeBudgetSeconds });
  const startedAt = now();
  const timeExpired = () => now() - startedAt >= timeBudgetSeconds * 1000;
  const pages = [];
  const errors = [];
  let stopReason = 'frontier_exhausted';
  const timeBudgetStopped = () => {
    if (!timeExpired()) return false;
    if (stopReason === 'frontier_exhausted') stopReason = 'time_budget_exhausted';
    return true;
  };

  // Robots and sitemap topology are collected first so sitemap-only pages share
  // the same bounded, deduplicated frontier as pages found through HTML links.
  let robotsText = null;
  if (!timeBudgetStopped()) {
    try {
      const robotsUrl = new URL('/robots.txt', origin).href;
      const response = await fetcher(robotsUrl, { userAgent, maxBodyBytes: robotsMaxBytes });
      if (response.status === 200) robotsText = response.body;
    } catch {
      // Missing robots remains represented by robotsText=null for existing detectors.
    }
    timeBudgetStopped();
  }

  const declaredSitemaps = robotsText != null ? parseRobots(robotsText).sitemaps : [];
  const sitemapEntries = declaredSitemaps.length
    ? declaredSitemaps
    : [new URL('/sitemap.xml', origin).href];
  const sitemapTopology = await collectSitemapTopology(sitemapEntries, {
    fetcher,
    maxDepth: sitemapMaxDepth,
    maxDocuments: sitemapMaxDocuments,
    maxUncompressedBytes: sitemapMaxUncompressedBytes,
    maxTotalUncompressedBytes: sitemapMaxTotalUncompressedBytes,
    maxDiscoveredUrls: sitemapMaxDiscoveredUrls,
    maxQueuedDocuments: sitemapMaxQueuedDocuments,
    maxRawEntries: sitemapMaxRawEntries,
    maxXmlTokens: sitemapMaxXmlTokens,
    sitemapMaxBytes,
    origin,
    userAgent,
    shouldStop: timeExpired,
  });
  if (sitemapTopology.stop_reasons.includes('time_budget_exhausted')) timeBudgetStopped();
  for (const error of sitemapTopology.errors) {
    errors.push(sanitizedSitemapError(error));
  }
  const sitemaps = sitemapTopology.documents
    .filter((document) => document.http_status === 200 && document.parsed?.rootValid)
    .map((document) => ({
      source: document.effective_url,
      parsed: document.parsed,
      status: document.status,
      failure_reason: document.failure_reason,
    }));

  const seen = new Set();
  const queued = new Set();
  const queue = [];
  const enqueuePage = (rawUrl, source, base = origin) => {
    let url;
    let requestedUrl;
    try {
      const raw = String(rawUrl).trim();
      url = new URL(raw, base);
      url.hash = '';
      const fragmentAt = raw.indexOf('#');
      const withoutFragment = fragmentAt === -1 ? raw : raw.slice(0, fragmentAt);
      if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(withoutFragment)) requestedUrl = withoutFragment;
      else if (withoutFragment.startsWith('//')) requestedUrl = `${new URL(base).protocol}${withoutFragment}`;
      else requestedUrl = url.href;
    } catch {
      return;
    }
    if (url.origin !== origin || isProviderUtilityPath(url.pathname) || seen.has(url.href) || queued.has(url.href)) return;
    coverageLedger.discover(url.href, source, { requested_url: requestedUrl });
    queued.add(url.href);
    queue.push({ url: url.href, requestedUrl, source });
  };
  enqueuePage(startUrl, 'start');
  for (const entry of sitemapTopology.urls) enqueuePage(entry.url, 'sitemap');

  while (queue.length && stopReason !== 'time_budget_exhausted') {
    if (timeBudgetStopped()) break;
    if (seen.size >= maxPages) {
      stopReason = 'page_budget_exhausted';
      break;
    }
    const next = queue.shift();
    queued.delete(next.url);
    seen.add(next.url);
    coverageLedger.attempt(next.url, { attempt: 1, requested_url: next.requestedUrl });
    try {
      const response = await fetcher(next.url, { userAgent, maxBodyBytes: pageMaxBytes });
      coverageLedger.retrieve(next.url, {
        status: response.status,
        effective_url: response.url,
        body_complete: response.bodyComplete ?? true,
      });
      const page = extractPage({
        url: response.url, html: response.body, status: response.status,
        headers: response.headers, redirectChain: response.redirectChain,
      });
      attachResourceMetadata(page, {
        requestedUrl: next.requestedUrl,
        bodyComplete: response.bodyComplete ?? true,
        fetchAttempts: response.attempts ?? [],
      });
      page.crawlUrl = next.url;
      if (page.resourceValidity?.state === 'valid_resource') {
        coverageLedger.classify(next.url, {
          state: 'valid_resource',
          resource_id: page.urlIdentity?.resource_id,
        });
      } else {
        coverageLedger.markIndeterminate(next.url, {
          reason_codes: page.resourceValidity?.reason_codes || ['resource_invalid'],
          resource_validity: page.resourceValidity?.state || 'indeterminate',
        });
      }
      page.discoverySource = next.source;
      pages.push(page);
      if (timeBudgetStopped()) break;
      if (String(response.headers['content-type'] || '').includes('text/html')) {
        for (const link of page.links) {
          if (timeBudgetStopped()) break;
          enqueuePage(link.href, 'link', response.url);
        }
      }
      if (stopReason === 'time_budget_exhausted') break;
    } catch (error) {
      coverageLedger.fail(next.url, { reason: error?.code || 'FETCH_ERROR' });
      errors.push(sanitizedFetchError(next.url, error));
    }
  }
  if (stopReason === 'frontier_exhausted') timeBudgetStopped();
  const pendingUrls = queue.map((entry) => entry.url).filter((url) => !seen.has(url));
  const crawl = {
    maxPages,
    timeBudgetSeconds,
    stopReason,
    pagesFetched: pages.length,
    truncated: stopReason === 'page_budget_exhausted' || stopReason === 'time_budget_exhausted',
    pendingUrlCount: pendingUrls.length,
    pendingUrls,
    sitemapStopReasons: [...sitemapTopology.stop_reasons],
    sitemapTopology: {
      status: sitemapTopology.status,
      stopReasons: [...sitemapTopology.stop_reasons],
      limitations: [...sitemapTopology.limitations],
    },
  };
  const site = assembleSite({ baseUrl: origin, pages, robotsText, sitemaps, transport: {}, mode: 'url', location: startUrl, crawl });
  site.coverageLedger = coverageLedger;
  site.coverageOptions = {
    discoveryStatus: sitemapTopology.status,
    discoveryMethods: ['start', 'link', 'sitemap'],
    discoveryLimitations: [...sitemapTopology.limitations],
    limitations: [...sitemapTopology.limitations],
  };
  site.previewCoverage = () => coverageLedger.preview(stopReason, site.coverageOptions);
  site.finalizeCoverage = ({ evaluated = true } = {}) => {
    if (evaluated) {
      for (const page of pages) {
        if (page.resourceValidity?.state === 'valid_resource') {
          coverageLedger.evaluate(page.crawlUrl || page.url, {
            evaluator: 'audit-detectors',
            detector_scope: 'selected',
          });
        }
      }
    } else {
      for (const page of pages) {
        if (page.resourceValidity?.state === 'valid_resource') {
          coverageLedger.markValidButUnevaluated(page.crawlUrl || page.url, { reason: 'not_evaluated' });
        }
      }
    }
    return coverageLedger.finalize(stopReason, site.coverageOptions);
  };
  site.fetchErrors = errors;
  site.sitemapTopology = sitemapTopology;
  return site;
}

function assembleSite({ baseUrl, pages, robotsText, sitemaps, transport, mode, location, crawl = null, llmsText = null, llmsFullText = null }) {
  const byUrl = new Map();
  for (const p of pages) byUrl.set(normalize(p.url), p);

  // Internal link graph
  const inbound = new Map();
  const outbound = new Map();
  for (const p of pages) {
    const from = normalize(p.url);
    outbound.set(from, []);
    for (const l of p.links) {
      let target;
      try {
        target = new URL(l.href, p.url);
      } catch {
        continue;
      }
      if (target.origin !== new URL(baseUrl).origin) continue;
      const to = normalize(target.href);
      outbound.get(from).push({ to, text: l.text, rel: l.rel, href: l.href });
      if (!inbound.has(to)) inbound.set(to, []);
      inbound.get(to).push({ from, text: l.text, rel: l.rel });
    }
  }

  // Crawl depth from root
  const depth = new Map();
  const rootUrl = normalize(new URL('/', baseUrl).href);
  if (byUrl.has(rootUrl)) {
    depth.set(rootUrl, 0);
    const q = [rootUrl];
    while (q.length) {
      const u = q.shift();
      for (const e of outbound.get(u) || []) {
        if (!depth.has(e.to) && byUrl.has(e.to)) {
          depth.set(e.to, depth.get(u) + 1);
          q.push(e.to);
        }
      }
    }
  }

  return {
    mode,
    location,
    baseUrl,
    pages,
    byUrl,
    robotsText,
    robots: robotsText != null ? parseRobots(robotsText) : null,
    sitemaps,
    transport,
    inbound,
    outbound,
    depth,
    normalize,
    crawl,
    llmsTxt: llmsText != null ? { raw: llmsText, found: true, path: '/llms.txt' } : null,
    llmsFullTxt: llmsFullText != null ? { raw: llmsFullText, found: true, path: '/llms-full.txt' } : null,
  };
}

function isProviderUtilityPath(pathname) {
  return pathname === '/cdn-cgi' || pathname.startsWith('/cdn-cgi/');
}

export function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.href;
    return s;
  } catch {
    return url;
  }
}
