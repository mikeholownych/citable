import { defineDetector, indexTargets, pageSubject, safePath } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

D.push(defineDetector({
  id: 'SCHEMA-001', name: 'JSON-LD parse failure', namespace: 'SCHEMA',
  description: 'A JSON-LD script block does not parse as JSON.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium', representation: 'medium' },
  applicable_requirement: 'SEO §7 schema validation in CI/CD; detector spec: JSON-LD parse failure',
  remediation: 'Fix the JSON syntax; generate JSON-LD from data structures rather than hand-edited strings.',
  verification: 'All ld+json blocks parse.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        if (j.parseError) {
          hits.push({
            subject: { type: 'schema_block', identifier: `${p.url}#ld+json`, url: p.url, ...(p.sourceFile ? { source_file: p.sourceFile } : {}) },
            summary: `JSON-LD block fails to parse: ${j.parseError}`,
            evidence: [`parse error: ${j.parseError}`, `block head: ${j.raw.slice(0, 120)}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-002', name: 'Schema headline/name mismatch with visible content', namespace: 'SCHEMA',
  description: 'Article/WebPage headline in JSON-LD does not match the visible title or H1.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium' },
  applicable_requirement: 'Premise 3.4: structured data must match visible content; SEO §7 no invisible marked-up claims',
  remediation: 'Generate the headline from the same authoritative field that renders the visible title.',
  verification: 'Schema headline equals visible title or H1.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const type = [].concat(b['@type'] || []).join(',');
          if (!/Article|BlogPosting|TechArticle|WebPage/i.test(type)) continue;
          const headline = b.headline || b.name;
          if (!headline) continue;
          const visible = [p.title, ...(p.h1s.map((h) => h.text))].filter(Boolean).map((s) => s.toLowerCase().trim());
          if (!visible.some((v) => v.includes(String(headline).toLowerCase().trim()) || String(headline).toLowerCase().trim().includes(v))) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#${type}`, url: p.url },
              summary: `Schema headline "${headline}" does not match visible title or H1`,
              evidence: [`schema headline: ${headline}`, `visible title: ${p.title}`, `H1: ${p.h1s.map((h) => h.text).join(' | ') || 'none'}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-003', name: 'Schema URL conflicts with canonical', namespace: 'SCHEMA',
  description: 'JSON-LD url/mainEntityOfPage disagrees with the page canonical.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §2 canonical signals should agree across structured data URLs',
  remediation: 'Emit the canonical URL in structured data.',
  verification: 'Schema url matches rel=canonical.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.canonicals.length !== 1) continue;
      const canon = safePath(p.canonicals[0], p.url);
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const u = typeof b.url === 'string' ? b.url : typeof b.mainEntityOfPage === 'string' ? b.mainEntityOfPage : b.mainEntityOfPage?.['@id'];
          if (u && /WebPage|Article|BlogPosting|TechArticle/i.test([].concat(b['@type'] || []).join(',')) && safePath(u, p.url) !== canon) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#url`, url: p.url },
              summary: `Schema URL ${u} conflicts with canonical ${p.canonicals[0]}`,
              evidence: [`schema url: ${u}`, `canonical: ${p.canonicals[0]}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-004', name: 'Inaccurate schema dates', namespace: 'SCHEMA',
  description: 'datePublished is in the future, or dateModified precedes datePublished.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium' },
  applicable_requirement: 'SEO §7 accurate dates; AEO §8 do not update dates without material updates',
  remediation: 'Derive dates from the content system of record.',
  verification: 'datePublished ≤ dateModified ≤ now.',
  check(ctx) {
    const now = ctx.refDate ?? new Date();
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const pub = b.datePublished ? new Date(b.datePublished) : null;
          const mod = b.dateModified ? new Date(b.dateModified) : null;
          if (pub && !Number.isNaN(pub.getTime()) && pub > now) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#datePublished`, url: p.url },
              summary: `datePublished ${b.datePublished} is in the future`,
              evidence: [`datePublished: ${b.datePublished}; audit reference date: ${now.toISOString().slice(0, 10)}`],
            });
          }
          if (pub && mod && !Number.isNaN(pub.getTime()) && !Number.isNaN(mod.getTime()) && mod < pub) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#dateModified`, url: p.url },
              summary: `dateModified ${b.dateModified} precedes datePublished ${b.datePublished}`,
              evidence: [`dateModified: ${b.dateModified}; datePublished: ${b.datePublished}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-005', name: 'Rating/review markup without visible reviews', namespace: 'SCHEMA',
  description: 'aggregateRating or review markup exists but the visible page contains no review content.',
  discipline: ['seo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { legal: 'high', reputational: 'high', ranking: 'medium' },
  applicable_requirement: 'Premise 3.4: no fabricated ratings or reviews; SEO §7 required controls',
  remediation: 'Remove the rating markup unless genuine, visible, attributable reviews exist.',
  unsafe_shortcuts: ['keeping the markup and adding boilerplate "reviews" text'],
  verification: 'Rating markup exists only alongside visible review content.',
  check(ctx) {
    const reviewRx = /\b(review(s|ed)?|rating|testimonial)\b/i;
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if ((b.aggregateRating || b.review) && !reviewRx.test(p.text)) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#aggregateRating`, url: p.url },
              summary: 'Rating/review markup present but no visible review content on the page',
              evidence: [`schema contains ${b.aggregateRating ? 'aggregateRating' : 'review'}`, 'page text contains no review/rating/testimonial content'],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-006', name: 'Stale offer price validity', namespace: 'SCHEMA',
  description: 'Offer markup carries a priceValidUntil in the past.',
  discipline: ['seo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'high', conversion: 'medium' },
  applicable_requirement: 'Premise 3.4: avoid stale prices or availability; GEO §11 pricing: immediate on change',
  remediation: 'Regenerate offers from live commercial data; remove expired offers.',
  verification: 'No offer has priceValidUntil in the past.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const offers = [].concat(b.offers || []);
          for (const o of offers) {
            if (o && o.priceValidUntil && isPastDate(o.priceValidUntil, ctx.refDate)) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#offers`, url: p.url },
                summary: `Offer priceValidUntil ${o.priceValidUntil} is in the past`,
                evidence: [`priceValidUntil: ${o.priceValidUntil}; price: ${o.price ?? '?'}`],
              });
            }
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-007', name: 'FAQPage markup without matching visible questions', namespace: 'SCHEMA',
  description: 'FAQPage JSON-LD questions do not appear in the visible page text.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { legal: 'medium', ranking: 'medium' },
  applicable_requirement: 'AEO §6 do not deploy mass-generated FAQ schema; anti-pattern: FAQ schema without substantive FAQ content',
  remediation: 'Only mark up FAQs that are visible, substantive page content.',
  verification: 'Every FAQPage question string appears in visible text.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (![].concat(b['@type'] || []).includes('FAQPage')) continue;
          const questions = [].concat(b.mainEntity || []).map((q) => q?.name).filter(Boolean);
          const missing = questions.filter((q) => !p.text.toLowerCase().includes(String(q).toLowerCase().slice(0, 40)));
          if (questions.length > 0 && missing.length > 0) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#FAQPage`, url: p.url },
              summary: `${missing.length}/${questions.length} FAQ schema questions not found in visible content`,
              evidence: missing.slice(0, 3).map((q) => `not visible: "${q}"`),
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-008', name: 'Contradictory Organization graphs', namespace: 'SCHEMA',
  description: 'Multiple Organization blocks exist with the same @id but different names, or different @id values with the same name (split identity).',
  discipline: ['geo', 'seo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { representation: 'high' },
  applicable_requirement: 'Detector spec: multiple contradictory entity graphs; GEO §9 graph consistency',
  remediation: 'Emit one shared Organization node from a single data source; reference it by @id everywhere else.',
  verification: 'One @id ↔ one name for the organization across all pages.',
  check(ctx) {
    const byId = new Map();
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (!/Organization|Corporation/i.test([].concat(b['@type'] || []).join(','))) continue;
          if (!b['@id'] || !b.name) continue;
          if (!byId.has(b['@id'])) byId.set(b['@id'], new Set());
          byId.get(b['@id']).add(String(b.name));
        }
      }
    }
    return [...byId.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([id, names]) => ({
        subject: { type: 'schema_block', identifier: id },
        summary: `Organization @id ${id} carries ${names.size} different names: ${[...names].join(' / ')}`,
        evidence: [...names].map((n) => `name: ${n}`),
      }));
  },
}));

export default D;
