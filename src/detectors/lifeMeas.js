import { defineDetector, entrySubject } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

/* ---------------- LIFE: lifecycle and ownership ---------------- */

D.push(defineDetector({
  id: 'LIFE-001', name: 'Page without content owner', namespace: 'LIFE',
  description: 'An active page registry entry has no accountable content owner.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { maintainability: 'high' },
  applicable_requirement: 'SEO §14 lifecycle: owner assigned; AEO §13 content owner assigned',
  remediation: 'Assign a named accountable content owner.',
  verification: 'content_owner set on all active pages.',
  check(ctx) {
    return activePages(ctx).filter((p) => !p.content_owner).map((p) => ({
      subject: entrySubject('pages', p.page_id),
      summary: `Page ${p.page_id} has no content owner`,
      evidence: ['content_owner: missing'],
    }));
  },
}));

D.push(defineDetector({
  id: 'LIFE-002', name: 'Claim-bearing page without factual reviewer', namespace: 'LIFE',
  description: 'A page that publishes registered claims has no factual reviewer.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', maintainability: 'medium' },
  applicable_requirement: 'AEO §8 required update controls: factual reviewer; SEO §12 subject-matter expert role',
  remediation: 'Assign a factual reviewer for pages that publish claims.',
  verification: 'factual_reviewer set on claim-bearing pages.',
  check(ctx) {
    return activePages(ctx)
      .filter((p) => (p.published_claims || []).length > 0 && !p.factual_reviewer)
      .map((p) => ({
        subject: entrySubject('pages', p.page_id),
        summary: `Page ${p.page_id} publishes ${(p.published_claims || []).length} claim(s) but has no factual reviewer`,
        evidence: [`published_claims: ${(p.published_claims || []).join(', ')}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'LIFE-003', name: 'Review overdue', namespace: 'LIFE',
  description: 'A page has passed its next review date.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'medium', maintainability: 'medium' },
  applicable_requirement: 'AEO §8 lifecycle classification and review intervals; SEO §12 content review dates',
  remediation: 'Perform the scheduled factual review and set the next review date.',
  verification: 'next_review_date in the future for all active pages.',
  check(ctx) {
    return activePages(ctx)
      .filter((p) => isPastDate(p.next_review_date, ctx.refDate))
      .map((p) => ({
        subject: entrySubject('pages', p.page_id),
        summary: `Page ${p.page_id} review overdue (due ${p.next_review_date})`,
        evidence: [`next_review_date: ${p.next_review_date}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'LIFE-004', name: 'Page without lifecycle classification', namespace: 'LIFE',
  description: 'An active page has no lifecycle class, so no review model can apply.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { maintainability: 'medium' },
  applicable_requirement: 'AEO §8 every page needs a lifecycle classification; detector spec: content lacks lifecycle classification',
  remediation: 'Classify the page (foundational, product_capability, regulatory, pricing, …) and derive its review cadence.',
  verification: 'lifecycle_class set on all active pages.',
  check(ctx) {
    return activePages(ctx)
      .filter((p) => !p.lifecycle_class || p.lifecycle_class === 'unclassified')
      .map((p) => ({
        subject: entrySubject('pages', p.page_id),
        summary: `Page ${p.page_id} has no lifecycle classification`,
        evidence: [`lifecycle_class: ${p.lifecycle_class ?? 'missing'}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'LIFE-005', name: 'Regulatory content without jurisdiction', namespace: 'LIFE',
  description: 'A page classified regulatory (or carrying legal claims) records no jurisdiction.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'high' },
  applicable_requirement: 'Detector spec: regulatory content lacks jurisdiction; AEO §1 jurisdiction field',
  remediation: 'Record the jurisdiction the content applies to and state it on the page.',
  verification: 'jurisdiction set on regulatory pages.',
  check(ctx) {
    const legalClaims = new Set((ctx.registries.claims?.entries || []).filter((c) => c.claim_type === 'legal_regulatory').map((c) => c.claim_id));
    return activePages(ctx)
      .filter((p) => (p.lifecycle_class === 'regulatory' || (p.published_claims || []).some((c) => legalClaims.has(c))) && !p.jurisdiction)
      .map((p) => ({
        subject: entrySubject('pages', p.page_id),
        summary: `Regulatory page ${p.page_id} records no jurisdiction`,
        evidence: [`lifecycle_class: ${p.lifecycle_class}; jurisdiction: missing`],
      }));
  },
}));

D.push(defineDetector({
  id: 'LIFE-006', name: 'Freshness theater (date bumped, content unchanged)', namespace: 'LIFE',
  description: 'Between snapshots, a page’s dateModified advanced while its content hash stayed identical.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site', 'snapshots'],
  impact: { reputational: 'medium', representation: 'medium' },
  applicable_requirement: 'AEO §8 do not update dates without materially updating content ("freshness theater")',
  remediation: 'Only advance revision dates alongside substantive updates.',
  verification: 'Compare content hash and dateModified across snapshots.',
  check(ctx) {
    const prev = ctx.snapshots?.pages;
    if (!prev) return [];
    const hits = [];
    for (const p of ctx.site.pages) {
      const old = prev[p.url];
      if (!old) continue;
      const currentDate = extractModified(p);
      if (old.contentHash && ctx.hashPage && old.contentHash === ctx.hashPage(p) && old.dateModified && currentDate && currentDate > old.dateModified) {
        hits.push({
          subject: { type: 'page', identifier: p.url, url: p.url },
          summary: `dateModified advanced (${old.dateModified} → ${currentDate}) with identical content`,
          evidence: [`content hash unchanged: ${old.contentHash.slice(0, 12)}…`],
        });
      }
    }
    return hits;
  },
}));

export function extractModified(page) {
  for (const j of page.jsonLd) {
    for (const b of j.blocks) {
      if (b.dateModified) return String(b.dateModified);
    }
  }
  return page.metas?.['article:modified_time']?.[0] ?? null;
}

/* ---------------- MEAS: measurement integrity ---------------- */

D.push(defineDetector({
  id: 'MEAS-001', name: 'Prompt observation missing required metadata', namespace: 'MEAS',
  description: 'A recorded prompt-test observation lacks engine, model/interface, locale, or timestamp context.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: true, requires: ['promptResults'],
  impact: { maintainability: 'high' },
  applicable_requirement: '§8.8 test-prompts must record model, interface, locale, date; GEO §12 evidence capture',
  remediation: 'Re-record the observation with full context; discard observations that cannot be contextualized.',
  verification: 'All observations validate against prompt-result.schema.json.',
  check(ctx) {
    const hits = [];
    for (const o of ctx.promptResults || []) {
      const missing = ['engine', 'locale', 'date_time', 'prompt_text'].filter((k) => !o[k]);
      if (missing.length) {
        hits.push({
          subject: { type: 'prompt', identifier: o.observation_id ?? o.prompt_id ?? 'unknown' },
          summary: `Prompt observation missing: ${missing.join(', ')}`,
          evidence: [`observation ${o.observation_id ?? '?'} lacks ${missing.join(', ')}`],
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'MEAS-002', name: 'Single observation treated as stable outcome', namespace: 'MEAS',
  description: 'A prompt has exactly one recorded observation but its registry accuracy_status asserts a definitive outcome.',
  discipline: ['geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { maintainability: 'medium', representation: 'low' },
  applicable_requirement: 'AEO §10 statistical caution: do not claim improvement from one prompt/one day; GEO §12 repeatability',
  remediation: 'Collect repeated observations across engines, dates, and variants before recording a definitive accuracy status.',
  verification: 'Prompts with definitive status have ≥3 observations.',
  check(ctx) {
    const counts = new Map();
    for (const o of ctx.promptResults || []) {
      counts.set(o.prompt_id, (counts.get(o.prompt_id) || 0) + 1);
    }
    return (ctx.registries.prompts?.entries || [])
      .filter((p) => ['accurate', 'inaccurate'].includes(p.accuracy_status) && (counts.get(p.prompt_id) || 0) < 3)
      .map((p) => ({
        subject: entrySubject('prompts', p.prompt_id),
        summary: `Prompt ${p.prompt_id} has definitive accuracy_status "${p.accuracy_status}" from only ${counts.get(p.prompt_id) || 0} observation(s)`,
        evidence: [`observations recorded: ${counts.get(p.prompt_id) || 0}; minimum for definitive status: 3`],
      }));
  },
}));

D.push(defineDetector({
  id: 'MEAS-003', name: 'Causal experiment conclusion without controls', namespace: 'MEAS',
  description: 'A concluded experiment asserts a result but records no control group, baseline window, or confounders.',
  discipline: ['seo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { maintainability: 'medium' },
  applicable_requirement: 'SEO §11 required experiment record; GEO §14 invalid conclusion pattern',
  remediation: 'Re-open the experiment with a control/baseline design, or downgrade the result confidence to low.',
  verification: 'Concluded experiments carry control/baseline and confounders.',
  check(ctx) {
    return (ctx.registries.experiments?.entries || [])
      .filter((e) => e.status === 'concluded' && e.result && e.result_confidence !== 'low')
      .filter((e) => (!e.control_group && !e.baseline_window) || (e.known_confounders || []).length === 0)
      .map((e) => ({
        subject: entrySubject('experiments', e.experiment_id),
        summary: `Experiment ${e.experiment_id} concludes "${String(e.result).slice(0, 60)}" without ${(!e.control_group && !e.baseline_window) ? 'control/baseline' : ''}${((!e.control_group && !e.baseline_window) && (e.known_confounders || []).length === 0) ? ' or ' : ''}${(e.known_confounders || []).length === 0 ? 'recorded confounders' : ''}`,
        evidence: [`control_group: ${e.control_group ?? 'none'}; baseline_window: ${e.baseline_window ?? 'none'}; known_confounders: ${(e.known_confounders || []).length}`],
      }));
  },
}));

function activePages(ctx) {
  return (ctx.registries.pages?.entries || []).filter((p) => !['retired', 'draft'].includes(p.status));
}

export default D;
