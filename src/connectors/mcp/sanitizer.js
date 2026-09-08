/**
 * Sanitizer for Model Context Protocol (MCP) transports.
 *
 * Security Invariants:
 * - Credentials, bearer tokens, API keys, and secret parameters must never
 *   persist into raw or normalized observation packages.
 * - Counts redactions accurately for envelope provenance.
 */

const SENSITIVE_KEY_PATTERN = /^(authorization|bearer|token|secret|apiKey|api_key|password|credential|access_token|refresh_token)$/i;
const SENSITIVE_VALUE_PATTERN = /(?:bearer\s+[a-zA-Z0-9_\-.]{10,}|(?:ghp|gho|glpat|ya29|sk-[a-zA-Z0-9]{20,}))/i;

export function sanitizeSecrets(value, countRef = { count: 0 }) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (SENSITIVE_VALUE_PATTERN.test(value)) {
      countRef.count++;
      return "[REDACTED_SECRET]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecrets(item, countRef));
  }
  if (typeof value === "object") {
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        copy[k] = "[REDACTED_SECRET]";
        countRef.count++;
      } else {
        copy[k] = sanitizeSecrets(v, countRef);
      }
    }
    return copy;
  }
  return value;
}
