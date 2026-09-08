/**
 * Governed Exception Lifecycle & Expiry Review.
 *
 * Provides inspection, renewal, and revocation of entries in .citable/exceptions.yaml
 * under strict schema, reviewer authority, and audit trail rules.
 *
 * Governed Invariants:
 * - Expired exceptions fail closed and are surfaced explicitly.
 * - Renewals require an active, authorized reviewer and cannot exceed policy or renewal limits.
 * - Revocations and renewals append immutable audit history events.
 * - Candidate registries are validated against exception.schema.json before saving.
 */

import { loadRegistries, saveRegistry } from "../registries/index.js";
import { validateAgainst } from "../shared/schemaValidator.js";
import { parseRefDate, sha256 } from "../shared/io.js";

export function listExceptions(root, {
  expiredOnly = false,
  expiringSoonDays = 14,
  refDate = null,
} = {}) {
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join("; ")}`);

  const ref = parseRefDate(refDate);
  const entries = registries.exceptions?.entries || [];

  const evaluated = entries.map((entry) => {
    const expiresAt = new Date(entry.expires_at);
    const isExpired = expiresAt < ref;
    const daysRemaining = Math.ceil((expiresAt.getTime() - ref.getTime()) / 86400000);
    const isExpiringSoon = !isExpired && daysRemaining <= Number(expiringSoonDays) && daysRemaining >= 0;

    let computedStatus = entry.status;
    if (entry.status === "revoked") computedStatus = "revoked";
    else if (entry.status === "superseded") computedStatus = "superseded";
    else if (isExpired) computedStatus = "expired";
    else if (isExpiringSoon) computedStatus = "expiring_soon";

    return {
      exception_id: entry.exception_id,
      policy_id: entry.policy_id,
      status: entry.status,
      computed_status: computedStatus,
      is_expired: isExpired,
      is_expiring_soon: isExpiringSoon,
      days_remaining: daysRemaining,
      created_at: entry.created_at,
      expires_at: entry.expires_at,
      renewal_count: entry.renewal_count,
      renewal_limit: entry.renewal_limit,
      owner_reviewer_id: entry.owner_reviewer_id,
      reason: entry.reason,
      finding_ids: entry.finding_ids,
    };
  });

  const filtered = expiredOnly
    ? evaluated.filter((e) => e.is_expired)
    : evaluated;

  const summary = {
    total: evaluated.length,
    active: evaluated.filter((e) => e.computed_status === "approved").length,
    expiring_soon: evaluated.filter((e) => e.is_expiring_soon).length,
    expired: evaluated.filter((e) => e.is_expired).length,
    revoked: evaluated.filter((e) => e.status === "revoked").length,
    superseded: evaluated.filter((e) => e.status === "superseded").length,
  };

  return {
    exceptions: filtered,
    summary,
  };
}

export function renewException(root, {
  id,
  until,
  reviewer,
  evidence = null,
  note = null,
  write = false,
  refDate = null,
} = {}) {
  if (!id) throw new Error("--id <exception-id> is required to renew an exception");
  if (!until) throw new Error("--until <YYYY-MM-DD> is required to renew an exception");
  if (!reviewer) throw new Error("--reviewer <reviewer-id> is required to renew an exception");

  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join("; ")}`);

  const exceptions = registries.exceptions?.entries || [];
  const entryIndex = exceptions.findIndex((e) => e.exception_id === id);
  if (entryIndex === -1) throw new Error(`exception not found: ${id}`);

  const entry = structuredClone(exceptions[entryIndex]);
  if (entry.status === "revoked") throw new Error(`cannot renew revoked exception: ${id}`);
  if (entry.status === "superseded") throw new Error(`cannot renew superseded exception: ${id}`);

  // Verify reviewer authority
  const reviewers = registries.reviewers?.entries || [];
  const rev = reviewers.find((r) => r.reviewer_id === reviewer);
  if (!rev || rev.status !== "active") {
    throw new Error(`reviewer not found or inactive: ${reviewer}`);
  }

  // Check renewal limits
  if (entry.renewal_count >= entry.renewal_limit) {
    throw new Error(`exception ${id} has reached its renewal limit (${entry.renewal_limit})`);
  }

  const ref = parseRefDate(refDate);
  const untilIso = until.includes("T") ? until : `${until}T23:59:59.999Z`;
  const newExpiry = new Date(untilIso);

  if (Number.isNaN(newExpiry.getTime())) {
    throw new Error(`invalid renewal date format: ${until}`);
  }
  if (newExpiry <= ref) {
    throw new Error("renewal date must be in the future relative to the reference date");
  }
  if (newExpiry <= new Date(entry.expires_at)) {
    throw new Error("renewal date must extend past current expiration date");
  }

  // Check review policy limits if defined
  const policies = registries.review_policies?.entries || [];
  const policy = policies.find((p) => p.policy_id === entry.policy_id);
  if (policy) {
    if (entry.renewal_count + 1 > policy.max_renewals) {
      throw new Error(`renewal would exceed policy max_renewals (${policy.max_renewals})`);
    }
    const durationDays = (newExpiry.getTime() - new Date(entry.created_at).getTime()) / 86400000;
    if (durationDays > policy.max_exception_days) {
      throw new Error(`renewal would exceed policy max_exception_days (${policy.max_exception_days} days)`);
    }
  }

  entry.renewal_count += 1;
  entry.expires_at = newExpiry.toISOString();

  if (evidence && !entry.evidence_ids.includes(evidence)) {
    entry.evidence_ids.push(evidence);
    entry.evidence_hashes[evidence] = sha256(evidence);
  }

  entry.audit_history.push({
    timestamp: new Date().toISOString(),
    actor_reviewer_id: reviewer,
    action: "renewed",
    note: note || `Renewed until ${until} by ${reviewer}`,
  });

  const updatedEntries = [...exceptions];
  updatedEntries[entryIndex] = entry;

  const candidate = {
    ...registries.exceptions,
    updated: new Date().toISOString(),
    entries: updatedEntries,
  };

  const check = validateAgainst("exception.schema.json", candidate);
  if (!check.valid) {
    throw new Error(`renewed exception violates schema: ${check.errors.join("; ")}`);
  }

  if (write) {
    saveRegistry(root, "exceptions", candidate);
  }

  return {
    exception_id: id,
    expires_at: entry.expires_at,
    renewal_count: entry.renewal_count,
    renewal_limit: entry.renewal_limit,
    written: write,
  };
}

export function invalidateException(root, {
  id,
  reason,
  reviewer,
  write = false,
} = {}) {
  if (!id) throw new Error("--id <exception-id> is required to invalidate an exception");
  if (!reason) throw new Error("--reason <text> is required to invalidate an exception");
  if (!reviewer) throw new Error("--reviewer <reviewer-id> is required to record who revoked the exception");

  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join("; ")}`);

  const exceptions = registries.exceptions?.entries || [];
  const entryIndex = exceptions.findIndex((e) => e.exception_id === id);
  if (entryIndex === -1) throw new Error(`exception not found: ${id}`);

  const entry = structuredClone(exceptions[entryIndex]);
  if (entry.status === "revoked") throw new Error(`exception ${id} is already revoked`);

  // Verify reviewer authority
  const reviewers = registries.reviewers?.entries || [];
  const rev = reviewers.find((r) => r.reviewer_id === reviewer);
  if (!rev || rev.status !== "active") {
    throw new Error(`reviewer not found or inactive: ${reviewer}`);
  }

  entry.status = "revoked";
  entry.audit_history.push({
    timestamp: new Date().toISOString(),
    actor_reviewer_id: reviewer,
    action: "revoked",
    note: reason,
  });

  const updatedEntries = [...exceptions];
  updatedEntries[entryIndex] = entry;

  const candidate = {
    ...registries.exceptions,
    updated: new Date().toISOString(),
    entries: updatedEntries,
  };

  const check = validateAgainst("exception.schema.json", candidate);
  if (!check.valid) {
    throw new Error(`revoked exception violates schema: ${check.errors.join("; ")}`);
  }

  if (write) {
    saveRegistry(root, "exceptions", candidate);
  }

  return {
    exception_id: id,
    status: "revoked",
    written: write,
  };
}
