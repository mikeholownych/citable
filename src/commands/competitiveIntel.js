/**
 * competitive-intel command — Competitive Intelligence Registry
 *
 * High-provenance only. Every claim retains source and observation date.
 * Refuses claims from: stale marketing pages, scraped snippets alone,
 * model recall, unverified directories, or synthetic review sites.
 *
 * Uses the existing competitors.yaml registry — extends it with
 * provenance validation controls.
 *
 * Usage:
 *   citable competitive-intel list
 *   citable competitive-intel show <competitor_id>
 *   citable competitive-intel validate
 *   citable competitive-intel stale [--days <N>]  — claims older than N days
 */
import { contextDir, loadRegistryFile, registryLoadProblems } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import path from 'node:path';

import { dateOnly, parseAsOf } from '../shared/asOf.js';

// Claim sources that cannot stand alone as primary evidence
const UNRELIABLE_SOURCES = [
  /marketing.?page/i, /homepage/i, /landing.?page/i,
  /g2\.com/i, /capterra/i, /trustpilot/i, /trustradius/i,
  /model.recall/i, /llm.recall/i, /memory/i,
  /unverified/i, /unknown/i,
];

const STALE_DAYS_DEFAULT = 90;

export async function competitiveIntelCommand(args, root = process.cwd()) {
  const [subcommand, ...rest] = args;
  const file = path.join(contextDir(root), 'competitors.yaml');

  switch (subcommand) {
    case 'show':     return competitorShow(file, rest[0]);
    case 'validate': return competitorValidate(file);
    case 'stale': {
      const daysIndex = rest.indexOf('--days');
      const days = (daysIndex >= 0 ? parseInt(rest[daysIndex + 1], 10) : NaN) || STALE_DAYS_DEFAULT;
      return competitorStale(file, days, parseAsOf(args));
    }
    default: return competitorList(file);
  }
}

function load(file) {
  return loadRegistryFile(file, 'competitors');
}

function competitorList(file) {
  const data = load(file);
  return {
    competitors: data.entries.map(c => ({
      competitor_id:    c.competitor_id,
      name:             c.name,
      category:         c.category,
      last_updated:     c.last_updated ?? c.updated ?? 'unknown',
      claims_count:     countClaims(c),
      verified_claims:  countVerified(c),
    })),
    total: data.entries.length,
  };
}

function competitorShow(file, id) {
  if (!id) return { error: 'competitor_id required' };
  const data = load(file);
  const c = data.entries.find(e => e.competitor_id === id);
  if (!c) return { error: `Competitor not found: ${id}` };
  return { competitor: c };
}

function competitorStale(file, days, asOf) {
  const data = load(file);
  const cutoff = new Date(asOf.getTime() - days * 86400000);
  const stale = data.entries.filter(c => {
    const updated = c.last_updated ?? c.updated;
    return !updated || new Date(updated) < cutoff;
  });
  return {
    stale_competitors: stale.map(c => ({ competitor_id: c.competitor_id, name: c.name, last_updated: c.last_updated ?? c.updated ?? 'never' })),
    cutoff_days: days,
    as_of: dateOnly(asOf),
    total: stale.length,
  };
}

function competitorValidate(file) {
  const data = load(file);
  const problems = [...registryLoadProblems(data)];

  for (const c of data.entries) {
    // Every claim must have observation_date
    for (const claim of (c.claims ?? [])) {
      if (!claim.observation_date)
        problems.push(`${c.competitor_id} claim "${(claim.text ?? '').slice(0,50)}": observation_date required`);
      if (!claim.source)
        problems.push(`${c.competitor_id} claim: source required for every claim`);
      // Unreliable sources must not be the sole source
      const source = claim.source ?? '';
      const isUnreliable = UNRELIABLE_SOURCES.some(p => p.test(source));
      if (isUnreliable && !claim.independent_verification)
        problems.push(`${c.competitor_id} claim source "${source}": unreliable source — must provide independent_verification`);
    }
    // Distinguish competitor claim vs Citable interpretation
    for (const claim of (c.claims ?? [])) {
      if (!claim.claim_type || !['competitor_claim','independent_verification','citable_interpretation'].includes(claim.claim_type))
        problems.push(`${c.competitor_id} claim: claim_type must be competitor_claim, independent_verification, or citable_interpretation`);
    }
  }

  return { valid: problems.length === 0, problems, checked: data.entries.length };
}

function countClaims(c) {
  return (c.claims ?? []).length;
}

function countVerified(c) {
  return (c.claims ?? []).filter(cl => cl.independent_verification).length;
}
