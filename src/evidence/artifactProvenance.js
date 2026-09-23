import { sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const SCHEMA_NAME = 'artifact-provenance.schema.json';

export const ACQUISITION_AUTHORITIES = Object.freeze({
  SYNTHETIC: 'SYNTHETIC',
  EXTERNAL_RETRIEVAL: 'EXTERNAL_RETRIEVAL',
  DIRECT_RETRIEVAL: 'DIRECT_RETRIEVAL',
  PROVIDER_SUPPLIED: 'PROVIDER_SUPPLIED',
  UNKNOWN_PROVENANCE: 'UNKNOWN_PROVENANCE',
});

export const TRANSPORT_MECHANISMS = Object.freeze({
  FILE_INPUT: 'file_input',
  DIRECT_NETWORK: 'direct_network',
  PROVIDER_API: 'provider_api',
  STREAM: 'stream',
  INLINE: 'inline',
  SYNTHETIC_FIXTURE: 'synthetic_fixture',
  UNKNOWN: 'unknown',
});

const VALID_AUTHORITIES = new Set(Object.values(ACQUISITION_AUTHORITIES));

/**
 * Classify the acquisition authority based on declared metadata and transport.
 * Enforces fail-closed rules:
 * 1. File transport does NOT imply SYNTHETIC (preserves AC 2).
 * 2. Citable direct retrieval is only attributed when Citable itself performed it (AC 3).
 * 3. Insufficient metadata fails closed to UNKNOWN_PROVENANCE (AC 4).
 */
export function classifyAcquisitionAuthority({
  declared = null,
  transport = null,
  isSynthetic = false,
  explicitAuthority = null,
} = {}) {
  if (explicitAuthority) {
    if (!VALID_AUTHORITIES.has(explicitAuthority)) {
      throw new TypeError(`invalid acquisition authority: ${explicitAuthority}`);
    }
    // Strict safety check: Citable direct retrieval cannot be claimed without citable retrieval actor
    if (explicitAuthority === ACQUISITION_AUTHORITIES.DIRECT_RETRIEVAL) {
      const actor = String(declared?.retrieval_actor || '').toLowerCase();
      if (!actor.includes('citable')) {
        return ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE;
      }
    }
    // Strict safety check: External retrieval requires some declared provenance
    if (explicitAuthority === ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL) {
      if (!declared || (!declared.declarer && !declared.retrieval_actor && !declared.source_url)) {
        return ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE;
      }
    }
    return explicitAuthority;
  }

  if (isSynthetic || transport?.mechanism === TRANSPORT_MECHANISMS.SYNTHETIC_FIXTURE) {
    return ACQUISITION_AUTHORITIES.SYNTHETIC;
  }

  // Declared retrieval facts evaluation
  if (declared && typeof declared === 'object') {
    const actor = String(declared.retrieval_actor || '').toLowerCase();
    const declarer = String(declared.declarer || '').toLowerCase();

    if (actor.includes('citable')) {
      return ACQUISITION_AUTHORITIES.DIRECT_RETRIEVAL;
    }

    if (declared.provider || declarer.includes('provider') || transport?.mechanism === TRANSPORT_MECHANISMS.PROVIDER_API) {
      return ACQUISITION_AUTHORITIES.PROVIDER_SUPPLIED;
    }

    if (declared.source_url || declared.retrieval_actor || declared.declarer) {
      // Real external capture delivered via file or stream or direct network
      return ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL;
    }
  }

  // Missing or insufficient provenance fails closed
  return ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE;
}

/**
 * Create a deterministic, schema-validated artifact provenance record.
 */
export function createArtifactProvenance({
  content = '',
  rawBytes = null,
  transport = {},
  declaredRetrieval = null,
  acquisitionAuthority = null,
  isSynthetic = false,
  contentType = null,
  lineage = {},
  limitations = [],
} = {}) {
  const payload = rawBytes != null ? rawBytes : String(content ?? '');
  const digest = sha256(payload);
  const byteLength = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload, 'utf8');
  const artifactId = `ART-${digest.slice(0, 24)}`;

  const resolvedAuthority = classifyAcquisitionAuthority({
    declared: declaredRetrieval,
    transport,
    isSynthetic,
    explicitAuthority: acquisitionAuthority,
  });

  const record = {
    schema_version: 1,
    artifact_id: artifactId,
    artifact_digest: digest,
    acquisition_authority: resolvedAuthority,
    transport: {
      mechanism: transport.mechanism || (transport.source_location ? TRANSPORT_MECHANISMS.FILE_INPUT : TRANSPORT_MECHANISMS.UNKNOWN),
      source_location: transport.source_location || null,
      received_at: transport.received_at || nowIso(),
    },
    declared_retrieval: declaredRetrieval ? {
      declarer: declaredRetrieval.declarer || null,
      retrieval_actor: declaredRetrieval.retrieval_actor || null,
      source_url: declaredRetrieval.source_url || null,
      retrieved_at: declaredRetrieval.retrieved_at || null,
      http_status: declaredRetrieval.http_status ?? null,
      headers: declaredRetrieval.headers || null,
      declared_digest: declaredRetrieval.declared_digest || null,
    } : null,
    derived_facts: {
      digest,
      byte_length: byteLength,
      derived_at: nowIso(),
      content_type: contentType || null,
    },
    lineage: {
      source_identity: lineage.source_identity || 'citable-provenance-verifier',
      predecessor_artifact_id: lineage.predecessor_artifact_id || null,
      provenance_version: lineage.provenance_version || 1,
    },
    limitations: Array.isArray(limitations) && limitations.length > 0
      ? limitations
      : (resolvedAuthority === ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE
          ? ['Artifact lacks sufficient acquisition metadata to verify source or retrieval authority.']
          : ['Artifact provenance is bounded by declared retrieval claims.']),
  };

  const validation = validateAgainst(SCHEMA_NAME, record);
  if (!validation.valid) {
    throw new TypeError(`artifact provenance violates contract: ${validation.errors.join('; ')}`);
  }

  return Object.freeze(record);
}

/**
 * Verify artifact provenance integrity against content bytes and schema contract.
 */
export function verifyArtifactProvenance(record, { content = null, rawBytes = null } = {}) {
  const failures = [];
  const validation = validateAgainst(SCHEMA_NAME, record);
  if (!validation.valid) {
    failures.push(...validation.errors);
  }

  if (record && typeof record === 'object') {
    if (record.artifact_digest !== record.derived_facts?.digest) {
      failures.push('artifact_digest does not match derived_facts.digest');
    }
    const expectedId = `ART-${record.artifact_digest?.slice(0, 24)}`;
    if (record.artifact_id !== expectedId) {
      failures.push(`artifact_id mismatch: expected ${expectedId}, received ${record.artifact_id}`);
    }

    if (content != null || rawBytes != null) {
      const payload = rawBytes != null ? rawBytes : String(content ?? '');
      const actualDigest = sha256(payload);
      if (actualDigest !== record.artifact_digest) {
        failures.push(`content digest mismatch: actual ${actualDigest} vs recorded ${record.artifact_digest}`);
      }
    }
  } else {
    failures.push('record must be an object');
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}
