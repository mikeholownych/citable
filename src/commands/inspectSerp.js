import { buildContext } from './context.js';
import { safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/**
 * Approximate Google SERP title pixel width in Arial ~20px font.
 */
export function estimateTitlePixelWidth(title) {
  if (!title) return 0;
  let px = 0;
  for (const ch of title) {
    if (/[wmWM]/.test(ch)) px += 17;
    else if (/[ijlI|!.:;, '`\-]/.test(ch)) px += 5;
    else if (/[frt]/.test(ch)) px += 7;
    else if (/[A-Z]/.test(ch)) px += 13;
    else px += 10;
  }
  return px;
}

/**
 * Truncate title to fit pixel limit (e.g. 600px for desktop).
 */
export function truncateTitleByPixels(title, maxPixels = 600) {
  if (!title) return { text: '', truncated: false, pixelWidth: 0 };
  const totalPx = estimateTitlePixelWidth(title);
  if (totalPx <= maxPixels) {
    return { text: title, truncated: false, pixelWidth: totalPx };
  }

  let curr = '';
  for (const ch of title) {
    if (estimateTitlePixelWidth(curr + ch + ' ...') > maxPixels) {
      break;
    }
    curr += ch;
  }
  return {
    text: curr.trim() + ' ...',
    truncated: true,
    pixelWidth: totalPx,
  };
}

/**
 * Truncate description text by character count.
 */
export function truncateSnippet(text, maxChars = 160) {
  if (!text) return { text: '', truncated: false };
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, maxChars - 4).trim() + ' ...',
    truncated: true,
  };
}

/**
 * Build simulated Google SERP breadcrumb string.
 */
export function buildSerpBreadcrumb(page) {
  // Check for schema BreadcrumbList first
  for (const j of page.jsonLd || []) {
    for (const b of j.blocks || []) {
      const type = [].concat(b['@type'] || []).join(',');
      if (/BreadcrumbList/i.test(type) && Array.isArray(b.itemListElement) && b.itemListElement.length > 0) {
        const sorted = [...b.itemListElement].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
        const names = sorted.map((it) => it?.name || it?.item?.name).filter(Boolean);
        if (names.length > 0) {
          return {
            source: 'schema',
            display: names.join(' > '),
            items: names,
          };
        }
      }
    }
  }

  // Fallback to URL path segments
  try {
    const u = new URL(page.url);
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    const display = [host, ...parts].join(' > ');
    return {
      source: 'url_fallback',
      display,
      items: [host, ...parts],
    };
  } catch {
    return {
      source: 'raw',
      display: page.url,
      items: [page.url],
    };
  }
}

/**
 * Evaluate Google SERP rich snippet feature eligibility.
 */
export function evaluateRichSnippetEligibility(page) {
  const blocks = [];
  for (const j of page.jsonLd || []) {
    for (const b of j.blocks || []) {
      if (b && typeof b === 'object') blocks.push(b);
    }
  }

  const results = {};

  // 1. BreadcrumbList
  const breadcrumbs = blocks.filter((b) => /BreadcrumbList/i.test([].concat(b['@type'] || []).join(',')));
  if (breadcrumbs.length === 0) {
    results.breadcrumb = { status: 'missing', eligible: false, issues: ['No BreadcrumbList JSON-LD block found'] };
  } else {
    const b = breadcrumbs[0];
    const items = Array.isArray(b.itemListElement) ? b.itemListElement : [];
    const issues = [];
    if (items.length < 2) issues.push('Breadcrumbs should have at least 2 navigation levels');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it?.name && !it?.item?.name) issues.push(`Item ${i + 1} missing name`);
      if (i < items.length - 1 && !it?.item && !it?.url) issues.push(`Item ${i + 1} missing item URL`);
    }
    results.breadcrumb = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      itemCount: items.length,
      issues,
    };
  }

  // 2. Product
  const products = blocks.filter((b) => /Product/i.test([].concat(b['@type'] || []).join(',')));
  if (products.length === 0) {
    results.product = { status: 'not_applicable', eligible: false, issues: [] };
  } else {
    const prod = products[0];
    const issues = [];
    if (!prod.name) issues.push('Product missing name');
    const hasOffer = prod.offers && (prod.offers.price !== undefined || Array.isArray(prod.offers));
    const hasRating = prod.aggregateRating && prod.aggregateRating.ratingValue !== undefined;
    if (!hasOffer && !hasRating) issues.push('Product requires either offers (with price) or aggregateRating (with ratingValue)');
    results.product = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      hasOffers: !!hasOffer,
      hasAggregateRating: !!hasRating,
      issues,
    };
  }

  // 3. FAQPage
  const faqs = blocks.filter((b) => /FAQPage/i.test([].concat(b['@type'] || []).join(',')));
  if (faqs.length === 0) {
    results.faq = { status: 'not_applicable', eligible: false, issues: [] };
  } else {
    const faq = faqs[0];
    const issues = [];
    const questions = [].concat(faq.mainEntity || []);
    if (questions.length === 0) issues.push('FAQPage has no mainEntity question entries');
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.name) issues.push(`Question ${i + 1} missing name`);
      const ans = q.acceptedAnswer?.text;
      if (!ans) issues.push(`Question ${i + 1} missing acceptedAnswer.text`);
    }
    results.faq = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      questionCount: questions.length,
      issues,
    };
  }

  // 4. Article / BlogPosting / NewsArticle
  const articles = blocks.filter((b) => /Article|BlogPosting|NewsArticle/i.test([].concat(b['@type'] || []).join(',')));
  if (articles.length === 0) {
    results.article = { status: 'not_applicable', eligible: false, issues: [] };
  } else {
    const art = articles[0];
    const issues = [];
    if (!art.headline) issues.push('Article missing headline');
    if (!art.image) issues.push('Article missing image');
    if (!art.datePublished) issues.push('Article missing datePublished');
    if (!art.author) issues.push('Article missing author');
    results.article = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      issues,
    };
  }

  // 5. VideoObject
  const videos = blocks.filter((b) => /VideoObject/i.test([].concat(b['@type'] || []).join(',')));
  if (videos.length === 0) {
    results.video = { status: 'not_applicable', eligible: false, issues: [] };
  } else {
    const vid = videos[0];
    const issues = [];
    if (!vid.name) issues.push('Video missing name');
    if (!vid.description) issues.push('Video missing description');
    if (!vid.uploadDate) issues.push('Video missing uploadDate');
    if (!vid.thumbnailUrl && !vid.thumbnail) issues.push('Video missing thumbnailUrl');
    if (!vid.contentUrl && !vid.embedUrl) issues.push('Video missing contentUrl or embedUrl');
    results.video = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      issues,
    };
  }

  // 6. Organization
  const orgs = blocks.filter((b) => /Organization|Corporation/i.test([].concat(b['@type'] || []).join(',')));
  if (orgs.length === 0) {
    results.organization = { status: 'not_applicable', eligible: false, issues: [] };
  } else {
    const org = orgs[0];
    const issues = [];
    if (!org.name) issues.push('Organization missing name');
    if (!org.url) issues.push('Organization missing url');
    if (!org.logo && !org.image) issues.push('Organization missing logo');
    results.organization = {
      status: issues.length === 0 ? 'eligible' : 'ineligible',
      eligible: issues.length === 0,
      issues,
    };
  }

  return results;
}

/**
 * `citable inspect serp <page>` — simulate Google SERP representation and evaluate rich snippet eligibility.
 */
export function renderSerpVisualCard({ breadcrumb, title, snippet, richSnippets = {} }) {
  const eligibleBadges = Object.entries(richSnippets)
    .filter(([, v]) => v.status === 'eligible')
    .map(([k]) => k);
  const badgeStr = eligibleBadges.length > 0 ? ` [Rich Features: ${eligibleBadges.join(', ')}]` : '';
  const cleanTitle = (title || '').slice(0, 64);
  const cleanBc = (breadcrumb || '').slice(0, 64);
  const cleanSnip = (snippet || '').slice(0, 70);

  return [
    '  ┌────────────────────────────────────────────────────────────────────────┐',
    `  │ 🌐 ${cleanBc.padEnd(68)} │`,
    `  │ ${cleanTitle.padEnd(70)} │`,
    `  │ ${cleanSnip.padEnd(70)} │`,
    ...(badgeStr ? [`  │ ${badgeStr.padEnd(70)} │`] : []),
    '  └────────────────────────────────────────────────────────────────────────┘',
  ].join('\n');
}

export async function inspectSerp(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect serp requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  const breadcrumb = buildSerpBreadcrumb(page);
  const desktopTitle = truncateTitleByPixels(page.title || '', 600);
  const desktopSnippet = truncateSnippet(page.metaDescription || page.paragraphs?.[0] || '', 160);

  const mobileTitle = truncateTitleByPixels(page.title || '', 960);
  const mobileSnippet = truncateSnippet(page.metaDescription || page.paragraphs?.[0] || '', 200);

  const richSnippets = evaluateRichSnippetEligibility(page);

  // Run SCHEMA detectors specifically on this page
  const single = { ...ctx, site: { ...ctx.site, pages: [page] } };
  const { findings } = runDetectors(selectDetectors({ namespaces: ['SCHEMA'] }), single);
  const pageFindings = findings.filter((f) => f.subject.identifier?.startsWith(page.url) || f.subject.url === page.url);

  const visualCard = renderSerpVisualCard({
    breadcrumb: desktopTitle.text ? desktopSnippet.text ? breadcrumb.display : breadcrumb.display : breadcrumb.display,
    title: desktopTitle.text,
    snippet: desktopSnippet.text,
    richSnippets,
  });

  return {
    url: page.url,
    sourceFile: page.sourceFile,
    title: page.title || '(none)',
    metaDescription: page.metaDescription || '(none)',
    breadcrumb,
    visualCard,
    desktop: {
      breadcrumb: breadcrumb.display,
      title: desktopTitle.text,
      titlePixelWidth: desktopTitle.pixelWidth,
      isTitleTruncated: desktopTitle.truncated,
      snippet: desktopSnippet.text,
      isSnippetTruncated: desktopSnippet.truncated,
    },
    mobile: {
      breadcrumb: breadcrumb.display,
      title: mobileTitle.text,
      titlePixelWidth: mobileTitle.pixelWidth,
      isTitleTruncated: mobileTitle.truncated,
      snippet: mobileSnippet.text,
      isSnippetTruncated: mobileSnippet.truncated,
    },
    richSnippets,
    findings: pageFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      summary: f.observation.summary,
    })),
  };
}
