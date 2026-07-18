import { defineDetector, indexTargets, registryPageFor, sitePageFor, pageSubject, entrySubject } from './framework.js';

const D = [];

/* ---------------- EXT: external corroboration ---------------- */

D.push(defineDetector({
  id: 'EXT-001', name: 'Corroboration claimed from owned surface', namespace: 'EXT',
  description: 'A claim lists "external corroboration" whose source is the organization’s own domain — self-corroboration.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'medium', reputational: 'medium' },
  applicable_requirement: 'AEO §7: corroboration must be editorially independent; premise 3.6',
  remediation: 'Move the reference to evidence (owned) and pursue genuinely independent corroboration.',
  verification: 'External corroboration entries resolve to non-owned domains.',
  check(ctx) {
    const ownDomains = new Set();
    try { ownDomains.add(new URL(ctx.config?.site?.base_url ?? 'https://invalid.test').hostname); } catch { /* no base url */ }
    const ev = new Map((ctx.registries.evidence?.entries || []).map((e) => [e.evidence_id, e]));
    const hits = [];
    for (const c of ctx.registries.claims?.entries || []) {
      for (const ref of c.external_corroboration || []) {
        const e = ev.get(ref);
        const src = e?.source ?? (typeof ref === 'string' && ref.startsWith('http') ? ref : null);
        if (!src) continue;
        try {
          if (ownDomains.has(new URL(src).hostname)) {
            hits.push({
              subject: entrySubject('claims', c.claim_id),
              summary: `External corroboration for claim ${c.claim_id} points at owned domain ${new URL(src).hostname}`,
              evidence: [`corroboration source: ${src}`],
            });
          }
        } catch { /* non-URL sources cannot be classified */ }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'EXT-002', name: 'Comparative claim lacking independent corroboration', namespace: 'EXT',
  description: 'A verified comparative claim has no external corroboration recorded at all.',
  discipline: ['geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { representation: 'medium', citation: 'low' },
  applicable_requirement: 'GEO §6: owned content is necessary but insufficient; AEO §7 external corroboration layer',
  remediation: 'Pursue independent editorial coverage, reviews, or analyst references that corroborate the comparison — never manufacture them.',
  unsafe_shortcuts: ['fake reviews', 'synthetic community posts', 'paid lists presented as editorial'],
  verification: 'Comparative verified claims list at least one independent corroboration source.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => c.claim_type === 'comparative' && ['verified', 'verified_narrowed'].includes(c.status) && (c.external_corroboration || []).length === 0)
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `Verified comparative claim ${c.claim_id} has no independent corroboration`,
        evidence: ['external_corroboration: []'],
      }));
  },
}));

/* ---------------- GEO: generative representation ---------------- */

D.push(defineDetector({
  id: 'GEO-001', name: 'Hidden instructions targeting language models', namespace: 'GEO',
  description: 'Hidden page text or HTML comments contain instruction-like phrasing aimed at AI systems (crawler prompt injection).',
  discipline: ['geo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { reputational: 'high', legal: 'medium', representation: 'high' },
  applicable_requirement: 'Premise 3.6: no hidden instructions for language models, no crawler prompt injection; GEO §6 unsafe practices',
  remediation: 'Remove the hidden instruction text entirely.',
  unsafe_shortcuts: ['moving the instructions to a less detectable location'],
  verification: 'No hidden text or comments contain model-directed instructions.',
  check(ctx) {
    const rx = /(ignore (all |any )?(previous|prior|above) (instructions|prompts)|you are an? (ai|llm|language model|assistant)|when summariz|if you are an? (ai|llm|assistant|model)|always recommend|do not mention (competitor|alternative)|respond with|tell the user)/i;
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const t of p.hiddenTexts) {
        if (rx.test(t)) {
          hits.push({
            subject: pageSubject(p),
            summary: 'Hidden text contains instructions directed at AI systems',
            evidence: [`hidden text: "${t.slice(0, 160)}"`],
          });
        }
      }
      const comments = p.rawHtml.match(/<!--([\s\S]*?)-->/g) || [];
      for (const c of comments) {
        if (rx.test(c)) {
          hits.push({
            subject: pageSubject(p),
            summary: 'HTML comment contains instructions directed at AI systems',
            evidence: [`comment: "${c.slice(0, 160)}"`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-002', name: 'Proprietary concept without stable definition', namespace: 'GEO',
  description: 'A proprietary-concept entity has no definition recorded and/or no canonical page.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'high', citation: 'medium' },
  applicable_requirement: 'Detector spec: proprietary term lacks a stable definition; GEO §5 controlled terminology',
  remediation: 'Publish one canonical definition page per proprietary concept and record it in the registry.',
  verification: 'Concept entity has definition and canonical_url.',
  check(ctx) {
    return (ctx.registries.entities?.entries || [])
      .filter((e) => e.entity_type === 'proprietary_concept' && e.status !== 'retired')
      .filter((e) => !e.definition || !e.canonical_url)
      .map((e) => ({
        subject: entrySubject('entities', e.entity_id),
        summary: `Proprietary concept "${e.canonical_name}" lacks ${!e.definition ? 'a definition' : ''}${!e.definition && !e.canonical_url ? ' and ' : ''}${!e.canonical_url ? 'a canonical page' : ''}`,
        evidence: [`definition: ${e.definition ? 'present' : 'missing'}; canonical_url: ${e.canonical_url ?? 'missing'}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'GEO-003', name: 'Entity absent from its category page', namespace: 'GEO',
  description: 'A product entity declares a category for which a category page exists, but the page never mentions the entity.',
  discipline: ['geo'], severity: 'medium', deterministic: true, requires: ['site', 'registries'],
  impact: { representation: 'medium', citation: 'low' },
  applicable_requirement: 'Detector spec: entity omitted from its relevant category page; GEO §3 category placement',
  remediation: 'Reference the entity (with its canonical name) on the category page it belongs to.',
  verification: 'Category page text contains the entity canonical name or an alias.',
  check(ctx) {
    const categoryPages = (ctx.registries.pages?.entries || []).filter((p) => p.page_type === 'category' && p.status !== 'retired');
    if (categoryPages.length === 0) return [];
    const hits = [];
    for (const e of (ctx.registries.entities?.entries || []).filter((e) => ['product', 'product_family'].includes(e.entity_type) && e.category)) {
      for (const cp of categoryPages) {
        if (!(cp.primary_entities || []).some((pe) => {
          const cat = (ctx.registries.entities?.entries || []).find((x) => x.entity_id === pe);
          return cat && (cat.canonical_name.toLowerCase() === String(e.category).toLowerCase() || cat.entity_id === e.category);
        })) continue;
        const page = sitePageFor(ctx, cp);
        if (!page) continue;
        const names = [e.canonical_name, ...(e.aliases || [])].map((n) => n.toLowerCase());
        if (!names.some((n) => page.text.toLowerCase().includes(n))) {
          hits.push({
            subject: entrySubject('entities', e.entity_id),
            summary: `Entity "${e.canonical_name}" is not mentioned on its category page ${cp.page_id}`,
            evidence: [`category: ${e.category}`, `category page: ${cp.url}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-004', name: 'llms.txt treated as authority mechanism', namespace: 'GEO',
  description: 'llms.txt exists and contains directive/authority language, which no engine honors as an authorization mechanism.',
  discipline: ['geo'], severity: 'low', deterministic: false, requires: ['site'],
  impact: { representation: 'low', legal: 'low' },
  applicable_requirement: 'Anti-pattern: treating llms.txt as an authority mechanism; GEO §9 llms.txt is optional and experimental',
  false_positive_conditions: ['descriptive llms.txt files that merely index documentation'],
  remediation: 'Treat llms.txt as optional discovery metadata only; move access decisions to robots.txt and the crawler policy registry.',
  verification: 'llms.txt contains no directive/authorization language.',
  check(ctx) {
    const page = ctx.site.pages.find((p) => p.url.endsWith('/llms.txt'));
    const raw = page?.rawHtml ?? ctx.site.llmsTxt ?? null;
    if (!raw) return [];
    if (/\b(must not|do not (train|use|crawl)|prohibited|required to|you must|licen[cs]e enforcement)\b/i.test(raw)) {
      return [{
        subject: { type: 'url', identifier: 'llms.txt' },
        summary: 'llms.txt contains directive language it cannot enforce',
        evidence: ['llms.txt is not a recognized authorization mechanism; Google explicitly does not use it'],
        confidence: 'high',
      }];
    }
    return [];
  },
}));

D.push(defineDetector({
  id: 'GEO-005', name: 'Generative target lacks primary entity mapping', namespace: 'GEO',
  description: 'A page intended to define, compare, categorize, or recommend entities does not declare its primary entities.',
  discipline: ['geo', 'aeo'], severity: 'high', deterministic: true, requires: ['site', 'registries'],
  impact: { representation: 'high', citation: 'medium', maintainability: 'medium' },
  applicable_requirement: 'GEO §3 canonical entity registry and §19 page acceptance; AEO §3 entity architecture',
  remediation: 'Map the page to canonical entity IDs in primary_entities and ensure visible names and structured-data @ids agree.',
  verification: 'Page primary_entities is non-empty, referential integrity passes, and ENTITY detectors report no conflict.',
  check(ctx) {
    const entityTypes = new Set(['definition', 'product', 'service', 'comparison', 'recommendation', 'category', 'about']);
    return indexTargets(ctx).flatMap((p) => {
      const reg = registryPageFor(ctx, p);
      if (!reg || !entityTypes.has(reg.page_type) || (reg.primary_entities || []).length) return [];
      return [{
        subject: pageSubject(p),
        summary: `${reg.page_type} page ${reg.page_id} has no primary entity mapping`,
        evidence: ['primary_entities is empty or absent'],
      }];
    });
  },
}));

D.push(defineDetector({
  id: 'GEO-006', name: 'Active prompt lacks evaluation brief', namespace: 'GEO',
  description: 'An active prompt lacks the expected answer components, desired outcome, risk classification, or accountable owner needed for reproducible GEO evaluation.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'high', citation: 'medium', maintainability: 'high' },
  applicable_requirement: 'GEO §1 prompt registry, §12 repeatable measurement, and §15 governance; AEO §1 question corpus',
  remediation: 'Complete expected_answer_components, desired_outcome, risk_classification, and owner before using the prompt as an optimization target.',
  verification: 'Every active prompt has a complete evaluation brief and passes registry validation.',
  check(ctx) {
    return (ctx.registries.prompts?.entries || [])
      .filter((p) => !['retired', 'deprecated'].includes(p.status))
      .flatMap((p) => {
        const missing = [];
        if (!(p.expected_answer_components || []).length) missing.push('expected_answer_components');
        if (!p.desired_outcome) missing.push('desired_outcome');
        if (!p.risk_classification) missing.push('risk_classification');
        if (!p.owner) missing.push('owner');
        return missing.length ? [{
          subject: entrySubject('prompts', p.prompt_id),
          summary: `Prompt ${p.prompt_id} lacks a complete evaluation brief`,
          evidence: [`missing: ${missing.join(', ')}`],
        }] : [];
      });
  },
}));

/* ---------------- RECO: recommendation eligibility ---------------- */

const RECO_CHECKS = [
  ['RECO-001', 'target user', /\b((designed|built|intended|best|ideal) for|who (is|are) (this|it) for|target (user|customer|audience)|for (teams|organizations|enterprises|companies) (that|who|with))\b/i, 'Recommendation-eligible page never states who the product is for.', 'GEO §7 target user'],
  ['RECO-002', 'non-target user / exclusions', /\b(not (for|intended for|suitable for|a fit for|designed for)|who should not|isn'?t for|poor fit|when not to use)\b/i, 'Page never states who the product is NOT for.', 'GEO §7 non-target user; recommendation page lacks non-target user'],
  ['RECO-003', 'deployment model', /\b(saas|self-?hosted|on-?prem(ise|ises)?|cloud[- ]hosted|hybrid deployment|deployment (model|option))\b/i, 'Page never states the deployment model.', 'GEO §7 deployment'],
  ['RECO-004', 'pricing qualification', /\b(pricing|price|cost|quote|per (seat|user|month|year)|contact (us|sales) for pricing|free (tier|trial))\b/i, 'Page gives no pricing information or qualification.', 'GEO §7 pricing public or clearly qualified'],
  ['RECO-005', 'limitations', /\b(limitation|constraint|does not (support|cover|solve)|not (yet )?(supported|available)|known (issue|limitation)|trade-?off)\b/i, 'Page states no limitations.', 'GEO §7 limitations; detector spec: missing limitations'],
  ['RECO-006', 'geography', /\b(available in|supported (market|countr|region)|north america|europe|global(ly)? available|jurisdiction)\b/i, 'Page never states supported geography.', 'GEO §7 geography'],
];

for (const [id, label, rx, desc, req] of RECO_CHECKS) {
  D.push(defineDetector({
    id, name: `Recommendation data missing: ${label}`, namespace: 'RECO',
    description: desc,
    discipline: ['geo'], severity: 'medium', deterministic: false, requires: ['site', 'registries'],
    impact: { representation: 'high', conversion: 'medium' },
    applicable_requirement: req,
    false_positive_conditions: [`${label} expressed with vocabulary outside the matched set`],
    remediation: `State the ${label} explicitly on product and recommendation pages.`,
    verification: `${label} phrasing present on the page.`,
    check(ctx) {
      const hits = [];
      for (const p of indexTargets(ctx)) {
        const reg = registryPageFor(ctx, p);
        if (!reg || !['product', 'recommendation'].includes(reg.page_type) || p.status !== 200) continue;
        if (!rx.test(p.text)) {
          hits.push({
            subject: pageSubject(p),
            summary: `${reg.page_type} page ${reg.page_id}: no ${label} stated`,
            evidence: [`no ${label} phrasing found in page text`],
            confidence: 'medium',
          });
        }
      }
      return hits;
    },
  }));
}

export default D;
