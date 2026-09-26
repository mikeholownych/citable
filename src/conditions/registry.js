import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { ALL_DETECTORS } from '../detectors/index.js';
import { computeSemanticFingerprint } from './fingerprint.js';
import {
  NORMATIVE_SOURCE_CLASSES,
  SOURCE_MATURITY,
  EVALUATION_METHODS,
} from './constants.js';
import { ECOMMERCE_DETECTOR_IDS } from './siteProfile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY_FILE = path.join(ROOT, 'src', 'conditions', 'conditions.json');

/**
 * Derives the applicability rule for a condition based on detector attributes.
 */
export function deriveApplicabilityRule(d) {
  if (d.applicability_rule) return d.applicability_rule;

  if (ECOMMERCE_DETECTOR_IDS.has(d.id)) {
    return {
      profile_filter: 'ecommerce',
      subject_type: 'page',
      description: 'Requires e-commerce transaction pathway',
    };
  }

  if (d.requires?.includes('site')) {
    return {
      profile_filter: 'all',
      subject_type: 'page',
      description: 'Evaluates pages on any crawled or rendered site',
    };
  }

  if (d.requires?.includes('registries')) {
    return {
      profile_filter: 'all',
      subject_type: 'registry',
      description: 'Evaluates registered project entries',
    };
  }

  return {
    profile_filter: 'all',
    subject_type: 'site',
    description: 'Evaluates site or run-level configuration',
  };
}

/**
 * Derives structured normative sources for a condition (B-023).
 * INVARIANT: A heuristic is NEVER presented as a STANDARD.
 */
export function deriveNormativeSources(d) {
  if (Array.isArray(d.normative_sources) && d.normative_sources.length > 0) {
    // Enforce invariant: if heuristic, source_class cannot be STANDARD
    if (!d.deterministic) {
      for (const s of d.normative_sources) {
        if (s.source_class === NORMATIVE_SOURCE_CLASSES.STANDARD) {
          throw new Error(`Invalid condition ${d.id}: heuristic condition must NEVER declare source_class STANDARD`);
        }
      }
    }
    return d.normative_sources;
  }

  const req = d.applicable_requirement || '';
  const isHeuristic = !d.deterministic;

  // Heuristic conditions: NEVER classed as STANDARD (B-023)
  if (isHeuristic) {
    let sourceClass = NORMATIVE_SOURCE_CLASSES.HEURISTIC;
    let maturity = SOURCE_MATURITY.CANDIDATE;
    if (/research|study|empirical|flesch/i.test(req)) {
      sourceClass = NORMATIVE_SOURCE_CLASSES.RESEARCH;
      maturity = SOURCE_MATURITY.STABLE;
    } else if (/guidance|best practice|recommendation/i.test(req)) {
      sourceClass = NORMATIVE_SOURCE_CLASSES.VENDOR_GUIDANCE;
      maturity = SOURCE_MATURITY.STABLE;
    } else if (/convention|pattern/i.test(req)) {
      sourceClass = NORMATIVE_SOURCE_CLASSES.COMMUNITY_CONVENTION;
      maturity = SOURCE_MATURITY.STABLE;
    }
    return [{
      source_class: sourceClass,
      maturity,
      title: req || `${d.name} heuristic evaluation rule`,
      url: null,
      citation: req || null,
    }];
  }

  // Deterministic conditions
  if (/RFC\s*(\d+)/i.test(req)) {
    const match = req.match(/RFC\s*(\d+)/i);
    const rfcNum = match[1];
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.RFC,
      maturity: SOURCE_MATURITY.MATURE,
      title: `RFC ${rfcNum}`,
      url: `https://www.rfc-editor.org/rfc/rfc${rfcNum}`,
      citation: req,
    }];
  }

  if (/schema\.org/i.test(req)) {
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.SPECIFICATION,
      maturity: SOURCE_MATURITY.MATURE,
      title: 'Schema.org Community Specification',
      url: 'https://schema.org',
      citation: req,
    }];
  }

  if (/MCP|Model Context Protocol|A2A|WebMCP|ARD/i.test(req)) {
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.SPECIFICATION,
      maturity: SOURCE_MATURITY.STABLE,
      title: 'Model Context Protocol / Agent Protocol Specification',
      url: 'https://modelcontextprotocol.io',
      citation: req,
    }];
  }

  if (/W3C|HTML5|DOM|CSS|ISO/i.test(req)) {
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.STANDARD,
      maturity: SOURCE_MATURITY.MATURE,
      title: req.split(';')[0].trim() || 'W3C Standard',
      url: 'https://www.w3.org/standards',
      citation: req,
    }];
  }

  if (/Google Search Essentials|Google Search Central|Bing Webmaster/i.test(req)) {
    const isRequirement = d.severity === 'critical' || /required|essential|must/i.test(req);
    return [{
      source_class: isRequirement ? NORMATIVE_SOURCE_CLASSES.VENDOR_REQUIREMENT : NORMATIVE_SOURCE_CLASSES.VENDOR_GUIDANCE,
      maturity: SOURCE_MATURITY.STABLE,
      title: req.split(';')[0].trim(),
      url: 'https://developers.google.com/search/docs',
      citation: req,
    }];
  }

  if (/Core Web Vitals|Chrome User Experience|CrUX|Lighthouse/i.test(req)) {
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.VENDOR_GUIDANCE,
      maturity: SOURCE_MATURITY.STABLE,
      title: 'Web.dev Core Web Vitals Guidance',
      url: 'https://web.dev/vitals/',
      citation: req,
    }];
  }

  if (/robots\.txt|sitemap/i.test(req) || d.namespace === 'CRAWL') {
    return [{
      source_class: NORMATIVE_SOURCE_CLASSES.SPECIFICATION,
      maturity: SOURCE_MATURITY.MATURE,
      title: 'Sitemap Protocol 0.9 / Web Robotics Specification',
      url: 'https://www.sitemaps.org/protocol.html',
      citation: req,
    }];
  }

  const isReq = d.severity === 'critical';
  return [{
    source_class: isReq ? NORMATIVE_SOURCE_CLASSES.VENDOR_REQUIREMENT : NORMATIVE_SOURCE_CLASSES.COMMUNITY_CONVENTION,
    maturity: SOURCE_MATURITY.STABLE,
    title: req || `${d.name} normative criteria`,
    url: null,
    citation: req || null,
  }];
}

/**
 * Builds a valid condition object from a detector definition (B-020).
 */
export function buildConditionFromDetector(d) {
  const isHeuristic = !d.deterministic;
  return {
    condition_id: d.condition_id || d.id,
    condition_version: d.condition_version || d.version || 1,
    name: d.name,
    namespace: d.namespace || (d.id ? d.id.split('-')[0] : 'TECH'),
    description: d.description,
    discipline: Array.isArray(d.discipline) ? d.discipline : ['seo'],
    applicability_rule: deriveApplicabilityRule(d),
    observation_requirements: Array.isArray(d.requires) ? d.requires : [],
    evaluation_method: isHeuristic ? EVALUATION_METHODS.HEURISTIC : EVALUATION_METHODS.DETERMINISTIC,
    severity_rule: d.severity_rule || {
      default_severity: d.severity || 'medium',
      escalation_conditions: [],
    },
    normative_sources: deriveNormativeSources(d),
    semantic_fingerprint: computeSemanticFingerprint(d),
    introduced_at: d.introduced_at || '1.0.0',
    deprecated_at: d.deprecated_at || null,
  };
}

/**
 * Generates the full condition registry envelope for all detectors.
 */
export function buildConditionRegistry(detectors = ALL_DETECTORS) {
  const conditions = detectors.map((d) => buildConditionFromDetector(d));
  return {
    schema_version: 1,
    generated_at: nowIso(),
    total_conditions: conditions.length,
    conditions,
  };
}

/**
 * Loads the committed condition registry.
 */
export function loadConditionRegistry(filePath = REGISTRY_FILE) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Condition registry file not found: ${filePath}`);
  }
  return readJson(filePath);
}

/**
 * Saves the condition registry to disk.
 */
export function saveConditionRegistry(registry, filePath = REGISTRY_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, registry);
}

/**
 * Validates the condition registry against schemas, verifies fingerprints,
 * enforces version bumps on semantic change (B-021), and enforces normative
 * source invariants (B-023).
 */
export function validateConditionRegistry(options = {}) {
  const registry = options.registry || loadConditionRegistry(options.filePath || REGISTRY_FILE);
  const detectors = options.detectors || ALL_DETECTORS;
  const errors = [];

  // 1. Validate registry schema
  const regCheck = validateAgainst('condition-registry.schema.json', registry);
  if (!regCheck.valid) {
    errors.push(...regCheck.errors.map((e) => `Registry schema error: ${e}`));
  }

  // 2. Validate individual condition schemas & invariants
  const committedMap = new Map();
  for (const cond of registry.conditions || []) {
    committedMap.set(cond.condition_id, cond);

    const condCheck = validateAgainst('condition.schema.json', cond);
    if (!condCheck.valid) {
      errors.push(...condCheck.errors.map((e) => `${cond.condition_id}: ${e}`));
    }

    // B-023: Heuristic is NEVER presented as a standard
    if (cond.evaluation_method === EVALUATION_METHODS.HEURISTIC) {
      for (const src of cond.normative_sources || []) {
        if (src.source_class === NORMATIVE_SOURCE_CLASSES.STANDARD) {
          errors.push(`${cond.condition_id}: heuristic condition must NEVER present source_class as STANDARD`);
        }
      }
    }
  }

  // 3. B-021: Compare semantic fingerprint over check logic, thresholds, and output shape
  for (const d of detectors) {
    const currentFingerprint = computeSemanticFingerprint(d);
    const committed = committedMap.get(d.id);

    if (!committed) {
      // New condition not in registry yet
      continue;
    }

    const currentVersion = d.version ?? 1;
    const committedVersion = committed.condition_version;

    if (currentFingerprint !== committed.semantic_fingerprint) {
      // Semantic change detected!
      if (currentVersion <= committedVersion) {
        errors.push(
          `B-021 VIOLATION: Condition ${d.id} check logic, thresholds, or output shape changed (fingerprint changed from ${committed.semantic_fingerprint.slice(0, 8)} to ${currentFingerprint.slice(0, 8)}), but condition_version was NOT incremented (remains v${currentVersion}). Bump version to ${committedVersion + 1}.`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    total_conditions: registry.conditions?.length ?? 0,
    errors,
  };
}
