import { sha256 } from '../../shared/io.js';

// Sensitive key patterns: headers, storage keys, query parameters, payload fields
export const SENSITIVE_KEY_PATTERN = /(?:^|[-_])(?:authorization|bearer|token|secret|apiKey|api[-_]?key|password|credential|access[-_]?token|refresh[-_]?token|jwt|session(?:[-_]?id)?|csrf|xsrf|cvv|cvc|ssn|credit[-_]?card|passwd|auth[-_]?token|oauth[-_]?token|auth[-_]?code|code)(?:$|[-_])|^(?:cookie|set[-_]?cookie)$/i;

// Sensitive value patterns: bearer tokens, common API keys, JWT tokens, card numbers
export const SENSITIVE_VALUE_PATTERN = /(?:bearer\s+[a-zA-Z0-9_\-.]{10,}|(?:ghp|gho|glpat|ya29|sk-[a-zA-Z0-9]{20,})|eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|\b(?:\d[ -]*?){13,16}\b)/i;

export const REDACTED_MARKER = '[REDACTED_SECRET]';
export const FILTERED_MARKER = '[FILTERED]';
export const POLICY_RESTRICTED_MARKER = '[POLICY_RESTRICTED]';

/**
 * Check if a field/header/cookie/param key is sensitive.
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Check if a string value contains sensitive tokens or patterns.
 */
export function isSensitiveValue(value) {
  if (typeof value !== 'string') return false;
  return SENSITIVE_VALUE_PATTERN.test(value);
}

/**
 * Sanitize headers against allowlist and sensitive key/value rules.
 * Even if a sensitive header is allowlisted, it MUST be redacted.
 */
export function sanitizeHeaders(headers, allowedNames = null) {
  if (!headers || typeof headers !== 'object') {
    return { headers: null, status: 'not_requested', redactedCount: 0, filteredCount: 0 };
  }
  const allowedSet = Array.isArray(allowedNames) ? new Set(allowedNames.map((n) => n.toLowerCase())) : null;
  const result = {};
  let redactedCount = 0;
  let filteredCount = 0;

  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    // Sensitive keys are unconditionally redacted or omitted
    if (isSensitiveKey(key)) {
      if (allowedSet && allowedSet.has(key)) {
        result[key] = REDACTED_MARKER;
        redactedCount++;
      } else {
        filteredCount++;
      }
      continue;
    }

    // Non-sensitive keys: must be explicitly allowed if allowedSet is provided
    if (allowedSet && !allowedSet.has(key)) {
      filteredCount++;
      continue;
    }

    // Value sanitization
    const strVal = String(rawVal ?? '');
    if (isSensitiveValue(strVal)) {
      result[key] = REDACTED_MARKER;
      redactedCount++;
    } else {
      result[key] = strVal;
    }
  }

  const hasEntries = Object.keys(result).length > 0;
  let status = 'captured';
  if (!hasEntries) {
    status = filteredCount > 0 ? 'filtered' : 'not_requested';
  } else if (redactedCount > 0) {
    status = 'redacted';
  }

  return {
    headers: hasEntries ? result : null,
    status,
    redactedCount,
    filteredCount,
  };
}

/**
 * Sanitize URL query parameters according to allowlist.
 */
export function sanitizeQueryParams(urlStr, allowedParams = null) {
  if (!urlStr) return { query: null, status: 'none_present', redactedCount: 0, filteredFields: [] };
  if (!allowedParams || !Array.isArray(allowedParams) || allowedParams.length === 0) {
    return { query: null, status: 'not_requested', redactedCount: 0, filteredFields: [] };
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { query: null, status: 'none_present', redactedCount: 0, filteredFields: [] };
  }

  const searchParams = parsed.searchParams;
  if (!searchParams || Array.from(searchParams.keys()).length === 0) {
    return { query: null, status: 'none_present', redactedCount: 0, filteredFields: [] };
  }

  const allowedSet = new Set(allowedParams.map((p) => p.toLowerCase()));
  const query = {};
  let redactedCount = 0;
  const filteredFields = [];

  for (const [key, val] of searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (isSensitiveKey(lowerKey)) {
      if (allowedSet.has(lowerKey)) {
        query[key] = REDACTED_MARKER;
        redactedCount++;
      } else {
        filteredFields.push(key);
      }
      continue;
    }

    if (!allowedSet.has(lowerKey)) {
      filteredFields.push(key);
      continue;
    }

    if (isSensitiveValue(val)) {
      query[key] = REDACTED_MARKER;
      redactedCount++;
    } else {
      query[key] = val;
    }
  }

  const hasEntries = Object.keys(query).length > 0;
  let status = 'captured';
  if (!hasEntries) {
    status = filteredFields.length > 0 ? 'filtered' : 'none_present';
  } else if (redactedCount > 0) {
    status = 'redacted';
  }

  return {
    query: hasEntries ? query : null,
    status,
    redactedCount,
    filteredFields,
  };
}

/**
 * Safely deep-clone an object with cycle detection, depth limits, field allowlists,
 * and sensitive-value redaction.
 */
export function safeJsonClone(value, options = {}) {
  const {
    maxDepth = 5,
    maxBytes = 4096,
    maxFieldSize = 1024,
    allowedFields = null,
    hashFields = null,
    redactFields = null,
    seen = new WeakSet(),
    depth = 0,
    stats = { redactedCount: 0, filteredFields: [] },
  } = options;

  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean' || typeof value === 'number') return value;

  if (typeof value === 'string') {
    if (isSensitiveValue(value)) {
      stats.redactedCount++;
      return REDACTED_MARKER;
    }
    if (value.length > maxFieldSize) {
      return value.slice(0, maxFieldSize) + '...[TRUNCATED]';
    }
    return value;
  }

  if (depth >= maxDepth) return '[DEPTH_LIMIT]';

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => safeJsonClone(item, { ...options, depth: depth + 1, seen, stats }));
    }

    const copy = {};
    const allowedSet = allowedFields ? new Set(allowedFields) : null;
    const hashSet = hashFields ? new Set(hashFields) : null;
    const redactSet = redactFields ? new Set(redactFields) : null;

    for (const k of Object.getOwnPropertyNames(value)) {
      // Check allowlist first: if not allowed, filter it out
      if (allowedSet && !allowedSet.has(k)) {
        stats.filteredFields.push(k);
        continue;
      }

      // If allowed (or no allowlist specified), check if k is sensitive or in redactSet
      if (isSensitiveKey(k) || (redactSet && redactSet.has(k))) {
        copy[k] = REDACTED_MARKER;
        stats.redactedCount++;
        continue;
      }

      let v;
      try {
        v = value[k];
      } catch {
        v = '[GETTER_ERROR]';
      }

      // Check hash fields
      if (hashSet && hashSet.has(k)) {
        copy[k] = `sha256:${sha256(typeof v === 'string' ? v : JSON.stringify(v))}`;
        continue;
      }

      copy[k] = safeJsonClone(v, { ...options, depth: depth + 1, seen, stats });
    }
    return copy;
  }

  return String(value);
}

/**
 * Sanitize request or response payloads (body).
 */
export function sanitizePayload(payload, options = {}) {
  const {
    allowedFields = null,
    hashOnly = false,
    maxBytes = 4096,
    maxDepth = 5,
  } = options;

  if (payload == null || payload === '') {
    return { sanitized: null, hash: null, bytes: 0, status: 'unavailable', redactedCount: 0, filteredFields: [] };
  }

  // Handle binary buffers without unsafe UTF-8 string coercion
  if (Buffer.isBuffer(payload)) {
    const isBinary = payload.some((byte) => byte === 0);
    if (isBinary) {
      const hash = sha256(payload);
      return {
        sanitized: null,
        hash,
        bytes: payload.length,
        status: hashOnly ? 'hash_only' : 'unavailable',
        redactedCount: 0,
        filteredFields: [],
      };
    }
  }

  const rawString = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : JSON.stringify(payload);
  const bytes = Buffer.byteLength(rawString, 'utf8');
  const hash = sha256(rawString);

  if (hashOnly) {
    return { sanitized: null, hash, bytes, status: 'hash_only', redactedCount: 0, filteredFields: [] };
  }

  // Try parsing JSON if allowedFields or structured redaction is requested
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(rawString);
  } catch {
    parsedJson = null;
  }

  const stats = { redactedCount: 0, filteredFields: [] };

  if (parsedJson && typeof parsedJson === 'object') {
    const cloned = safeJsonClone(parsedJson, {
      maxDepth,
      maxBytes,
      allowedFields,
      stats,
    });
    const hasAllowedEntries = cloned !== null && typeof cloned === 'object' && Object.keys(cloned).length > 0;
    let status = 'captured';
    if (!hasAllowedEntries && allowedFields && allowedFields.length > 0) {
      status = 'filtered';
    } else if (rawString.length > maxBytes) {
      status = 'truncated';
    }
    return {
      sanitized: cloned,
      hash,
      bytes,
      status,
      redactedCount: stats.redactedCount,
      filteredFields: stats.filteredFields,
    };
  }

  // Raw text payload
  if (isSensitiveValue(rawString)) {
    return { sanitized: REDACTED_MARKER, hash, bytes, status: 'captured', redactedCount: 1, filteredFields: [] };
  }

  const isTruncated = rawString.length > maxBytes;
  const truncated = isTruncated ? rawString.slice(0, maxBytes) + '...[TRUNCATED]' : rawString;
  return {
    sanitized: truncated,
    hash,
    bytes,
    status: isTruncated ? 'truncated' : 'captured',
    redactedCount: 0,
    filteredFields: [],
  };
}
