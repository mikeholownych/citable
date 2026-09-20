import fs from 'node:fs';
import path from 'node:path';
import { readYaml, readJson, sha256, parseRefDate } from '../shared/io.js';
import { loadRegistries } from '../registries/index.js';
import { buildSiteFromDir, buildSiteFromUrl } from '../extractor/site.js';

const AUDIT_BUDGET_DEFAULTS = Object.freeze({ maxPages: 500, timeBudgetSeconds: 1800 });

function validateBudget(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}; received ${String(value)}`);
  }
  return value;
}

/** Resolve bounded network collection budgets: command options > config > safe defaults. */
export function resolveAuditBudgets(config = {}, options = {}) {
  const configured = config.audit ?? {};
  const maxPagesFromOptions = options.maxPages !== undefined;
  const timeBudgetFromOptions = options.timeBudgetSeconds !== undefined;
  const maxPages = maxPagesFromOptions
    ? options.maxPages
    : configured.max_pages !== undefined ? configured.max_pages : AUDIT_BUDGET_DEFAULTS.maxPages;
  const timeBudgetSeconds = timeBudgetFromOptions
    ? options.timeBudgetSeconds
    : configured.time_budget_seconds !== undefined
      ? configured.time_budget_seconds
      : AUDIT_BUDGET_DEFAULTS.timeBudgetSeconds;

  return {
    maxPages: validateBudget(maxPages, maxPagesFromOptions ? '--max-pages' : 'audit.max_pages', 10_000),
    timeBudgetSeconds: validateBudget(
      timeBudgetSeconds,
      timeBudgetFromOptions ? '--time-budget-seconds' : 'audit.time_budget_seconds',
      86_400,
    ),
  };
}

/** Assemble the shared execution context used by audit-family commands. */
export async function buildContext(root, {
  target, baseUrl, refDate, viewport = null,
  maxPages, timeBudgetSeconds, fetcher, concurrency = 1,
} = {}) {
  const warnings = [];
  const configFile = path.join(root, '.citable', 'config.yaml');
  const config = fs.existsSync(configFile) ? readYaml(configFile) : { version: 1 };
  const { registries, problems } = loadRegistries(root);
  warnings.push(...problems);

  let site = null;
  let auditBudgets = null;
  const resolvedBase = baseUrl ?? config.site?.base_url ?? 'https://example.test';
  if (target) {
    if (/^https?:\/\//.test(target)) {
      auditBudgets = resolveAuditBudgets(config, { maxPages, timeBudgetSeconds });
      site = await buildSiteFromUrl(target, { ...auditBudgets, fetcher, concurrency });
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

  // Observations recorded under .citable/runs/*/observations/
  const observations = [];
  if (fs.existsSync(runsDir)) {
    for (const run of fs.readdirSync(runsDir)) {
      const obsDir = path.join(runsDir, run, 'observations');
      if (!fs.existsSync(obsDir)) continue;
      for (const f of fs.readdirSync(obsDir)) {
        if (f.endsWith('.json')) {
          try { observations.push(readJson(path.join(obsDir, f))); } catch { warnings.push(`unreadable observation: ${run}/${f}`); }
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
    observations: observations.length ? observations : null,
    snapshots,
    auditBudgets,
    refDate: parseRefDate(refDate),
    viewport,
    hashPage: (p) => sha256(p.text),
    warnings,
  };
}
