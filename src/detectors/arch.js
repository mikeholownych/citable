import { defineDetector, indexTargets, pageSubject, entrySubject, sitePageFor } from './framework.js';

const D = [];

D.push(defineDetector({
  id: 'ARCH-001', name: 'Orphan page', namespace: 'ARCH',
  description: 'An index-target page receives no internal links from any other audited page.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'medium' },
  applicable_requirement: 'SEO §3 no orphan pages; AEO §9 eliminate orphan pages',
  remediation: 'Link the page from its topic hub and at least one relevant contextual page.',
  verification: 'Rebuild the internal link graph and confirm at least one inbound link.',
  check(ctx) {
    const root = ctx.site.normalize(new URL('/', ctx.site.baseUrl).href);
    return indexTargets(ctx)
      .filter((p) => ctx.site.normalize(p.url) !== root)
      .filter((p) => (ctx.site.inbound.get(ctx.site.normalize(p.url)) || []).length === 0)
      .map((p) => ({
        subject: pageSubject(p),
        summary: 'Page has no inbound internal links (orphan)',
        evidence: ['0 inbound internal links in audited link graph'],
      }));
  },
}));

D.push(defineDetector({
  id: 'ARCH-002', name: 'Dead-end page', namespace: 'ARCH',
  description: 'A page has no outbound internal links; users and crawlers cannot continue anywhere.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'low', conversion: 'medium' },
  applicable_requirement: 'SEO §3 internal links: link upward, laterally, and to the commercial next step',
  remediation: 'Add links to the topic hub, related material, and the relevant commercial next step.',
  verification: 'Confirm at least one outbound internal link.',
  check(ctx) {
    return indexTargets(ctx)
      .filter((p) => p.status === 200 && (ctx.site.outbound.get(ctx.site.normalize(p.url)) || []).length === 0)
      .map((p) => ({
        subject: pageSubject(p),
        summary: 'Page has no outbound internal links (dead end)',
        evidence: ['0 outbound internal links in audited link graph'],
      }));
  },
}));

D.push(defineDetector({
  id: 'ARCH-003', name: 'Excessive crawl depth', namespace: 'ARCH',
  description: 'An index-target page requires more than the configured number of clicks from the home page.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'medium' },
  applicable_requirement: 'SEO §3 shallow access to important pages',
  remediation: 'Add hub or navigation links to reduce click depth for important pages.',
  verification: 'Recompute shortest-path depth from the home page.',
  check(ctx) {
    const max = ctx.config?.audit?.max_crawl_depth ?? 4;
    return indexTargets(ctx)
      .filter((p) => {
        const d = ctx.site.depth.get(ctx.site.normalize(p.url));
        return d !== undefined && d > max;
      })
      .map((p) => ({
        subject: pageSubject(p),
        summary: `Page is ${ctx.site.depth.get(ctx.site.normalize(p.url))} clicks from home (max ${max})`,
        evidence: [`crawl depth: ${ctx.site.depth.get(ctx.site.normalize(p.url))}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'ARCH-004', name: 'Duplicate query target', namespace: 'ARCH',
  description: 'Two or more registry pages target the same query — internal competition for one intent.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { ranking: 'high', citation: 'medium' },
  applicable_requirement: 'SEO §3 one canonical URL per primary intent; AEO §9 one clear canonical answer page per question',
  remediation: 'Consolidate the overlapping pages or re-target one of them; record the decision in the page registry.',
  verification: 'Each query_id appears in target_queries of at most one active page.',
  check(ctx) {
    const byQuery = new Map();
    for (const p of ctx.registries.pages?.entries || []) {
      if (p.status === 'retired') continue;
      for (const q of p.target_queries || []) {
        if (!byQuery.has(q)) byQuery.set(q, []);
        byQuery.get(q).push(p.page_id);
      }
    }
    return [...byQuery.entries()]
      .filter(([, pages]) => pages.length > 1)
      .map(([q, pages]) => ({
        subject: { type: 'query', identifier: q },
        summary: `Query ${q} is targeted by ${pages.length} pages: ${pages.join(', ')}`,
        evidence: pages.map((p) => `pages/${p} targets ${q}`),
      }));
  },
}));

D.push(defineDetector({
  id: 'ARCH-005', name: 'Overlapping primary intent', namespace: 'ARCH',
  description: 'Two active registry pages declare the same primary intent and share a primary entity.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §3 consolidated duplicate or overlapping pages; §9 detectors: overlapping intent',
  remediation: 'Differentiate the intents explicitly or consolidate the pages.',
  verification: 'No two active pages share identical primary_intent and a primary entity.',
  check(ctx) {
    const entries = (ctx.registries.pages?.entries || []).filter((p) => p.status !== 'retired' && p.primary_intent);
    const hits = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        if (a.primary_intent === b.primary_intent && (a.primary_entities || []).some((e) => (b.primary_entities || []).includes(e))) {
          hits.push({
            subject: entrySubject('pages', `${a.page_id}+${b.page_id}`),
            summary: `Pages ${a.page_id} and ${b.page_id} share primary intent "${a.primary_intent}" and a primary entity`,
            evidence: [`${a.page_id}: intent=${a.primary_intent}, entities=${(a.primary_entities || []).join('/')}`, `${b.page_id}: intent=${b.primary_intent}, entities=${(b.primary_entities || []).join('/')}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ARCH-006', name: 'Page without topic-hub relationship', namespace: 'ARCH',
  description: 'A non-hub content page has no internal link to any hub/category page.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site', 'registries'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §3 clear hub-and-spoke relationships; AEO §9 link back to canonical topic hubs',
  remediation: 'Add an upward link from the page to its topic hub.',
  verification: 'Page links to at least one page registered as hub/category.',
  check(ctx) {
    const hubs = new Set(
      (ctx.registries.pages?.entries || [])
        .filter((p) => ['hub', 'category', 'home'].includes(p.page_type))
        .map((p) => ctx.site.normalize(new URL(p.url, ctx.site.baseUrl).href))
    );
    if (hubs.size === 0) return [];
    const hits = [];
    for (const reg of (ctx.registries.pages?.entries || []).filter((p) => !['hub', 'category', 'home', 'legal', 'policy', 'contact'].includes(p.page_type) && p.status !== 'retired')) {
      const page = sitePageFor(ctx, reg);
      if (!page) continue;
      const out = ctx.site.outbound.get(ctx.site.normalize(page.url)) || [];
      if (!out.some((e) => hubs.has(e.to))) {
        hits.push({
          subject: pageSubject(page),
          summary: `Page ${reg.page_id} has no link to any registered topic hub`,
          evidence: [`outbound internal links: ${out.length}; none targets a hub/category/home page`],
        });
      }
    }
    return hits;
  },
}));

export default D;
