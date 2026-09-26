/**
 * Suppression Registry, Deduplication, and Frequency Control (B-084).
 *
 * Invariants:
 * 1. Suppression overrides campaign logic.
 * 2. Two agents cannot independently contact the same editor for the same opportunity.
 * 3. Enforces domain and contact frequency limits.
 */

export class OutreachSuppressionRegistry {
  constructor() {
    this._suppressedEmails = new Map(); // email -> { reason, added_at }
    this._suppressedDomains = new Map(); // domain -> { reason, added_at }
    this._activeEngagements = new Map(); // key = opp_id|email -> { agent_id, started_at }
    this._contactHistory = new Map(); // email -> array of timestamps
    this._frequencyCappedCount = 0;
  }

  suppressEmail(email, reason = "DO_NOT_CONTACT") {
    if (!email) return;
    this._suppressedEmails.set(email.toLowerCase().trim(), {
      reason,
      added_at: new Date().toISOString(),
    });
  }

  suppressDomain(domain, reason = "DOMAIN_BLOCKED") {
    if (!domain) return;
    this._suppressedDomains.set(domain.toLowerCase().trim(), {
      reason,
      added_at: new Date().toISOString(),
    });
  }

  isSuppressed(email, domain = null) {
    if (email) {
      const e = email.toLowerCase().trim();
      if (this._suppressedEmails.has(e)) {
        return {
          suppressed: true,
          scope: "EMAIL",
          reason: this._suppressedEmails.get(e).reason,
        };
      }
    }

    if (domain) {
      const d = domain.toLowerCase().trim();
      if (this._suppressedDomains.has(d)) {
        return {
          suppressed: true,
          scope: "DOMAIN",
          reason: this._suppressedDomains.get(d).reason,
        };
      }
    }

    return { suppressed: false, reason: null };
  }

  /**
   * Reserves an engagement for an opportunity and recipient, preventing multiple agents from colliding.
   */
  reserveEngagement({ agentId, opportunityId, recipientEmail, cooldownDays = 30 }) {
    if (!agentId || !opportunityId || !recipientEmail) {
      throw new Error("agentId, opportunityId, and recipientEmail are required");
    }

    const normEmail = recipientEmail.toLowerCase().trim();
    const engagementKey = `${opportunityId}|${normEmail}`;

    // Check suppression first: suppression overrides campaign logic
    const suppression = this.isSuppressed(normEmail);
    if (suppression.suppressed) {
      return {
        allowed: false,
        reason: `SUPPRESSED: Target ${normEmail} is suppressed (${suppression.reason})`,
      };
    }

    // Invariant: Two agents cannot independently contact the same editor for the same opportunity
    const existing = this._activeEngagements.get(engagementKey);
    if (existing && existing.agent_id !== agentId) {
      return {
        allowed: false,
        reason: `DEDUPLICATION_CONFLICT: Agent "${existing.agent_id}" is already actively engaging ${normEmail} for opportunity "${opportunityId}"`,
      };
    }

    // Check frequency cooldown
    const history = this._contactHistory.get(normEmail) || [];
    const now = Date.now();
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    const recent = history.filter((ts) => now - ts < cooldownMs);
    if (recent.length > 0) {
      this._frequencyCappedCount++;
      return {
        allowed: false,
        reason: `FREQUENCY_CAP_EXCEEDED: Recipient ${normEmail} was contacted within the last ${cooldownDays} days`,
      };
    }

    this._activeEngagements.set(engagementKey, {
      agent_id: agentId,
      started_at: new Date().toISOString(),
    });

    return { allowed: true, engagement_key: engagementKey };
  }

  recordContactSent(recipientEmail) {
    const norm = recipientEmail.toLowerCase().trim();
    const history = this._contactHistory.get(norm) || [];
    history.push(Date.now());
    this._contactHistory.set(norm, history);
  }

  releaseEngagement(opportunityId, recipientEmail) {
    const normEmail = recipientEmail.toLowerCase().trim();
    const engagementKey = `${opportunityId}|${normEmail}`;
    return this._activeEngagements.delete(engagementKey);
  }

  getSummary() {
    return {
      total_suppressed_contacts: this._suppressedEmails.size + this._suppressedDomains.size,
      frequency_cap_contacts: this._frequencyCappedCount,
    };
  }

  clear() {
    this._suppressedEmails.clear();
    this._suppressedDomains.clear();
    this._activeEngagements.clear();
    this._contactHistory.clear();
    this._frequencyCappedCount = 0;
  }
}
