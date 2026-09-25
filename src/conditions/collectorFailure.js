import { COLLECTOR_FAILURES } from "./constants.js";

/**
 * Maps network error codes, HTTP statuses, and collector signals to standard
 * collector failure codes (B-014 invariant).
 */
export function classifyCollectorError(err) {
  if (!err) return null;
  const str = String(typeof err === "string" ? err : err.code || err.message || "").toUpperCase();

  if (str.includes("ENOTFOUND") || str.includes("EAI_AGAIN") || str.includes("DNS_FAILED") || str.includes("DNS_PREFLIGHT")) {
    return COLLECTOR_FAILURES.DNS_FAILED;
  }
  if (str.includes("ETIMEDOUT") || str.includes("TIMEOUT") || str.includes("FETCH_TIMEOUT") || str.includes("CONNECT_TIMEOUT")) {
    return COLLECTOR_FAILURES.TIMEOUT;
  }
  if (str.includes("403") || str.includes("BLOCKED") || str.includes("FORBIDDEN") || str.includes("FETCH_REDIRECT_ORIGIN")) {
    return COLLECTOR_FAILURES.BLOCKED;
  }
  if (str.includes("CAPTCHA") || str.includes("CHALLENGE_WALL") || str.includes("CLOUDFLARE")) {
    return COLLECTOR_FAILURES.CAPTCHA;
  }
  if (str.includes("429") || str.includes("RATE_LIMIT") || str.includes("TOO_MANY_REQUESTS")) {
    return COLLECTOR_FAILURES.RATE_LIMITED;
  }
  if (str.includes("PARSER_FAILED") || str.includes("PARSE_ERROR") || str.includes("XML_PARSE")) {
    return COLLECTOR_FAILURES.PARSER_FAILED;
  }
  return null;
}

/**
 * Evaluates whether a subject or its fetch attempt experienced a collector failure.
 */
export function detectCollectorFailure(subject, ctx = {}) {
  if (!subject) return null;

  // Direct failure attached to subject or hit
  if (subject.collector_failure && Object.values(COLLECTOR_FAILURES).includes(subject.collector_failure)) {
    return subject.collector_failure;
  }

  // Check page resource validity and HTTP status
  if (subject.type === "page" && ctx.site?.pages) {
    const page = ctx.site.pages.find((p) => p.url === subject.identifier || p.url === subject.url);
    if (page) {
      if (page.resourceValidity?.signals?.challenge_wall) return COLLECTOR_FAILURES.CAPTCHA;
      if (page.status === 429) return COLLECTOR_FAILURES.RATE_LIMITED;
      if (page.status === 403) return COLLECTOR_FAILURES.BLOCKED;
      if (page.parseError || page.resourceValidity?.reason_codes?.includes("parser_failed")) {
        return COLLECTOR_FAILURES.PARSER_FAILED;
      }
    const reasonCodes = page.resourceValidity?.reason_codes || [];
    for (const rc of reasonCodes) {
      const classified = classifyCollectorError(rc);
      if (classified) return classified;
    }
    for (const attempt of page.fetchAttempts || []) {
      const classified = classifyCollectorError(attempt.errorCode);
      if (classified) return classified;
    }
  }
}

  // Check site-level fetch errors
  if (ctx.site?.fetchErrors?.length) {
    const ident = (subject.url || subject.identifier || "").toLowerCase();
    let subjectHost = "";
    try {
      if (subject.url) subjectHost = new URL(subject.url).hostname.toLowerCase();
      else if (subject.identifier?.startsWith("http")) subjectHost = new URL(subject.identifier).hostname.toLowerCase();
    } catch {}

    for (const err of ctx.site.fetchErrors) {
      const errStr = String(err);
      const lower = errStr.toLowerCase();
      const isTargeted = lower.includes("http://") || lower.includes("https://");
      if (isTargeted) {
        if (ident && lower.includes(ident)) {
          const classified = classifyCollectorError(errStr);
          if (classified) return classified;
        }
      } else {
        if (!subjectHost || lower.includes(subjectHost) || !isTargeted) {
          const classified = classifyCollectorError(errStr);
          if (classified) return classified;
        }
      }
    }
  }

  return null;
}
