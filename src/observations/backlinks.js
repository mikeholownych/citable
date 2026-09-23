import { parse } from 'node-html-parser';
import { URL } from 'node:url';
import { sha256, nowIso } from '../shared/io.js';
import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { extractRegistrableDomain } from '../shared/domainUtils.js';
import {
  createArtifactProvenance,
  verifyArtifactProvenance,
  ACQUISITION_AUTHORITIES,
  TRANSPORT_MECHANISMS,
} from '../evidence/artifactProvenance.js';

const OBSERVATION_SCHEMA = 'backlink-observation.schema.json';
const COMPARISON_SCHEMA = 'backlink-comparison.schema.json';
const EXTRACTION_VERSION = 'backlink-extractor/1.0.0';
const RETRIEVAL_VERSION = 'citable-observe/1.0.0';

function canonical(value) {
  return canonicalEvidenceJson(value);
}

export function urlValue(raw, base) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new TypeError('URL must be a string');
  let parsed;
  try {
    parsed = new URL(raw, base);
  } catch {
    throw new TypeError(`invalid URL: ${raw}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError(`unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('URLs may not contain credentials');
  }
  return parsed.href;
}

export function domainOf(url) {
  if (!url) return { host: null, registrable: null };
  try {
    const host = new URL(url).hostname.toLowerCase();
    return { host, registrable: extractRegistrableDomain(host) || host };
  } catch {
    return { host: null, registrable: null };
  }
}

export function relTokens(rel) {
  return [...new Set(String(rel || '').toLowerCase().split(/\s+/).filter(Boolean))].sort();
}

/**
 * Extract qualifying backlink from raw HTML document.
 * Strictly implements AC 6, 7, 8:
 * - OBSERVED when link is present and valid.
 * - NOT_OBSERVED only when retrieval SUCCEEDED and bounded scan confirmed absence.
 * - UNKNOWN on retrieval failure, parser failure, or partial coverage (fail-closed).
 */
export function extractBacklinkFromHtml({
  html,
  sourceUrl,
  targetUrl,
  artifactProvenance = null,
  rawContent = null,
  retrieval = {},
  coverage = {},
  lineage = {},
  limitations = [],
} = {}) {
  const normSource = urlValue(sourceUrl);
  const normTarget = urlValue(targetUrl);
  if (!normSource) throw new TypeError('sourceUrl is required and must be valid');
  if (!normTarget) throw new TypeError('targetUrl is required and must be valid');

  const contentPayload = rawContent != null ? rawContent : (html ?? '');
  const provenance = artifactProvenance && verifyArtifactProvenance(artifactProvenance).valid
    ? artifactProvenance
    : createArtifactProvenance({
        content: contentPayload,
        declaredRetrieval: {
          source_url: normSource,
          declarer: retrieval.declarer || 'html-capture',
          retrieval_actor: retrieval.retrieval_actor || null,
          http_status: retrieval.http_status ?? 200,
          retrieved_at: retrieval.attempted_at || nowIso(),
        },
      });

  const retrievalStatus = retrieval.status || (html != null ? 'SUCCEEDED' : 'FAILED');
  const httpStatus = retrieval.http_status ?? (retrievalStatus === 'SUCCEEDED' ? 200 : null);
  const coverageStatus = coverage.status || 'COMPLETE';

  let foundLink = null;
  let parserError = null;

  if (retrievalStatus === 'SUCCEEDED') {
    if (typeof html !== 'string') {
      parserError = 'HTML payload is missing, null, or not a string';
    } else {
      try {
        const root = parse(html);
        const anchors = root.querySelectorAll('a');
        for (const a of anchors) {
          const rawHref = a.getAttribute('href');
          if (!rawHref) continue;
          let resolved = null;
          try {
            resolved = urlValue(rawHref, normSource);
          } catch {
            continue;
          }
          if (resolved && resolved === normTarget) {
            const rawRel = a.getAttribute('rel') || null;
            const tokens = relTokens(rawRel);
            foundLink = {
              raw_href: rawHref,
              anchor_text: a.text?.trim() || null,
              rel: rawRel,
              rel_tokens: tokens,
              nofollow: tokens.includes('nofollow'),
              sponsored: tokens.includes('sponsored'),
              ugc: tokens.includes('ugc'),
              surrounding_text: a.parentNode?.text?.trim()?.slice(0, 200) || null,
              locator: null,
            };
            break; // First qualifying link
          }
        }
      } catch (err) {
        parserError = err.message;
      }
    }
  }


  // Strict epistemic status determination
  let observationStatus;
  const limits = [...limitations];

  if (retrievalStatus !== 'SUCCEEDED') {
    observationStatus = 'UNKNOWN';
    limits.push(`Retrieval failed with status ${retrievalStatus}; link presence cannot be determined.`);
  } else if (parserError) {
    observationStatus = 'UNKNOWN';
    limits.push(`HTML parser failed: ${parserError}; link presence cannot be determined.`);
  } else if (coverageStatus === 'PARTIAL' || coverageStatus === 'FAILED') {
    if (foundLink) {
      observationStatus = 'OBSERVED';
      limits.push('Link observed under partial coverage; broader page topology remains unverified.');
    } else {
      observationStatus = 'UNKNOWN';
      limits.push('Incomplete coverage prevents establishing link absence (cannot emit NOT_OBSERVED).');
    }
  } else if (foundLink) {
    observationStatus = 'OBSERVED';
  } else {
    // Only emitted when retrieval SUCCEEDED and bounded scan was COMPLETE
    observationStatus = 'NOT_OBSERVED';
  }

  const sourceDomain = domainOf(normSource);
  const logicalBasis = {
    source: normSource,
    target: normTarget,
    locator: foundLink?.locator ?? null,
    provider_record_id: null,
  };
  const logicalLinkId = `BL-LINK-${sha256(canonical(logicalBasis)).slice(0, 16)}`;
  const obsDigest = sha256(canonical({ source: normSource, target: normTarget, link: foundLink, status: observationStatus, artifact: provenance.artifact_digest }));
  const observationId = `BL-OBS-${obsDigest.slice(0, 16)}`;

  const observation = {
    schema_version: 1,
    observation_id: observationId,
    logical_link_id: logicalLinkId,
    observation_status: observationStatus,
    acquisition_provenance: provenance,
    observed_at: nowIso(),
    first_observed_at: null,
    last_observed_at: null,
    source: {
      raw_url: sourceUrl,
      normalized_url: normSource,
      effective_url: normSource,
      canonical_url: null,
      redirect_chain: [],
      domain: sourceDomain.host,
      referring_domain: sourceDomain.registrable,
    },
    target: {
      raw_url: targetUrl,
      resolved_url: normTarget,
      normalized_url: normTarget,
      identity: `URL:${normTarget}`,
      redirect_chain: [],
    },
    link: foundLink,
    provider: null,
    retrieval: {
      status: parserError ? 'MALFORMED' : retrievalStatus,
      method: retrieval.method || 'direct_observation',
      http_status: httpStatus,
      artifact_id: provenance.artifact_id,
      artifact_hash: provenance.artifact_digest,
      extraction_version: EXTRACTION_VERSION,
      retrieval_version: RETRIEVAL_VERSION,
    },
    coverage: {
      status: coverageStatus,
      bounded_scope: coverage.bounded_scope ?? true,
      unscanned_reason: coverage.unscanned_reason || null,
    },
    lineage: {
      source_identity: lineage.source_identity || 'citable-backlink-extractor',
      evidence_identity: `EVD-${obsDigest.slice(0, 16)}`,
      predecessor_observation_ids: lineage.predecessor_observation_ids || [],
      supersedes_observation_id: lineage.supersedes_observation_id || null,
    },
    determination: {
      state: 'CURRENT',
      version: '1.0.0',
      reason: observationStatus === 'OBSERVED'
        ? 'Qualifying link positively evidenced in substantive artifact.'
        : observationStatus === 'NOT_OBSERVED'
          ? 'Bounded examination verified target link absent.'
          : 'Retrieval, parsing, or coverage limitations prevent determination.',
    },
    limitations: limits.length > 0 ? limits : ['Observation reflects single point-in-time capture.'],
  };

  const check = validateAgainst(OBSERVATION_SCHEMA, observation);
  if (!check.valid) {
    throw new TypeError(`backlink observation violates contract: ${check.errors.join('; ')}`);
  }

  return Object.freeze(observation);
}

/**
 * Normalize provider-supplied backlink record.
 * Strictly implements AC 9:
 * Provider omission does NOT imply absence unless provider contract explicitly declares an exhaustive census.
 */
export function normalizeProviderBacklink({
  providerRecord = {},
  sourceUrl,
  targetUrl,
  artifactProvenance = null,
  lineage = {},
  limitations = [],
} = {}) {
  const normSource = urlValue(sourceUrl || providerRecord.source_url);
  const normTarget = urlValue(targetUrl || providerRecord.target_url);
  if (!normSource || !normTarget) throw new TypeError('source and target URLs are required');

  const provenance = artifactProvenance && verifyArtifactProvenance(artifactProvenance).valid
    ? artifactProvenance
    : createArtifactProvenance({
        content: JSON.stringify(providerRecord),
        transport: { mechanism: TRANSPORT_MECHANISMS.PROVIDER_API },
        declaredRetrieval: {
          declarer: providerRecord.provider || 'external_provider',
          retrieval_actor: 'external_provider_crawler',
          source_url: normSource,
        },
      });

  const isExhaustive = Boolean(providerRecord.is_exhaustive_census);
  let observationStatus;
  const limits = [...limitations];

  if (providerRecord.present === true || providerRecord.link) {
    observationStatus = 'OBSERVED';
  } else if (providerRecord.present === false) {
    if (isExhaustive) {
      observationStatus = 'NOT_OBSERVED';
    } else {
      // AC 9: Provider omission without exhaustive contract remains UNKNOWN
      observationStatus = 'UNKNOWN';
      limits.push('Provider omission does not imply absence without an explicit exhaustive census contract.');
    }
  } else {
    observationStatus = 'UNKNOWN';
    limits.push('Provider record does not contain link presence assertion.');
  }

  const sourceDomain = domainOf(normSource);
  const linkObj = providerRecord.link ? {
    raw_href: providerRecord.link.href || normTarget,
    anchor_text: providerRecord.link.anchor_text || null,
    rel: providerRecord.link.rel || null,
    rel_tokens: relTokens(providerRecord.link.rel),
    nofollow: providerRecord.link.nofollow ?? null,
    sponsored: providerRecord.link.sponsored ?? null,
    ugc: providerRecord.link.ugc ?? null,
    surrounding_text: providerRecord.link.surrounding_text || null,
    locator: providerRecord.link.locator || null,
  } : null;

  const logicalBasis = { source: normSource, target: normTarget, provider_record_id: providerRecord.record_id || null };
  const logicalLinkId = `BL-LINK-${sha256(canonical(logicalBasis)).slice(0, 16)}`;
  const obsDigest = sha256(canonical({ source: normSource, target: normTarget, provider: providerRecord.provider, status: observationStatus }));

  const observation = {
    schema_version: 1,
    observation_id: `BL-OBS-${obsDigest.slice(0, 16)}`,
    logical_link_id: logicalLinkId,
    observation_status: observationStatus,
    acquisition_provenance: provenance,
    observed_at: providerRecord.reported_at || nowIso(),
    first_observed_at: providerRecord.first_seen || null,
    last_observed_at: providerRecord.last_seen || null,
    source: {
      raw_url: sourceUrl || providerRecord.source_url,
      normalized_url: normSource,
      effective_url: normSource,
      canonical_url: null,
      redirect_chain: [],
      domain: sourceDomain.host,
      referring_domain: sourceDomain.registrable,
    },
    target: {
      raw_url: targetUrl || providerRecord.target_url,
      resolved_url: normTarget,
      normalized_url: normTarget,
      identity: `URL:${normTarget}`,
      redirect_chain: [],
    },
    link: linkObj,
    provider: {
      identity: providerRecord.provider || 'generic-provider',
      record_id: providerRecord.record_id || null,
      reported_at: providerRecord.reported_at || null,
      is_exhaustive_census: isExhaustive,
      fields: providerRecord.fields || {},
    },
    retrieval: {
      status: 'SUCCEEDED',
      method: 'provider_report',
      http_status: 200,
      artifact_id: provenance.artifact_id,
      artifact_hash: provenance.artifact_digest,
      extraction_version: EXTRACTION_VERSION,
      retrieval_version: RETRIEVAL_VERSION,
    },
    coverage: {
      status: 'COMPLETE',
      bounded_scope: true,
      unscanned_reason: null,
    },
    lineage: {
      source_identity: lineage.source_identity || 'citable-provider-import',
      evidence_identity: `EVD-${obsDigest.slice(0, 16)}`,
      predecessor_observation_ids: lineage.predecessor_observation_ids || [],
      supersedes_observation_id: null,
    },
    determination: {
      state: 'CURRENT',
      version: '1.0.0',
      reason: observationStatus === 'OBSERVED'
        ? 'Provider affirmatively reported backlink.'
        : observationStatus === 'NOT_OBSERVED'
          ? 'Provider exhaustive census verified link absent.'
          : 'Provider non-exhaustive omission cannot establish absence.',
    },
    limitations: limits.length > 0 ? limits : ['Observation sourced from third-party provider export.'],
  };

  const check = validateAgainst(OBSERVATION_SCHEMA, observation);
  if (!check.valid) {
    throw new TypeError(`provider backlink observation violates contract: ${check.errors.join('; ')}`);
  }

  return Object.freeze(observation);
}

/**
 * Temporal comparison of two backlink observations.
 * Strictly implements AC 10 and AC 11:
 * - Does not alter predecessor or current observations (immutable).
 * - Distinguishes UNCHANGED, CHANGED, NO_LONGER_OBSERVED, NEWLY_OBSERVED, INDETERMINATE.
 * - Incompatible or UNKNOWN inputs evaluate to NOT_COMPARABLE or INDETERMINATE.
 */
export function compareBacklinkObservations(left, right) {
  const checkLeft = validateAgainst(OBSERVATION_SCHEMA, left);
  const checkRight = validateAgainst(OBSERVATION_SCHEMA, right);
  if (!checkLeft.valid || !checkRight.valid) {
    throw new TypeError('both arguments must be valid backlink observations');
  }

  const sourceMatch = left.source.normalized_url === right.source.normalized_url;
  const targetMatch = left.target.normalized_url === right.target.normalized_url;

  if (!sourceMatch || !targetMatch || left.schema_version !== right.schema_version) {
    return Object.freeze({
      schema_version: 1,
      comparison_id: `CMP-${sha256(`${left.observation_id}:${right.observation_id}:incompatible`).slice(0, 16)}`,
      left_reference: left.observation_id,
      right_reference: right.observation_id,
      status: 'NOT_COMPARABLE',
      transition: 'INDETERMINATE',
      link_match: { source_match: sourceMatch, target_match: targetMatch, anchor_match: null, rel_match: null },
      dimensions: { source_url: sourceMatch ? 'match' : 'mismatch', target_url: targetMatch ? 'match' : 'mismatch' },
      limitations: ['Observations reference different source or target URLs and cannot be compared temporally.'],
    });
  }

  if (left.observation_status === 'UNKNOWN' || right.observation_status === 'UNKNOWN') {
    return Object.freeze({
      schema_version: 1,
      comparison_id: `CMP-${sha256(`${left.observation_id}:${right.observation_id}:unknown`).slice(0, 16)}`,
      left_reference: left.observation_id,
      right_reference: right.observation_id,
      status: 'PARTIALLY_COMPARABLE',
      transition: 'INDETERMINATE',
      link_match: { source_match: true, target_match: true, anchor_match: null, rel_match: null },
      dimensions: {
        left_status: left.observation_status,
        right_status: right.observation_status,
      },
      limitations: ['One or both observations have UNKNOWN status; transition cannot be determined.'],
    });
  }

  let anchorMatch = null;
  let relMatch = null;
  let transition;

  if (left.observation_status === 'OBSERVED' && right.observation_status === 'OBSERVED') {
    anchorMatch = left.link?.anchor_text === right.link?.anchor_text;
    relMatch = JSON.stringify(left.link?.rel_tokens || []) === JSON.stringify(right.link?.rel_tokens || []);
    transition = (anchorMatch && relMatch) ? 'UNCHANGED' : 'CHANGED';
  } else if (left.observation_status === 'OBSERVED' && right.observation_status === 'NOT_OBSERVED') {
    transition = 'NO_LONGER_OBSERVED';
  } else if (left.observation_status === 'NOT_OBSERVED' && right.observation_status === 'OBSERVED') {
    transition = 'NEWLY_OBSERVED';
  } else {
    // Both NOT_OBSERVED
    transition = 'UNCHANGED';
  }

  const comparisonData = {
    left: left.observation_id,
    right: right.observation_id,
    transition,
    anchorMatch,
    relMatch,
  };
  const comparisonId = `CMP-${sha256(canonical(comparisonData)).slice(0, 16)}`;

  const result = {
    schema_version: 1,
    comparison_id: comparisonId,
    left_reference: left.observation_id,
    right_reference: right.observation_id,
    status: 'COMPARABLE',
    transition,
    link_match: {
      source_match: true,
      target_match: true,
      anchor_match: anchorMatch,
      rel_match: relMatch,
    },
    dimensions: {
      status_transition: `${left.observation_status} -> ${right.observation_status}`,
      anchor_match: anchorMatch,
      rel_match: relMatch,
      referring_domain: left.source.referring_domain,
    },
    limitations: ['Comparison is non-causal and evaluates observed link attributes only.'],
  };

  const validation = validateAgainst(COMPARISON_SCHEMA, result);
  if (!validation.valid) {
    throw new TypeError(`backlink comparison violates contract: ${validation.errors.join('; ')}`);
  }

  return Object.freeze(result);
}
