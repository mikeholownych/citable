import { defineDetector, indexTargets, pageSubject, entrySubject } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

const SUPERLATIVE_RX = /\b(the (best|leading|top|most (advanced|powerful|trusted|secure)|fastest|#?1|number one|first and only)|world[- ]class|industry[- ]leading|unmatched|unrivalled|unrivaled|best[- ]in[- ]class)\b/i;

function evidenceById(ctx) {
  return new Map((ctx.registries.evidence?.entries || []).map((e) => [e.evidence_id, e]));
}

D.push(defineDetector({
  id: 'CLAIM-001', name: 'Verified claim without evidence', namespace: 'CLAIM',
  description: 'A claim is marked verified but references no evidence entries.',
  discipline: ['aeo', 'geo'], severity: 'critical', deterministic: true, requires: ['registries'],
  impact: { legal: 'high', reputational: 'high', citation: 'medium' },
  applicable_requirement: 'Premise 3.5: owned claims require evidence; acceptance criterion 11: claims cannot become verified without evidence',
  remediation: 'Attach verified evidence or downgrade the claim to insufficient_evidence.',
  verification: 'Every verified claim lists at least one evidence id.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => ['verified', 'verified_narrowed'].includes(c.status) && (c.evidence || []).length === 0)
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `Claim "${truncate(c.claim)}" is marked ${c.status} with no evidence`,
        evidence: [`claims/${c.claim_id}: status=${c.status}, evidence=[]`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CLAIM-002', name: 'Verified claim depends on expired or revoked evidence', namespace: 'CLAIM',
  description: 'All evidence supporting a verified claim is expired, stale, revoked, or inaccessible.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { legal: 'high', reputational: 'high' },
  applicable_requirement: 'Acceptance criterion 12: expired evidence invalidates dependent claims; §8.5 substantiate outcomes',
  remediation: 'Re-validate with current evidence or downgrade the claim status.',
  verification: 'At least one supporting evidence entry is verified/reviewed and unexpired.',
  check(ctx) {
    const ev = evidenceById(ctx);
    const hits = [];
    for (const c of (ctx.registries.claims?.entries || []).filter((c) => ['verified', 'verified_narrowed'].includes(c.status) && (c.evidence || []).length > 0)) {
      const statuses = (c.evidence || []).map((id) => {
        const e = ev.get(id);
        if (!e) return `${id}: missing`;
        if (['revoked', 'stale', 'inaccessible'].includes(e.verification_status)) return `${id}: ${e.verification_status}`;
        if (isPastDate(e.valid_until, ctx.refDate)) return `${id}: expired ${e.valid_until}`;
        return null;
      });
      if (statuses.every((s) => s !== null)) {
        hits.push({
          subject: entrySubject('claims', c.claim_id),
          summary: `Claim "${truncate(c.claim)}" remains ${c.status} but no supporting evidence is currently valid`,
          evidence: statuses,
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CLAIM-003', name: 'Claim active after expiry', namespace: 'CLAIM',
  description: 'A claim has passed its expires date but is not marked expired/retired.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { legal: 'high' },
  applicable_requirement: 'Detector spec (lifecycle): claim remains active after expiry',
  remediation: 'Re-verify and extend, narrow, or expire the claim.',
  verification: 'No non-expired status on claims past their expires date.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => isPastDate(c.expires, ctx.refDate) && !['expired', 'retired', 'prohibited'].includes(c.status))
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `Claim "${truncate(c.claim)}" passed expiry ${c.expires} but status is still "${c.status}"`,
        evidence: [`expires: ${c.expires}; status: ${c.status}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CLAIM-004', name: 'Quantitative or comparative claim without evidence', namespace: 'CLAIM',
  description: 'A performance or comparative claim (any status except prohibited/retired) has no supporting evidence recorded.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { legal: 'high', reputational: 'medium' },
  applicable_requirement: 'Detector spec: unsupported quantitative claim, comparative claim without evidence; SEO §4 defensible claims',
  remediation: 'Gather methodology-backed evidence, or mark the claim insufficient_evidence and remove it from publication surfaces.',
  verification: 'Performance/comparative claims all reference evidence.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => ['performance', 'comparative'].includes(c.claim_type) && !['prohibited', 'retired', 'expired'].includes(c.status) && (c.evidence || []).length === 0)
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `${c.claim_type} claim "${truncate(c.claim)}" has no supporting evidence`,
        evidence: [`claims/${c.claim_id}: claim_type=${c.claim_type}, evidence=[]`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CLAIM-005', name: 'Opinion or aspiration represented as verified fact', namespace: 'CLAIM',
  description: 'An opinion, position, or aspirational claim carries a "verified" status, flattening the claim hierarchy.',
  discipline: ['geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'high', legal: 'medium' },
  applicable_requirement: 'GEO §4 claim hierarchy: engines may flatten distinctions, your content must not; §6.4 prevent opinion/aspiration silently becoming fact',
  remediation: 'Keep opinion/position/aspirational claims in their own status track (active, not verified); label them as positions on publication surfaces.',
  verification: 'No opinion/position/aspirational claim holds a verified status.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => ['opinion', 'position', 'aspirational'].includes(c.claim_type) && ['verified', 'verified_narrowed'].includes(c.status))
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `${c.claim_type} claim "${truncate(c.claim)}" is marked "${c.status}" — opinions and aspirations cannot be verified facts`,
        evidence: [`claim_type=${c.claim_type}, status=${c.status}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CLAIM-006', name: 'Regulated claim without required review', namespace: 'CLAIM',
  description: 'A legal/regulatory, security, or commercial claim has no legal_status assessment.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { legal: 'high' },
  applicable_requirement: '§8.4: human review required for regulated, contractual, security, financial claims',
  remediation: 'Route the claim to legal/subject-matter review and record legal_status.',
  verification: 'Regulated claim types carry a legal_status other than not_assessed.',
  check(ctx) {
    return (ctx.registries.claims?.entries || [])
      .filter((c) => ['legal_regulatory', 'security', 'commercial'].includes(c.claim_type) && !['prohibited', 'retired'].includes(c.status))
      .filter((c) => !c.legal_status || c.legal_status === 'not_assessed')
      .map((c) => ({
        subject: entrySubject('claims', c.claim_id),
        summary: `${c.claim_type} claim "${truncate(c.claim)}" has no legal/SME review recorded`,
        evidence: [`legal_status: ${c.legal_status ?? 'missing'}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CLAIM-007', name: 'Unbounded superlative in page text', namespace: 'CLAIM',
  description: 'Page text contains a superlative ("best", "industry-leading", "#1") with no registered comparative claim covering that page.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site', 'registries'],
  impact: { legal: 'medium', reputational: 'medium', citation: 'low' },
  applicable_requirement: 'Detector spec: superlative without comparison set; SEO §4 no unsupported claims of superiority; anti-pattern: unbounded superlatives',
  false_positive_conditions: ['superlatives inside quotations from attributed third parties'],
  remediation: 'Remove the superlative, or register a comparative claim with a defined comparison set and evidence.',
  verification: 'Superlatives on the page map to registered, evidenced comparative claims.',
  check(ctx) {
    const claims = ctx.registries.claims?.entries || [];
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const m = p.text.match(SUPERLATIVE_RX);
      if (!m) continue;
      const covered = claims.some((c) => c.claim_type === 'comparative' && (c.evidence || []).length > 0 && (c.publication_surfaces || []).some((s) => p.url.includes(s) || s.includes(new URL(p.url).pathname)));
      if (!covered) {
        hits.push({
          subject: pageSubject(p),
          summary: `Superlative "${m[0]}" with no registered comparative claim for this page`,
          evidence: [`matched: "${m[0]}"`, 'no comparative claim lists this page as a publication surface'],
          confidence: 'high',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CLAIM-008', name: 'Published claim missing from page text (surface drift)', namespace: 'CLAIM',
  description: 'A claim lists a page as a publication surface, but the page no longer contains recognizably similar text.',
  discipline: ['geo'], severity: 'low', deterministic: false, requires: ['site', 'registries'],
  impact: { representation: 'medium', maintainability: 'medium' },
  applicable_requirement: '§6.4 publication_surfaces tracking; contradiction management',
  false_positive_conditions: ['legitimate paraphrase beyond token-overlap detection'],
  remediation: 'Update the claim’s publication_surfaces, or restore the claim text on the page.',
  verification: 'Claim key terms appear on each listed surface.',
  check(ctx) {
    const hits = [];
    for (const c of (ctx.registries.claims?.entries || []).filter((c) => (c.publication_surfaces || []).length > 0 && !['retired', 'expired'].includes(c.status))) {
      const keywords = (c.claim.toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).slice(0, 8);
      if (keywords.length < 3) continue;
      for (const surface of c.publication_surfaces) {
        const page = ctx.site.pages.find((p) => p.url.includes(surface) || surface.includes(new URL(p.url).pathname));
        if (!page) continue;
        const text = page.text.toLowerCase();
        const present = keywords.filter((k) => text.includes(k)).length;
        if (present / keywords.length < 0.4) {
          hits.push({
            subject: entrySubject('claims', c.claim_id),
            summary: `Claim "${truncate(c.claim)}" lists ${surface} as a surface but only ${present}/${keywords.length} key terms appear there`,
            evidence: [`surface: ${surface}`, `key-term overlap: ${present}/${keywords.length}`],
            confidence: 'medium',
          });
        }
      }
    }
    return hits;
  },
}));

function truncate(s, n = 70) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default D;
