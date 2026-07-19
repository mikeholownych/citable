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

  const sitemaps = [];
  for (const f of fs.readdirSync(dir)) {
    if (/sitemap.*\.xml$/i.test(f)) {
      sitemaps.push({ source: f, parsed: parseSitemap(fs.readFileSync(path.join(dir, f), 'utf8')) });
    }
  }

  return assembleSite({ baseUrl, pages, robotsText, sitemaps, transport, mode: 'built_output', location: dir });
}

/** Build a SiteModel by fetching a deployed URL set (target URL + same-origin discovery, bounded). */
export async function buildSiteFromUrl(startUrl, {
  maxPages = 50, userAgent, pageMaxBytes = 5 * 1024 * 1024,
  robotsMaxBytes = 512 * 1024, sitemapMaxBytes = 5 * 1024 * 1024,
  fetcher = fetchUrl,
} = {}) {
  const origin = new URL(startUrl).origin;
  const seen = new Set();
  const queue = [startUrl];
  const pages = [];
  const errors = [];
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    const key = url.replace(/#.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await fetcher(url, { userAgent, maxBodyBytes: pageMaxBytes });
      const page = extractPage({
        url: res.url, html: res.body, status: res.status, headers: res.headers, redirectChain: res.redirectChain,
      });
      page.requestedUrl = url;
      pages.push(page);
      if (String(res.headers['content-type'] || '').includes('text/html')) {
        for (const l of page.links) {
          try {
            const u = new URL(l.href, res.url);
            u.hash = '';
            if (u.origin === origin && !isProviderUtilityPath(u.pathname) && !seen.has(u.href)) queue.push(u.href);
          } catch { /* unresolvable href — surfaced by LINK detectors */ }
        }
      }
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  let robotsText = null;
  const sitemaps = [];
  try {
    const r = await fetcher(new URL('/robots.txt', origin).href, { userAgent, maxBodyBytes: robotsMaxBytes });
    if (r.status === 200) robotsText = r.body;
  } catch { /* recorded as missing robots */ }
  const smUrls = robotsText ? parseRobots(robotsText).sitemaps : [new URL('/sitemap.xml', origin).href];
  for (const sm of smUrls) {
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
  const pendingUrls = [...new Set(queue.map((url) => url.replace(/#.*$/, '')).filter((url) => !seen.has(url)))];
  const crawl = {
    maxPages,
    pagesFetched: pages.length,
    truncated: pages.length >= maxPages && pendingUrls.length > 0,
    pendingUrlCount: pendingUrls.length,
    pendingUrls,
  };
  const site = assembleSite({ baseUrl: origin, pages, robotsText, sitemaps, transport: {}, mode: 'url', location: startUrl, crawl });
  site.fetchErrors = errors;
  return site;
}

function assembleSite({ baseUrl, pages, robotsText, sitemaps, transport, mode, location, crawl = null }) {
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
