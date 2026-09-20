import { sha256 } from '../shared/io.js';

export const EVIDENCE_HASH_SCHEMA_VERSION = 'evidence-hashes-v1';

/**
 * Canonical JSON used for evidence representations. Object key order is not
 * evidence; array order is preserved because it can be meaningful (for
 * example, JSON-LD graph order and an evaluator's finding order).
 */
export function canonicalEvidenceJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalEvidenceJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

function hashBytes(value) {
  return sha256(bytes(value));
}

function hashCanonical(value) {
  return sha256(canonicalEvidenceJson(value));
}

/** Normalize only extraction whitespace; do not remove content or metadata. */
export function normalizeExtractedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Build named hashes for representations that are actually available.
 * Null means that representation was not observed; it is never synthesized
 * from another layer.
 */
export function createEvidenceHashes({
  responseBody,
  extractedText,
  structuredData,
  renderedDom,
  evidence,
  artifact,
} = {}) {
  return {
    hash_schema_version: EVIDENCE_HASH_SCHEMA_VERSION,
    response_body_hash: responseBody == null ? null : hashBytes(responseBody),
    rendered_dom_hash: renderedDom == null ? null : hashBytes(renderedDom),
    extracted_text_hash: extractedText == null ? null : hashBytes(normalizeExtractedText(extractedText)),
    structured_data_hash: structuredData == null ? null : hashCanonical(structuredData),
    evidence_hash: evidence == null ? null : hashCanonical(evidence),
    artifact_hash: artifact == null ? null : hashCanonical(artifact),
  };
}

/** Explicit legacy meaning for snapshots and connector payloads during migration. */
export const LEGACY_CONTENT_HASH_SEMANTICS = 'extracted_text_v1';

/**
 * Canonical shape of the persisted pages/index.json record. The artifact hash
 * is intentionally excluded so the hash does not contain itself; verification
 * recomputes this exact record shape and compares it with the stored claim.
 */
export function pageArtifactRecord(page) {
  return {
    url: page.url,
    status: page.status,
    title: page.title,
    canonicals: page.canonicals,
    noindex: page.noindex,
    wordCount: page.wordCount,
    sourceFile: page.sourceFile,
    requested_url: page.requestedUrl ?? null,
    effective_url: page.url,
    declared_canonical_url: page.canonicals?.[0] ?? null,
    resource_id: page.urlIdentity?.resource_id ?? null,
    url_identity: page.urlIdentity ?? null,
    hash_schema_version: page.hash_schema_version ?? null,
    response_body_hash: page.response_body_hash ?? null,
    rendered_dom_hash: page.rendered_dom_hash ?? null,
    extracted_text_hash: page.extracted_text_hash ?? null,
    structured_data_hash: page.structured_data_hash ?? null,
    evidence_hash: page.evidence_hash ?? null,
    contentHash: page.extracted_text_hash ?? null,
    hash_semantics: LEGACY_CONTENT_HASH_SEMANTICS,
  };
}

export function hashPageArtifact(page) {
  return hashCanonical(pageArtifactRecord(page));
}

/** Bind a determination/finding to the representation its hash actually covers. */
export function evidenceIdentity(hashes, representation) {
  const field = `${representation}_hash`;
  const hash = hashes?.[field];
  if (!['response_body', 'rendered_dom', 'extracted_text', 'structured_data', 'evidence', 'artifact'].includes(representation)) {
    throw new TypeError(`unknown evidence representation: ${representation}`);
  }
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`evidence representation is unavailable: ${representation}`);
  }
  return { hash_schema_version: hashes.hash_schema_version ?? EVIDENCE_HASH_SCHEMA_VERSION, representation, hash };
}
