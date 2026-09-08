import { loadRegistries } from '../registries/index.js';

/**
 * Experiment safety guardrails.
 *
 * Lifecycle statuses are mutually exclusive and explicitly defined:
 *   planned     — declared, not yet receiving traffic decisions
 *   running     — receiving traffic, sample below the computed requirement and
 *                 window not elapsed; no reading may be taken
 *   inconclusive— window and sample satisfied, effect not statistically
 *                 significant; absence of evidence is not evidence of absence
 *   validated   — full window, full sample, no SRM, effect significant at the
 *                 declared alpha for the primary metric ONLY
 *
 * Guardrails fail closed: missing observations, missing windows, or missing
 * registry context produce `blocked` findings, never a silent pass.
 */

const MIN_WINDOW_DAYS = 7;
const SRM_ALPHA = 0.001; // standard SRM alert threshold

/** Abramowitz–Stegun normal CDF. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

function chiSquare1dfP(chi2) {
  return 2 * (1 - normalCdf(Math.sqrt(chi2)));
}

export function requiredSamplePerVariant(baselineRate, mde, alpha = 0.05, power = 0.8) {
  const p1 = baselineRate;
  const p2 = p1 * (1 + mde);
  const pBar = (p1 + p2) / 2;
  const zAlpha = alpha === 0.01 ? 2.576 : alpha === 0.10 ? 1.645 : 1.96;
  const zBeta = power === 0.9 ? 1.282 : power === 0.95 ? 1.645 : 0.8416;
  const numerator = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
  const denominator = Math.pow(p2 - p1, 2);
  return Math.ceil(numerator / denominator);
}

function windowDays(str) {
  const m = String(str || '').match(/(\d+)\s*d/i);
  return m ? Number(m[1]) : null;
}

/**
 * Core guardrail evaluation for one experiment record plus optional observed
 * data: { control, variant, baseline_rate, mde, days_running, revenue_claimed,
 * other_active_experiments: [{experiment_id, target_page}] }.
 */
export function evaluateExperiment(experiment, observed = {}) {
  const findings = [];
  const add = (guardrail_id, severity, summary, required_input = null) =>
    findings.push({ guardrail_id, severity, summary, ...(required_input ? { required_input } : {}) });

  const status = experiment.status || 'draft';
  const declaredSplit = (experiment.variants || []).length
    ? (experiment.variants.find((v) => v.traffic_pct) || {}).traffic_pct || 50
    : 50;
  const window = windowDays(experiment.evaluation_window || experiment.minimum_observation_window);
  const baseline = observed.baseline_rate ?? experiment.baseline_rate ?? null;
  const mde = observed.mde ?? experiment.mde ?? null;

  // Underpowered / required sample
  let requiredN = null;
  if (baseline > 0 && baseline < 1 && mde > 0) {
    requiredN = requiredSamplePerVariant(baseline, mde);
    if (window && window < MIN_WINDOW_DAYS) {
      add('EXP-WINDOW-TOO-SHORT', 'high',
        `Evaluation window ${window}d is shorter than the ${MIN_WINDOW_DAYS}d minimum; day-of-week seasonality produces high false-positive risk.`);
    }
  } else {
    add('EXP-BASELINE-MISSING', 'blocked',
      'No usable baseline_rate/mde declared; sample-size and power requirements cannot be established (fail closed).',
      'required_input: baseline_rate (0-1) and mde (relative)');
  }

  // Stopping early
  if (status === 'active' || status === 'observing') {
    const daysRunning = observed.days_running ?? null;
    if (window && daysRunning !== null && daysRunning < window) {
      add('EXP-STOPPING-EARLY', 'high',
        `Experiment has run ${daysRunning}d of the declared ${window}d window; stopping now invalidates the design. No interim reading is decision-grade.`);
    }
  }

  // Sample-ratio mismatch
  if (observed.control !== undefined && observed.variant !== undefined) {
    const c = Number(observed.control);
    const v = Number(observed.variant);
    if (!Number.isFinite(c) || !Number.isFinite(v) || c < 0 || v < 0) {
      add('EXP-OBSERVATIONS-INVALID', 'blocked', 'Observed counts must be non-negative numbers (fail closed).');
    } else if (c + v >= 100) {
      const total = c + v;
      const share = declaredSplit / 100;
      const expectedC = total * share;
      const expectedV = total * (1 - share);
      const chi2 = ((c - expectedC) ** 2) / expectedC + ((v - expectedV) ** 2) / expectedV;
      const p = chiSquare1dfP(chi2);
      if (p < SRM_ALPHA) {
        add('EXP-SRM-DETECTED', 'critical',
          `Sample-ratio mismatch: observed ${c}/${v} vs declared ${declaredSplit}/${100 - declaredSplit} split (chi-square p=${p.toExponential(2)}). Instrumentation or routing is broken; all readings from this experiment are untrustworthy until fixed.`);
      }
    } else {
      add('EXP-SAMPLE-TOO-SMALL-FOR-SRM', 'blocked',
        'Fewer than 100 total observations; SRM cannot be assessed yet (fail closed).');
    }
  } else if (status === 'active' || status === 'observing') {
    add('EXP-OBSERVATIONS-MISSING', 'blocked',
      'Active experiment without observed variant counts; sample ratio, power, and stopping state cannot be verified (fail closed).',
      'required_input: observed control and variant assignment counts');
  }

  // Power status against observed sample
  if (requiredN !== null && observed.control !== undefined && observed.variant !== undefined) {
    const perVariant = Math.min(Number(observed.control), Number(observed.variant));
    if (perVariant < requiredN) {
      add('EXP-UNDERPOWERED', 'medium',
        `Current sample (${perVariant}/variant) is below the ${requiredN}/variant requirement for ${Math.round((mde ?? 0) * 100)}% MDE at 80% power; any observed difference is not decision-grade.`);
    }
  }

  // Revenue attribution without sufficient evidence
  if (observed.revenue_claimed || /revenue|aov|arp/i.test(experiment.primary_metric || '')) {
    const hasConcluded = status === 'concluded';
    const hasSrm = findings.some((f) => f.guardrail_id === 'EXP-SRM-DETECTED');
    if (hasSrm || !hasConcluded) {
      add('EXP-REVENUE-UNSUPPORTED', 'high',
        'Revenue attribution asserted without a concluded, SRM-clean experiment and verified conversion instrumentation; this remains a modeled estimate, not a measured outcome.');
    }
  }

  // Contamination across pages / incompatible variants
  const others = observed.other_active_experiments || [];
  for (const other of others) {
    if (other.target_page && experiment.target_page && other.target_page === experiment.target_page) {
      add('EXP-CONTAMINATION', 'high',
        `Experiment ${other.experiment_id} is also active on ${other.target_page}; overlapping experiments contaminate each other's readings.`);
    }
    const sharedVariants = (other.variant_ids || []).filter((id) => (experiment.variant_ids || []).includes(id));
    if (sharedVariants.length) {
      add('EXP-VARIANT-COLLISION', 'high',
        `Variant id(s) ${sharedVariants.join(', ')} collide with active experiment ${other.experiment_id}; assignment is ambiguous.`);
    }
  }

  // Lifecycle status (mutually exclusive, explicitly derived)
  let lifecycle;
  const blocking = findings.some((f) => f.severity === 'blocked' || f.severity === 'critical');
  if (status === 'draft' || status === 'observing' || (!observed.control && !observed.variant && status !== 'active')) {
    lifecycle = 'planned';
  } else if (blocking) {
    lifecycle = 'inconclusive';
  } else {
    const perVariant = Math.min(Number(observed.control ?? 0), Number(observed.variant ?? 0));
    const withinWindow = window ? (observed.days_running ?? Infinity) >= window : false;
    const sampleMet = requiredN !== null ? perVariant >= requiredN : false;
    const significant = typeof observed.p_value === 'number' ? observed.p_value < (observed.alpha ?? 0.05) : false;
    if (withinWindow && sampleMet && significant) lifecycle = 'validated';
    else if (withinWindow && sampleMet) lifecycle = 'inconclusive';
    else lifecycle = 'running';
  }

  const definitions = {
    planned: 'declared, not yet receiving traffic; no reading exists',
    running: 'receiving traffic; sample/window incomplete; interim readings are not decision-grade',
    inconclusive: 'window and sample satisfied but the effect is not statistically significant, or a blocking guardrail fired; absence of evidence is not evidence of absence',
    validated: 'full window, sufficient sample, no SRM, primary metric significant at declared alpha — statistically validated for the primary metric only, never a conversion or revenue guarantee',
  };

  return {
    experiment_id: experiment.experiment_id,
    registry_status: status,
    lifecycle,
    lifecycle_definition: definitions[lifecycle],
    required_sample_per_variant: requiredN,
    declared_traffic_split: `${declaredSplit}/${100 - declaredSplit}`,
    guardrail_count: findings.length,
    findings,
    lifecycle_definitions: definitions,
    note: 'lifecycle labels describe statistical state only; Citable does not guarantee conversion, ranking, or citation outcomes',
  };
}

/**
 * `citable check experiment <id> [--observed-control N --observed-variant N]`
 */
export async function checkExperiment(root, options = {}) {
  const { registries, problems } = loadRegistries(root);
  const entries = registries?.experiments?.entries || [];
  const id = options.experimentId || options.experiment_id;
  if (!id) throw new Error('usage: citable check experiment <experiment-id> [--observed-control N --observed-variant N --days-running N]');
  const experiment = entries.find((e) => e.experiment_id === id);
  if (!experiment) {
    throw new Error(`experiment "${id}" not found in experiments.yaml. Available: ${entries.map((e) => e.experiment_id).join(', ') || 'none'}`);
  }
  const observed = {
    control: options.observedControl ?? options.observed_control,
    variant: options.observedVariant ?? options.observed_variant,
    days_running: options.daysRunning ?? options.days_running,
    baseline_rate: options.baselineRate ? Number(options.baselineRate) : undefined,
    mde: options.mde ? Number(options.mde) : undefined,
    p_value: options.pValue ? Number(options.pValue) : undefined,
    revenue_claimed: options.revenueClaimed ?? options.revenue_claimed ?? false,
    other_active_experiments: entries.filter((e) => e.status === 'active' && e.experiment_id !== id),
  };
  const result = evaluateExperiment(experiment, observed);
  return { ...result, registry_problems: problems };
}
