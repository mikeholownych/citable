import { loadRegistries, saveRegistry, diffRegistries } from '../registries/index.js';
import { isPastDate, nowIso, parseRefDate } from '../shared/io.js';

const REGULATED = new Set(['legal_regulatory', 'security', 'commercial']);

/**
 * `citable substantiate` — deterministic claim/evidence assessment.
 *
 * Outcomes per claim (spec §8.5): verified · verified_narrowed · insufficient_evidence ·
 * contradicted · expired · prohibited · review_required.
 *
 * This command performs the *deterministic* portion: evidence linkage, validity dates,
 * type adequacy, contradiction records, and legal-review gating. It never invents evidence
 * and never upgrades a claim to verified on its own — upgrades require existing verified
 * evidence in the registry. Semantic adequacy (does the evidence actually support the
 * wording?) is a human/rubric task: see skill/rubrics/evidence-strength.md.
 */
export function substantiate(root, { write = false, refDate } = {}) {
  const { registries, problems } = loadRegistries(root);
  const ref = parseRefDate(refDate);
  const evidence = new Map(registries.evidence.entries.map((e) => [e.evidence_id, e]));
  const before = JSON.parse(JSON.stringify(registries.claims));
  const assessments = [];

  for (const c of registries.claims.entries) {
    const a = { claim_id: c.claim_id, previous_status: c.status, outcome: null, reasons: [], required_input: [] };

    if (c.legal_status === 'prohibited') {
      a.outcome = 'prohibited';
      a.reasons.push('legal_status is prohibited');
    } else if (isPastDate(c.expires, ref)) {
      a.outcome = 'expired';
      a.reasons.push(`claim expiry ${c.expires} has passed`);
    } else if ((c.contradictory_sources || []).length > 0) {
      a.outcome = 'contradicted';
      a.reasons.push(`contradictory sources recorded: ${c.contradictory_sources.join(', ')}`);
    } else if (REGULATED.has(c.claim_type) && (!c.legal_status || c.legal_status === 'not_assessed')) {
      a.outcome = 'review_required';
      a.reasons.push(`${c.claim_type} claim requires legal/SME review before any verified status`);
      a.required_input.push('legal or subject-matter review decision');
    } else if (['opinion', 'position', 'aspirational'].includes(c.claim_type)) {
      // Opinions and aspirations are positions, not verifiable facts; they never enter the verified track.
      a.outcome = c.status === 'candidate' ? 'candidate' : 'unverified';
      a.reasons.push(`${c.claim_type} claims are positions, not verifiable facts; keep them out of the verified track`);
    } else {
      const evs = (c.evidence || []).map((id) => evidence.get(id)).filter(Boolean);
      const missing = (c.evidence || []).filter((id) => !evidence.has(id));
      const live = evs.filter((e) => !isPastDate(e.valid_until, ref) && ['verified', 'reviewed'].includes(e.verification_status));
      if (missing.length) a.reasons.push(`dangling evidence references: ${missing.join(', ')}`);
      if (evs.length === 0) {
        a.outcome = 'insufficient_evidence';
        a.reasons.push('no resolvable evidence attached');
        a.required_input.push(...requiredInputFor(c));
      } else if (live.length === 0) {
        a.outcome = 'insufficient_evidence';
        a.reasons.push('all attached evidence is expired, unverified, revoked, or inaccessible');
        a.required_input.push('current, verified evidence');
      } else if (['performance', 'comparative', 'security'].includes(c.claim_type) && live.every((e) => e.primary_or_secondary === 'secondary')) {
        a.outcome = 'insufficient_evidence';
        a.reasons.push(`${c.claim_type} claims require primary evidence; only secondary evidence attached`);
        a.required_input.push('primary evidence (test result, benchmark, specification, certification)');
      } else if (['performance'].includes(c.claim_type) && live.every((e) => !e.methodology)) {
        a.outcome = 'insufficient_evidence';
        a.reasons.push('performance evidence lacks methodology');
        a.required_input.push('methodology', 'test conditions', 'measurement period');
      } else if ((c.scope || []).length === 0 && ['capability', 'performance', 'comparative'].includes(c.claim_type)) {
        a.outcome = 'verified_narrowed';
        a.reasons.push('evidence exists but claim declares no scope; treat as verified only with narrowed scope pending scope definition');
        a.required_input.push('explicit scope and exclusions');
      } else {
        // Deterministic conditions passed. Verified status additionally requires a recorded
        // semantic support assessment (entailment) by a named assessor — evidence linkage
        // alone does not establish that the wording matches what the evidence proves.
        const sa = c.support_assessment;
        if (sa?.status === 'contradicted') {
          a.outcome = 'contradicted';
          a.reasons.push('support assessment records the evidence as contradicting the claim wording');
        } else if (['verified', 'verified_narrowed'].includes(c.status)) {
          if (sa && ['directly_supported', 'partially_supported'].includes(sa.status) && sa.assessor) {
            a.outcome = sa.status === 'partially_supported' ? 'verified_narrowed' : c.status;
            a.reasons.push(`deterministic conditions hold; support assessment ${sa.status} by ${sa.assessor}`);
          } else {
            a.outcome = 'review_required';
            a.reasons.push('verified status held without an adequate semantic support assessment; entailment review required (evidence-strength rubric)');
            a.required_input.push('support_assessment with named assessor');
          }
        } else {
          a.outcome = 'review_required';
          a.reasons.push('deterministic conditions hold; semantic adequacy review required before marking verified (see evidence-strength rubric)');
        }
      }
    }
    assessments.push(a);
  }

  let registryDiff = null;
  if (write) {
    for (const a of assessments) {
      const c = registries.claims.entries.find((x) => x.claim_id === a.claim_id);
      if (a.outcome && a.outcome !== c.status && a.outcome !== 'candidate') {
        // Never silently upgrade to verified; only downgrades/lateral moves are automated.
        const upgrade = ['verified', 'verified_narrowed'].includes(a.outcome) && !['verified', 'verified_narrowed'].includes(c.status);
        if (!upgrade) {
          c.status = a.outcome;
          c.provenance = { ...(c.provenance || {}), updated: nowIso(), source: `citable substantiate: ${a.reasons[0]}` };
        }
      }
    }
    saveRegistry(root, 'claims', registries.claims);
    registryDiff = diffRegistries(before, registries.claims, 'claim_id');
  }

  return { assessments, problems, registryDiff };
}

function requiredInputFor(c) {
  if (c.claim_type === 'performance') return ['baseline', 'measurement period', 'test population/conditions', 'methodology', 'result source'];
  if (c.claim_type === 'comparative') return ['comparison set', 'comparison criteria', 'evidence for each compared dimension'];
  if (c.claim_type === 'security') return ['test report, certification, or architecture evidence'];
  return ['supporting evidence with an accountable owner'];
}
