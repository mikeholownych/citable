import { defineDetector, indexTargets, registryPageFor, sitePageFor, pageSubject, entrySubject } from './framework.js';
import { classifyAnswerStance } from '../observations/stance.js';
import { evaluateAnswerAttribution } from '../observations/attribution.js';

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

D.push(defineDetector({
  id: 'GEO-007', name: 'Unfavorable or distorted entity stance in recorded generative answers', namespace: 'GEO',
  description: 'Recorded generative engine answers express an unfavorable, negative, or critically distorted stance toward a registered entity.',
  discipline: ['geo', 'aeo'], severity: 'high', deterministic: false, requires: ['registries'],
  finding_type: 'evidence_backed_semantic_finding',
  impact: { representation: 'high', reputational: 'high', conversion: 'medium' },
  applicable_requirement: 'GEO §6: accurate synthesis and entity representation; Rubric: narrative accuracy (§4 & §5)',
  false_positive_conditions: ['Legitimate negative comparison where a product does not support a feature by design'],
  remediation: 'Review the recorded answers against the narrative-accuracy rubric, identify whether the negative characterization reflects true product limitations or factual inaccuracies/outdated information, and publish authoritative corroborating evidence or file model corrections.',
  unsafe_shortcuts: ['publishing fabricated positive reviews', 'manipulating third-party review sites', 'crawler prompt injection (GEO-001)'],
  verification: 'Follow-up generative engine observations demonstrate neutral or favorable stance with no narrative-accuracy violations.',
  review_required: true,
  check(ctx) {
    const entities = (ctx.registries?.entities?.entries || []).filter((e) => e.status !== 'retired');
    if (!entities.length) return [];
    const hits = [];

    // 1. Check promptResults
    for (const pr of ctx.promptResults || []) {
      for (const e of entities) {
        const names = [e.canonical_name, ...(e.aliases || [])].map((n) => n.toLowerCase());
        const text = `${pr.prompt_text || ''} ${pr.answer_text || ''}`.toLowerCase();
        const mentioned = names.some((n) => text.includes(n));
        if (!mentioned) continue;

        const classification = classifyAnswerStance(pr.answer_text || '', e, { reviewer: pr.evaluator });
        const isNegativeSentiment = pr.sentiment === 'negative' || pr.recommendation_status === 'not_recommended';
        if (classification.stance === 'unfavorable' || isNegativeSentiment) {
          hits.push({
            subject: entrySubject('entities', e.entity_id),
            summary: `Generative engine ${pr.engine || 'unknown'} expresses unfavorable stance toward entity "${e.canonical_name}"`,
            evidence: [
              `engine: ${pr.engine || 'unknown'}`,
              `prompt: ${pr.prompt_text || pr.prompt_id || 'unknown'}`,
              `stance: unfavorable`,
              `markers: ${classification.unfavorable_markers?.join(', ') || 'recorded negative sentiment'}`,
              `excerpt: "${(classification.evidence_passages?.[0] || pr.answer_text || '').slice(0, 160)}"`,
              `reviewer: ${pr.evaluator || 'unreviewed (semantic review required)'}`,
            ],
            confidence: pr.evaluator ? 'confirmed' : 'medium',
            finding_type: 'evidence_backed_semantic_finding',
          });
        }
      }
    }

    // 2. Check observations (stance or citation)
    for (const obs of ctx.observations || []) {
      if (obs.kind === 'stance' && obs.data?.stance === 'unfavorable') {
        const e = entities.find((ent) => ent.entity_id === obs.data.entity_id);
        if (e) {
          hits.push({
            subject: entrySubject('entities', e.entity_id),
            summary: `Generative engine ${obs.data.engine || 'unknown'} expresses unfavorable stance toward entity "${e.canonical_name}"`,
            evidence: [
              `engine: ${obs.data.engine || 'unknown'}`,
              `prompt: ${obs.data.prompt_text || obs.data.prompt_id || 'unknown'}`,
              `stance: unfavorable`,
              `markers: ${(obs.data.unfavorable_markers || []).join(', ') || 'unfavorable markers'}`,
              `excerpt: "${(obs.data.evidence_passages?.[0] || '').slice(0, 160)}"`,
              `reviewer: ${obs.data.reviewer || 'unreviewed (semantic review required)'}`,
            ],
            confidence: obs.data.reviewer ? 'confirmed' : 'medium',
            finding_type: 'evidence_backed_semantic_finding',
          });
        }
      } else if (obs.kind === 'citation' && obs.data?.answer_text) {
        for (const e of entities) {
          const classification = classifyAnswerStance(obs.data.answer_text, e);
          if (classification.mentioned && classification.stance === 'unfavorable') {
            hits.push({
              subject: entrySubject('entities', e.entity_id),
              summary: `Generative engine ${obs.data.provider || 'unknown'} expresses unfavorable stance toward entity "${e.canonical_name}"`,
              evidence: [
                `engine: ${obs.data.provider || 'unknown'}`,
                `prompt: ${obs.data.prompt_text || obs.data.prompt_id || 'unknown'}`,
                `stance: unfavorable`,
                `markers: ${(classification.unfavorable_markers || []).join(', ')}`,
                `excerpt: "${(classification.evidence_passages?.[0] || obs.data.answer_text).slice(0, 160)}"`,
                `reviewer: unreviewed (semantic review required)`,
              ],
              confidence: 'medium',
              finding_type: 'evidence_backed_semantic_finding',
            });
          }
        }
      }
    }

    // Deduplicate by entity and summary
    const seen = new Set();
    return hits.filter((h) => {
      const k = `${h.subject.identifier}|${h.summary}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },
}));

D.push(defineDetector({
  id: 'GEO-008', name: 'Generative citation attributes unverified or distorted claim to brand', namespace: 'GEO',
  description: 'Recorded generative engine answers attribute contradicted, distorted, or unverified factual claims to a registered entity or brand.',
  discipline: ['geo', 'aeo'], severity: 'high', deterministic: false, requires: ['registries'],
  finding_type: 'evidence_backed_semantic_finding',
  impact: { representation: 'high', reputational: 'high', conversion: 'medium' },
  applicable_requirement: 'GEO §6: accurate synthesis and entity representation; Rubric: narrative accuracy (§4 & §5) and claim boundedness (§1)',
  false_positive_conditions: ['Answer accurately reflects a verified change in product capability not yet updated in registries'],
  remediation: 'Review the generative engine answer against the narrative-accuracy and claim-boundedness rubrics, identify the distorted or unverified claim attribution, and update public corroborating evidence or submit engine correction requests.',
  unsafe_shortcuts: ['deleting legitimate claim records to hide discrepancies', 'crawler prompt injection (GEO-001)'],
  verification: 'Follow-up generative engine observations demonstrate accurate claim attribution without distorted or hallucinated assertions.',
  review_required: true,
  check(ctx) {
    const entities = (ctx.registries?.entities?.entries || []).filter((e) => e.status !== 'retired');
    if (!entities.length) return [];
    const claims = (ctx.registries?.claims?.entries || []).filter((c) => c.status !== 'retired');
    const hits = [];

    // 1. Check observations (attribution or citation)
    for (const obs of ctx.observations || []) {
      if (obs.kind === 'attribution' && obs.data?.has_distorted_claims) {
        for (const evalItem of obs.data.evaluations || []) {
          if (evalItem.attribution_status === 'distorted') {
            hits.push({
              subject: entrySubject('claims', evalItem.claim_id),
              summary: `Generative engine ${obs.data.engine || 'unknown'} attributes distorted claim "${evalItem.claim_id}" to entity "${obs.data.canonical_name}"`,
              evidence: [
                `engine: ${obs.data.engine || 'unknown'}`,
                `prompt: ${obs.data.prompt_text || obs.data.prompt_id || 'unknown'}`,
                `claim_id: ${evalItem.claim_id}`,
                `claim_text: "${evalItem.claim_text}"`,
                `assertion_excerpt: "${evalItem.assertion_excerpt}"`,
                `reasons: ${(evalItem.reasons || []).join('; ')}`,
                `reviewer: ${obs.data.reviewer || 'unreviewed (semantic review required)'}`,
              ],
              confidence: obs.data.reviewer ? 'confirmed' : 'medium',
              finding_type: 'evidence_backed_semantic_finding',
            });
          }
        }
      } else if (obs.kind === 'citation' && obs.data?.answer_text) {
        for (const e of entities) {
          const evalRes = evaluateAnswerAttribution(obs.data.answer_text, e, { claims });
          if (evalRes.mentioned && evalRes.has_distorted_claims) {
            for (const evalItem of evalRes.evaluations) {
              if (evalItem.attribution_status === 'distorted') {
                hits.push({
                  subject: entrySubject('claims', evalItem.claim_id),
                  summary: `Generative engine ${obs.data.provider || 'unknown'} attributes distorted claim "${evalItem.claim_id}" to entity "${e.canonical_name}"`,
                  evidence: [
                    `engine: ${obs.data.provider || 'unknown'}`,
                    `prompt: ${obs.data.prompt_text || obs.data.prompt_id || 'unknown'}`,
                    `claim_id: ${evalItem.claim_id}`,
                    `assertion_excerpt: "${evalItem.assertion_excerpt}"`,
                    `reasons: ${(evalItem.reasons || []).join('; ')}`,
                  ],
                  confidence: 'medium',
                  finding_type: 'evidence_backed_semantic_finding',
                });
              }
            }
          }
        }
      }
    }

    // 2. Check promptResults
    for (const pr of ctx.promptResults || []) {
      if (!pr.answer_text) continue;
      for (const e of entities) {
        const evalRes = evaluateAnswerAttribution(pr.answer_text, e, { claims, reviewer: pr.evaluator });
        if (evalRes.mentioned && evalRes.has_distorted_claims) {
          for (const evalItem of evalRes.evaluations) {
            if (evalItem.attribution_status === 'distorted') {
              hits.push({
                subject: entrySubject('claims', evalItem.claim_id),
                summary: `Generative engine ${pr.engine || 'unknown'} attributes distorted claim "${evalItem.claim_id}" to entity "${e.canonical_name}"`,
                evidence: [
                  `engine: ${pr.engine || 'unknown'}`,
                  `prompt: ${pr.prompt_text || pr.prompt_id || 'unknown'}`,
                  `claim_id: ${evalItem.claim_id}`,
                  `assertion_excerpt: "${evalItem.assertion_excerpt}"`,
                  `reasons: ${(evalItem.reasons || []).join('; ')}`,
                  `reviewer: ${pr.evaluator || 'unreviewed (semantic review required)'}`,
                ],
                confidence: pr.evaluator ? 'confirmed' : 'medium',
                finding_type: 'evidence_backed_semantic_finding',
              });
            }
          }
        }
      }
    }

    const seen = new Set();
    return hits.filter((h) => {
      const k = `${h.subject.identifier}|${h.summary}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },
}));

D.push(defineDetector({
  id: 'GEO-009', name: 'Unstable citation presence across repeated probes', namespace: 'GEO',
  description: 'Brand citation status exhibits high volatility or flapping (alternating between cited and unmentioned) across repeated probe runs for the same prompt and engine.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: false, requires: ['registries'],
  finding_type: 'evidence_backed_semantic_finding',
  impact: { representation: 'high', citation: 'high' },
  applicable_requirement: 'GEO §6 generative retrieval stability; longitudinal observation controls; answer-engine variance tracking',
  false_positive_conditions: ['Deliberate query variation or divergent test prompts'],
  remediation: 'Strengthen entity salience and disambiguation in target content, improve passage answer density, and establish consistent external corroboration for core claims.',
  unsafe_shortcuts: ['over-optimizing phrasing to trigger keyword matching in a single model version'],
  verification: 'Subsequent repeated probe runs demonstrate stable citation presence (presence rate >= 80% with low flapping).',
  check(ctx) {
    const hits = [];
    const groups = new Map();

    // 1. Group citation observations by prompt + provider
    for (const obs of ctx.observations || []) {
      if (obs.kind !== 'citation' || !obs.data) continue;
      const promptKey = obs.data.prompt_id || obs.data.prompt_text;
      if (!promptKey) continue;
      const provider = obs.data.provider || 'unknown';
      const key = `${promptKey}|${provider}`;
      if (!groups.has(key)) groups.set(key, { prompt: promptKey, provider, samples: [] });
      groups.get(key).samples.push(Boolean(obs.data.property_cited));
    }

    // 2. Also group promptResults if present
    for (const pr of ctx.promptResults || []) {
      const promptKey = pr.prompt_id || pr.prompt_text;
      if (!promptKey) continue;
      const provider = pr.engine || 'unknown';
      const key = `${promptKey}|${provider}`;
      if (!groups.has(key)) groups.set(key, { prompt: promptKey, provider, samples: [] });
      const cited = pr.cited !== undefined ? Boolean(pr.cited) : (pr.citations && pr.citations.length > 0);
      groups.get(key).samples.push(Boolean(cited));
    }

    // Evaluate each group with at least 3 samples
    for (const { prompt, provider, samples } of groups.values()) {
      if (samples.length < 3) continue;
      const total = samples.length;
      const citedCount = samples.filter(Boolean).length;
      const presenceRate = citedCount / total;

      // Calculate transitions (flapping)
      let flips = 0;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i] !== samples[i - 1]) flips++;
      }
      const flappingRate = flips / (total - 1);

      // Flapping threshold: presence rate between 20% and 80% with at least 1 flip, or flapping rate >= 0.4
      if ((presenceRate >= 0.2 && presenceRate <= 0.8 && flips >= 1) || flappingRate >= 0.4) {
        const volatility = (1 - Math.abs(presenceRate - 0.5) * 2).toFixed(2);
        hits.push({
          subject: entrySubject('prompts', prompt),
          summary: `High citation volatility for "${prompt}" on ${provider}: cited in ${citedCount}/${total} runs (${Math.round(presenceRate * 100)}% presence rate)`,
          evidence: [
            `provider: ${provider}`,
            `prompt: ${prompt}`,
            `total_probes: ${total}`,
            `cited_count: ${citedCount}`,
            `presence_rate: ${(presenceRate * 100).toFixed(1)}%`,
            `flapping_rate: ${(flappingRate * 100).toFixed(1)}% (${flips} state flips)`,
            `volatility_score: ${volatility}`,
            `sample_sequence: [${samples.map((s) => (s ? 'cited' : 'omitted')).join(', ')}]`,
          ],
          confidence: total >= 5 ? 'confirmed' : 'medium',
          captured: { presenceRate, flappingRate, volatility: Number(volatility), samples: total },
          expected: 'stable citation presence (presence rate >= 80% with low flapping)',
        });
      }
    }

    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-010', name: 'Brand erasure in multi-competitor category prompt', namespace: 'GEO',
  description: 'A generative engine observation for a relevant category or comparison prompt cites multiple registered competitors but completely omits the first-party entity or brand.',
  discipline: ['geo', 'aeo'], severity: 'high', deterministic: false, requires: ['registries'],
  impact: { representation: 'high', conversion: 'medium' },
  applicable_requirement: 'GEO §6 entity representation in competitive category synthesis; GEO §1 share of model parity',
  remediation: 'Publish comparative evidence, authoritative category definitions, and benchmark substantiation to establish entity co-occurrence in generative training and retrieval corpora.',
  verification: 'Follow-up category engine observations cite the first-party brand alongside peers.',
  check(ctx) {
    const competitors = ctx.registries?.competitors?.entries || [];
    if (competitors.length < 2) return [];
    const entities = (ctx.registries?.entities?.entries || []).filter((e) => e.status !== 'retired');
    if (!entities.length) return [];

    const firstPartyNames = [];
    for (const e of entities) {
      if (e.canonical_name) firstPartyNames.push(e.canonical_name.toLowerCase());
      for (const a of e.aliases || []) firstPartyNames.push(a.toLowerCase());
    }

    const hits = [];
    for (const obs of ctx.observations || []) {
      const d = obs.data || {};
      const answer = d.answer_text || '';
      const lowerAnswer = answer.toLowerCase();

      // Check if first-party brand is omitted
      const firstPartyCited = d.property_cited === true || firstPartyNames.some((n) => lowerAnswer.includes(n));
      if (firstPartyCited) continue;

      let citedCompetitors = [];
      if (Array.isArray(d.competitors_cited) && d.competitors_cited.length > 0) {
        citedCompetitors = d.competitors_cited;
      } else if (answer) {
        citedCompetitors = competitors.filter((c) => {
          const cNames = [c.name, ...(c.aliases || [])].filter(Boolean);
          return cNames.some((cn) => lowerAnswer.includes(cn.toLowerCase()));
        }).map((c) => c.name);
      }

      if (citedCompetitors.length >= 2) {
        const promptLabel = d.prompt_id || d.prompt_text || 'category prompt';
        const engineLabel = d.provider || d.engine || 'generative engine';
        hits.push({
          subject: entrySubject('prompts', promptLabel),
          summary: `Brand erased in category response by ${engineLabel}: ${citedCompetitors.length} competitors cited (${citedCompetitors.slice(0, 3).join(', ')}), 0 first-party mentions`,
          evidence: [
            `engine: ${engineLabel}`,
            `prompt: ${promptLabel}`,
            `competitors cited: ${citedCompetitors.join(', ')}`,
            'first-party mentions: 0',
          ],
          confidence: 'high',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-011', name: 'RAG chunk fracture: claim separated from citation across oversized section', namespace: 'GEO',
  description: 'A section under a single heading exceeds 450 words without structural sub-headings or lists, separating claims from qualifying citations and causing retrieval fracture in RAG chunking pipelines.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', representation: 'high' },
  applicable_requirement: 'GEO §4 RAG semantic chunk boundary preservation; AEO §4 modular evidence proximity',
  remediation: 'Subdivide sections exceeding 400 words with H3 sub-headings or bullet lists, and anchor citations in the same paragraph as the claim.',
  verification: 'Re-audit section word counts and ensure paragraphs with factual claims contain adjacent citation anchors.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const paragraphs = p.paragraphs || [];
      if (paragraphs.length < 4) continue;

      let currentHeading = 'intro';
      let currentWords = 0;
      let hasClaimInChunk = false;
      const CLAIM_RX = /\b(?:\d+%\s*(?:reduction|faster|increase|savings?)|SOC\s*2|GDPR|ISO\s*27001|compliant|verified|guaranteed)\b/i;
      const CITE_RX = /\[\d+\]|href=|\(source:|\(see\s+|according\s+to|citation/i;

      for (const para of paragraphs) {
        const words = para.split(/\s+/).length;
        currentWords += words;
        if (CLAIM_RX.test(para) && !CITE_RX.test(para)) {
          hasClaimInChunk = true;
        }

        if (currentWords > 450 && hasClaimInChunk) {
          hits.push({
            subject: pageSubject(p),
            summary: `Oversized section under "${currentHeading.slice(0, 50)}" (${currentWords} words) risks RAG chunk fracture for unanchored claims`,
            evidence: [
              `section heading: "${currentHeading}"`,
              `accumulated section words: ${currentWords}`,
              'generative search RAG pipelines chunk text at 300-500 tokens, severing unanchored claims from qualifying context',
            ],
            captured: { section: currentHeading, wordCount: currentWords },
            expected: '<= 400 words per section before sub-heading',
          });
          break;
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-012', name: 'Repetitive phrase stuffing in section headings degrading dense retrieval', namespace: 'GEO',
  description: 'Multiple headings repeat the identical multi-word phrase or entity prefix, degrading dense vector discriminability and triggering keyword stuffing penalties in neural search rankers.',
  discipline: ['geo', 'seo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', ranking: 'low' },
  applicable_requirement: 'GEO §4 semantic vector distinctiveness; SEO §4 heading diversity and keyword stuffing avoidance',
  remediation: 'Diversify section headings to reflect specific sub-topics, user questions, or tasks rather than repeating the same keyword stem.',
  verification: 'Ensure no multi-word phrase is repeated across more than 3 headings.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.headings || p.headings.length < 5) continue;
      const headingTexts = p.headings.map((h) => (h.text || '').toLowerCase().trim()).filter(Boolean);

      const ngramCounts = new Map();
      for (const text of headingTexts) {
        const words = text.split(/\s+/).filter((w) => w.length > 2);
        for (let i = 0; i <= words.length - 2; i++) {
          const gram2 = words.slice(i, i + 2).join(' ');
          ngramCounts.set(gram2, (ngramCounts.get(gram2) || 0) + 1);
          if (i <= words.length - 3) {
            const gram3 = words.slice(i, i + 3).join(' ');
            ngramCounts.set(gram3, (ngramCounts.get(gram3) || 0) + 1);
          }
        }
      }

      let repeatedGram = null;
      let maxCount = 0;
      for (const [gram, count] of ngramCounts) {
        if (count >= 4 && count > maxCount) {
          maxCount = count;
          repeatedGram = gram;
        }
      }

      if (repeatedGram && maxCount >= 4 && (maxCount / headingTexts.length) >= 0.4) {
        hits.push({
          subject: pageSubject(p),
          summary: `Repetitive phrase "${repeatedGram}" repeated in ${maxCount}/${headingTexts.length} headings`,
          evidence: [
            `repeated phrase: "${repeatedGram}"`,
            `occurrence: ${maxCount} headings (${Math.round((maxCount / headingTexts.length) * 100)}%)`,
            'dense retrieval and bi-encoder embeddings suffer loss of discriminability from repetitive heading stems',
          ],
          captured: { phrase: repeatedGram, count: maxCount, totalHeadings: headingTexts.length },
          expected: 'repeated phrase in <= 3 headings',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'GEO-013', name: 'AI engine assertion contradicts verified publisher claim registry', namespace: 'GEO',
  description: 'An external AI search engine or generative model assertion directly contradicts or negates a verified publisher claim registered in claims.yaml.',
  discipline: ['geo', 'aeo'], severity: 'high', deterministic: true, requires: ['observations', 'registries'],
  impact: { representation: 'high', citation: 'high' },
  applicable_requirement: 'GEO §13 AI hallucination and claim contradiction governance; AEO §2 factual integrity',
  remediation: 'Publish explicit corroborating evidence on high-authority pages and submit model feedback/correction citations addressing the contradicted fact.',
  verification: 'All generative AI assertions corroborate verified publisher claims without factual contradiction.',
  check(ctx) {
    const hits = [];
    const claims = ctx.registries?.claims?.entries || [];
    const verifiedClaims = claims.filter((c) => c.status === 'verified');
    if (verifiedClaims.length === 0) return hits;

    const observations = ctx.observations || [];
    for (const obs of observations) {
      if (obs.data?.contradiction_detected) {
        hits.push({
          subject: { type: 'registry_entry', identifier: `claims/${obs.data.claim_id || 'unspecified'}` },
          summary: `AI engine ${obs.data.provider || 'unknown'} assertion contradicts verified claim "${obs.data.claim_id || 'unspecified'}"`,
          evidence: [
            `provider: ${obs.data.provider || 'unknown'}`,
            `prompt: "${obs.data.prompt_text || 'prompt'}"`,
            `contradicted assertion: "${obs.data.contradicted_assertion || obs.data.raw_response || ''}"`,
            `claim: "${obs.data.claim_text || ''}"`,
          ],
          captured: { provider: obs.data.provider, claim_id: obs.data.claim_id, assertion: obs.data.contradicted_assertion },
          expected: 'AI answer corroborates verified claim',
        });
        continue;
      }

      if (obs.data?.raw_response || obs.data?.assertion) {
        const responseText = (obs.data.raw_response || obs.data.assertion || '').toLowerCase();
        for (const vc of verifiedClaims) {
          if (!vc.claim) continue;
          const subjectMatch = vc.claim.match(/(?:supports|provides|features|certified|complies with)\s+([^,\.]+)/i);
          if (subjectMatch) {
            const feature = subjectMatch[1].toLowerCase().trim();
            const negationRegex = new RegExp(`\\b(does not support|doesn't support|lacks|no support for|not certified|unsupported|fails to support)\\s+${feature.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'i');
            if (negationRegex.test(responseText)) {
              hits.push({
                subject: { type: 'registry_entry', identifier: `claims/${vc.claim_id}` },
                summary: `AI engine ${obs.data.provider || 'unknown'} assertion contradicts verified claim "${vc.claim_id}" (${feature})`,
                evidence: [
                  `provider: ${obs.data.provider || 'unknown'}`,
                  `prompt: "${obs.data.prompt_text || 'prompt'}"`,
                  `contradictory assertion: "${negationRegex.exec(responseText)?.[0] || 'negated assertion'}"`,
                  `verified claim: "${vc.claim}"`,
                ],
                captured: { provider: obs.data.provider, claim_id: vc.claim_id, feature },
                expected: `AI answer reflects verified claim: "${vc.claim}"`,
              });
            }
          }
        }
      }
    }

    return hits;
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
