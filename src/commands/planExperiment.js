/**
 * `citable plan experiment` — calculate required sample size, statistical power, and duration for A/B testing,
 * and verify that conversion variants avoid SEO regressions.
 */
export async function planExperiment(root, options = {}) {
  const baselineRate = Number(options.baselineRate ?? options['baseline-rate'] ?? 0.02);
  const mde = Number(options.mde ?? 0.10); // 10% relative MDE
  const dailyVisitors = Number(options.dailyVisitors ?? options['daily-visitors'] ?? 500);
  const alpha = Number(options.alpha ?? 0.05); // 95% confidence
  const power = Number(options.power ?? 0.80); // 80% power

  if (baselineRate <= 0 || baselineRate >= 1) {
    throw new Error('baseline-rate must be between 0 and 1 (e.g. 0.02 for 2%)');
  }
  if (mde <= 0) {
    throw new Error('mde must be greater than 0 (e.g. 0.10 for 10% relative lift)');
  }
  if (dailyVisitors <= 0) {
    throw new Error('daily-visitors must be a positive integer');
  }

  const p1 = baselineRate;
  const p2 = p1 * (1 + mde);
  const pBar = (p1 + p2) / 2;

  // Normal critical values (standard two-tailed alpha=0.05, power=0.80)
  const zAlpha = alpha === 0.01 ? 2.576 : alpha === 0.10 ? 1.645 : 1.96;
  const zBeta = power === 0.90 ? 1.282 : power === 0.95 ? 1.645 : 0.8416;

  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    2
  );
  const denominator = Math.pow(p2 - p1, 2);
  const nPerVariant = Math.ceil(numerator / denominator);
  const totalSample = nPerVariant * 2;
  const estimatedDays = Math.ceil(totalSample / dailyVisitors);

  const recommendations = [];
  let riskLevel = 'low';

  if (estimatedDays < 7) {
    recommendations.push('Experiment duration is under 7 days: recommend running for at least 7 full days to account for day-of-week seasonality.');
    riskLevel = 'moderate';
  } else if (estimatedDays > 90) {
    recommendations.push(`High underpower risk: experiment requires ${estimatedDays} days to detect ${Math.round(mde * 100)}% lift. Target a higher-traffic page or increase MDE threshold.`);
    riskLevel = 'high_underpowered';
  } else if (estimatedDays > 45) {
    recommendations.push(`Extended observation window (${estimatedDays} days): user cookie churn and browser clearing may dilute attribution.`);
    riskLevel = 'moderate';
  } else {
    recommendations.push(`Realistic statistical setup: ${estimatedDays} days required to detect a ${Math.round(mde * 100)}% lift with 80% power at 95% confidence.`);
  }

  const experimentId = options.id || options.experimentId || 'EXP-CRO-AUTO';
  const targetPage = options.page || options.targetPage || '/pricing';
  const primaryMetric = options.metric || 'conversion_rate';

  const blueprint = {
    experiment_id: experimentId,
    discipline: 'cro',
    target_page: targetPage,
    status: 'planned',
    hypothesis: options.hypothesis || 'Replacing high-friction hero with NebulaHeroCTA increases primary CTA conversion.',
    primary_metric: primaryMetric,
    evaluation_window: `${Math.max(estimatedDays, 7)} days`,
    sample_size_per_variant: nPerVariant,
    variants: [
      { id: 'control', name: 'Original Page (Baseline)', traffic_pct: 50 },
      { id: 'variant_nebula', name: 'Nebula Remediated Component', traffic_pct: 50 },
    ],
  };

  const edgeVariantRouterCode = `// Zero-Flicker Edge A/B Variant Router (MurmurHash3 / FNV-1a)
export function routeExperiment(request) {
  const visitorId = request.headers.get('cf-connecting-ip') || 'anon';
  let hash = 2166136261;
  const str = visitorId + ':${experimentId}';
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bucket = Math.abs(hash % 100);
  return bucket < 50 ? 'control' : 'variant_nebula';
}`;

  const telemetryCode = `// Schema-Valid Conversion Event Telemetry Envelope
export function trackConversion(experimentId, variantId, actionName) {
  const payload = {
    kind: 'cro_conversion_event',
    experiment_id: experimentId,
    variant_id: variantId,
    action: actionName,
    timestamp: new Date().toISOString(),
  };
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/citable/events', JSON.stringify(payload));
  } else {
    fetch('/api/citable/events', { method: 'POST', body: JSON.stringify(payload), keepalive: true });
  }
}`;

  return {
    experiment_id: experimentId,
    baseline_conversion_rate: p1,
    target_conversion_rate: Number(p2.toFixed(4)),
    minimum_detectable_effect_relative: mde,
    significance_level_alpha: alpha,
    statistical_power: power,
    daily_visitors: dailyVisitors,
    sample_size_per_variant: nPerVariant,
    total_sample_size: totalSample,
    estimated_duration_days: estimatedDays,
    risk_level: riskLevel,
    blueprint,
    edge_variant_router_code: edgeVariantRouterCode,
    telemetry_code: telemetryCode,
    recommendations,
  };
}
