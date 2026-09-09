/**
 * Impact / Effort / Confidence (ICE) scoring matrix for Citable findings and initiatives.
 *
 * All factors are explicitly scored on a transparent 1-10 scale.
 * Formula: ICE Score = (Impact × Confidence) / Effort
 * Quadrants:
 * - Quick Wins: High Impact (>=6), Low Effort (<=4), High Confidence (>=6)
 * - Strategic Bets: High Impact (>=6), High Effort (>=5)
 * - Low-Hanging Fruit: Low Impact (<6), Low Effort (<=4)
 * - Deprioritize: Low Impact (<6), High Effort (>=5) or Low Confidence (<5)
 */

const SEVERITY_IMPACT_MAP = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 2,
  informational: 1,
  experimental: 2,
};

const DETECTOR_EFFORT_MAP = {
  TECH: 4,
  CRAWL: 3,
  CWV: 5,
  ARCH: 6,
  PAGE: 3,
  ANS: 4,
  GEO: 5,
  RECO: 6,
  SCHEMA: 3,
  LINK: 4,
  ENTITY: 4,
  CLAIM: 5,
  EVD: 6,
  SEC: 4,
  MOBILE: 3,
  CRO: 4,
};

const CONFIDENCE_MAP = {
  deterministic: 10,
  verified: 9,
  validated: 8,
  proxy: 6,
  modeled: 6,
  anecdote: 4,
  assumption: 3,
};

/**
 * Score an audit finding for the ICE matrix
 */
export function scoreFinding(finding) {
  const severity = finding.classification?.severity || 'medium';
  const impact = SEVERITY_IMPACT_MAP[severity] ?? 5;

  const ns = (finding.detector_id || '').split('-')[0];
  let effort = DETECTOR_EFFORT_MAP[ns] ?? 4;
  if (finding.remediation?.review_required) effort += 2;
  effort = Math.min(10, Math.max(1, effort));

  let confidence = 8;
  if (finding.classification?.deterministic) {
    confidence = 10;
  } else if (finding.fact_status === 'observed_telemetry') {
    confidence = 9;
  } else if (finding.fact_status === 'modeled_rubric_evaluation') {
    confidence = 6;
  }

  const iceScore = Math.round(((impact * confidence) / effort) * 10) / 10;

  let quadrant = 'low_hanging_fruit';
  if (impact >= 6 && effort <= 4 && confidence >= 6) {
    quadrant = 'quick_wins';
  } else if (impact >= 6 && effort >= 5) {
    quadrant = 'strategic_bets';
  } else if (impact < 6 && effort <= 4) {
    quadrant = 'low_hanging_fruit';
  } else {
    quadrant = 'deprioritize';
  }

  return {
    id: finding.detector_id || finding.finding_id,
    finding_id: finding.finding_id,
    detector_id: finding.detector_id,
    title: finding.observation?.summary || finding.name || finding.detector_id,
    subject: finding.subject?.identifier || finding.subject?.url || 'global',
    severity,
    impact,
    effort,
    confidence,
    ice_score: iceScore,
    quadrant,
  };
}

/**
 * Score an initiative from initiatives.yaml for the ICE matrix
 */
export function scoreInitiative(initiative) {
  const SCALE = { none: 0, low: 2, medium: 5, high: 8, critical: 10, validated: 9, transformative: 10, trivial: 1, very_high: 9, negligible: 1 };

  const demand = SCALE[initiative.customer_demand] ?? 5;
  const rev = SCALE[initiative.revenue_potential] ?? 5;
  const diff = SCALE[initiative.strategic_differentiation] ?? 5;
  const impact = Math.min(10, Math.max(1, Math.round((demand + rev + diff) / 3)));

  const engCost = SCALE[initiative.engineering_cost] ?? 5;
  const opCost = SCALE[initiative.operating_cost || 'none'] ?? 0;
  const effort = Math.min(10, Math.max(1, Math.round(engCost + opCost * 0.3)));

  const confidence = CONFIDENCE_MAP[initiative.evidence_strength] ?? 5;
  const iceScore = Math.round(((impact * confidence) / effort) * 10) / 10;

  let quadrant = 'low_hanging_fruit';
  if (impact >= 6 && effort <= 4 && confidence >= 6) {
    quadrant = 'quick_wins';
  } else if (impact >= 6 && effort >= 5) {
    quadrant = 'strategic_bets';
  } else if (impact < 6 && effort <= 4) {
    quadrant = 'low_hanging_fruit';
  } else {
    quadrant = 'deprioritize';
  }

  return {
    id: initiative.initiative_id,
    title: initiative.title,
    owner: initiative.owner || 'unassigned',
    status: initiative.status,
    impact,
    effort,
    confidence,
    ice_score: iceScore,
    quadrant,
  };
}

/**
 * Build the full ICE Scoring Matrix from a list of findings or initiatives
 */
export function buildIceMatrix(items = [], { type = 'findings' } = {}) {
  const scored = items.map((item) => (type === 'initiatives' ? scoreInitiative(item) : scoreFinding(item)));
  scored.sort((a, b) => b.ice_score - a.ice_score || b.impact - a.impact);

  const quadrants = {
    quick_wins: scored.filter((i) => i.quadrant === 'quick_wins'),
    strategic_bets: scored.filter((i) => i.quadrant === 'strategic_bets'),
    low_hanging_fruit: scored.filter((i) => i.quadrant === 'low_hanging_fruit'),
    deprioritize: scored.filter((i) => i.quadrant === 'deprioritize'),
  };

  return {
    fact_status: 'transparent_prioritization_matrix',
    scoring_method: 'ICE: (Impact [1-10] × Confidence [1-10]) / Effort [1-10]',
    total_items: scored.length,
    summary: {
      quick_wins_count: quadrants.quick_wins.length,
      strategic_bets_count: quadrants.strategic_bets.length,
      low_hanging_fruit_count: quadrants.low_hanging_fruit.length,
      deprioritize_count: quadrants.deprioritize.length,
    },
    quadrants,
    ranked_items: scored,
  };
}

/**
 * Format ICE Matrix as human-readable terminal table / markdown
 */
export function formatIceMatrixOutput(matrix) {
  const lines = [
    `Impact / Effort / Confidence (ICE) Prioritization Matrix`,
    `=======================================================`,
    `Methodology: ${matrix.scoring_method}`,
    `Total Items Scored: ${matrix.total_items}`,
    ``,
    `QUADRANT SUMMARY:`,
    `  Quadrant I   [Quick Wins]:          ${matrix.summary.quick_wins_count} item(s) (High Impact, Low Effort, High Confidence)`,
    `  Quadrant II  [Strategic Bets]:      ${matrix.summary.strategic_bets_count} item(s) (High Impact, High Effort)`,
    `  Quadrant III [Low-Hanging Fruit]:   ${matrix.summary.low_hanging_fruit_count} item(s) (Low Impact, Low Effort)`,
    `  Quadrant IV  [Deprioritize]:        ${matrix.summary.deprioritize_count} item(s) (Low Impact or Low Confidence)`,
    ``,
    `RANKED ACTION MATRIX:`,
    `  ${'Rank'.padEnd(6)} | ${'ID'.padEnd(16)} | ${'Impact'.padEnd(8)} | ${'Effort'.padEnd(8)} | ${'Conf'.padEnd(6)} | ${'ICE Score'.padEnd(10)} | Quadrant`,
    `  ${'-'.repeat(80)}`,
  ];

  matrix.ranked_items.forEach((item, idx) => {
    const rank = `#${idx + 1}`.padEnd(6);
    const id = (item.id || '').slice(0, 16).padEnd(16);
    const impact = `${item.impact}/10`.padEnd(8);
    const effort = `${item.effort}/10`.padEnd(8);
    const conf = `${item.confidence}/10`.padEnd(6);
    const score = `${item.ice_score}`.padEnd(10);
    const q = item.quadrant.toUpperCase();
    lines.push(`  ${rank} | ${id} | ${impact} | ${effort} | ${conf} | ${score} | ${q}`);
    lines.push(`         ${item.title.slice(0, 70)}`);
  });

  return lines.join('\n');
}
