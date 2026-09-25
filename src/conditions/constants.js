/**
 * Condition, determination, and transition constants.
 */

export const DETERMINATION_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  WARNING: "WARNING",
  INDETERMINATE: "INDETERMINATE",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  NOT_TESTED: "NOT_TESTED",
  ERROR: "ERROR",
});

export const VALID_DETERMINATION_STATUSES = new Set(Object.values(DETERMINATION_STATUS));

export const TRANSITION_TYPES = Object.freeze({
  NEW_FAILURE: "NEW_FAILURE",
  REGRESSION: "REGRESSION",
  RESOLVED: "RESOLVED",
  UNCHANGED_FAILURE: "UNCHANGED_FAILURE",
  NEWLY_APPLICABLE: "NEWLY_APPLICABLE",
  NO_LONGER_APPLICABLE: "NO_LONGER_APPLICABLE",
});

export const COLLECTOR_FAILURES = Object.freeze({
  DNS_FAILED: "DNS_FAILED",
  TIMEOUT: "TIMEOUT",
  BLOCKED: "BLOCKED",
  CAPTCHA: "CAPTCHA",
  RATE_LIMITED: "RATE_LIMITED",
  PARSER_FAILED: "PARSER_FAILED",
});

export const VALID_COLLECTOR_FAILURES = new Set(Object.values(COLLECTOR_FAILURES));

export const SITE_PROFILES = Object.freeze({
  CONTENT_ONLY: "content_only",
  ECOMMERCE: "ecommerce",
  SAAS: "saas",
  LEADGEN: "leadgen",
  PUBLISHER: "publisher",
  LOCAL: "local",
  API_DOCS: "api-docs",
});
