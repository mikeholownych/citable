import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';

const POSTURE_CLASS = {
  pass: 'posture-pass',
  partial: 'posture-partial',
  fail: 'posture-fail',
  not_established: 'posture-unknown',
  observed: 'posture-pass',
  not_evidenced: 'posture-unknown',
};

const NO_GUARANTEE = 'This dashboard renders values already recorded by each audit run. It derives no new findings, combines nothing into an AI visibility score, and guarantees no crawling, indexing, ranking, citation, recommendation, or conversion outcome.';

function isAuditSummary(summary) {
  return Boolean(summary) && typeof summary === 'object' && Boolean(summary.by_severity) && Boolean(summary.posture);
}

/**
 * Load every audit run that recorded a summary.json, oldest first. Run IDs are
 * `<ISO-timestamp>-<command>-<rand>`, so a lexicographic sort is chronological.
 * A run whose evidence cannot be read is reported in `skipped`, never dropped
 * silently and never thrown.
 */
export function loadRunHistory(root, { since, last } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  const included = [];
  const skipped = [];
  if (!fs.existsSync(runsDir)) return { included, skipped };
  let runIds = fs.readdirSync(runsDir)
    .filter((runId) => fs.existsSync(path.join(runsDir, runId, 'summary.json')))
    .sort();
  if (since) runIds = runIds.filter((runId) => runId >= since);
  for (const runId of runIds) {
    const dir = path.join(runsDir, runId);
    try {
      const summary = readJson(path.join(dir, 'summary.json'));
      if (!isAuditSummary(summary)) {
        skipped.push({ run_id: runId, reason: 'summary.json records no by_severity or posture; observation runs are not part of the audit trend' });
        continue;
      }
      included.push({ run_id: runId, manifest: readJson(path.join(dir, 'manifest.json')), summary });
    } catch (err) {
      skipped.push({ run_id: runId, reason: err.message });
    }
  }
  // `last` counts audit runs that carry usable evidence, so an unreadable or
  // observation-only run cannot silently consume the requested window. Skipped
  // runs are reported unless `last` moved the window past them; `since` has
  // already bounded them above.
  const windowed = Number.isInteger(last) && last > 0 ? included.slice(-last) : included;
  const truncated = windowed.length < included.length && windowed.length > 0;
  return {
    included: windowed,
    skipped: truncated ? skipped.filter((item) => item.run_id >= windowed[0].run_id) : skipped,
  };
}

/** Project the loaded runs into parallel, run-aligned series. */
export function buildTimeSeries(included) {
  return {
    run_ids: included.map((run) => run.run_id),
    timestamps: included.map((run) => run.manifest?.timestamp ?? null),
    by_severity_series: included.map((run) => run.summary.by_severity ?? {}),
    retrieval_eligibility_series: included.map((run) => run.summary.posture?.retrieval_eligibility?.result ?? null),
    source_extraction_series: included.map((run) => run.summary.posture?.source_extraction_and_support?.result ?? null),
    citation_presence_rate_series: included.map((run) => run.summary.posture?.observed_citation_behavior?.citation_presence_rate ?? null),
  };
}

function severityCount(bySeverity, severity) {
  return bySeverity?.[severity] ?? 0;
}

function formatRate(rate) {
  return rate == null ? 'not evidenced' : `${(rate * 100).toFixed(1)}%`;
}

function formatPosture(result) {
  return result ?? 'not recorded';
}

function formatTimestamp(timestamp) {
  return timestamp ?? 'not recorded';
}

export function renderDashboardMarkdown(series, skipped = []) {
  const lines = [];
  const runCount = series.run_ids.length;
  lines.push(`# Citable evidence dashboard`);
  lines.push('');
  lines.push(`- Audit runs included: ${runCount}`);
  lines.push(`- Runs skipped: ${skipped.length}`);
  if (runCount) lines.push(`- Window: \`${series.run_ids[0]}\` → \`${series.run_ids[runCount - 1]}\``);
  lines.push('');
  lines.push(`> ${NO_GUARANTEE}`);
  lines.push('');
  if (runCount < 2) {
    lines.push('## Insufficient history');
    lines.push('');
    lines.push(runCount === 0
      ? 'No audit run in `.citable/runs/` recorded a summary. No trend is established. Run `citable audit` to record comparable evidence.'
      : 'Only one audit run is available. A single point establishes no trend, no direction, and no rate of change. Record at least two comparable runs before reading movement into these values.');
    lines.push('');
  }
  if (runCount) {
    lines.push('## Run history');
    lines.push('');
    lines.push('| Run | Timestamp | Critical | High | Medium | Retrieval eligibility | Source extraction | Citation presence rate |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (let i = 0; i < runCount; i++) {
      const sev = series.by_severity_series[i];
      lines.push(`| \`${series.run_ids[i]}\` | ${formatTimestamp(series.timestamps[i])} | ${severityCount(sev, 'critical')} | ${severityCount(sev, 'high')} | ${severityCount(sev, 'medium')} | ${formatPosture(series.retrieval_eligibility_series[i])} | ${formatPosture(series.source_extraction_series[i])} | ${formatRate(series.citation_presence_rate_series[i])} |`);
    }
    lines.push('');
    lines.push('Counts come from each run\'s own recorded summary. A lower count is an observed difference between runs, not proof that a condition was fixed — see `citable compare-snapshots` for run comparability.');
    lines.push('');
  }
  if (skipped.length) {
    lines.push('## Skipped runs');
    lines.push('');
    for (const item of skipped) lines.push(`- \`${item.run_id}\`: ${item.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Map run-aligned values to `<polyline points>` coordinates. Non-numeric entries
 * (a run with no evidenced value) are omitted rather than interpolated, and
 * fewer than two numeric points yields no line at all.
 */
function sparklinePath(values, { width = 480, height = 80 } = {}) {
  const pad = 3;
  const points = values.map((value, index) => ({ value, index })).filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return '';
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min;
  const steps = Math.max(values.length - 1, 1);
  return points.map((point) => {
    const x = pad + (point.index / steps) * (width - pad * 2);
    const y = span === 0 ? height / 2 : (height - pad) - ((point.value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function renderSparkline(title, values, format) {
  const points = sparklinePath(values);
  const numeric = values.filter((value) => Number.isFinite(value));
  const html = [];
  html.push('<section class="chart">');
  html.push(`<h3>${escapeHtml(title)}</h3>`);
  if (!points) {
    html.push(`<p class="note">Fewer than two runs recorded a numeric value for this series (${numeric.length} of ${values.length}). No trend line is drawn.</p>`);
  } else {
    html.push(`<svg viewBox="0 0 480 80" width="480" height="80" role="img" aria-label="${escapeHtml(title)}">`);
    html.push(`<polyline points="${points}" fill="none" stroke="#2f6f4f" stroke-width="2" />`);
    html.push('</svg>');
    html.push(`<p class="note">Range across ${numeric.length} run(s) with a recorded value: ${escapeHtml(format(Math.min(...numeric)))} to ${escapeHtml(format(Math.max(...numeric)))}. The vertical axis is scaled to this range only; runs without a recorded value are omitted, not interpolated.</p>`);
  }
  html.push('</section>');
  return html.join('\n');
}

function renderPostureRow(label, results, runIds) {
  const cells = results.map((result, index) => `<span class="posture ${POSTURE_CLASS[result] ?? 'posture-unknown'}" title="${escapeHtml(runIds[index])}">${escapeHtml(formatPosture(result))}</span>`).join('');
  return `<section class="chart"><h3>${escapeHtml(label)}</h3><div class="posture-row">${cells}</div><p class="note">Categorical states in run order. These are not plotted as numbers because they have no defined numeric distance.</p></section>`;
}

export function renderDashboardHtml(series, skipped = []) {
  const runCount = series.run_ids.length;
  const criticalHigh = series.by_severity_series.map((sev) => severityCount(sev, 'critical') + severityCount(sev, 'high'));
  const html = [];
  html.push('<!doctype html>');
  html.push('<html lang="en">');
  html.push('<head>');
  html.push('<meta charset="utf-8" />');
  html.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  html.push('<title>Citable evidence dashboard</title>');
  html.push('<style>');
  html.push('body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1c1c1c; }');
  html.push('table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }');
  html.push('th, td { border: 1px solid #d4d4d4; padding: 0.375rem 0.5rem; text-align: left; }');
  html.push('th { background: #f3f3f3; }');
  html.push('code { font-size: 0.8125rem; }');
  html.push('blockquote { border-left: 4px solid #999; margin: 0 0 1.5rem; padding: 0.25rem 1rem; color: #333; }');
  html.push('.note { color: #555; font-size: 0.8125rem; }');
  html.push('.chart { margin: 1.5rem 0; }');
  html.push('.chart svg { background: #fafafa; border: 1px solid #e4e4e4; }');
  html.push('.posture-row { display: flex; flex-wrap: wrap; gap: 0.25rem; }');
  html.push('.posture { border-radius: 3px; font-size: 0.75rem; padding: 0.125rem 0.375rem; }');
  html.push('.posture-pass { background: #e2f2e6; color: #1d5c33; }');
  html.push('.posture-partial { background: #fbf1d8; color: #7a5510; }');
  html.push('.posture-fail { background: #fbe0e0; color: #8c1f1f; }');
  html.push('.posture-unknown { background: #ececec; color: #4a4a4a; }');
  html.push('.insufficient { background: #fbf1d8; border: 1px solid #e2c98a; padding: 0.75rem 1rem; }');
  html.push('</style>');
  html.push('</head>');
  html.push('<body>');
  html.push('<h1>Citable evidence dashboard</h1>');
  html.push('<ul>');
  html.push(`<li>Audit runs included: ${runCount}</li>`);
  html.push(`<li>Runs skipped: ${skipped.length}</li>`);
  if (runCount) html.push(`<li>Window: <code>${escapeHtml(series.run_ids[0])}</code> to <code>${escapeHtml(series.run_ids[runCount - 1])}</code></li>`);
  html.push('</ul>');
  html.push(`<blockquote>${escapeHtml(NO_GUARANTEE)}</blockquote>`);
  if (runCount < 2) {
    html.push('<section class="insufficient">');
    html.push('<h2>Insufficient history</h2>');
    html.push(`<p>${runCount === 0
      ? 'No audit run in <code>.citable/runs/</code> recorded a summary. No trend is established. Run <code>citable audit</code> to record comparable evidence.'
      : 'Only one audit run is available. A single point establishes no trend, no direction, and no rate of change. Record at least two comparable runs before reading movement into these values.'}</p>`);
    html.push('</section>');
  }
  if (runCount) {
    html.push('<h2>Trends</h2>');
    html.push(renderSparkline('Critical and high findings per run', criticalHigh, (value) => String(value)));
    html.push(renderSparkline('Observed citation presence rate per run', series.citation_presence_rate_series, formatRate));
    html.push(renderPostureRow('Retrieval eligibility per run', series.retrieval_eligibility_series, series.run_ids));
    html.push(renderPostureRow('Source extraction and support per run', series.source_extraction_series, series.run_ids));
    html.push('<h2>Run history</h2>');
    html.push('<table>');
    html.push('<thead><tr><th>Run</th><th>Timestamp</th><th>Critical</th><th>High</th><th>Medium</th><th>Retrieval eligibility</th><th>Source extraction</th><th>Citation presence rate</th></tr></thead>');
    html.push('<tbody>');
    for (let i = 0; i < runCount; i++) {
      const sev = series.by_severity_series[i];
      html.push(`<tr><td><code>${escapeHtml(series.run_ids[i])}</code></td><td>${escapeHtml(formatTimestamp(series.timestamps[i]))}</td><td>${severityCount(sev, 'critical')}</td><td>${severityCount(sev, 'high')}</td><td>${severityCount(sev, 'medium')}</td><td>${escapeHtml(formatPosture(series.retrieval_eligibility_series[i]))}</td><td>${escapeHtml(formatPosture(series.source_extraction_series[i]))}</td><td>${escapeHtml(formatRate(series.citation_presence_rate_series[i]))}</td></tr>`);
    }
    html.push('</tbody>');
    html.push('</table>');
    html.push('<p class="note">Counts come from each run&#39;s own recorded summary. A lower count is an observed difference between runs, not proof that a condition was fixed.</p>');
  }
  if (skipped.length) {
    html.push('<h2>Skipped runs</h2>');
    html.push('<ul>');
    for (const item of skipped) html.push(`<li><code>${escapeHtml(item.run_id)}</code>: ${escapeHtml(item.reason)}</li>`);
    html.push('</ul>');
  }
  html.push('</body>');
  html.push('</html>');
  html.push('');
  return html.join('\n');
}
