import { sha256 } from "./utils.js";

const DEFAULT_BOUNCE_THRESHOLD = 0.05; // 5% bounce rate threshold
const DEFAULT_SPAM_COMPLAINT_THRESHOLD = 0.001; // 0.1% spam complaint threshold

const KILL_SWITCH_LEVELS = [
  "organization",
  "sender",
  "campaign",
  "strategy",
  "agent",
  "domain",
];

/**
 * Deliverability Monitoring, Circuit Breaker, and Multi-level Kill Switches (B-087).
 *
 * Invariants:
 * 1. SPF, DKIM, DMARC and bounce/spam reputation are monitored.
 * 2. Threshold breach halts campaign and trips circuit breaker, requiring explicit reauthorization.
 * 3. Kill switches exist across 6 explicit hierarchy levels.
 */
export class OutreachDeliverabilityMonitor {
  constructor(campaignId, config = {}) {
    if (!campaignId) {
      const generated = `cmp_out_${sha256(String(Date.now())).slice(0, 16)}`;
      this.campaignId = generated;
    } else {
      this.campaignId = campaignId.startsWith("cmp_out_")
        ? campaignId
        : `cmp_out_${sha256(campaignId).slice(0, 16)}`;
    }

    this.bounceThreshold = config.bounceThreshold ?? DEFAULT_BOUNCE_THRESHOLD;
    this.spamComplaintThreshold = config.spamComplaintThreshold ?? DEFAULT_SPAM_COMPLAINT_THRESHOLD;

    this.deliverabilityHealth = {
      spf_valid: config.spf_valid ?? true,
      dkim_valid: config.dkim_valid ?? true,
      dmarc_aligned: config.dmarc_aligned ?? true,
      bounce_rate: config.bounce_rate ?? 0.0,
      spam_complaint_rate: config.spam_complaint_rate ?? 0.0,
    };

    this.circuitBreaker = {
      state: "HEALTHY", // "HEALTHY" | "TRIPPED_HALTED" | "EXPLICITLY_REAUTHORIZED"
      tripped_reason: null,
      tripped_at: null,
      reauthorized_by: null,
      reauthorized_at: null,
    };

    this.killSwitches = {
      organization_halted: false,
      sender_halted: false,
      campaign_halted: false,
      strategy_halted: false,
      agent_halted: false,
      domain_halted: false,
    };

    this.updatedAt = new Date().toISOString();
  }

  updateDeliverabilityMetrics({
    spf_valid,
    dkim_valid,
    dmarc_aligned,
    bounce_rate,
    spam_complaint_rate,
  }) {
    if (spf_valid !== undefined) this.deliverabilityHealth.spf_valid = Boolean(spf_valid);
    if (dkim_valid !== undefined) this.deliverabilityHealth.dkim_valid = Boolean(dkim_valid);
    if (dmarc_aligned !== undefined) this.deliverabilityHealth.dmarc_aligned = Boolean(dmarc_aligned);
    if (bounce_rate !== undefined) this.deliverabilityHealth.bounce_rate = Number(bounce_rate);
    if (spam_complaint_rate !== undefined) this.deliverabilityHealth.spam_complaint_rate = Number(spam_complaint_rate);

    this.updatedAt = new Date().toISOString();

    // Check thresholds: breach trips circuit breaker automatically
    const reasons = [];
    if (!this.deliverabilityHealth.spf_valid) reasons.push("SPF authentication failed");
    if (!this.deliverabilityHealth.dkim_valid) reasons.push("DKIM authentication failed");
    if (!this.deliverabilityHealth.dmarc_aligned) reasons.push("DMARC alignment failed");
    if (this.deliverabilityHealth.bounce_rate > this.bounceThreshold) {
      reasons.push(
        `Bounce rate ${this.deliverabilityHealth.bounce_rate} exceeded threshold ${this.bounceThreshold}`
      );
    }
    if (this.deliverabilityHealth.spam_complaint_rate > this.spamComplaintThreshold) {
      reasons.push(
        `Spam complaint rate ${this.deliverabilityHealth.spam_complaint_rate} exceeded threshold ${this.spamComplaintThreshold}`
      );
    }

    if (reasons.length > 0 && this.circuitBreaker.state !== "EXPLICITLY_REAUTHORIZED") {
      this.circuitBreaker.state = "TRIPPED_HALTED";
      this.circuitBreaker.tripped_reason = `CIRCUIT_BREAKER_TRIPPED: ${reasons.join("; ")}`;
      this.circuitBreaker.tripped_at = this.updatedAt;
    }

    return this.circuitBreaker;
  }

  reauthorizeCircuitBreaker(operatorIdentity) {
    if (!operatorIdentity) {
      throw new Error("Explicit operator identity is required to reauthorize a tripped circuit breaker");
    }
    this.circuitBreaker.state = "EXPLICITLY_REAUTHORIZED";
    this.circuitBreaker.reauthorized_by = operatorIdentity;
    this.circuitBreaker.reauthorized_at = new Date().toISOString();
    this.updatedAt = this.circuitBreaker.reauthorized_at;
  }

  setKillSwitch(level, halted = true) {
    const key = `${level.toLowerCase()}_halted`;
    if (!(key in this.killSwitches)) {
      throw new Error(`Invalid kill switch level: "${level}". Valid levels: ${KILL_SWITCH_LEVELS.join(", ")}`);
    }
    this.killSwitches[key] = Boolean(halted);
    this.updatedAt = new Date().toISOString();
  }

  isExecutionHalted(scopeContext = {}) {
    // 1. Any kill switch triggered halts execution
    if (this.killSwitches.organization_halted) {
      return { halted: true, reason: "Organization-level kill switch active" };
    }
    if (this.killSwitches.campaign_halted) {
      return { halted: true, reason: "Campaign-level kill switch active" };
    }
    if (scopeContext.sender && this.killSwitches.sender_halted) {
      return { halted: true, reason: "Sender-level kill switch active" };
    }
    if (scopeContext.strategy && this.killSwitches.strategy_halted) {
      return { halted: true, reason: "Strategy-level kill switch active" };
    }
    if (scopeContext.agent && this.killSwitches.agent_halted) {
      return { halted: true, reason: "Agent-level kill switch active" };
    }
    if (scopeContext.domain && this.killSwitches.domain_halted) {
      return { halted: true, reason: "Domain-level kill switch active" };
    }

    // 2. Circuit breaker check
    if (this.circuitBreaker.state === "TRIPPED_HALTED") {
      return {
        halted: true,
        reason: `Circuit breaker tripped: ${this.circuitBreaker.tripped_reason}; explicit human reauthorization required`,
      };
    }

    return { halted: false, reason: null };
  }

  getState(suppressionSummary = { total_suppressed_contacts: 0, frequency_cap_contacts: 0 }) {
    return {
      schema_version: 1,
      campaign_id: this.campaignId,
      deliverability_health: { ...this.deliverabilityHealth },
      circuit_breaker: { ...this.circuitBreaker },
      kill_switches: { ...this.killSwitches },
      suppression_summary: {
        total_suppressed_contacts: Number(suppressionSummary.total_suppressed_contacts ?? 0),
        frequency_cap_contacts: Number(suppressionSummary.frequency_cap_contacts ?? 0),
      },
      updated_at: this.updatedAt,
    };
  }
}
