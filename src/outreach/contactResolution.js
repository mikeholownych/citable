import { sha256 } from "../shared/io.js";

const BILLING_EMAIL_PATTERNS = [
  /^billing@/i,
  /^invoices?@/i,
  /^accounting@/i,
  /^accounts?@/i,
  /^payments?@/i,
  /^ap@/i,
  /^ar@/i,
  /^finance@/i,
];

const BILLING_ROLES = ["BILLING", "ACCOUNTING", "FINANCE", "INVOICING"];

/**
 * Public Contact Resolution (B-083).
 *
 * Invariants:
 * 1. Contact evidence retains its source.
 * 2. Private contact data is never inferred.
 * 3. A billing address is never repurposed as an editorial contact.
 */
export function resolvePublicContact({
  targetDomain,
  candidateContact = {},
  sourceEvidence = {},
  intendedRole = "EDITORIAL",
}) {
  if (!targetDomain) {
    throw new Error("targetDomain is required for contact resolution");
  }

  const {
    email,
    name,
    role = "EDITORIAL",
    is_inferred = false,
  } = candidateContact;

  const {
    source_url,
    evidence_snippet,
    retrieved_at,
  } = sourceEvidence;

  // Rule 1: Private contact data is never inferred
  if (is_inferred || !source_url || !evidence_snippet) {
    return {
      resolved: false,
      contact: null,
      refusal_reason: "PRIVATE_DATA_INFERRED: Inferred contact data without direct public crawl evidence is strictly prohibited",
    };
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return {
      resolved: false,
      contact: null,
      refusal_reason: "INVALID_CONTACT_DATA: Missing or invalid email address",
    };
  }

  // Rule 2: Billing address is never repurposed as an editorial contact
  const isBillingEmail = BILLING_EMAIL_PATTERNS.some((pattern) => pattern.test(email.trim()));
  const isBillingRole = BILLING_ROLES.includes(role.toUpperCase());

  if (isBillingEmail || isBillingRole) {
    return {
      resolved: false,
      contact: null,
      refusal_reason: `BILLING_ADDRESS_REJECTED: Billing or accounting contact (${email}) cannot be repurposed for editorial or partnership outreach`,
    };
  }

  const contactId = `cnt_${sha256(`${targetDomain}|${email.toLowerCase()}`).slice(0, 16)}`;

  return {
    resolved: true,
    refusal_reason: null,
    contact: {
      contact_id: contactId,
      domain: targetDomain,
      email: email.trim().toLowerCase(),
      name: name ? String(name).trim() : null,
      role: role.toUpperCase(),
      source_evidence: {
        source_url,
        evidence_snippet,
        retrieved_at: retrieved_at || new Date().toISOString(),
      },
      resolved_at: new Date().toISOString(),
    },
  };
}
