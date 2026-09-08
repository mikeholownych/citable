import fs from 'node:fs';
import path from 'node:path';
import { nowIso, readJson } from '../shared/io.js';

const NO_GUARANTEE = 'Consensus matrix evaluates agreement between declared publisher signals (HTML rel=canonical, Open Graph og:url, XML sitemaps, HTTP Last-Modified) and optional search engine observations. Signal consensus does not guarantee crawling, indexing, ranking, or citation outcomes in search or answer engines.';

export function loadConsensusRuns(root, { runId, since, last } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  const included = [];
  const skipped = [];
  if (!fs.existsSync(runsDir)) return { included, skipped };

  let runIds = [];
  if (runId) {
    if (fs.existsSync(path.join(runsDir, runId))) {
      runIds = [runId];
    } else {
      throw new Error(`run not found: ${runId}`);
    }
  } else {
    runIds = fs.readdirSync(runsDir).sort();
    if (since) runIds = runIds.filter((id) => id >= since);
  }

  for (const id of runIds) {
    const dir = path.join(runsDir, id);
    const obsDir = path.join(dir, 'observations');
    if (!fs.existsSync(obsDir)) continue;

    try {
      const files = fs.readdirSync(obsDir).filter((f) => f.endsWith('.json')).sort();
      const consensusObs = [];
      for (const f of files) {
        const item = readJson(path.join(obsDir, f));
        if (item.kind === 'canonical_freshness') {
          consensusObs.push(item);
        }
      }
      if (consensusObs.length > 0) {
        const manifest = fs.existsSync(path.join(dir, 'manifest.json'))
          ? readJson(path.join(dir, 'manifest.json'))
          : null;
        included.push({ run_id: id, manifest, observations: consensusObs });
      }
    } catch (err) {
      skipped.push({ run_id: id, reason: err.message });
    }
  }

  const windowed = Number.isInteger(last) && last > 0 ? included.slice(-last) : included;
  return { included: windowed, skipped };
}

export function buildConsensusMatrix(includedRuns = []) {
  if (!includedRuns.length) {
    return {
      latest_run_id: null,
      target: null,
      total_urls: 0,
      full_canonical_consensus: 0,
      canonical_conflicts: 0,
      engine_discrepancies: 0,
      freshness_aligned: 0,
      freshness_conflicts: 0,
      freshness_insufficient: 0,
      rows: [],
      discrepancies: [],
    };
  }

  const latestRun = includedRuns[includedRuns.length - 1];
  const observations = latestRun.observations || [];

  const rows = [];
  const discrepancies = [];

  let fullCanonicalConsensus = 0;
  let canonicalConflicts = 0;
  let engineDiscrepancies = 0;
  let freshnessAligned = 0;
  let freshnessConflicts = 0;
  let freshnessInsufficient = 0;

  for (const obs of observations) {
    const data = obs.data || {};
    const signals = data.signals || {};
    const url = data.url || signals.final_url;
    const htmlCanonical = signals.html_canonical || null;
    const ogUrl = signals.open_graph_url || null;
    const sitemapPresent = Boolean(signals.sitemap_present);
    const canonicalConsensus = Boolean(data.canonical_consensus);
    const dateConsensus = data.date_consensus;
    const freshnessAssessment = data.freshness_assessment || 'insufficient_signals';
    const contentSnapshot = data.content_snapshot || {};
    const engineCanonicals = data.engine_selected_canonical || [];
    const canonicalConsensusWithEngines = data.canonical_consensus_with_engines;

    const itemDiscrepancies = [];
    if (htmlCanonical && htmlCanonical !== url) {
      itemDiscrepancies.push({
        type: 'non_self_canonical',
        description: `rel=canonical targets ${htmlCanonical} instead of self URL`,
      });
    }
    if (ogUrl && htmlCanonical && ogUrl !== htmlCanonical) {
      itemDiscrepancies.push({
        type: 'og_disagrees_with_canonical',
        description: `Open Graph URL (${ogUrl}) disagrees with rel=canonical (${htmlCanonical})`,
      });
    }
    if (!sitemapPresent) {
      itemDiscrepancies.push({
        type: 'missing_from_sitemap',
        description: 'Page URL is not listed in any XML sitemap',
      });
    }
    if (engineCanonicals.length > 0) {
      for (const ec of engineCanonicals) {
        if (ec.selected_canonical && htmlCanonical && ec.selected_canonical !== htmlCanonical) {
          itemDiscrepancies.push({
            type: 'engine_canonical_discrepancy',
            description: `${ec.engine || 'Search engine'} selected canonical (${ec.selected_canonical}) differs from declared rel=canonical (${htmlCanonical})`,
          });
        }
      }
    }
    if (freshnessAssessment === 'conflicting_signals') {
      itemDiscrepancies.push({
        type: 'conflicting_freshness_dates',
        description: 'HTTP Last-Modified, sitemap lastmod, and/or visible date signals disagree',
      });
    }

    if (canonicalConsensus) {
      fullCanonicalConsensus++;
    } else {
      canonicalConflicts++;
    }

    if (canonicalConsensusWithEngines === false) {
      engineDiscrepancies++;
    }

    if (freshnessAssessment === 'aligned_signals') {
      freshnessAligned++;
    } else if (freshnessAssessment === 'conflicting_signals') {
      freshnessConflicts++;
    } else {
      freshnessInsufficient++;
    }

    const row = {
      url,
      html_canonical: htmlCanonical,
      open_graph_url: ogUrl,
      sitemap_present: sitemapPresent,
      canonical_consensus: canonicalConsensus,
      engine_canonicals: engineCanonicals,
      canonical_consensus_with_engines: canonicalConsensusWithEngines,
      freshness_assessment: freshnessAssessment,
      date_consensus: dateConsensus,
      date_signals: data.date_signals || [],
      content_changed: contentSnapshot.changed_since_snapshot,
      content_hash: contentSnapshot.current_content_hash,
      discrepancies: itemDiscrepancies,
    };

    rows.push(row);
    if (itemDiscrepancies.length > 0) {
      discrepancies.push({ url, discrepancies: itemDiscrepancies });
    }
  }

  return {
    latest_run_id: latestRun.run_id,
    target: latestRun.manifest?.target?.location || null,
    total_urls: rows.length,
    full_canonical_consensus: fullCanonicalConsensus,
    canonical_conflicts: canonicalConflicts,
    engine_discrepancies: engineDiscrepancies,
    freshness_aligned: freshnessAligned,
    freshness_conflicts: freshnessConflicts,
    freshness_insufficient: freshnessInsufficient,
    rows,
    discrepancies,
  };
}

export function renderConsensusMarkdown(matrix, { runId, skipped = [], generatedAt = nowIso() } = {}) {
  const lines = [
    '# Canonical Discovery & Freshness Consensus Matrix',
    '',
    `> **Operating boundary:** ${NO_GUARANTEE}`,
    '',
    `- **Run ID:** \`${runId || matrix.latest_run_id || 'n/a'}\``,
    `- **Generated:** ${generatedAt}`,
    `- **Target:** \`${matrix.target || 'n/a'}\``,
    `- **Evaluated URLs:** ${matrix.total_urls}`,
    '',
    '## Executive Summary',
    '',
    '| Consensus Dimension | Count | Percentage |',
    '| --- | --- | --- |',
    `| Total URLs Evaluated | ${matrix.total_urls} | 100.0% |`,
    `| Full Publisher Canonical Consensus | ${matrix.full_canonical_consensus} | ${matrix.total_urls ? ((matrix.full_canonical_consensus / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    `| Internal Canonical Conflicts | ${matrix.canonical_conflicts} | ${matrix.total_urls ? ((matrix.canonical_conflicts / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    `| Search Engine Discrepancies | ${matrix.engine_discrepancies} | ${matrix.total_urls ? ((matrix.engine_discrepancies / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    `| Freshness Signals Aligned | ${matrix.freshness_aligned} | ${matrix.total_urls ? ((matrix.freshness_aligned / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    `| Freshness Signals Conflicting | ${matrix.freshness_conflicts} | ${matrix.total_urls ? ((matrix.freshness_conflicts / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    `| Freshness Data Insufficient | ${matrix.freshness_insufficient} | ${matrix.total_urls ? ((matrix.freshness_insufficient / matrix.total_urls) * 100).toFixed(1) : 0}% |`,
    '',
    '## URL Discovery Consensus Matrix',
    '',
    '| URL | rel=canonical | og:url | Sitemap | Engine Selected | Canonical Consensus | Freshness Assessment |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of matrix.rows) {
    const engineText = r.engine_canonicals.length
      ? r.engine_canonicals.map((e) => `${e.engine}: ${e.selected_canonical}`).join('; ')
      : '*(none)*';
    const canonStatus = r.canonical_consensus ? '✅ Consensus' : '❌ Conflict';
    const freshStatus = r.freshness_assessment === 'aligned_signals'
      ? '✅ Aligned'
      : r.freshness_assessment === 'conflicting_signals'
        ? '⚠️ Conflict'
        : '⚪ Insufficient';

    lines.push(`| \`${r.url}\` | \`${r.html_canonical || '(none)'}\` | \`${r.open_graph_url || '(none)'}\` | ${r.sitemap_present ? 'Yes' : 'No'} | ${engineText} | ${canonStatus} | ${freshStatus} |`);
  }

  if (matrix.discrepancies.length > 0) {
    lines.push('', '## Discrepancy Breakdown', '');
    lines.push('| URL | Discrepancy Type | Description |');
    lines.push('| --- | --- | --- |');
    for (const d of matrix.discrepancies) {
      for (const item of d.discrepancies) {
        lines.push(`| \`${d.url}\` | \`${item.type}\` | ${item.description} |`);
      }
    }
  }

  if (skipped.length > 0) {
    lines.push('', '## Skipped Runs', '');
    lines.push('| Run ID | Reason |');
    lines.push('| --- | --- |');
    for (const s of skipped) {
      lines.push(`| \`${s.run_id}\` | ${s.reason} |`);
    }
  }

  lines.push('', '---', `*Generated by Citable ${nowIso().slice(0, 10)}*`, '');
  return lines.join('\n');
}

export function renderConsensusHtml(matrix, { runId, skipped = [], generatedAt = nowIso() } = {}) {
  const rowsHtml = matrix.rows.map((r) => {
    const canonBadge = r.canonical_consensus
      ? '<span class="badge badge-pass">Consensus</span>'
      : '<span class="badge badge-fail">Conflict</span>';

    const freshBadge = r.freshness_assessment === 'aligned_signals'
      ? '<span class="badge badge-pass">Aligned</span>'
      : r.freshness_assessment === 'conflicting_signals'
        ? '<span class="badge badge-warn">Conflict</span>'
        : '<span class="badge badge-muted">Insufficient</span>';

    const engineText = r.engine_canonicals.length
      ? r.engine_canonicals.map((e) => `${e.engine}: ${e.selected_canonical}`).join('<br>')
      : '<span class="text-muted">none</span>';

    return `<tr>
  <td><code>${r.url}</code></td>
  <td><code>${r.html_canonical || '<span class="text-muted">none</span>'}</code></td>
  <td><code>${r.open_graph_url || '<span class="text-muted">none</span>'}</code></td>
  <td>${r.sitemap_present ? 'Yes' : '<span class="text-warn">No</span>'}</td>
  <td>${engineText}</td>
  <td>${canonBadge}</td>
  <td>${freshBadge}</td>
</tr>`;
  }).join('\n');

  const discrepancyRowsHtml = matrix.discrepancies.flatMap((d) =>
    d.discrepancies.map((item) => `<tr>
  <td><code>${d.url}</code></td>
  <td><code>${item.type}</code></td>
  <td>${item.description}</td>
</tr>`)
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canonical Discovery Consensus Matrix — Citable</title>
  <style>
    :root {
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --pass: #22c55e;
      --fail: #ef4444;
      --warn: #f59e0b;
    }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.8rem; }
    .meta { color: var(--text-muted); font-size: 0.9rem; }
    .notice {
      background: #1e293b;
      border-left: 4px solid var(--warn);
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; text-align: center; }
    .card-value { font-size: 1.8rem; font-weight: bold; margin: 0.25rem 0; }
    .card-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: var(--card-bg); border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
    th { background: #182234; color: var(--text-muted); font-weight: 600; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 0.8rem; color: #38bdf8; word-break: break-all; }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-pass { background: #064e3b; color: #6ee7b7; }
    .badge-fail { background: #7f1d1d; color: #fca5a5; }
    .badge-warn { background: #78350f; color: #fde68a; }
    .badge-muted { background: #334155; color: #cbd5e1; }
    .text-muted { color: var(--text-muted); }
    .text-warn { color: var(--warn); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Canonical Discovery & Freshness Consensus Matrix</h1>
      <div class="meta">Run: <code>${runId || matrix.latest_run_id || 'n/a'}</code> | Generated: ${generatedAt} | Target: <code>${matrix.target || 'n/a'}</code></div>
    </header>

    <div class="notice">
      <strong>Operating boundary:</strong> ${NO_GUARANTEE}
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">Total URLs</div>
        <div class="card-value">${matrix.total_urls}</div>
      </div>
      <div class="card">
        <div class="card-label">Canonical Consensus</div>
        <div class="card-value" style="color: var(--pass)">${matrix.full_canonical_consensus}</div>
      </div>
      <div class="card">
        <div class="card-label">Canonical Conflicts</div>
        <div class="card-value" style="color: var(--fail)">${matrix.canonical_conflicts}</div>
      </div>
      <div class="card">
        <div class="card-label">Engine Discrepancies</div>
        <div class="card-value" style="color: ${matrix.engine_discrepancies ? 'var(--fail)' : 'var(--text-muted)'}">${matrix.engine_discrepancies}</div>
      </div>
      <div class="card">
        <div class="card-label">Freshness Aligned</div>
        <div class="card-value" style="color: var(--pass)">${matrix.freshness_aligned}</div>
      </div>
    </div>

    <h2>URL Discovery Consensus Matrix</h2>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>rel=canonical</th>
          <th>og:url</th>
          <th>Sitemap</th>
          <th>Engine Selected</th>
          <th>Canonical Consensus</th>
          <th>Freshness Assessment</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="7" class="text-muted">No URLs evaluated</td></tr>'}
      </tbody>
    </table>

    ${discrepancyRowsHtml ? `
    <h2>Discrepancy Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Discrepancy Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${discrepancyRowsHtml}
      </tbody>
    </table>
    ` : ''}
  </div>
</body>
</html>`;
}
