import { buildContext } from './context.js';
import { loadRegistries, saveRegistry, diffRegistries } from '../registries/index.js';
import { nowIso } from '../shared/io.js';

const PATTERNS = [
  { rx: /\b(the (best|leading|top|fastest|most \w+)|#1|number one|industry[- ]leading|world[- ]class|first and only|unmatched|unrivalled|unrivaled)\b/i, type: 'comparative', why: 'superlative / market-position language' },
  { rx: /\b\d+(\.\d+)?\s*(%|percent|x|times)\b/i, type: 'performance', why: 'quantitative assertion' },
  { rx: /\b(guarantee[ds]?|ensures?|always|never fails?|zero (downtime|risk)|100%)\b/i, type: 'performance', why: 'absolute or guarantee language' },
  { rx: /\b(compliant|certified|SOC ?2|ISO ?\d+|GDPR|HIPAA|PCI[- ]DSS|FedRAMP|accredited)\b/i, type: 'legal_regulatory', why: 'compliance / certification assertion' },
  { rx: /\b(secure|encrypt(s|ed|ion)|zero[- ]trust|penetration[- ]tested|audited)\b/i, type: 'security', why: 'security capability assertion' },
  { rx: /\b(only (platform|solution|product|vendor)|unlike (any|all) (other|competitors))\b/i, type: 'comparative', why: 'exclusivity assertion' },
  { rx: /\b(trusted by|used by|customers? (include|like)|deployed (at|by))\b/i, type: 'commercial', why: 'customer / adoption assertion' },
  { rx: /\b(integrates? with|supports? (over )?\d+|compatible with)\b/i, type: 'capability', why: 'capability / integration assertion' },
];

const REVIEW_TYPES = new Set(['legal_regulatory', 'security', 'commercial']);

/**
 * `citable map-claims` — extract MATERIAL claim candidates from page text.
 * Candidates are never marked verified; regulated types are flagged review_required.
 * Writes to the claim registry only when `write: true`.
 */
export async function mapClaims(root, { target, baseUrl, write = false, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('map-claims requires a site target (built output directory or URL)');

  const existing = new Set((ctx.registries.claims?.entries || []).map((c) => normalizeText(c.claim)));
  const candidates = [];
  for (const p of ctx.site.pages) {
    if (p.status !== 200) continue;
    const sentences = p.paragraphs.flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z])/));
    for (const s of sentences) {
      if (s.length < 25 || s.length > 400) continue; // not every sentence is a strategic claim
      for (const pat of PATTERNS) {
        if (pat.rx.test(s)) {
          if (existing.has(normalizeText(s))) break;
          candidates.push({
            claim: s.trim(),
            claim_type: pat.type,
            reason: pat.why,
            source_location: `${p.sourceFile ?? p.url}`,
            page_url: p.url,
            review_required: REVIEW_TYPES.has(pat.type),
          });
          break; // one classification per sentence
        }
      }
    }
  }

  // Deduplicate by normalized text
  const seen = new Set();
  const unique = candidates.filter((c) => {
    const k = normalizeText(c.claim);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let registryDiff = null;
  if (write && unique.length) {
    const { registries } = loadRegistries(root);
    const before = JSON.parse(JSON.stringify(registries.claims));
    let n = registries.claims.entries.length;
    for (const c of unique) {
      n += 1;
      registries.claims.entries.push({
        claim_id: `CLAIM-${String(n).padStart(4, '0')}`,
        claim: c.claim,
        claim_type: c.claim_type,
        entity: undefined,
        evidence: [],
        publication_surfaces: [c.page_url],
        source_location: c.source_location,
        status: c.review_required ? 'review_required' : 'candidate',
        legal_status: c.review_required ? 'review_required' : 'not_assessed',
        provenance: { created: nowIso(), created_by: 'citable map-claims', source: c.reason },
      });
    }
    saveRegistry(root, 'claims', registries.claims);
    registryDiff = diffRegistries(before, registries.claims, 'claim_id');
  }

  return { candidates: unique, written: write ? unique.length : 0, registryDiff };
}

function normalizeText(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
