import fs from 'node:fs';
import path from 'node:path';
import { extractPage } from './page.js';
import { parseRobots } from '../crawler/robots.js';
import { parseSitemap } from '../crawler/sitemap.js';
import { fetchUrl } from '../crawler/fetch.js';

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
        pages.push(
          extractPage({
            url: new URL(urlPath, baseUrl).href,
            html: fs.readFileSync(p, 'utf8'),
            status: t.status ?? 200,
            headers: { 'content-type': 'text/html', ...(t.headers || {}) },
            sourceFile: p,
            redirectChain: [],
          })
        );
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
  fetcher = fetchUrl,
  now = () => performance.now(),
} = {}) {
  const origin = new URL(startUrl).origin;
  const startedAt = now();
  const timeExpired = () => now() - startedAt >= timeBudgetSeconds * 1000;
  const seen = new Set();
  const queue = [startUrl];
  const pages = [];
  const errors = [];
  let stopReason = 'frontier_exhausted';
  const timeBudgetStopped = () => {
    if (!timeExpired()) return false;
    if (stopReason === 'frontier_exhausted') stopReason = 'time_budget_exhausted';
    return true;
  };
  while (queue.length) {
    if (timeBudgetStopped()) break;
    const url = queue[0];
    const key = url.replace(/#.*$/, '');
    if (seen.has(key)) {
      queue.shift();
      continue;
    }
    if (seen.size >= maxPages) {
      stopReason = 'page_budget_exhausted';
      break;
    }
    queue.shift();
    seen.add(key);
    try {
      const res = await fetcher(url, { userAgent, maxBodyBytes: pageMaxBytes });
      const page = extractPage({
        url: res.url, html: res.body, status: res.status, headers: res.headers, redirectChain: res.redirectChain,
      });
      page.requestedUrl = url;
      pages.push(page);
      if (timeBudgetStopped()) break;
      if (String(res.headers['content-type'] || '').includes('text/html')) {
        for (const l of page.links) {
          if (timeBudgetStopped()) break;
          try {
            const u = new URL(l.href, res.url);
            u.hash = '';
            if (u.origin === origin && !isProviderUtilityPath(u.pathname) && !seen.has(u.href)) queue.push(u.href);
          } catch { /* unresolvable href — surfaced by LINK detectors */ }
        }
      }
      if (stopReason === 'time_budget_exhausted') break;
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  let robotsText = null;
  const sitemaps = [];
  if (stopReason !== 'time_budget_exhausted') {
    if (!timeBudgetStopped()) {
      try {
        const r = await fetcher(new URL('/robots.txt', origin).href, { userAgent, maxBodyBytes: robotsMaxBytes });
        if (r.status === 200) robotsText = r.body;
      } catch { /* recorded as missing robots */ }
    }
  }
  const smUrls = robotsText ? parseRobots(robotsText).sitemaps : [new URL('/sitemap.xml', origin).href];
  for (const sm of stopReason === 'time_budget_exhausted' ? [] : smUrls) {
    if (timeBudgetStopped()) break;
    try {
      const sitemapUrl = new URL(sm, origin);
      if (sitemapUrl.origin !== origin) {
        errors.push(`${sitemapUrl.href}: sitemap URL leaves audited origin`);
        continue;
      }
      const r = await fetcher(sitemapUrl.href, { userAgent, maxBodyBytes: sitemapMaxBytes });
      if (r.status === 200) sitemaps.push({ source: sm, parsed: parseSitemap(r.body) });
    } catch { /* absence handled by TECH detectors */ }
  }
  if (stopReason === 'frontier_exhausted') timeBudgetStopped();
  const pendingUrls = [...new Set(queue.map((url) => url.replace(/#.*$/, '')).filter((url) => !seen.has(url)))];
  const crawl = {
    maxPages,
    timeBudgetSeconds,
    stopReason,
    pagesFetched: pages.length,
    truncated: stopReason === 'page_budget_exhausted' || stopReason === 'time_budget_exhausted',
    pendingUrlCount: pendingUrls.length,
    pendingUrls,
  };
  const site = assembleSite({ baseUrl: origin, pages, robotsText, sitemaps, transport: {}, mode: 'url', location: startUrl, crawl });
  site.fetchErrors = errors;
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
