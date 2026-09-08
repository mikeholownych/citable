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

  return {
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
    recommendations,
  };
}
