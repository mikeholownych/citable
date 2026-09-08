import { defineDetector, htmlIndexTargets, pageSubject } from './framework.js';
import { parse } from 'node-html-parser';

const D = [];

D.push(defineDetector({
  id: 'PAGE-001', name: 'Missing title element', namespace: 'PAGE',
  description: 'Index-target page has no <title>.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { ranking: 'high', representation: 'medium' },
  applicable_requirement: 'SEO §2 unique and accurate title; §5 title element',
  remediation: 'Add a concise title identifying the page subject and distinguishing it from other pages.',
  verification: 'Confirm a non-empty <title> in rendered HTML.',
  check(ctx) {
    return htmlIndexTargets(ctx).filter((p) => p.status === 200 && !p.title).map((p) => ({
      subject: pageSubject(p), summary: 'Page has no title element', evidence: ['<title> absent or empty'],
    }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-002', name: 'Duplicate title across pages', namespace: 'PAGE',
  description: 'Two or more index-target pages share an identical title.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §5 title should distinguish the page from other pages; avoid boilerplate duplication',
  remediation: 'Differentiate titles to reflect each page’s distinct intent.',
  verification: 'Confirm title uniqueness across index targets.',
  check(ctx) {
    const byTitle = new Map();
    for (const p of htmlIndexTargets(ctx)) {
      if (!p.title || p.status !== 200) continue;
      if (!byTitle.has(p.title)) byTitle.set(p.title, []);
      byTitle.get(p.title).push(p);
    }
    return [...byTitle.entries()].filter(([, ps]) => ps.length > 1).map(([title, ps]) => ({
      subject: { type: 'site', identifier: `title:${title}` },
      summary: `${ps.length} pages share the title "${title}"`,
      evidence: ps.map((p) => p.url),
    }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-003', name: 'Missing meta description', namespace: 'PAGE',
  description: 'Index-target page lacks a meta description (search-result copy).',
  discipline: ['seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'low', ranking: 'none' },
  applicable_requirement: 'SEO §5 meta description as search-result copy, not a ranking lever',
  remediation: 'Add an accurate, page-specific description stating the expected value.',
  verification: 'Confirm meta[name=description] present and non-empty.',
  check(ctx) {
    return htmlIndexTargets(ctx).filter((p) => p.status === 200 && !p.metaDescription).map((p) => ({
      subject: pageSubject(p), summary: 'Page has no meta description', evidence: ['meta[name=description] absent'],
    }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-004', name: 'Duplicate meta description', namespace: 'PAGE',
  description: 'Multiple pages share an identical meta description.',
  discipline: ['seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'low' },
  applicable_requirement: 'SEO §5 avoid duplicated descriptions',
  remediation: 'Write distinct descriptions per page.',
  verification: 'Confirm description uniqueness.',
  check(ctx) {
    const byDesc = new Map();
    for (const p of htmlIndexTargets(ctx)) {
      if (!p.metaDescription || p.status !== 200) continue;
      if (!byDesc.has(p.metaDescription)) byDesc.set(p.metaDescription, []);
      byDesc.get(p.metaDescription).push(p);
    }
    return [...byDesc.entries()].filter(([, ps]) => ps.length > 1).map(([desc, ps]) => ({
      subject: { type: 'site', identifier: `description:${desc.slice(0, 40)}` },
      summary: `${ps.length} pages share the same meta description`,
      evidence: ps.map((p) => p.url),
    }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-005', name: 'Missing or multiple H1', namespace: 'PAGE',
  description: 'Page does not have exactly one primary heading.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'low', citation: 'low' },
  applicable_requirement: 'SEO §2 one clear primary heading; §5 primary heading',
  remediation: 'Use exactly one H1 that identifies the page purpose.',
  verification: 'Count H1 elements.',
  check(ctx) {
    return htmlIndexTargets(ctx).filter((p) => p.status === 200 && p.h1s.length !== 1).map((p) => ({
      subject: pageSubject(p),
      summary: p.h1s.length === 0 ? 'Page has no H1' : `Page has ${p.h1s.length} H1 elements`,
      evidence: p.h1s.length ? p.h1s.map((h) => `H1: ${h.text}`) : ['no <h1> found'],
      captured: p.h1s.length, expected: 1,
    }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-006', name: 'Heading hierarchy skip', namespace: 'PAGE',
  description: 'Heading levels skip (e.g., H1 → H3), indicating headings used for visual size rather than document structure.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { citation: 'low' },
  applicable_requirement: 'SEO §5 headings represent real document hierarchy',
  remediation: 'Restructure headings to descend one level at a time.',
  verification: 'Walk heading sequence and confirm no level is skipped.',
  check(ctx) {
    const hits = [];
    for (const p of htmlIndexTargets(ctx)) {
      if (p.status !== 200) continue;
      let prev = 0;
      for (const h of p.headings) {
        if (prev > 0 && h.level > prev + 1) {
          hits.push({
            subject: pageSubject(p),
            summary: `Heading hierarchy skips from H${prev} to H${h.level} ("${h.text.slice(0, 60)}")`,
            evidence: [`sequence: H${prev} → H${h.level}`],
          });
          break;
        }
        prev = h.level;
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'PAGE-007', name: 'Image missing alt text', namespace: 'PAGE',
  description: 'Content images lack alt attributes.',
  discipline: ['seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { ranking: 'low', representation: 'low' },
  applicable_requirement: 'SEO §5 images: appropriate alt text; accessibility preservation (premise 3.7)',
  remediation: 'Add descriptive alt text (or empty alt for purely decorative images, reviewed case by case).',
  verification: 'Confirm every <img> has an alt attribute.',
  check(ctx) {
    return htmlIndexTargets(ctx)
      .map((p) => ({ p, missing: p.images.filter((i) => i.alt === undefined || i.alt === null) }))
      .filter(({ p, missing }) => p.status === 200 && missing.length > 0)
      .map(({ p, missing }) => ({
        subject: pageSubject(p),
        summary: `${missing.length} image(s) without alt attribute`,
        evidence: missing.slice(0, 5).map((i) => `img src=${i.src}`),
      }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-008', name: 'Thin index-target content', namespace: 'PAGE',
  description: 'An index-target page has very little primary text.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { ranking: 'medium', citation: 'medium' },
  applicable_requirement: 'SEO §2 meaningful main content; §4 sufficient depth',
  false_positive_conditions: ['intentionally short pages (contact, legal index) — classify them in the page registry'],
  remediation: 'Either add substantive content for the intent or remove the page from the index target set.',
  verification: 'Re-measure extracted word count after revision.',
  check(ctx) {
    const min = ctx.config?.audit?.thin_content_words ?? 120;
    return htmlIndexTargets(ctx)
      .filter((p) => p.status === 200 && p.wordCount > 0 && p.wordCount < min)
      .map((p) => ({
        subject: pageSubject(p),
        summary: `Index-target page has only ~${p.wordCount} words (threshold ${min})`,
        evidence: [`extracted word count: ${p.wordCount}`],
        confidence: 'high',
      }));
  },
}));

D.push(defineDetector({
  id: 'PAGE-009', name: 'Keyword stuffing', namespace: 'PAGE',
  description: 'A single non-trivial term dominates the page text at a frequency inconsistent with natural prose.',
  discipline: ['seo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { ranking: 'medium', reputational: 'low' },
  applicable_requirement: 'SEO §5 semantic coverage, not term-frequency quotas; anti-pattern library: keyword stuffing',
  false_positive_conditions: ['glossaries and reference pages legitimately repeating a defined term'],
  remediation: 'Rewrite for human comprehension; vary phrasing naturally; do not chase term-frequency quotas.',
  verification: 'Re-measure dominant-term density.',
  check(ctx) {
    const hits = [];
    for (const p of htmlIndexTargets(ctx)) {
      if (p.status !== 200 || p.wordCount < 80) continue;
      const words = p.text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
      const freq = new Map();
      for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
      const stop = new Set(['this', 'that', 'with', 'from', 'have', 'your', 'about', 'more', 'when', 'they', 'their', 'will', 'which', 'into', 'than', 'them', 'these', 'those', 'because', 'does', 'were', 'been', 'also', 'such', 'other']);
      let top = null;
      for (const [w, n] of freq) if (!stop.has(w) && (!top || n > top[1])) top = [w, n];
      if (top && top[1] / words.length > 0.08 && top[1] >= 10) {
        hits.push({
          subject: pageSubject(p),
          summary: `Term "${top[0]}" is ${(100 * top[1] / words.length).toFixed(1)}% of page words (${top[1]} occurrences)`,
          evidence: [`density ${(100 * top[1] / words.length).toFixed(1)}% exceeds 8% threshold`],
          confidence: 'medium',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'PAGE-010', name: 'High boilerplate-to-content ratio in extracted answer passages', namespace: 'PAGE',
  description: 'An index-target page has a high ratio of boilerplate (navigation, header, footer, chrome) relative to substantive primary content, diluting extracted answer passages.',
  discipline: ['aeo', 'seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'low', citation: 'medium' },
  applicable_requirement: 'SEO §5 main content extraction; AEO §4 concise and focused answer passages',
  false_positive_conditions: ['minimal navigation shells intentionally designed as search gateways'],
  remediation: 'Reduce header/footer/chrome weight or enrich main body content so substantive answer passages dominate the document.',
  verification: 'Confirm boilerplate-to-content ratio is below the defined threshold.',
  check(ctx) {
    const threshold = ctx.config?.audit?.max_boilerplate_ratio ?? 0.70;
    const hits = [];
    for (const p of htmlIndexTargets(ctx)) {
      if (p.status !== 200) continue;
      const boilerplateWords = (p.structuralRegions || []).reduce((sum, r) => sum + (r.token_count || 0), 0);
      const mainWords = p.wordCount || 0;
      const total = boilerplateWords + mainWords;
      if (boilerplateWords > 0 && mainWords > 0 && total >= 50) {
        const ratio = boilerplateWords / total;
        if (ratio >= threshold) {
          hits.push({
            subject: pageSubject(p),
            summary: `High boilerplate-to-content ratio: ${(100 * ratio).toFixed(1)}% of visible text is chrome/navigation/footer (threshold ${(100 * threshold).toFixed(0)}%)`,
            evidence: [`boilerplate tokens: ${boilerplateWords}`, `main content tokens: ${mainWords}`, `ratio: ${(100 * ratio).toFixed(1)}%`],
            captured: Number(ratio.toFixed(4)),
            threshold,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'PAGE-011', name: 'Critical entity claims rendered inside transient/collapsible UI containers without fallback', namespace: 'PAGE',
  description: 'Registered claim or critical entity statement is rendered exclusively inside a collapsible or transient UI container (<details>, accordion, hidden tab) without an uncollapsed fallback or crawlable representation.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site', 'registries'],
  impact: { citation: 'medium', representation: 'medium' },
  applicable_requirement: 'AEO §2 crawlable and indexable answer surfaces; premise 3.5: claims must be verified and crawlable',
  false_positive_conditions: ['supplemental FAQs where claims are also summarized in main prose'],
  remediation: 'Expose key entity statements and primary claim assertions directly in main crawlable prose or provide server-rendered uncollapsed fallbacks.',
  verification: 'Confirm registered claims are accessible outside closed collapsible containers.',
  check(ctx) {
    const claims = (ctx.registries?.claims?.entries || []).filter((c) => !['retired', 'expired', 'prohibited'].includes(c.status));
    if (claims.length === 0) return [];
    const hits = [];

    for (const p of htmlIndexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const doc = parse(p.rawHtml);

      // Identify transient/collapsible containers
      const collapsibleContainers = doc.querySelectorAll('details:not([open]), [aria-expanded="false"], .collapse:not(.show), [data-state="closed"]');
      if (collapsibleContainers.length === 0) continue;

      const containerTexts = collapsibleContainers.map((el) => ({
        tag: el.tagName ? el.tagName.toLowerCase() : 'container',
        text: el.text.toLowerCase().replace(/\s+/g, ' ').trim(),
      })).filter((c) => c.text.length > 0);

      if (containerTexts.length === 0) continue;

      // Compute document text outside collapsible containers
      const docClone = parse(p.rawHtml);
      for (const el of docClone.querySelectorAll('details:not([open]), [aria-expanded="false"], .collapse:not(.show), [data-state="closed"]')) {
        el.remove();
      }
      const exteriorText = docClone.text.toLowerCase().replace(/\s+/g, ' ').trim();

      for (const c of claims) {
        const keywords = (c.claim.toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) || []).slice(0, 8);
        if (keywords.length < 2) continue;

        for (const container of containerTexts) {
          const matchedInContainer = keywords.filter((k) => container.text.includes(k)).length;
          if (matchedInContainer / keywords.length >= 0.7) {
            const matchedInExterior = keywords.filter((k) => exteriorText.includes(k)).length;
            if (matchedInExterior / keywords.length < 0.4) {
              hits.push({
                subject: pageSubject(p),
                summary: `Claim "${c.claim_id}" rendered inside collapsible <${container.tag}> container without uncollapsed fallback`,
                evidence: [
                  `claim_id: ${c.claim_id}`,
                  `claim: "${c.claim}"`,
                  `container: <${container.tag}>`,
                  `keywords matched in container: ${matchedInContainer}/${keywords.length}`,
                  `keywords outside container: ${matchedInExterior}/${keywords.length}`,
                ],
              });
              break;
            }
          }
        }
      }
    }
    return hits;
  },
}));

export default D;
