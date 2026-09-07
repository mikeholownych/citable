import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';

const NO_GUARANTEE = 'This report calculates citation presence and share strictly from recorded observation runs and declared competitor domains. It does not estimate visibility, predict search rankings, or guarantee citation outcomes in live consumer experiences.';

export function extractDomain(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr.includes('://') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function matchesDomain(hostname, targetDomain) {
  if (!hostname || !targetDomain) return false;
  const h = hostname.toLowerCase();
  const t = extractDomain(targetDomain) || targetDomain.toLowerCase();
  return h === t || h.endsWith(`.${t}`);
}

export function loadCitationRuns(root, { since, last } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  const included = [];
  const skipped = [];
  if (!fs.existsSync(runsDir)) return { included, skipped };

  let runIds = fs.readdirSync(runsDir).sort();
  if (since) runIds = runIds.filter((id) => id >= since);

  for (const runId of runIds) {
    const dir = path.join(runsDir, runId);
    const obsDir = path.join(dir, 'observations');
    if (!fs.existsSync(obsDir)) continue;

    try {
      const obsFiles = fs.readdirSync(obsDir).filter((f) => f.endsWith('.json')).sort();
      const citations = [];
      const reviews = [];

      for (const f of obsFiles) {
        const item = readJson(path.join(obsDir, f));
        if (item.kind === 'citation') citations.push(item);
        if (item.kind === 'citation_review') reviews.push(item);
      }

      if (citations.length > 0 || reviews.length > 0) {
        const manifest = fs.existsSync(path.join(dir, 'manifest.json'))
          ? readJson(path.join(dir, 'manifest.json'))
          : null;
        included.push({ run_id: runId, manifest, citations, reviews });
      }
    } catch (err) {
      skipped.push({ run_id: runId, reason: err.message });
    }
  }

  const windowed = Number.isInteger(last) && last > 0 ? included.slice(-last) : included;
  const truncated = windowed.length < included.length && windowed.length > 0;
  return {
    included: windowed,
    skipped: truncated ? skipped.filter((item) => item.run_id >= windowed[0].run_id) : skipped,
  };
}

export function calculateShareOfVoice(includedRuns, competitors = [], firstPartyDomains = new Set()) {
  const promptsMap = new Map();
  let totalObservations = 0;
  let totalCitationsCount = 0;

  for (const run of includedRuns) {
    for (const item of run.citations) {
      totalObservations++;
      const promptId = item.data?.prompt_id || 'unspecified_prompt';
      const promptText = item.data?.prompt_text || promptId;
      const promptRecord = promptsMap.get(promptId) || {
        prompt_id: promptId,
        prompt_text: promptText,
        total_runs: 0,
        total_citations: 0,
        first_party_presence_runs: 0,
        first_party_citations: 0,
        competitors: {},
        other_citations: 0,
      };

      promptRecord.total_runs++;
      if (item.data?.property_cited) {
        promptRecord.first_party_presence_runs++;
      }

      const reviews = item.data?.citations || [];
      const competitorPresentInRun = new Set();

      for (const review of reviews) {
        promptRecord.total_citations++;
        totalCitationsCount++;
        const url = review.canonical_url || review.url || '';
        const host = extractDomain(url);

        const isFirstParty = review.first_party === true || (host && [...firstPartyDomains].some((d) => matchesDomain(host, d)));
        if (isFirstParty) {
          promptRecord.first_party_citations++;
          continue;
        }

        let matchedCompetitor = null;
        for (const comp of competitors) {
          const compDomains = comp.domains || [];
          if (host && compDomains.some((d) => matchesDomain(host, d))) {
            matchedCompetitor = comp;
            break;
          }
        }

        if (matchedCompetitor) {
          const compId = matchedCompetitor.competitor_id;
          promptRecord.competitors[compId] ||= { citations: 0, presence_runs: 0 };
          promptRecord.competitors[compId].citations++;
          competitorPresentInRun.add(compId);
        } else {
          promptRecord.other_citations++;
        }
      }

      for (const compId of competitorPresentInRun) {
        promptRecord.competitors[compId].presence_runs++;
      }

      promptsMap.set(promptId, promptRecord);
    }
  }

  // Calculate aggregates
  const aggregateCompetitors = {};
  for (const comp of competitors) {
    aggregateCompetitors[comp.competitor_id] = {
      name: comp.name,
      domains: comp.domains || [],
      citations: 0,
      presence_runs: 0,
    };
  }

  let aggregateFirstPartyCitations = 0;
  let aggregateFirstPartyPresenceRuns = 0;
  let aggregateOtherCitations = 0;

  for (const prompt of promptsMap.values()) {
    aggregateFirstPartyCitations += prompt.first_party_citations;
    aggregateFirstPartyPresenceRuns += prompt.first_party_presence_runs;
    aggregateOtherCitations += prompt.other_citations;

    for (const [compId, stats] of Object.entries(prompt.competitors)) {
      if (aggregateCompetitors[compId]) {
        aggregateCompetitors[compId].citations += stats.citations;
        aggregateCompetitors[compId].presence_runs += stats.presence_runs;
      }
    }
  }

  return {
    total_runs_evaluated: totalObservations,
    total_citations_recorded: totalCitationsCount,
    prompts: [...promptsMap.values()],
    aggregate: {
      first_party: {
        citations: aggregateFirstPartyCitations,
        presence_runs: aggregateFirstPartyPresenceRuns,
        citation_share: totalCitationsCount > 0 ? aggregateFirstPartyCitations / totalCitationsCount : null,
        presence_rate: totalObservations > 0 ? aggregateFirstPartyPresenceRuns / totalObservations : null,
      },
      competitors: Object.entries(aggregateCompetitors).map(([compId, data]) => ({
        competitor_id: compId,
        name: data.name,
        domains: data.domains,
        citations: data.citations,
        presence_runs: data.presence_runs,
        citation_share: totalCitationsCount > 0 ? data.citations / totalCitationsCount : null,
        presence_rate: totalObservations > 0 ? data.presence_runs / totalObservations : null,
      })),
      other: {
        citations: aggregateOtherCitations,
        citation_share: totalCitationsCount > 0 ? aggregateOtherCitations / totalCitationsCount : null,
      },
    },
  };
}

function formatPercent(val) {
  return val == null ? 'not evidenced' : `${(val * 100).toFixed(1)}%`;
}

export function renderShareOfVoiceMarkdown(data, skipped = []) {
  const lines = [];
  lines.push('# Citable share-of-voice report');
  lines.push('');
  lines.push(`- Observation runs evaluated: ${data.total_runs_evaluated}`);
  lines.push(`- Total citations recorded: ${data.total_citations_recorded}`);
  lines.push(`- Prompts evaluated: ${data.prompts.length}`);
  lines.push(`- Runs skipped: ${skipped.length}`);
  lines.push('');
  lines.push(`> ${NO_GUARANTEE}`);
  lines.push('');

  if (data.total_runs_evaluated === 0) {
    lines.push('## Insufficient history');
    lines.push('');
    lines.push('No citation observations were found in `.citable/runs/`. Run `citable observe citations` to record provider citation evidence.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Aggregate citation share');
  lines.push('');
  lines.push('| Entity | Status | Citations | Citation share | Presence rate |');
  lines.push('| --- | --- | --- | --- | --- |');

  lines.push(`| **First-party** | Primary | ${data.aggregate.first_party.citations} | ${formatPercent(data.aggregate.first_party.citation_share)} | ${formatPercent(data.aggregate.first_party.presence_rate)} |`);

  for (const comp of data.aggregate.competitors) {
    lines.push(`| ${comp.name} (\`${comp.competitor_id}\`) | Registered competitor | ${comp.citations} | ${formatPercent(comp.citation_share)} | ${formatPercent(comp.presence_rate)} |`);
  }

  lines.push(`| Third-party sources (unregistered) | Uncontested | ${data.aggregate.other.citations} | ${formatPercent(data.aggregate.other.citation_share)} | — |`);
  lines.push('');

  lines.push('## Prompt breakdown');
  lines.push('');
  for (const prompt of data.prompts) {
    lines.push(`### \`${prompt.prompt_id}\`: "${prompt.prompt_text}"`);
    lines.push('');
    lines.push(`- Total runs: ${prompt.total_runs}`);
    lines.push(`- Total citations: ${prompt.total_citations}`);
    lines.push('');
    lines.push('| Entity | Citations | Share | Prompt presence |');
    lines.push('| --- | --- | --- | --- |');
    const fpShare = prompt.total_citations > 0 ? prompt.first_party_citations / prompt.total_citations : null;
    const fpPres = prompt.total_runs > 0 ? prompt.first_party_presence_runs / prompt.total_runs : null;
    lines.push(`| First-party | ${prompt.first_party_citations} | ${formatPercent(fpShare)} | ${formatPercent(fpPres)} |`);

    for (const comp of data.aggregate.competitors) {
      const stats = prompt.competitors[comp.competitor_id] || { citations: 0, presence_runs: 0 };
      const compShare = prompt.total_citations > 0 ? stats.citations / prompt.total_citations : null;
      const compPres = prompt.total_runs > 0 ? stats.presence_runs / prompt.total_runs : null;
      lines.push(`| ${comp.name} | ${stats.citations} | ${formatPercent(compShare)} | ${formatPercent(compPres)} |`);
    }
    const otherShare = prompt.total_citations > 0 ? prompt.other_citations / prompt.total_citations : null;
    lines.push(`| Other | ${prompt.other_citations} | ${formatPercent(otherShare)} | — |`);
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

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderShareOfVoiceHtml(data, skipped = []) {
  const html = [];
  html.push('<!doctype html>');
  html.push('<html lang="en">');
  html.push('<head>');
  html.push('<meta charset="utf-8" />');
  html.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  html.push('<title>Citable share-of-voice report</title>');
  html.push('<style>');
  html.push('body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1c1c1c; }');
  html.push('table { border-collapse: collapse; width: 100%; font-size: 0.875rem; margin: 1rem 0 2rem; }');
  html.push('th, td { border: 1px solid #d4d4d4; padding: 0.375rem 0.5rem; text-align: left; }');
  html.push('th { background: #f3f3f3; }');
  html.push('code { font-size: 0.8125rem; }');
  html.push('blockquote { border-left: 4px solid #999; margin: 0 0 1.5rem; padding: 0.25rem 1rem; color: #333; }');
  html.push('.bar-container { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin: 1rem 0; border: 1px solid #ccc; }');
  html.push('.bar-fp { background: #2f6f4f; color: #fff; text-align: center; font-size: 0.75rem; line-height: 24px; }');
  html.push('.bar-comp { background: #e09f3e; color: #fff; text-align: center; font-size: 0.75rem; line-height: 24px; }');
  html.push('.bar-other { background: #999; color: #fff; text-align: center; font-size: 0.75rem; line-height: 24px; }');
  html.push('.insufficient { background: #fbf1d8; border: 1px solid #e2c98a; padding: 0.75rem 1rem; }');
  html.push('</style>');
  html.push('</head>');
  html.push('<body>');
  html.push('<h1>Citable share-of-voice report</h1>');
  html.push('<ul>');
  html.push(`<li>Observation runs evaluated: ${data.total_runs_evaluated}</li>`);
  html.push(`<li>Total citations recorded: ${data.total_citations_recorded}</li>`);
  html.push(`<li>Prompts evaluated: ${data.prompts.length}</li>`);
  html.push(`<li>Runs skipped: ${skipped.length}</li>`);
  html.push('</ul>');
  html.push(`<blockquote>${escapeHtml(NO_GUARANTEE)}</blockquote>`);

  if (data.total_runs_evaluated === 0) {
    html.push('<section class="insufficient"><h2>Insufficient history</h2><p>No citation observations found in <code>.citable/runs/</code>.</p></section>');
    html.push('</body></html>');
    return html.join('\n');
  }

  html.push('<h2>Aggregate citation distribution</h2>');
  const fpPct = data.aggregate.first_party.citation_share ? (data.aggregate.first_party.citation_share * 100).toFixed(1) : 0;
  const otherPct = data.aggregate.other.citation_share ? (data.aggregate.other.citation_share * 100).toFixed(1) : 0;

  html.push('<div class="bar-container">');
  if (fpPct > 0) html.push(`<div class="bar-fp" style="width: ${fpPct}%;">First-party (${fpPct}%)</div>`);
  for (const comp of data.aggregate.competitors) {
    const cPct = comp.citation_share ? (comp.citation_share * 100).toFixed(1) : 0;
    if (cPct > 0) html.push(`<div class="bar-comp" style="width: ${cPct}%;">${escapeHtml(comp.name)} (${cPct}%)</div>`);
  }
  if (otherPct > 0) html.push(`<div class="bar-other" style="width: ${otherPct}%;">Other (${otherPct}%)</div>`);
  html.push('</div>');

  html.push('<table>');
  html.push('<thead><tr><th>Entity</th><th>Type</th><th>Citations</th><th>Citation share</th><th>Presence rate</th></tr></thead>');
  html.push('<tbody>');
  html.push(`<tr><td><strong>First-party</strong></td><td>Primary</td><td>${data.aggregate.first_party.citations}</td><td>${formatPercent(data.aggregate.first_party.citation_share)}</td><td>${formatPercent(data.aggregate.first_party.presence_rate)}</td></tr>`);
  for (const comp of data.aggregate.competitors) {
    html.push(`<tr><td>${escapeHtml(comp.name)} (<code>${escapeHtml(comp.competitor_id)}</code>)</td><td>Competitor</td><td>${comp.citations}</td><td>${formatPercent(comp.citation_share)}</td><td>${formatPercent(comp.presence_rate)}</td></tr>`);
  }
  html.push(`<tr><td>Other third-party</td><td>Unregistered</td><td>${data.aggregate.other.citations}</td><td>${formatPercent(data.aggregate.other.citation_share)}</td><td>—</td></tr>`);
  html.push('</tbody></table>');

  html.push('<h2>Prompt breakdown</h2>');
  for (const prompt of data.prompts) {
    html.push(`<h3><code>${escapeHtml(prompt.prompt_id)}</code>: &ldquo;${escapeHtml(prompt.prompt_text)}&rdquo;</h3>`);
    html.push(`<ul><li>Runs: ${prompt.total_runs}</li><li>Citations: ${prompt.total_citations}</li></ul>`);
    html.push('<table><thead><tr><th>Entity</th><th>Citations</th><th>Share</th><th>Presence rate</th></tr></thead><tbody>');
    const fpShare = prompt.total_citations > 0 ? prompt.first_party_citations / prompt.total_citations : null;
    const fpPres = prompt.total_runs > 0 ? prompt.first_party_presence_runs / prompt.total_runs : null;
    html.push(`<tr><td>First-party</td><td>${prompt.first_party_citations}</td><td>${formatPercent(fpShare)}</td><td>${formatPercent(fpPres)}</td></tr>`);
    for (const comp of data.aggregate.competitors) {
      const stats = prompt.competitors[comp.competitor_id] || { citations: 0, presence_runs: 0 };
      const compShare = prompt.total_citations > 0 ? stats.citations / prompt.total_citations : null;
      const compPres = prompt.total_runs > 0 ? stats.presence_runs / prompt.total_runs : null;
      html.push(`<tr><td>${escapeHtml(comp.name)}</td><td>${stats.citations}</td><td>${formatPercent(compShare)}</td><td>${formatPercent(compPres)}</td></tr>`);
    }
    const otherShare = prompt.total_citations > 0 ? prompt.other_citations / prompt.total_citations : null;
    html.push(`<tr><td>Other</td><td>${prompt.other_citations}</td><td>${formatPercent(otherShare)}</td><td>—</td></tr>`);
    html.push('</tbody></table>');
  }

  if (skipped.length) {
    html.push('<h2>Skipped runs</h2><ul>');
    for (const item of skipped) html.push(`<li><code>${escapeHtml(item.run_id)}</code>: ${escapeHtml(item.reason)}</li>`);
    html.push('</ul>');
  }

  html.push('</body></html>');
  return html.join('\n');
}
