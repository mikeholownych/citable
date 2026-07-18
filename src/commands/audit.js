import fs from 'node:fs';
import path from 'node:path';
import { buildContext } from './context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';
import { createRun } from '../evidence/run.js';
import { summarize, renderMarkdownReport } from '../reporting/report.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { writeJson, sha256 } from '../shared/io.js';
import { extractModified } from '../detectors/lifeMeas.js';

/** `citable audit [scope]` — run detectors and produce an evidence package. */
export async function audit(root, { target, scope, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  const detectors = selectDetectors({ scope });

  const run = createRun(root, {
    command: `audit${scope ? ' ' + scope : ''}`,
    argv: process.argv.slice(2),
    target: {
      kind: ctx.site ? ctx.site.mode : 'registries',
      location: ctx.site ? ctx.site.location : path.join(root, '.citable'),
      environment: 'local',
    },
    configHash: sha256(JSON.stringify(ctx.config)),
  });
  ctx.runId = run.runId;
  ctx.timestamp = run.manifest.timestamp;

  run.manifest.warnings.push(...ctx.warnings);
  if (!ctx.site) {
    run.manifest.incomplete_checks.push('No site target supplied and no built_output_dir configured: page/site detectors were skipped; this run covers registries only.');
  }
  if (ctx.site?.fetchErrors?.length) {
    run.manifest.errors.push(...ctx.site.fetchErrors);
  }

  const { findings, detectorsRun, detectorsSkipped, errors } = runDetectors(detectors, ctx);
  run.manifest.detectors_run = detectorsRun;
  run.manifest.detectors_skipped = detectorsSkipped;
  run.manifest.errors.push(...errors);

  // Validate every finding against the data contract; a contract breach fails the run.
  const invalid = [];
  for (const f of findings) {
    const { valid, errors: e } = validateAgainst('finding.schema.json', f);
    if (!valid) invalid.push(`${f.finding_id}: ${e.join('; ')}`);
  }
  if (invalid.length) {
    run.manifest.errors.push(...invalid);
    run.finalize('failed');
    throw new Error(`findings violate the data contract:\n${invalid.join('\n')}`);
  }

  // Evidence package artifacts
  run.writeArtifact('findings.json', findings);
  const summary = summarize(findings, {
    detectorsRun,
    detectorsSkipped,
    promptResults: ctx.promptResults || [],
    targetOrigin: ctx.site?.baseUrl ? new URL(ctx.site.baseUrl).origin : null,
  });
  run.writeArtifact('summary.json', summary);
  run.writeArtifact('inputs.json', {
    target: run.manifest.target, scope: scope ?? 'all',
    registry_counts: Object.fromEntries(Object.entries(ctx.registries).map(([k, v]) => [k, v.entries.length])),
    pages_audited: ctx.site?.pages.length ?? 0,
  });
  run.writeArtifact('environment.json', {
    node: process.version, platform: process.platform, cwd: root,
    ref_date: ctx.refDate.toISOString(),
  });
  if (ctx.site) {
    run.writeArtifact('pages/index.json', ctx.site.pages.map((p) => ({
      url: p.url, status: p.status, title: p.title, canonicals: p.canonicals,
      noindex: p.noindex, wordCount: p.wordCount, sourceFile: p.sourceFile,
      contentHash: ctx.hashPage(p),
    })));
    if (ctx.site.robotsText != null) run.writeArtifact('robots/robots.txt', ctx.site.robotsText);
    for (const sm of ctx.site.sitemaps) {
      run.writeArtifact(`sitemaps/${path.basename(String(sm.source))}.json`, sm.parsed);
    }
    run.writeArtifact('links/graph.json', {
      inbound: Object.fromEntries([...ctx.site.inbound.entries()].map(([k, v]) => [k, v.length])),
      outbound: Object.fromEntries([...ctx.site.outbound.entries()].map(([k, v]) => [k, v.map((e) => e.to)])),
    });
    const schemaBlocks = [];
    for (const p of ctx.site.pages) for (const j of p.jsonLd) schemaBlocks.push({ url: p.url, parseError: j.parseError, blocks: j.blocks });
    run.writeArtifact('schema/jsonld.json', schemaBlocks);
    for (const p of ctx.site.pages) {
      run.writeArtifact(`headers/${encodeURIComponent(p.url)}.json`, { status: p.status, headers: p.headers });
    }
  }

  const report = renderMarkdownReport({ findings, manifest: run.manifest, summary, detectorsSkipped });
  run.writeArtifact('report.md', report);

  // Update the latest page snapshot for regression/freshness comparison
  if (ctx.site) {
    const snap = { taken_at: run.manifest.timestamp, run_id: run.runId, pages: {} };
    for (const p of ctx.site.pages) {
      snap.pages[p.url] = { contentHash: ctx.hashPage(p), dateModified: extractModified(p), status: p.status };
    }
    const snapDir = path.join(root, '.citable', 'snapshots');
    fs.mkdirSync(snapDir, { recursive: true });
    if (fs.existsSync(path.join(snapDir, 'pages-latest.json'))) {
      fs.copyFileSync(path.join(snapDir, 'pages-latest.json'), path.join(snapDir, `pages-${run.runId}.prev.json`));
    }
    writeJson(path.join(snapDir, 'pages-latest.json'), snap);
  }

  const status = run.manifest.errors.length ? 'completed_with_warnings'
    : run.manifest.incomplete_checks.length ? 'incomplete' : 'completed';
  const dir = run.finalize(status);
  return { runId: run.runId, dir, findings, summary, manifest: run.manifest, report };
}
