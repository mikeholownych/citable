import { defineDetector, pageSubject } from './framework.js';

const D = [];

D.push(defineDetector({
  id: 'LINK-001', name: 'Broken internal link', namespace: 'LINK',
  description: 'An internal link targets a URL that is missing from the audited output or returns 4xx/5xx.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', conversion: 'low' },
  applicable_requirement: 'SEO §12 broken internal-link detection; §2 crawlable internal links',
  remediation: 'Fix or remove the link; add a redirect if the target moved.',
  verification: 'All internal links resolve to 200 pages.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      const seen = new Set();
      for (const e of ctx.site.outbound.get(ctx.site.normalize(p.url)) || []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        const target = ctx.site.byUrl.get(e.to);
        if (!target) {
          hits.push({
            subject: pageSubject(p),
            summary: `Internal link to missing URL ${e.to}`,
            evidence: [`link "${e.text || e.href}" → ${e.to} (not found in audited output)`],
          });
        } else if (target.status >= 400) {
          hits.push({
            subject: pageSubject(p),
            summary: `Internal link to ${e.to} returning HTTP ${target.status}`,
            evidence: [`link "${e.text || e.href}" → ${e.to} (status ${target.status})`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'LINK-002', name: 'Internal link to redirect', namespace: 'LINK',
  description: 'An internal link targets a URL that redirects instead of the final destination.',
  discipline: ['seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { retrieval: 'low' },
  applicable_requirement: 'SEO §3 avoid links to redirects or canonical duplicates',
  remediation: 'Update the link to the final destination URL.',
  verification: 'Internal links point directly at 200 URLs.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const e of ctx.site.outbound.get(ctx.site.normalize(p.url)) || []) {
        const target = ctx.site.byUrl.get(e.to);
        if (target && target.status >= 300 && target.status < 400) {
          hits.push({
            subject: pageSubject(p),
            summary: `Internal link to redirecting URL ${e.to} (HTTP ${target.status})`,
            evidence: [`link "${e.text || e.href}" → ${e.to} (status ${target.status})`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'LINK-003', name: 'Generic anchor text', namespace: 'LINK',
  description: 'Internal links use non-descriptive anchors ("click here", "read more", "learn more").',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { ranking: 'low' },
  applicable_requirement: 'SEO §3 meaningful anchor text; avoid "click here"',
  remediation: 'Rewrite anchors to describe the target ("AI execution governance definition", not "learn more").',
  verification: 'No internal anchors match the generic set.',
  check(ctx) {
    const generic = /^(click here|read more|learn more|here|more|this page|link)$/i;
    const hits = [];
    for (const p of ctx.site.pages) {
      const bad = (ctx.site.outbound.get(ctx.site.normalize(p.url)) || []).filter((e) => generic.test(e.text));
      if (bad.length) {
        hits.push({
          subject: pageSubject(p),
          summary: `${bad.length} internal link(s) with generic anchor text`,
          evidence: bad.slice(0, 5).map((e) => `"${e.text}" → ${e.to}`),
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'LINK-004', name: 'Sitewide repeated exact-match anchor', namespace: 'LINK',
  description: 'The same exact anchor text points at the same URL from a large share of pages — a pattern of mechanical link insertion.',
  discipline: ['seo'], severity: 'low', deterministic: false, requires: ['site'],
  impact: { ranking: 'low', reputational: 'low' },
  applicable_requirement: 'SEO §3 avoid sitewide exact-match anchors and automated keyword-matched links',
  false_positive_conditions: ['legitimate navigation labels (nav/footer) repeated by design'],
  remediation: 'Vary contextual anchors naturally; keep repeated labels to navigation chrome only.',
  verification: 'Re-measure anchor repetition after cleanup.',
  check(ctx) {
    if (ctx.site.pages.length < 5) return [];
    const counts = new Map();
    for (const p of ctx.site.pages) {
      for (const e of ctx.site.outbound.get(ctx.site.normalize(p.url)) || []) {
        if (!e.text || e.text.split(' ').length < 3) continue; // navigation labels are short; target phrase-anchors
        const key = `${e.text.toLowerCase()}→${e.to}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= Math.max(5, Math.ceil(ctx.site.pages.length * 0.8)))
      .map(([key, n]) => ({
        subject: { type: 'site', identifier: key },
        summary: `Exact-match anchor repeated ${n} times sitewide: ${key.split('→')[0]}`,
        evidence: [`${n} occurrences across ${ctx.site.pages.length} pages`],
        confidence: 'medium',
      }));
  },
}));

export default D;
