/**
 * Analyze behavioral interaction evidence across funnels, sessions, cohorts, and interaction signals.
 */
export function analyzeBehavioralTelemetry(telemetryData = {}) {
  const sessions = telemetryData.sessions || telemetryData.metrics || {};
  const cohorts = telemetryData.cohorts || {};
  const interactions = telemetryData.interactions || {};
  const funnelSteps = telemetryData.funnel || [];

  const findings = [];
  const frictionIndicators = [];

  // 1. Mobile vs Desktop Cohort Divergence
  const mobileCr = cohorts.mobile?.conversion_rate ?? null;
  const desktopCr = cohorts.desktop?.conversion_rate ?? null;

  let cohortDivergence = null;
  if (mobileCr !== null && desktopCr !== null && desktopCr > 0) {
    const ratio = mobileCr / desktopCr;
    cohortDivergence = {
      mobile_cr: mobileCr,
      desktop_cr: desktopCr,
      mobile_to_desktop_ratio: Math.round(ratio * 100) / 100,
    };

    if (ratio < 0.5) {
      frictionIndicators.push({
        type: 'mobile_conversion_gap',
        severity: 'high',
        evidence: `Mobile conversion rate (${(mobileCr * 100).toFixed(1)}%) is under half of desktop (${(desktopCr * 100).toFixed(1)}%)`,
        hypothesis: 'Mobile friction (virtual keyboard effort, diminutive tap targets, or slow paint) impedes mobile buyers',
      });
    }
  }

  // 2. Scroll Depth vs CTA Placement
  const p50Scroll = interactions.scroll_depth_p50_pct ?? interactions.median_scroll_depth ?? null;
  const ctaPosition = interactions.primary_cta_vertical_pct ?? null;

  if (p50Scroll !== null && ctaPosition !== null) {
    if (ctaPosition > p50Scroll) {
      frictionIndicators.push({
        type: 'buried_cta',
        severity: 'high',
        evidence: `Primary CTA is positioned at ${ctaPosition}% page depth, but median user scroll depth is only ${p50Scroll}%`,
        hypothesis: 'Over 50% of visitors never view the primary conversion CTA before abandoning',
      });
    }
  }

  // 3. Rage Clicks and Dead Clicks
  const rageClicks = interactions.rage_click_rate_pct ?? interactions.rage_clicks_count ?? 0;
  const deadClicks = interactions.dead_click_rate_pct ?? interactions.dead_clicks_count ?? 0;

  if (rageClicks > 3 || rageClicks > 50) {
    frictionIndicators.push({
      type: 'rage_clicks',
      severity: 'high',
      evidence: `Elevated rage click frequency (${rageClicks}) indicates user frustration with unresponsive or broken interactive elements`,
      hypothesis: 'Interactive components fail to provide immediate visual feedback or fail on tap',
    });
  }

  if (deadClicks > 5 || deadClicks > 80) {
    frictionIndicators.push({
      type: 'dead_clicks',
      severity: 'medium',
      evidence: `High dead click count (${deadClicks}): users attempt to click static elements perceived as interactive`,
      hypothesis: 'Visual affordances mislead users into clicking non-actionable elements',
    });
  }

  // 4. Funnel Drop-off Analysis
  const funnelDropOffs = [];
  if (Array.isArray(funnelSteps) && funnelSteps.length >= 2) {
    for (let i = 0; i < funnelSteps.length - 1; i++) {
      const curr = funnelSteps[i];
      const next = funnelSteps[i + 1];
      const dropOffRate = curr.visitors > 0 ? Math.round(((curr.visitors - next.visitors) / curr.visitors) * 100) : 0;
      funnelDropOffs.push({
        from_step: curr.name || `Step ${i + 1}`,
        to_step: next.name || `Step ${i + 2}`,
        drop_off_pct: dropOffRate,
        retained_visitors: next.visitors,
      });

      if (dropOffRate > 70) {
        frictionIndicators.push({
          type: 'steep_funnel_leak',
          severity: 'critical',
          evidence: `Severe drop-off between ${curr.name} and ${next.name} (${dropOffRate}% abandon rate)`,
          hypothesis: `Significant cognitive load, price shock, or friction barrier encountered at ${curr.name}`,
        });
      }
    }
  }

  // 5. Form Field Abandonment Peak
  const fieldAbandons = interactions.form_field_abandonment || [];
  let peakAbandonField = null;
  if (fieldAbandons.length > 0) {
    fieldAbandons.sort((a, b) => b.abandon_count - a.abandon_count);
    peakAbandonField = fieldAbandons[0];
    frictionIndicators.push({
      type: 'form_field_bottleneck',
      severity: 'high',
      evidence: `Peak form abandonment occurs on field "${peakAbandonField.field_name}" (${peakAbandonField.abandon_count} drop-offs)`,
      hypothesis: `Field "${peakAbandonField.field_name}" creates high friction or privacy resistance; consider making optional or eliminating`,
    });
  }

  return {
    fact_status: 'observed_behavioral_telemetry',
    summary: {
      total_friction_indicators: frictionIndicators.length,
      critical_indicators: frictionIndicators.filter((i) => i.severity === 'critical').length,
      high_indicators: frictionIndicators.filter((i) => i.severity === 'high').length,
      cohort_divergence: cohortDivergence,
    },
    funnel_drop_offs: funnelDropOffs,
    friction_indicators: frictionIndicators,
    limitations: [
      'Behavioral signals indicate correlation and user interaction bottlenecks; causal mechanisms must be verified via controlled A/B experiments.',
    ],
  };
}
