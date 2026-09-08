import { defineDetector, indexTargets, pageSubject } from './framework.js';

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

D.push(defineDetector({
  id: 'LINK-005', name: 'Internal redirect hop chain or circular redirect loop', namespace: 'LINK',
  description: 'An internal link targets a URL that initiates a multi-hop redirect chain (>=2 hops) or a circular redirect loop, dissipating link equity and wasting crawler budget.',
  discipline: ['seo', 'tech'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'low' },
  applicable_requirement: 'SEO §3 eliminate multi-hop internal redirects; prevent crawler trap redirect loops',
  remediation: 'Update internal links to point directly to the terminal 200 destination URL, bypassing redirect hops.',
  verification: 'Verify all internal links resolve to terminal 200 destinations in 0 redirect hops.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      const seenLinks = new Set();
      for (const e of ctx.site.outbound.get(ctx.site.normalize(p.url)) || []) {
        if (!e.to || seenLinks.has(e.to)) continue;
        seenLinks.add(e.to);

        let curr = ctx.site.byUrl.get(e.to);
        if (!curr || curr.status < 300 || curr.status >= 400) continue;

        let hops = 0;
        const visited = [e.to];
        const visitedSet = new Set([e.to]);
        let loopDetected = false;

        while (curr && curr.status >= 300 && curr.status < 400 && hops < 10) {
          hops++;
          const loc = curr.headers?.location || curr.headers?.Location || curr.redirectLocation;
          if (!loc) break;
          const nextUrl = ctx.site.normalize ? ctx.site.normalize(loc) : loc;
          if (visitedSet.has(nextUrl)) {
            loopDetected = true;
            visited.push(nextUrl);
            break;
          }
          visitedSet.add(nextUrl);
          visited.push(nextUrl);
          curr = ctx.site.byUrl.get(nextUrl);
        }

        if (loopDetected) {
          hits.push({
            subject: pageSubject(p),
            summary: `Internal link "${e.text || e.href}" targets circular redirect loop (${visited.join(' → ')})`,
            evidence: [
              `link: "${e.text || e.href}"`,
              `redirect loop: ${visited.join(' → ')}`,
            ],
          });
        } else if (hops >= 2) {
          hits.push({
            subject: pageSubject(p),
            summary: `Internal link "${e.text || e.href}" targets multi-hop redirect chain (${hops} hops: ${visited.join(' → ')})`,
            evidence: [
              `link: "${e.text || e.href}"`,
              `redirect chain: ${visited.join(' → ')}`,
              `hops: ${hops}`,
            ],
            captured: hops,
            expected: 0,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'LINK-006', name: 'Excessive naked URL or uninformative internal anchor text ratio', namespace: 'LINK',
  description: 'Over 25% of internal links on a page use naked URLs or uninformative anchors, diluting semantic topic graph signals for search engines and generative models.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium', representation: 'low' },
  applicable_requirement: 'SEO §3 descriptive anchor text; AEO §2 semantic entity linking; premise 3.3 topic graph integrity',
  remediation: 'Replace naked URLs and symbol-only anchors with descriptive, keyword-aligned topic text.',
  verification: 'Confirm less than 25% of internal anchors on any page are naked URLs or non-descriptive tokens.',
  check(ctx) {
    const hits = [];
    const UNINFORMATIVE_RX = /^(\s*|https?:\/\/.*|\/.*|[0-9]+|[•→>»*#\-_|~]+|click\s+here|read\s+more|learn\s+more|view\s+more|here|link|more|details|page)$/i;

    for (const p of indexTargets(ctx)) {
      const outbound = ctx.site.outbound.get(ctx.site.normalize(p.url)) || [];
      if (outbound.length < 4) continue;

      let uninformativeCount = 0;
      for (const e of outbound) {
        const text = (e.text || '').trim();
        if (!text || UNINFORMATIVE_RX.test(text) || text === e.href || text === e.to) {
          uninformativeCount++;
        }
      }

      const ratio = uninformativeCount / outbound.length;
      if (ratio > 0.25) {
        hits.push({
          subject: pageSubject(p),
          summary: `Page has ${Math.round(ratio * 100)}% uninformative internal anchors (${uninformativeCount}/${outbound.length})`,
          evidence: [
            `uninformative anchors: ${uninformativeCount}`,
            `total internal links: ${outbound.length}`,
            `ratio: ${(ratio * 100).toFixed(1)}%`,
          ],
          captured: `${Math.round(ratio * 100)}%`,
          expected: '<= 25%',
        });
      }
    }
    return hits;
  },
}));

export default D;

