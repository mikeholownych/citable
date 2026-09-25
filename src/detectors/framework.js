import { sha256 } from '../shared/io.js';
import { fileURLToPath } from 'node:url';
import { readJson } from '../shared/io.js';
import { evaluateRequirement, isCoverageRequirement, requirementForDetector } from '../evidence/determination.js';
import { evaluateDeterminations } from '../conditions/determinationEngine.js';

const TOOL_VERSION = readJson(new URL('../../package.json', import.meta.url)).version;

const REQUIRED = ['id', 'name', 'namespace', 'description', 'discipline', 'severity', 'deterministic', 'remediation', 'verification', 'check'];
// RENDER (browser-rendered truth / source-render divergence) is reserved for the
// rendered-truth phase; no RENDER detectors ship until a real renderer backs them.
const NAMESPACES = ['TECH', 'CRAWL', 'ARCH', 'PAGE', 'ANS', 'ENTITY', 'CLAIM', 'EVD', 'SCHEMA', 'LINK', 'EXT', 'GEO', 'RECO', 'LIFE', 'MEAS', 'RENDER', 'HREFLANG', 'CWV', 'AGENT', 'CRO'];

/**
 * Detector definition contract. `check(ctx)` returns raw hits:
 *   { subject: {type, identifier, url?, source_file?, source_location?, rendered_selector?}, summary, evidence: [..],
 *     captured?, expected?, severity?, confidence? }
 * Bump `version` whenever detector logic, thresholds, or output semantics
 * change; findings record it in provenance.detector_version.
 */
export function defineDetector(def) {
  for (const k of REQUIRED) {
    if (def[k] === undefined) throw new Error(`detector ${def.id ?? '?'} missing field: ${k}`);
  }
  if (!NAMESPACES.includes(def.namespace)) throw new Error(`detector ${def.id}: unknown namespace ${def.namespace}`);
  if (!def.id.startsWith(def.namespace + '-')) throw new Error(`detector id ${def.id} must be prefixed with namespace`);
  if (!isCoverageRequirement(def.coverage_requirement)) {
    throw new Error(`detector ${def.id ?? '?'} must explicitly declare a valid coverage_requirement`);
  }
  return {
    version: 1,
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

function evidenceSourceFor(detector, ctx) {
  if (ctx.observations?.length && detector.requires?.includes('observations')) return 'controlled_observation';
  if (detector.requires?.includes('registries') && detector.requires?.includes('site')) return 'registry+dom_parse';
  if (detector.requires?.includes('registries')) return 'registry';
  if (detector.requires?.includes('site')) return 'dom_parse';
  return 'configuration';
}

/** Run detectors over a context; returns { findings, determinations, detectorsRun, detectorsSkipped, errors, siteProfile }. */
export function runDetectors(detectors, ctx) {
  return evaluateDeterminations(detectors, ctx);
}

/* ---------- shared helpers for detector implementations ---------- */

/** Pages whose declared or default intent is to be indexed. */
export function indexTargets(ctx) {
  return ctx.site.pages.filter((p) => {
    if (isProviderUtilityUrl(p.url)) return false;
    const reg = registryPageFor(ctx, p);
    if (reg?.indexing_intent === 'noindex') return false;
    return true;
  });
}

/** Index targets whose response is an HTML document. */
export function htmlIndexTargets(ctx) {
  return indexTargets(ctx).filter(isHtmlDocument);
}

export function isHtmlDocument(page) {
  const type = String(page?.contentType || '').toLowerCase();
  return !type || type.includes('text/html') || type.includes('application/xhtml+xml');
}

/** URLs that conventionally identify HTML documents rather than media/data resources. */
export function isHtmlDocumentUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split('/').pop() || '';
    const match = name.match(/\.([a-z0-9]+)$/i);
    return Boolean(match) && ['html', 'htm', 'xhtml'].includes(match[1].toLowerCase());
  } catch {
    return false;
  }
}

export function hasHtmlDocumentMarkup(page) {
  return /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(String(page?.rawHtml || ''));
}

/** Provider-owned utility routes are link evidence, not default content pages. */
export function isProviderUtilityUrl(url) {
  try {
    const { pathname } = new URL(url);
    return pathname === '/cdn-cgi' || pathname.startsWith('/cdn-cgi/');
  } catch {
    return false;
  }
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
