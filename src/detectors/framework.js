import { sha256 } from '../shared/io.js';

const REQUIRED = ['id', 'name', 'namespace', 'description', 'discipline', 'severity', 'deterministic', 'remediation', 'verification', 'check'];
const NAMESPACES = ['TECH', 'CRAWL', 'ARCH', 'PAGE', 'ANS', 'ENTITY', 'CLAIM', 'EVD', 'SCHEMA', 'LINK', 'EXT', 'GEO', 'RECO', 'LIFE', 'MEAS'];

/**
 * Detector definition contract. `check(ctx)` returns raw hits:
 *   { subject: {type, identifier, url?, source_file?, source_location?}, summary, evidence: [..],
 *     captured?, expected?, severity?, confidence? }
 */
export function defineDetector(def) {
  for (const k of REQUIRED) {
    if (def[k] === undefined) throw new Error(`detector ${def.id ?? '?'} missing field: ${k}`);
  }
  if (!NAMESPACES.includes(def.namespace)) throw new Error(`detector ${def.id}: unknown namespace ${def.namespace}`);
  if (!def.id.startsWith(def.namespace + '-')) throw new Error(`detector id ${def.id} must be prefixed with namespace`);
  return {
    confidence_model: def.deterministic ? 'binary condition; confirmed when observed' : 'heuristic; confidence reported per finding',
    confidence: def.deterministic ? 'confirmed' : 'medium',
    finding_type: def.deterministic ? 'deterministic_observation' : 'probabilistic_inference',
    impact: {},
    false_positive_conditions: [],
    false_negative_conditions: [],
    applicable_requirement: '',
    ...def,
  };
}

/** Run detectors over a context; returns { findings, detectorsRun, detectorsSkipped, errors }. */
export function runDetectors(detectors, ctx) {
  const findings = [];
  const detectorsRun = [];
  const detectorsSkipped = [];
  const errors = [];
  const ts = ctx.timestamp ?? new Date().toISOString();
  for (const d of detectors) {
    if (d.requires && !d.requires.every((r) => ctx[r])) {
      detectorsSkipped.push({ detector_id: d.id, reason: `missing context: ${d.requires.filter((r) => !ctx[r]).join(', ')}` });
      continue;
    }
    let hits;
    try {
      hits = d.check(ctx) || [];
    } catch (err) {
      errors.push(`${d.id}: detector error: ${err.message}`);
      continue;
    }
    detectorsRun.push(d.id);
    for (const hit of hits) {
      const idSeed = `${d.id}|${hit.subject?.identifier ?? ''}|${hit.summary}`;
      findings.push({
        finding_id: `F-${sha256(idSeed).slice(0, 12)}`,
        detector_id: d.id,
        run_id: ctx.runId ?? 'adhoc',
        timestamp: ts,
        discipline: d.discipline,
        subject: hit.subject,
        observation: {
          summary: hit.summary,
          evidence: hit.evidence,
          captured_value: hit.captured ?? null,
          expected_value: hit.expected ?? null,
        },
        classification: {
          finding_type: hit.finding_type ?? d.finding_type,
          severity: hit.severity ?? d.severity,
          confidence: hit.confidence ?? d.confidence,
          deterministic: d.deterministic,
          impact: { ...d.impact, ...(hit.impact || {}) },
        },
        reasoning: {
          applicable_requirement: d.applicable_requirement,
          explanation: d.description,
          assumptions: hit.assumptions ?? [],
          limitations: d.deterministic ? [] : ['heuristic detection; verify manually before acting'],
        },
        remediation: {
          preferred: d.remediation,
          alternatives: d.remediation_alternatives ?? [],
          unsafe_shortcuts: d.unsafe_shortcuts ?? [],
          owner: hit.owner ?? null,
          review_required: d.review_required ?? !d.deterministic,
        },
        verification: {
          method: d.verification,
          expected_result: 'detector no longer reports this subject',
          detector_to_rerun: d.id,
        },
        status: { state: 'open', first_seen: ts, last_seen: ts, resolved_at: null },
      });
    }
  }
  return { findings, detectorsRun, detectorsSkipped, errors };
}

/* ---------- shared helpers for detector implementations ---------- */

/** Pages whose declared or default intent is to be indexed. */
export function indexTargets(ctx) {
  return ctx.site.pages.filter((p) => {
    const reg = registryPageFor(ctx, p);
    if (reg?.indexing_intent === 'noindex') return false;
    return true;
  });
}

/** Match a live page to its registry entry by URL path. */
export function registryPageFor(ctx, page) {
  const entries = ctx.registries?.pages?.entries || [];
  const pPath = safePath(page.url);
  return entries.find((e) => safePath(e.url, ctx.site?.baseUrl) === pPath) ?? null;
}

/** Find the live site page for a registry entry. */
export function sitePageFor(ctx, registryEntry) {
  if (!ctx.site) return null;
  const target = safePath(registryEntry.url, ctx.site.baseUrl);
  return ctx.site.pages.find((p) => safePath(p.url) === target) ?? null;
}

export function safePath(url, base = 'https://example.test') {
  try {
    return new URL(url, base).pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

export function pageSubject(page) {
  return { type: 'page', identifier: page.url, url: page.url, ...(page.sourceFile ? { source_file: page.sourceFile } : {}) };
}

export function entrySubject(type, id) {
  return { type: 'registry_entry', identifier: `${type}/${id}` };
}
