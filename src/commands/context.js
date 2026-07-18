import fs from 'node:fs';
import path from 'node:path';
import { readYaml, readJson, sha256, parseRefDate } from '../shared/io.js';
import { loadRegistries } from '../registries/index.js';
import { buildSiteFromDir, buildSiteFromUrl } from '../extractor/site.js';

/** Assemble the shared execution context used by audit-family commands. */
export async function buildContext(root, { target, baseUrl, refDate } = {}) {
  const warnings = [];
  const configFile = path.join(root, '.citable', 'config.yaml');
  const config = fs.existsSync(configFile) ? readYaml(configFile) : { version: 1 };
  const { registries, problems } = loadRegistries(root);
  warnings.push(...problems);

  let site = null;
  const resolvedBase = baseUrl ?? config.site?.base_url ?? 'https://example.test';
  if (target) {
    if (/^https?:\/\//.test(target)) {
      site = await buildSiteFromUrl(target);
    } else if (fs.existsSync(target)) {
      site = buildSiteFromDir(target, { baseUrl: resolvedBase });
    } else {
      throw new Error(`audit target not found: ${target}`);
    }
  } else if (config.site?.built_output_dir && fs.existsSync(path.join(root, config.site.built_output_dir))) {
    site = buildSiteFromDir(path.join(root, config.site.built_output_dir), { baseUrl: resolvedBase });
  }

  // Prompt observations recorded under .citable/runs/*/prompt-results/
  const promptResults = [];
  const runsDir = path.join(root, '.citable', 'runs');
  if (fs.existsSync(runsDir)) {
    for (const run of fs.readdirSync(runsDir)) {
      const prDir = path.join(runsDir, run, 'prompt-results');
      if (!fs.existsSync(prDir)) continue;
      for (const f of fs.readdirSync(prDir)) {
        if (f.endsWith('.json')) {
          try { promptResults.push(readJson(path.join(prDir, f))); } catch { warnings.push(`unreadable prompt result: ${run}/${f}`); }
        }
      }
    }
  }

  // Latest page snapshot (for regression/freshness comparison)
  let snapshots = null;
  const snapFile = path.join(root, '.citable', 'snapshots', 'pages-latest.json');
  if (fs.existsSync(snapFile)) {
    try { snapshots = readJson(snapFile); } catch { warnings.push('unreadable pages snapshot'); }
  }

  return {
    root,
    config,
    registries,
    site,
    promptResults: promptResults.length ? promptResults : null,
    snapshots,
    refDate: parseRefDate(refDate),
    hashPage: (p) => sha256(p.text),
    warnings,
  };
}
