import { parse } from 'node-html-parser';

/**
 * Extract a PageModel from raw HTML plus transport metadata.
 * Everything downstream (detectors, inspect, schema) consumes this model.
 */
export function extractPage({ url, html, status = 200, headers = {}, sourceFile = null, redirectChain = [] }) {
  const root = parse(html, { comment: true });
  const head = root.querySelector('head');

  const metas = {};
  for (const m of root.querySelectorAll('meta')) {
    const name = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
    if (name) (metas[name] ||= []).push(m.getAttribute('content') ?? '');
  }

  const canonicals = root
    .querySelectorAll('link[rel=canonical]')
    .map((l) => l.getAttribute('href'))
    .filter(Boolean);

  const robotsMetaRaw = [...(metas['robots'] || []), ...(metas['googlebot'] || [])].join(',').toLowerCase();
  const xRobots = String(headers['x-robots-tag'] || '').toLowerCase();
  const robotsDirectives = new Set(
    (robotsMetaRaw + ',' + xRobots)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const headings = [];
  for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    headings.push({ level: Number(h.tagName[1]), text: h.text.trim() });
  }

  const links = root.querySelectorAll('a').map((a) => ({
    href: a.getAttribute('href') || '',
    text: a.text.trim(),
    rel: (a.getAttribute('rel') || '').toLowerCase(),
  }));

  const images = root.querySelectorAll('img').map((i) => ({
    src: i.getAttribute('src') || '',
    alt: i.getAttribute('alt'),
  }));

  const jsonLd = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = s.text;
    try {
      const parsed = JSON.parse(raw);
      const blocks = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      jsonLd.push({ raw, parsed, blocks, parseError: null });
    } catch (err) {
      jsonLd.push({ raw, parsed: null, blocks: [], parseError: err.message });
    }
  }

  const body = root.querySelector('body');
  // Strip script/style/nav/footer noise for main-text estimation
  const bodyClone = body ? parse(body.outerHTML) : null;
  if (bodyClone) for (const s of bodyClone.querySelectorAll('script,style,noscript,nav,footer,header[role=banner]')) s.remove();
  const text = bodyClone ? bodyClone.text.replace(/\s+/g, ' ').trim() : '';
  const paragraphs = bodyClone
    ? bodyClone.querySelectorAll('p').map((p) => p.text.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 0)
    : [];

  const scriptBytes = root.querySelectorAll('script').reduce((n, s) => n + (s.text?.length || 0), 0);

  // Ordered/unordered lists and tables (answer-structure signals)
  const orderedLists = root.querySelectorAll('ol').length;
  const tables = root.querySelectorAll('table').length;

  // Hidden-text capture for prompt-injection detection
  const hiddenTexts = [];
  for (const el of root.querySelectorAll('[hidden],[aria-hidden=true],[style]')) {
    const style = (el.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
    const isHidden =
      el.hasAttribute('hidden') ||
      el.getAttribute('aria-hidden') === 'true' ||
      style.includes('display:none') ||
      style.includes('visibility:hidden') ||
      /font-size:0(px|;|$)/.test(style) ||
      style.includes('opacity:0;') || style.endsWith('opacity:0');
    if (isHidden) {
      const t = el.text.replace(/\s+/g, ' ').trim();
      if (t) hiddenTexts.push(t);
    }
  }
  for (const c of root.querySelectorAll('*')) {
    // comments handled below via rawHtml scan in detectors
  }

  return {
    url,
    sourceFile,
    status,
    headers,
    redirectChain,
    contentType: String(headers['content-type'] || ''),
    rawHtml: html,
    title: head?.querySelector('title')?.text.trim() ?? root.querySelector('title')?.text.trim() ?? null,
    metaDescription: metas['description']?.[0] ?? null,
    metas,
    canonicals,
    robotsDirectives: [...robotsDirectives],
    noindex: robotsDirectives.has('noindex') || robotsDirectives.has('none'),
    nosnippet: robotsDirectives.has('nosnippet') || [...robotsDirectives].some((d) => /^max-snippet:\s*0$/.test(d)),
    lang: root.querySelector('html')?.getAttribute('lang') ?? null,
    viewportMeta: metas['viewport']?.[0] ?? null,
    ogUrl: metas['og:url']?.[0] ?? null,
    headings,
    h1s: headings.filter((h) => h.level === 1),
    links,
    images,
    jsonLd,
    text,
    paragraphs,
    wordCount: text ? text.split(/\s+/).length : 0,
    scriptBytes,
    orderedLists,
    tables,
    hiddenTexts,
  };
}
