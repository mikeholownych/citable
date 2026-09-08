import { parse } from 'node-html-parser';
import { defineDetector, hasHtmlDocumentMarkup, indexTargets, isHtmlDocument, isHtmlDocumentUrl, registryPageFor, pageSubject, safePath } from './framework.js';
import { isAllowed } from '../crawler/robots.js';

const D = [];

D.push(defineDetector({
  id: 'TECH-001', name: 'Non-200 index-target URL', namespace: 'TECH',
  description: 'A page intended for indexing does not return HTTP 200.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high', citation: 'high' },
  applicable_requirement: 'SEO §2 required URL-level conditions; AEO §2 required indexing controls; GEO §2 required technical conditions',
  remediation: 'Restore a 200 response for the canonical URL, or update the page registry if the URL is intentionally retired (with a redirect to its successor).',
  verification: 'Fetch the URL and confirm HTTP 200.',
  check(ctx) {
    return indexTargets(ctx).filter((p) => p.status !== 200).map((p) => ({
      subject: pageSubject(p),
      summary: `Index-target URL returns HTTP ${p.status}`,
      evidence: [`HTTP status ${p.status} observed for ${p.url}`],
      captured: p.status, expected: 200,
    }));
  },
}));

D.push(defineDetector({
  id: 'TECH-002', name: 'Accidental noindex on index-target page', namespace: 'TECH',
  description: 'A page whose registry intent is "index" carries a noindex directive (meta robots or X-Robots-Tag).',
  discipline: ['seo', 'aeo', 'geo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high', citation: 'high' },
  applicable_requirement: 'SEO §2 crawl controls; AEO §2 no accidental noindex',
  remediation: 'Remove the noindex directive, or set indexing_intent: noindex in the page registry if exclusion is intended.',
  verification: 'Re-extract robots directives from the rendered page and response headers.',
  check(ctx) {
    return indexTargets(ctx).filter((p) => p.noindex).map((p) => ({
      subject: pageSubject(p),
      summary: 'Index-target page carries a noindex directive',
      evidence: [`robots directives: ${p.robotsDirectives.join(', ')}`],
      captured: p.robotsDirectives, expected: 'indexable directives',
    }));
  },
}));

D.push(defineDetector({
  id: 'TECH-003', name: 'robots.txt blocks index-target page', namespace: 'TECH',
  description: 'robots.txt disallows a search crawler from fetching a page that is intended to be indexed and cited.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high', citation: 'high' },
  applicable_requirement: 'SEO §2 critical distinction (robots.txt vs noindex); AEO §2 required crawler access',
  remediation: 'Remove or narrow the disallow rule for the affected path; use noindex (not robots.txt) when removal from search is the objective.',
  verification: 'Evaluate the robots.txt group matching the crawler against the URL path.',
  check(ctx) {
    if (!ctx.site.robots) return [];
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const verdict = isAllowed(ctx.site.robots, 'Googlebot', safePath(p.url));
      if (!verdict.allowed) {
        hits.push({
          subject: pageSubject(p),
          summary: `robots.txt blocks Googlebot from index-target path (${verdict.rule})`,
          evidence: [`matched rule: ${verdict.rule}`],
          captured: verdict.rule, expected: 'allow',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-004', name: 'Multiple conflicting canonical declarations', namespace: 'TECH',
  description: 'A document declares more than one rel=canonical with differing targets.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'high' },
  applicable_requirement: 'SEO §2 canonicalization: common canonical failures',
  remediation: 'Emit exactly one canonical link element per document, generated from the authoritative URL field.',
  verification: 'Count canonical link elements in rendered HTML.',
  check(ctx) {
    return ctx.site.pages.filter((p) => new Set(p.canonicals).size > 1).map((p) => ({
      subject: pageSubject(p),
      summary: `Document declares ${p.canonicals.length} canonical URLs`,
      evidence: p.canonicals.map((c) => `rel=canonical → ${c}`),
      captured: p.canonicals, expected: 'one canonical',
    }));
  },
}));

D.push(defineDetector({
  id: 'TECH-005', name: 'Canonical points to redirect', namespace: 'TECH',
  description: 'rel=canonical targets a URL that itself redirects.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'high' },
  applicable_requirement: 'SEO §2 canonical failures: canonical points to a redirect',
  remediation: 'Point the canonical at the final 200 destination.',
  verification: 'Resolve the canonical target and confirm a direct 200.',
  check(ctx) {
    return canonicalTargetProblem(ctx, (t) => t.status >= 300 && t.status < 400, 'redirect');
  },
}));

D.push(defineDetector({
  id: 'TECH-006', name: 'Canonical points to error page', namespace: 'TECH',
  description: 'rel=canonical targets a URL returning 4xx/5xx.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high' },
  applicable_requirement: 'SEO §2 canonical failures: canonical target returns an error',
  remediation: 'Point the canonical at a live 200 URL.',
  verification: 'Resolve the canonical target and confirm HTTP 200.',
  check(ctx) {
    return canonicalTargetProblem(ctx, (t) => t.status >= 400, 'error status');
  },
}));

D.push(defineDetector({
  id: 'TECH-007', name: 'Canonical points to noindex page', namespace: 'TECH',
  description: 'rel=canonical consolidates signals into a URL that is itself noindexed.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high' },
  applicable_requirement: 'SEO §2 canonical failures: canonical target is noindex',
  remediation: 'Either make the canonical target indexable or choose an indexable canonical.',
  verification: 'Check robots directives on the canonical target.',
  check(ctx) {
    return canonicalTargetProblem(ctx, (t) => t.noindex, 'noindex target');
  },
}));

D.push(defineDetector({
  id: 'TECH-008', name: 'Sitemap contains redirecting URL', namespace: 'TECH',
  description: 'An XML sitemap lists a URL that does not resolve directly with HTTP 200 (redirects).',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'low' },
  applicable_requirement: 'SEO §2: sitemap contains redirect',
  remediation: 'Regenerate sitemaps from the canonical URL set only.',
  verification: 'Fetch each sitemap URL and confirm direct 200 responses.',
  check(ctx) {
    return sitemapEntryProblem(ctx, (p) => p.status >= 300 && p.status < 400, 'redirects');
  },
}));

D.push(defineDetector({
  id: 'TECH-009', name: 'Sitemap contains non-canonical URL', namespace: 'TECH',
  description: 'A sitemap lists a URL whose page declares a different canonical.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §2 canonical signals should agree across sitemap entries',
  remediation: 'List only canonical URLs in sitemaps.',
  verification: 'Compare each sitemap URL with the canonical declared on the page it resolves to.',
  check(ctx) {
    const hits = [];
    for (const sm of ctx.site.sitemaps) {
      for (const u of sm.parsed.urls) {
        const page = ctx.site.byUrl.get(ctx.site.normalize(u.loc));
        if (!page || page.canonicals.length === 0) continue;
        const canon = page.canonicals[0];
        if (safePath(canon, ctx.site.baseUrl) !== safePath(u.loc, ctx.site.baseUrl)) {
          hits.push({
            subject: { type: 'url', identifier: u.loc, url: u.loc, source_location: sm.source },
            summary: `Sitemap lists non-canonical URL (page canonical: ${canon})`,
            evidence: [`sitemap ${sm.source} lists ${u.loc}`, `page declares canonical ${canon}`],
            captured: u.loc, expected: canon,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-010', name: 'Sitemap URL unresolvable or errors', namespace: 'TECH',
  description: 'A sitemap lists a URL that is missing from the built output or returns an error.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium' },
  applicable_requirement: 'SEO §2 sitemap processing; clean sitemap coverage (§15)',
  remediation: 'Regenerate sitemaps from live canonical URLs; remove retired URLs.',
  verification: 'Resolve every sitemap URL against the built output or deployed site.',
  check(ctx) {
    const hits = [];
    for (const sm of ctx.site.sitemaps) {
      for (const u of sm.parsed.urls) {
        const page = ctx.site.byUrl.get(ctx.site.normalize(u.loc));
        if (!page && ctx.site.mode === 'url' && ctx.site.crawl?.truncated) {
          continue;
        } else if (!page) {
          hits.push({
            subject: { type: 'url', identifier: u.loc, url: u.loc, source_location: sm.source },
            summary: 'Sitemap URL not present in audited output',
            evidence: [`sitemap ${sm.source} lists ${u.loc}; no matching page found`],
          });
        } else if (page.status >= 400) {
          hits.push({
            subject: { type: 'url', identifier: u.loc, url: u.loc, source_location: sm.source },
            summary: `Sitemap URL returns HTTP ${page.status}`,
            evidence: [`sitemap ${sm.source} lists ${u.loc}; observed status ${page.status}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-011', name: 'Render-dependent primary content', namespace: 'TECH',
  description: 'Initial HTML contains almost no primary text relative to script payload; principal content likely requires client-side rendering.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: false, requires: ['site'],
  impact: { retrieval: 'high', citation: 'high' },
  applicable_requirement: 'SEO §2 rendering; AEO §2 rendering requirements; GEO §2 server-rendered principal content',
  false_positive_conditions: ['intentionally minimal pages (e.g., app shells excluded from indexing)'],
  remediation: 'Server-render or statically generate the principal content so it exists in initial HTML.',
  verification: 'Compare extracted text of raw HTML against rendered output.',
  check(ctx) {
    return indexTargets(ctx)
      .filter((p) => p.status === 200 && p.wordCount < 40 && p.scriptBytes > 2000)
      .map((p) => ({
        subject: pageSubject(p),
        summary: `Initial HTML has ~${p.wordCount} words but ${p.scriptBytes} bytes of script; primary content appears render-dependent`,
        evidence: [`extracted word count: ${p.wordCount}`, `inline/external script text bytes: ${p.scriptBytes}`],
        confidence: 'medium',
      }));
  },
}));

D.push(defineDetector({
  id: 'TECH-012', name: 'Invalid MIME type for HTML page', namespace: 'TECH',
  description: 'An index-target page is served with a non-HTML content type.',
  discipline: ['seo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high' },
  applicable_requirement: 'SEO §2 correct MIME type',
  remediation: 'Serve HTML documents with Content-Type: text/html.',
  verification: 'Inspect the Content-Type response header.',
  check(ctx) {
    return indexTargets(ctx)
      .filter((p) => p.status === 200 && p.contentType && (isHtmlDocumentUrl(p.url) || hasHtmlDocumentMarkup(p)) && !isHtmlDocument(p))
      .map((p) => ({
        subject: pageSubject(p),
        summary: `HTML page served with Content-Type "${p.contentType}"`,
        evidence: [`content-type: ${p.contentType}`],
        captured: p.contentType, expected: 'text/html',
      }));
  },
}));

D.push(defineDetector({
  id: 'TECH-013', name: 'Redirect chain', namespace: 'TECH',
  description: 'Reaching the final URL required more than one redirect hop.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'low' },
  applicable_requirement: 'SEO §2 no redirect chain',
  remediation: 'Collapse redirect chains so every legacy URL redirects directly to the final destination.',
  verification: 'Follow redirects and count hops.',
  check(ctx) {
    return ctx.site.pages.filter((p) => (p.redirectChain?.length || 0) > 1).map((p) => ({
      subject: pageSubject(p),
      summary: `Redirect chain of ${p.redirectChain.length} hops`,
      evidence: p.redirectChain.map((r) => `${r.status} ${r.url} → ${r.location}`),
    }));
  },
}));

D.push(defineDetector({
  id: 'TECH-014', name: 'Soft-404 behaviour', namespace: 'TECH',
  description: 'A page returns 200 but its content indicates the resource does not exist.',
  discipline: ['seo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'medium' },
  applicable_requirement: 'SEO §2 no soft-404 behaviour',
  false_positive_conditions: ['pages legitimately discussing 404 handling or error pages'],
  remediation: 'Return a real 404/410 status for missing resources.',
  verification: 'Check the HTTP status of the affected URL.',
  check(ctx) {
    const rx = /\b(page not found|404 not found|this page (does not|doesn't) exist|nothing (was )?found here)\b/i;
    return ctx.site.pages
      .filter((p) => p.status === 200 && p.wordCount < 120 && (rx.test(p.title || '') || rx.test(p.text)))
      .map((p) => ({
        subject: pageSubject(p),
        summary: 'Page returns 200 but content indicates "not found" (soft 404)',
        evidence: [`title: ${p.title}`, `matched not-found phrasing in a ${p.wordCount}-word page`],
        confidence: 'medium',
      }));
  },
}));

D.push(defineDetector({
  id: 'TECH-015', name: 'Staging or preview host exposed as indexable', namespace: 'TECH',
  description: 'The audited base URL looks like a staging/preview environment yet pages are indexable.',
  discipline: ['seo'], severity: 'critical', deterministic: false, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high', reputational: 'medium' },
  applicable_requirement: 'SEO §2 staging environments; §12 staging environment protection',
  false_positive_conditions: ['production hosts that legitimately contain words like "preview" in the brand'],
  remediation: 'Add noindex + authentication to non-production environments.',
  verification: 'Check robots directives and access controls on the staging host.',
  check(ctx) {
    let host;
    try { host = new URL(ctx.site.baseUrl).hostname; } catch { return []; }
    const labels = host.split('.').slice(0, -1); // TLDs like .test/.dev are not staging signals
    if (!labels.some((l) => /(^|-)(staging|stage|preview|dev|test|uat)(-|$)/i.test(l))) return [];
    const indexable = ctx.site.pages.filter((p) => !p.noindex && p.status === 200);
    if (indexable.length === 0) return [];
    return [{
      subject: { type: 'site', identifier: ctx.site.baseUrl, url: ctx.site.baseUrl },
      summary: `Host "${host}" resembles a non-production environment and serves ${indexable.length} indexable page(s)`,
      evidence: [`hostname: ${host}`, `indexable pages: ${indexable.slice(0, 5).map((p) => p.url).join(', ')}`],
      confidence: 'medium',
    }];
  },
}));

D.push(defineDetector({
  id: 'TECH-016', name: 'Missing sitemap', namespace: 'TECH',
  description: 'No XML sitemap was found for the audited output.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium' },
  applicable_requirement: 'SEO §2 inclusion in the appropriate XML sitemap; AEO §2 sitemap architecture',
  remediation: 'Generate an XML sitemap covering all canonical index-target URLs and reference it from robots.txt.',
  verification: 'Confirm sitemap presence and robots.txt Sitemap directive.',
  check(ctx) {
    if (ctx.site.sitemaps.length > 0) return [];
    return [{
      subject: { type: 'site', identifier: ctx.site.baseUrl, url: ctx.site.baseUrl },
      summary: 'No XML sitemap found',
      evidence: ['no sitemap*.xml present in audited output and none referenced from robots.txt'],
    }];
  },
}));

D.push(defineDetector({
  id: 'TECH-017', name: 'Snippet suppression on citation-target page', namespace: 'TECH',
  description: 'A page targeted for answer citation carries nosnippet or max-snippet:0, which removes snippet eligibility that generative search features depend on.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { citation: 'high', representation: 'medium' },
  applicable_requirement: 'AEO §2 no restrictive nosnippet; GEO §2 snippet eligibility',
  remediation: 'Remove nosnippet/max-snippet:0 from citation-target pages, or record an explicit decision that snippet suppression is intended.',
  verification: 'Re-extract robots directives.',
  check(ctx) {
    return indexTargets(ctx).filter((p) => p.nosnippet).map((p) => ({
      subject: pageSubject(p),
      summary: 'Citation-target page suppresses snippets',
      evidence: [`robots directives: ${p.robotsDirectives.join(', ')}`],
    }));
  },
}));

D.push(defineDetector({
  id: 'TECH-018', name: 'Missing viewport (mobile readiness)', namespace: 'TECH',
  description: 'Page lacks a viewport meta tag, a minimum condition for mobile parity.',
  discipline: ['seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { ranking: 'low' },
  applicable_requirement: 'SEO §2 mobile-first requirements (proxy check; full parity requires dual rendering)',
  false_negative_conditions: ['viewport present but mobile content still diverges — requires rendered comparison, not covered here'],
  remediation: 'Add a responsive viewport meta tag; verify mobile content parity separately.',
  verification: 'Check for meta[name=viewport] in rendered HTML.',
  check(ctx) {
    return indexTargets(ctx)
      .filter((p) => p.status === 200 && !p.viewportMeta)
      .map((p) => ({
        subject: pageSubject(p),
        summary: 'No viewport meta tag; mobile rendering readiness not established',
        evidence: ['meta[name=viewport] absent from document head'],
      }));
  },
}));

D.push(defineDetector({
  id: 'TECH-019', name: 'Open Graph URL conflicts with canonical', namespace: 'TECH',
  description: 'Open Graph URL (og:url) disagrees with the declared canonical URL, sending conflicting canonicalization and entity identity signals.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'low', ranking: 'medium', citation: 'medium' },
  applicable_requirement: 'SEO §2 canonical signals should agree across Open Graph and HTML declarations; AEO §2 consistent identity signals',
  remediation: 'Align og:url with the rel=canonical target on the index-target document, or omit og:url if self-canonicalizing.',
  verification: 'Compare og:url and rel=canonical in rendered HTML.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      if (p.canonicals.length !== 1 || !p.ogUrl) continue;
      const declared = p.canonicals[0];
      let normCanonical;
      let normOg;
      try {
        normCanonical = ctx.site.normalize(new URL(declared, p.url).href);
        normOg = ctx.site.normalize(new URL(p.ogUrl, p.url).href);
      } catch {
        continue;
      }
      if (normCanonical !== normOg) {
        hits.push({
          subject: pageSubject(p),
          summary: `Open Graph URL (${p.ogUrl}) disagrees with rel=canonical (${declared})`,
          evidence: [`rel=canonical: ${declared}`, `og:url: ${p.ogUrl}`],
          captured: { canonical: declared, ogUrl: p.ogUrl },
          expected: 'matching canonical and og:url',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-020', name: 'Missing reciprocal hreflang return link', namespace: 'TECH',
  description: 'An alternate hreflang URL targets an internal page, but that target page does not reciprocate with a matching hreflang link back to the source page.',
  discipline: ['seo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'medium', citation: 'medium' },
  applicable_requirement: 'SEO §2 internationalization controls; RFC 8288 and search engine hreflang reciprocity requirement',
  remediation: 'Add a reciprocal <link rel="alternate" hreflang="..." href="..."> tag on the target page pointing back to the referencing page.',
  verification: 'Extract hreflang alternate links on both URLs and confirm bidirectional reciprocity.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      if (!p.hreflangs || p.hreflangs.length === 0) continue;
      const normSource = ctx.site.normalize(p.url);
      for (const alt of p.hreflangs) {
        if (!alt.href || alt.lang === 'x-default') continue;
        let normTarget;
        try {
          normTarget = ctx.site.normalize(new URL(alt.href, p.url).href);
        } catch {
          continue;
        }
        if (normTarget === normSource) continue;
        const targetPage = ctx.site.byUrl.get(normTarget);
        if (!targetPage) continue;
        const hasReciprocal = (targetPage.hreflangs || []).some((tAlt) => {
          try {
            const normBack = ctx.site.normalize(new URL(tAlt.href, targetPage.url).href);
            return normBack === normSource;
          } catch {
            return false;
          }
        });
        if (!hasReciprocal) {
          hits.push({
            subject: pageSubject(p),
            summary: `Missing reciprocal hreflang link from ${alt.href} back to ${p.url}`,
            evidence: [
              `${p.url} references alternate ${alt.href} (hreflang="${alt.lang}")`,
              `${normTarget} does not link back to ${p.url} in its hreflang annotations`,
            ],
            captured: { target: normTarget, hreflang: alt.lang },
            expected: `reciprocal link to ${p.url}`,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-021', name: 'Invalid or non-standard BCP 47 hreflang syntax', namespace: 'TECH',
  description: 'An hreflang annotation uses an invalid language code, malformed region subtag, deprecated territory, or relative URL.',
  discipline: ['seo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'medium', citation: 'medium' },
  applicable_requirement: 'SEO §2 BCP 47 language/region standards (ISO 639-1 language, ISO 3166-1 alpha-2 region)',
  remediation: 'Use lowercase two-letter ISO 639-1 language codes, optional uppercase ISO 3166-1 region codes (e.g. en-US, es-ES, de-DE), or x-default with absolute URLs.',
  verification: 'Validate all hreflang attribute values against BCP 47 and confirm absolute URLs.',
  check(ctx) {
    const hits = [];
    const BCP47_REGEX = /^(?:x-default|[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?)$/;
    for (const p of ctx.site.pages) {
      if (!p.hreflangs || p.hreflangs.length === 0) continue;
      for (const alt of p.hreflangs) {
        const code = alt.lang;
        const href = alt.href;
        const issues = [];
        if (!code) {
          issues.push('hreflang attribute is empty');
        } else {
          if (code.toLowerCase() === 'x-default') {
            if (code !== 'x-default') issues.push(`x-default must be lowercase (got "${code}")`);
          } else if (code.includes('_')) {
            issues.push(`hreflang uses underscore instead of hyphen ("${code}")`);
          } else if (/\ben-uk\b/i.test(code)) {
            issues.push(`"UK" is not an ISO 3166-1 alpha-2 country code; use "GB" (got "${code}")`);
          } else if (!BCP47_REGEX.test(code)) {
            issues.push(`malformed BCP 47 code format ("${code}")`);
          }
        }
        if (href && !/^https?:\/\//i.test(href)) {
          issues.push(`hreflang target must be an absolute URL with scheme (got "${href}")`);
        }
        if (issues.length > 0) {
          hits.push({
            subject: pageSubject(p),
            summary: `Invalid hreflang annotation: ${issues.join('; ')}`,
            evidence: issues.map((iss) => `${p.url}: ${iss}`),
            captured: { hreflang: code, href },
            expected: 'valid BCP 47 language/region code and absolute URL',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-022', name: 'Hreflang alternate target conflicts with rel=canonical', namespace: 'TECH',
  description: 'An alternate hreflang URL points to a page that declares a different rel=canonical target, breaking the alternate cluster.',
  discipline: ['seo', 'geo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'high', citation: 'high' },
  applicable_requirement: 'SEO §2 canonical and alternate harmony; localized pages in an hreflang cluster must be self-canonical',
  remediation: 'Ensure each localized alternate page declares a self-referencing rel=canonical matching its own URL.',
  verification: 'Check that target rel=canonical matches the alternate hreflang URL.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      if (!p.hreflangs || p.hreflangs.length === 0) continue;
      for (const alt of p.hreflangs) {
        if (!alt.href) continue;
        let normTarget;
        try {
          normTarget = ctx.site.normalize(new URL(alt.href, p.url).href);
        } catch {
          continue;
        }
        const targetPage = ctx.site.byUrl.get(normTarget);
        if (!targetPage || targetPage.canonicals.length !== 1) continue;
        let targetCanonical;
        try {
          targetCanonical = ctx.site.normalize(new URL(targetPage.canonicals[0], targetPage.url).href);
        } catch {
          continue;
        }
        if (targetCanonical !== normTarget) {
          hits.push({
            subject: pageSubject(p),
            summary: `Hreflang alternate ${alt.href} points to non-canonical page (canonical is ${targetCanonical})`,
            evidence: [
              `${p.url} lists ${alt.href} as alternate (${alt.lang})`,
              `${normTarget} declares canonical ${targetCanonical}`,
            ],
            captured: { target: normTarget, canonical: targetCanonical },
            expected: `self-canonical target (${normTarget})`,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-023', name: 'Hydration gap: critical metadata or schema missing from initial server HTML response', namespace: 'TECH',
  description: 'A single-page application or client-rendered document returns empty content mounting shells with virtually no static text (<20 words) in initial server HTML, breaking crawler and answer engine extraction without full headless JS rendering.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'medium', citation: 'medium' },
  applicable_requirement: 'SEO §2 crawlable HTML and server-side rendering; AEO §2 immediate extractability without execution delay',
  remediation: 'Implement Server-Side Rendering (SSR) or Static Site Generation (SSG) so critical content and metadata are present in initial server HTML.',
  verification: 'Inspect initial server HTML response to confirm main content and metadata are present before JavaScript execution.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const doc = parse(p.rawHtml);
      const hasMountShell = doc.querySelector('#root, #__next, #app, [data-reactroot]');
      const wordCount = p.rawVisibleWordCount || p.wordCount || 0;
      const hasScripts = (p.scriptBytes || 0) > 0 || doc.querySelectorAll('script').length > 0;

      if (hasMountShell && wordCount < 20 && hasScripts) {
        hits.push({
          subject: pageSubject(p),
          summary: `Client-rendered mounting shell (${hasMountShell.tagName.toLowerCase()}${hasMountShell.id ? '#' + hasMountShell.id : ''}) contains only ${wordCount} words in initial HTML response`,
          evidence: [
            `shell element: <${hasMountShell.tagName.toLowerCase()} id="${hasMountShell.id || ''}">`,
            `initial static word count: ${wordCount}`,
            'search engines and AI agents requiring raw HTML cannot extract content without full JavaScript rendering',
          ],
          captured: wordCount,
          expected: '>= 20 words with server-rendered content',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-024', name: 'Excessive render-blocking script payload exceeding crawler execution budget', namespace: 'TECH',
  description: 'The page delivers excessive inline/head script payloads (>1.2MB) or an excessive number of render-blocking head scripts (>12 without defer/async), exhausting crawler execution budgets and delaying indexing.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', ranking: 'low' },
  applicable_requirement: 'SEO §2 crawler execution budget; Google Search Central JavaScript rendering guidelines',
  remediation: 'Reduce JavaScript payload size, code-split vendor bundles, and add defer or async to head script tags.',
  verification: 'Verify total initial script payload is under 1.2MB and head script tags are deferred or asynchronous.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const doc = parse(p.rawHtml);
      const headScripts = doc.querySelectorAll('head script');
      let blockingCount = 0;
      for (const s of headScripts) {
        const type = (s.getAttribute('type') || '').toLowerCase();
        if (type === 'application/ld+json') continue;
        const isAsync = s.hasAttribute('async');
        const isDefer = s.hasAttribute('defer');
        const isModule = type === 'module';
        if (!isAsync && !isDefer && !isModule && s.hasAttribute('src')) {
          blockingCount++;
        }
      }

      const scriptBytes = p.scriptBytes || 0;
      if (scriptBytes > 1200000 || blockingCount > 12) {
        hits.push({
          subject: pageSubject(p),
          summary: `Page exceeds crawler script execution budget (${scriptBytes > 1200000 ? `${(scriptBytes / 1000000).toFixed(2)}MB script bytes` : ''}${scriptBytes > 1200000 && blockingCount > 12 ? '; ' : ''}${blockingCount > 12 ? `${blockingCount} render-blocking head scripts` : ''})`,
          evidence: [
            `script bytes: ${scriptBytes}`,
            `render-blocking scripts in head: ${blockingCount}`,
            'crawlers and generative search spiders may abort JavaScript execution under heavy script payloads',
          ],
          captured: { scriptBytes, blockingCount },
          expected: 'scriptBytes <= 1.2MB and blockingCount <= 12',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'TECH-025', name: 'Oversized uncompressed image asset or heavy inline image payload', namespace: 'TECH',
  description: 'The page embeds an excessively large inline image data URI (>100KB) or references raw uncompressed image payloads exceeding 1MB, delaying Largest Contentful Paint (LCP) and exhausting mobile data budgets.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'low' },
  applicable_requirement: 'SEO §2 crawler media payload budget; Google Search Central image optimization guidelines',
  remediation: 'Compress image assets using modern formats (WebP/AVIF), resize to display dimensions, and externalize inline base64 image data.',
  verification: 'Confirm all image references are under 1MB and inline data URIs are under 100KB.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.images) continue;
      for (const img of p.images) {
        const src = img.src || '';
        if (src.startsWith('data:image/') && src.length > 100000) {
          hits.push({
            subject: pageSubject(p),
            summary: `Heavy inline base64 image payload (${Math.round(src.length / 1024)}KB) bloats HTML document size`,
            evidence: [
              `data URI length: ${src.length} characters (~${Math.round(src.length / 1024)}KB)`,
              'inline image payloads delay initial HTML parsing and waste crawler network budgets',
            ],
            captured: { dataUriLength: src.length },
            expected: 'inline image data URI <= 100KB',
          });
          break;
        } else if (img.bytes && img.bytes > 1000000) {
          hits.push({
            subject: pageSubject(p),
            summary: `Oversized image asset "${src}" (${(img.bytes / 1000000).toFixed(2)}MB) delays LCP`,
            evidence: [
              `image source: ${src}`,
              `image size: ${img.bytes} bytes`,
              'images exceeding 1MB exhaust mobile rendering budgets and degrade Largest Contentful Paint',
            ],
            captured: { src, bytes: img.bytes },
            expected: 'image bytes <= 1MB',
          });
          break;
        }
      }
    }
    return hits;
  },
}));

export function canonicalTargetProblem(ctx, predicate, label) {
  const hits = [];
  for (const p of ctx.site.pages) {
    for (const c of p.canonicals) {
      let target;
      try {
        target = ctx.site.byUrl.get(ctx.site.normalize(new URL(c, p.url).href));
      } catch { continue; }
      if (target && target !== p && predicate(target)) {
        hits.push({
          subject: pageSubject(p),
          summary: `Canonical points to ${label} (${c})`,
          evidence: [`rel=canonical → ${c}`, `target status: ${target.status}${target.noindex ? ', noindex' : ''}`],
          captured: c,
        });
      }
    }
  }
  return hits;
}

function sitemapEntryProblem(ctx, predicate, label) {
  const hits = [];
  for (const sm of ctx.site.sitemaps) {
    for (const u of sm.parsed.urls) {
      const page = ctx.site.byUrl.get(ctx.site.normalize(u.loc));
      if (page && predicate(page)) {
        hits.push({
          subject: { type: 'url', identifier: u.loc, url: u.loc, source_location: sm.source },
          summary: `Sitemap URL ${label} (status ${page.status})`,
          evidence: [`sitemap ${sm.source} lists ${u.loc}; observed status ${page.status}`],
        });
      }
    }
  }
  return hits;
}

export default D;
