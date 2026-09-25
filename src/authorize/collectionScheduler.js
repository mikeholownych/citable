/**
 * Collection Scheduler with Hard Enforced Budgets (B-055).
 * Core authorization guard for collection requests.
 * Fails closed on per-query, per-provider, and per-project cost and request limits.
 */
export class SerpBudgetManager {
  constructor(budgetConfig = {}) {
    this.projectId = budgetConfig.project_id || "default_project";

    const rawLimits = budgetConfig.limits || {};
    this.limits = {
      daily_cost_limit_minor_units: rawLimits.daily_cost_limit_minor_units ?? 10000, // e.g. $100.00
      daily_request_limit: rawLimits.daily_request_limit ?? 500,
      per_query_daily_request_limit: rawLimits.per_query_daily_request_limit ?? 24,
      provider_limits: rawLimits.provider_limits || {},
    };

    const rawUsage = budgetConfig.usage || {};
    this.usage = {
      period_start: rawUsage.period_start || new Date().toISOString(),
      current_cost_minor_units: rawUsage.current_cost_minor_units ?? 0,
      current_request_count: rawUsage.current_request_count ?? 0,
      query_request_counts: { ...(rawUsage.query_request_counts || {}) },
      provider_usages: { ...(rawUsage.provider_usages || {}) },
    };

    const rawPolicy = budgetConfig.policy || {};
    this.policy = {
      fail_closed: rawPolicy.fail_closed ?? true,
      max_adaptive_frequency_multiplier: rawPolicy.max_adaptive_frequency_multiplier ?? 4.0,
    };
  }

  /**
   * Evaluates authorization for an upcoming collection request.
   * Fails closed if any limit would be exceeded.
   */
  authorizeCollection(request = {}) {
    const queryId = request.query_id || "adhoc_query";
    const providerName = String(request.provider || "default").toLowerCase();
    const estimatedCost = Number(request.estimated_cost_minor_units ?? 20); // 20 minor units default

    // 1. Check Project Daily Request Limit
    if (this.usage.current_request_count + 1 > this.limits.daily_request_limit) {
      return {
        authorized: false,
        refusal_code: "REFUSED_PROJECT_REQUESTS_EXCEEDED",
        reason: `project request limit exceeded (${this.usage.current_request_count}/${this.limits.daily_request_limit})`,
      };
    }

    // 2. Check Project Daily Cost Limit
    if (this.usage.current_cost_minor_units + estimatedCost > this.limits.daily_cost_limit_minor_units) {
      return {
        authorized: false,
        refusal_code: "REFUSED_PROJECT_COST_EXCEEDED",
        reason: `project cost limit exceeded (current ${this.usage.current_cost_minor_units} + est ${estimatedCost} > limit ${this.limits.daily_cost_limit_minor_units})`,
      };
    }

    // 3. Check Per-Query Daily Request Limit
    const queryCount = this.usage.query_request_counts[queryId] || 0;
    if (queryCount + 1 > this.limits.per_query_daily_request_limit) {
      return {
        authorized: false,
        refusal_code: "REFUSED_QUERY_LIMIT_EXCEEDED",
        reason: `query ${queryId} daily request limit exceeded (${queryCount}/${this.limits.per_query_daily_request_limit})`,
      };
    }

    // 4. Check Provider Specific Limits if configured
    const providerLimit = this.limits.provider_limits[providerName];
    if (providerLimit) {
      const providerUsage = this.usage.provider_usages[providerName] || { cost_minor_units: 0, request_count: 0 };
      if (providerUsage.request_count + 1 > providerLimit.daily_request_limit) {
        return {
          authorized: false,
          refusal_code: "REFUSED_PROVIDER_REQUESTS_EXCEEDED",
          reason: `provider ${providerName} request limit exceeded (${providerUsage.request_count}/${providerLimit.daily_request_limit})`,
        };
      }
      if (providerUsage.cost_minor_units + estimatedCost > providerLimit.daily_cost_limit_minor_units) {
        return {
          authorized: false,
          refusal_code: "REFUSED_PROVIDER_COST_EXCEEDED",
          reason: `provider ${providerName} cost limit exceeded (${providerUsage.cost_minor_units} + ${estimatedCost} > ${providerLimit.daily_cost_limit_minor_units})`,
        };
      }
    }

    return {
      authorized: true,
      refusal_code: null,
      reason: null,
    };
  }

  /**
   * Records completed collection execution and consumes budget.
   */
  recordUsage(request = {}, actualCostMinorUnits = 20) {
    const queryId = request.query_id || "adhoc_query";
    const providerName = String(request.provider || "default").toLowerCase();

    this.usage.current_request_count += 1;
    this.usage.current_cost_minor_units += actualCostMinorUnits;

    this.usage.query_request_counts[queryId] = (this.usage.query_request_counts[queryId] || 0) + 1;

    if (!this.usage.provider_usages[providerName]) {
      this.usage.provider_usages[providerName] = { cost_minor_units: 0, request_count: 0 };
    }
    this.usage.provider_usages[providerName].cost_minor_units += actualCostMinorUnits;
    this.usage.provider_usages[providerName].request_count += 1;
  }

  /**
   * Bounded Adaptive Scheduling (B-055):
   * Dynamically adjusts polling frequency based on SERP volatility,
   * but strictly caps adaptive frequency increases to avoid cost overrun.
   */
  requestAdaptiveFrequency(queryId, requestedMultiplier = 2.0, baseIntervalMinutes = 60) {
    const queryCount = this.usage.query_request_counts[queryId] || 0;
    const remainingQueryRequests = Math.max(0, this.limits.per_query_daily_request_limit - queryCount);

    const remainingProjectCost = Math.max(0, this.limits.daily_cost_limit_minor_units - this.usage.current_cost_minor_units);
    const estCostPerRequest = 20;
    const maxAffordableRequests = Math.floor(remainingProjectCost / estCostPerRequest);

    const safeRequestBudget = Math.min(remainingQueryRequests, maxAffordableRequests);

    // If no budget remains, cap multiplier to 0 or 1
    if (safeRequestBudget <= 0) {
      return {
        granted_multiplier: 1.0,
        granted_interval_minutes: baseIntervalMinutes,
        capped: true,
        reason: "budget exhausted; adaptive frequency increase refused",
      };
    }

    // Apply policy cap
    const policyCap = this.policy.max_adaptive_frequency_multiplier;
    let effectiveMultiplier = Math.min(requestedMultiplier, policyCap);

    // Check if new frequency would exceed safeRequestBudget over remaining day
    const hoursRemaining = 12; // estimated remaining hours in collection cycle
    const estimatedDailyRequestsAtMultiplier = (hoursRemaining * 60) / (baseIntervalMinutes / effectiveMultiplier);

    let capped = false;
    let reason = null;

    if (estimatedDailyRequestsAtMultiplier > safeRequestBudget) {
      // Scale down multiplier to fit within safeRequestBudget
      effectiveMultiplier = Math.max(1.0, Number(((safeRequestBudget * baseIntervalMinutes) / (hoursRemaining * 60)).toFixed(2)));
      capped = true;
      reason = `adaptive frequency bounded by remaining budget (${safeRequestBudget} requests available)`;
    } else if (requestedMultiplier > policyCap) {
      capped = true;
      reason = `capped by max_adaptive_frequency_multiplier policy (${policyCap}x)`;
    }

    const grantedInterval = Math.round(baseIntervalMinutes / effectiveMultiplier);

    return {
      granted_multiplier: effectiveMultiplier,
      granted_interval_minutes: grantedInterval,
      capped,
      reason,
    };
  }

  /**
   * Serializes current budget state.
   */
  toJSON() {
    return {
      schema_version: 1,
      project_id: this.projectId,
      limits: this.limits,
      usage: this.usage,
      policy: this.policy,
    };
  }
}
