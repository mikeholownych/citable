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

  const hreflangs = root
    .querySelectorAll('link[hreflang]')
    .filter((l) => {
      const rel = (l.getAttribute('rel') || '').toLowerCase();
      return rel.split(/\s+/).includes('alternate');
    })
    .map((l) => ({
      lang: (l.getAttribute('hreflang') || '').trim(),
      href: (l.getAttribute('href') || '').trim(),
    }))
    .filter((item) => item.lang || item.href);

  const linkHeader = headers['link'] || headers['Link'];
  if (linkHeader) {
    const headerStr = Array.isArray(linkHeader) ? linkHeader.join(', ') : String(linkHeader);
    const parts = headerStr.split(/,(?=\s*<)/);
    for (const part of parts) {
      const hrefMatch = part.match(/<([^>]+)>/);
      const relMatch = part.match(/rel=["']?([^"';\s]+)["']?/i);
      const hreflangMatch = part.match(/hreflang=["']?([^"';\s]+)["']?/i);
      if (hrefMatch && relMatch && relMatch[1].toLowerCase() === 'alternate' && hreflangMatch) {
        hreflangs.push({
          lang: hreflangMatch[1].trim(),
          href: hrefMatch[1].trim(),
        });
      }
    }
  }

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
    width: i.getAttribute('width') || null,
    height: i.getAttribute('height') || null,
    loading: (i.getAttribute('loading') || '').toLowerCase(),
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
  const rawVisibleText = body ? body.text.replace(/\s+/g, ' ').trim() : '';
  const structuralRegions = [];
  const seenRegions = new Set();
  for (const region of root.querySelectorAll('header,nav,aside,footer,[role=banner],[role=navigation],[role=complementary],[role=contentinfo]')) {
    if (seenRegions.has(region)) continue;
    seenRegions.add(region);
    const text = region.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    structuralRegions.push({
      region_type: (region.getAttribute('role') || region.tagName || 'unknown').toLowerCase(),
      text,
      html_bytes: Buffer.byteLength(region.outerHTML),
      token_count: text.split(/\s+/).filter(Boolean).length,
    });
  }
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
  // Extract interactive CTAs (buttons, links with button role/classes, submit inputs)
  const CTA_TEXT_RX = /\b(sign\s*up|get\s*started|request\s*(a\s*)?demo|book\s*(a\s*)?demo|schedule\s*(a\s*)?demo|try\s*(it\s*)?free|start\s*(free\s*)?trial|contact\s*sales|talk\s*to\s*sales|buy\s*now|subscribe|view\s*pricing|see\s*pricing|get\s*a\s*quote|download\s*whitepaper|download\s*report|join\s*waitlist)\b/i;
  const CTA_ATTR_RX = /\b(btn|cta|button|primary-action|action-btn|submit)\b/i;

  const ctas = [];
  for (const el of root.querySelectorAll('button, a, input[type=submit], input[type=button]')) {
    const tag = el.tagName.toLowerCase();
    const text = (tag === 'input' ? el.getAttribute('value') : el.text) || '';
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const href = el.getAttribute('href') || null;
    const action = el.getAttribute('formaction') || null;
    const role = (el.getAttribute('role') || '').toLowerCase();
    const cls = el.getAttribute('class') || '';

    const matchesKeyword = CTA_TEXT_RX.test(cleanText);
    const matchesAttr = CTA_ATTR_RX.test(cls) || role === 'button' || tag === 'button' || el.getAttribute('type') === 'submit';

    if (matchesKeyword || (matchesAttr && cleanText.length > 0 && cleanText.length <= 40)) {
      let inNav = false;
      let inHero = false;
      let cur = el.parentNode;
      while (cur && cur !== root) {
        const tn = cur.tagName ? cur.tagName.toLowerCase() : '';
        const c = cur.getAttribute ? (cur.getAttribute('class') || '') : '';
        const id = cur.getAttribute ? (cur.getAttribute('id') || '') : '';
        const r = cur.getAttribute ? (cur.getAttribute('role') || '') : '';
        if (tn === 'nav' || tn === 'header' || r === 'navigation' || r === 'banner') inNav = true;
        if (tn === 'header' || c.includes('hero') || id.includes('hero') || c.includes('banner') || id.includes('banner')) inHero = true;
        cur = cur.parentNode;
      }

      const style = (el.getAttribute('style') || '').toLowerCase();
      const widthMatch = style.match(/width:\s*(\d+)px/);
      const heightMatch = style.match(/height:\s*(\d+)px/);
      const fontSizeMatch = style.match(/font-size:\s*(\d+)px/);
      const inlineWidth = widthMatch ? Number(widthMatch[1]) : (el.getAttribute('width') ? Number(el.getAttribute('width')) : null);
      const inlineHeight = heightMatch ? Number(heightMatch[1]) : (el.getAttribute('height') ? Number(el.getAttribute('height')) : null);
      const inlineFontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : null;

      ctas.push({
        tag,
        text: cleanText,
        target: href || action || null,
        role: role || null,
        className: cls || null,
        isPrimary: matchesKeyword,
        inNav,
        inHero,
        style: style || null,
        inlineWidth,
        inlineHeight,
        inlineFontSize,
      });
    }
  }

  // Extract form elements
  const forms = [];
  for (const form of root.querySelectorAll('form')) {
    const action = form.getAttribute('action') || null;
    const method = (form.getAttribute('method') || 'GET').toUpperCase();
    const inputEls = form.querySelectorAll('input, select, textarea');
    const inputs = [];
    let hasSubmit = !!form.querySelector('button[type=submit], input[type=submit]');
    if (!hasSubmit && form.querySelector('button:not([type=button]):not([type=reset])')) {
      hasSubmit = true;
    }

    let nonHiddenCount = 0;
    for (const inp of inputEls) {
      const type = (inp.getAttribute('type') || (inp.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text')).toLowerCase();
      const name = inp.getAttribute('name') || null;
      const id = inp.getAttribute('id') || null;
      const required = inp.hasAttribute('required');
      const autocomplete = inp.getAttribute('autocomplete')?.trim() || null;
      const inputmode = inp.getAttribute('inputmode')?.trim() || null;
      const placeholder = inp.getAttribute('placeholder') || null;

      let hasLabel = inp.hasAttribute('aria-label') || inp.hasAttribute('aria-labelledby');
      if (!hasLabel && id) {
        hasLabel = !!root.querySelector(`label[for="${id}"]`);
      }
      if (!hasLabel) {
        let parent = inp.parentNode;
        while (parent && parent !== form) {
          if (parent.tagName && parent.tagName.toLowerCase() === 'label') {
            hasLabel = true;
            break;
          }
          parent = parent.parentNode;
        }
      }

      if (type !== 'hidden') nonHiddenCount++;
      inputs.push({ name, id, type, required, autocomplete, inputmode, placeholder, hasLabel });
    }

    forms.push({
      action,
      method,
      inputs,
      fieldCount: nonHiddenCount,
      hasSubmit,
    });
  }

  // Extract trust / proof signals in DOM
  const TRUST_RX = /\b(soc\s*2|iso\s*27001|gdpr|hipaa|pci[- ]dss|money[- ]back\s*guarantee|cancel\s*anytime|no\s*credit\s*card\s*required|trusted\s*by|featured\s*in|customer\s*reviews|satisfaction\s*guarantee|sla\s*guarantee)\b/i;
  const trustBadges = [];
  for (const el of root.querySelectorAll('div, section, p, span, img, li, footer')) {
    const txt = el.text.replace(/\s+/g, ' ').trim();
    const alt = el.getAttribute('alt') || '';
    const m = TRUST_RX.exec(txt) || TRUST_RX.exec(alt);
    if (m && !trustBadges.some((t) => t.signal.toLowerCase() === m[1].toLowerCase())) {
      trustBadges.push({
        signal: m[1],
        context: txt ? txt.slice(0, 100) : alt,
      });
    }
  }

  // Analytics & Tag Manager detection
  const ANALYTICS_RX = /\b(googletagmanager\.com|google-analytics\.com|gtag\(|posthog|segment\.com\/analytics|mixpanel|rudderstack|plausible|fathom)\b/i;
  const analyticsTags = [];
  for (const s of root.querySelectorAll('script')) {
    const src = s.getAttribute('src') || '';
    const content = s.text || '';
    if (ANALYTICS_RX.test(src) || ANALYTICS_RX.test(content)) {
      analyticsTags.push(src || 'inline-tag');
    }
  }

  // Navigation link count
  const navLinksCount = root.querySelectorAll('nav a, header a, [role=navigation] a').length;

  let domNodeCount = 0;
  let maxDomDepth = 0;
  const walkDom = (node, depth) => {
    domNodeCount++;
    if (depth > maxDomDepth) maxDomDepth = depth;
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        walkDom(child, depth + 1);
      }
    }
  };
  walkDom(root, 1);

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
    hreflangs,
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
    rawVisibleWordCount: rawVisibleText ? rawVisibleText.split(/\s+/).length : 0,
    structuralRegions,
    paragraphs,
    wordCount: text ? text.split(/\s+/).length : 0,
    scriptBytes,
    orderedLists,
    tables,
    hiddenTexts,
    ctas,
    forms,
    trustBadges,
    analyticsTags,
    navLinksCount,
    domNodeCount,
    maxDomDepth,
  };
}
