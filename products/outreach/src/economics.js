/**
 * Strategy Performance and Acquisition Economics (B-089).
 *
 * Invariants:
 * 1. Outcomes attribute to strategy with cost per acquired link and per qualified referral.
 * 2. Ranking improvement is NEVER asserted as caused by an acquired link (ranking_causation_claimed: false).
 */

export function calculateAcquisitionEconomics({
  strategy,
  costItems = {},
  acquiredLinksCount = 0,
  qualifiedReferralVisits = 0,
  rankingCausationClaimed = false,
}) {
  if (!strategy) {
    throw new Error("strategy is required for acquisition economics");
  }

  // Invariant 2: Ranking improvement is NEVER asserted as caused by an acquired link
  if (rankingCausationClaimed === true) {
    throw new Error(
      "RANKING_CAUSATION_PROHIBITED: System invariant violation: Ranking improvement is never asserted as caused by an acquired link"
    );
  }

  const research = Number(costItems.research_cost_minor_units ?? 0);
  const content = Number(costItems.content_cost_minor_units ?? 0);
  const outreach = Number(costItems.outreach_cost_minor_units ?? 0);
  const placement = Number(costItems.placement_cost_minor_units ?? 0);
  const tooling = Number(costItems.tooling_cost_minor_units ?? 0);

  const totalCost = research + content + outreach + placement + tooling;
  const links = Math.max(0, Number(acquiredLinksCount));
  const referrals = Math.max(0, Number(qualifiedReferralVisits));

  const costPerLink = links > 0 ? Math.round(totalCost / links) : null;
  const costPerReferral = referrals > 0 ? Math.round(totalCost / referrals) : null;

  return {
    strategy,
    total_acquisition_cost_minor_units: totalCost,
    acquired_links_count: links,
    qualified_referral_visits: referrals,
    cost_per_acquired_link_minor_units: costPerLink,
    cost_per_qualified_referral_minor_units: costPerReferral,
    cost_breakdown: {
      research_cost_minor_units: research,
      content_cost_minor_units: content,
      outreach_cost_minor_units: outreach,
      placement_cost_minor_units: placement,
      tooling_cost_minor_units: tooling,
    },
    ranking_causation_claimed: false, // Invariant: always false
  };
}

/**
 * Aggregates performance across multiple campaigns or opportunities by strategy.
 */
export function aggregateStrategyPerformance(economicRecords = []) {
  const byStrategy = new Map();

  for (const record of economicRecords) {
    const strat = record.strategy || "UNKNOWN";
    if (!byStrategy.has(strat)) {
      byStrategy.set(strat, {
        strategy: strat,
        total_acquisition_cost_minor_units: 0,
        acquired_links_count: 0,
        qualified_referral_visits: 0,
      });
    }

    const current = byStrategy.get(strat);
    current.total_acquisition_cost_minor_units += Number(record.total_acquisition_cost_minor_units ?? 0);
    current.acquired_links_count += Number(record.acquired_links_count ?? 0);
    current.qualified_referral_visits += Number(record.qualified_referral_visits ?? 0);
  }

  const results = [];
  for (const [strategy, agg] of byStrategy.entries()) {
    const costPerLink = agg.acquired_links_count > 0
      ? Math.round(agg.total_acquisition_cost_minor_units / agg.acquired_links_count)
      : null;
    const costPerReferral = agg.qualified_referral_visits > 0
      ? Math.round(agg.total_acquisition_cost_minor_units / agg.qualified_referral_visits)
      : null;

    results.push({
      strategy,
      total_acquisition_cost_minor_units: agg.total_acquisition_cost_minor_units,
      acquired_links_count: agg.acquired_links_count,
      qualified_referral_visits: agg.qualified_referral_visits,
      cost_per_acquired_link_minor_units: costPerLink,
      cost_per_qualified_referral_minor_units: costPerReferral,
      ranking_causation_claimed: false,
    });
  }

  return results;
}
