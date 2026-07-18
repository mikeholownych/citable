#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { init } from '../commands/init.js';
import { audit } from '../commands/audit.js';
import { validate } from '../commands/validate.js';
import { mapClaims } from '../commands/mapClaims.js';
import { substantiate } from '../commands/substantiate.js';
import { inspect } from '../commands/inspect.js';
import { schemaCommand } from '../commands/schemaCmd.js';
import { compareSnapshots } from '../commands/compareSnapshots.js';
import { isInstallerCommand, runInstallerCommand } from '../installer/index.js';
import { selfUpgradeCommand, selfUpgradeExitCode } from '../commands/selfUpgrade.js';

const HELP = `citable — SEO / AEO / GEO audit, remediation, validation, and governance

Usage: citable <command> [options]

Commands
  install                   Install the Citable skill into coding-agent harnesses
  update                    Update managed Citable skill installations
  check                     Report installed and available Citable versions
  uninstall                 Remove managed Citable skill files
  list                      List detected providers and installation state
  doctor                    Diagnose installer, provider, and integrity problems
  init                      Initialize .citable/ context and registries (non-destructive)
  audit [scope]             Run detectors; scopes: technical seo aeo geo architecture entity
                            claims evidence schema lifecycle corroboration
  inspect <page>            Profile one page (URL path or source file)
  map-claims                Extract material claim candidates from pages (--write to save)
  substantiate              Assess claim/evidence status (--write to apply downgrades)
  schema                    Validate deployed JSON-LD and propose registry-derived schema
  validate [mode]           registries (default) | claims | evidence | schema | links
  compare-snapshots [a b]   Regression diff between two audit runs
  self-upgrade              Check for a newer version and upgrade the npx cache

Options
  --target <dir|url>        Built output directory or deployed URL to audit
  --base-url <url>          Base URL for path resolution of a built output dir
  --ref-date <YYYY-MM-DD>   Reference date for expiry/staleness checks (default: today)
  --write                   Persist registry changes (map-claims, substantiate)
  --json                    Machine-readable output only

No output of this tool guarantees crawling, indexing, ranking, citation,
recommendation, inclusion, sentiment, or conversion outcomes.`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (a === '--json') args.json = true;
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--ref-date') args.refDate = argv[++i];
    else if (a === '--force') args.force = true;
    else args._.push(a);
  }
  return args;
}

function out(args, human, data) {
  if (args.json) console.log(JSON.stringify(data, null, 2));
  else console.log(human);
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const cmd = argv[0];
  if (isInstallerCommand(cmd)) return runInstallerCommand(cmd, argv.slice(1), options);
  const args = parseArgs(argv.slice(1));
  const root = options.cwd ?? process.cwd();

  try {
    switch (cmd) {
      case 'init': {
        const r = init(root, { force: args.force });
        out(args, `Initialized .citable/\n  created: ${r.created.join(', ') || 'nothing'}\n  skipped: ${r.skipped.join(', ') || 'nothing'}\n  detected framework: ${r.detected.framework ?? 'unknown'}\n  unresolved assumptions:\n${r.unresolved.map((u) => `    - ${u}`).join('\n') || '    none'}`, r);
        break;
      }
      case 'audit': {
        const scope = args._[0];
        const r = await audit(root, { target: args.target, scope, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, `Audit ${r.runId}: ${r.summary.total} finding(s) [${Object.entries(r.summary.by_severity).map(([k, v]) => `${k}:${v}`).join(' ')}]\nEvidence package: ${r.dir}\nReport: ${path.join(r.dir, 'report.md')}\nStatus: ${r.manifest.status}${r.manifest.incomplete_checks.length ? `\nIncomplete: ${r.manifest.incomplete_checks.join('; ')}` : ''}`, { runId: r.runId, dir: r.dir, summary: r.summary, status: r.manifest.status });
        break;
      }
      case 'inspect': {
        if (!args._[0]) throw new Error('usage: citable inspect <page> --target <dir|url>');
        const r = await inspect(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, `Inspect ${r.url}\n  title: ${r.title}\n  status: ${r.status}; canonical: ${r.canonicals.join(', ') || 'none'}; robots: ${r.robotsDirectives.join(',') || 'default'}\n  intent: ${r.primary_intent ?? 'undeclared'}; conversion: ${r.conversion_action ?? 'undeclared'}\n  entities: ${r.entities.map((e) => e.name).join(', ') || 'none'}\n  claims: ${r.claims.length}; findings: ${r.findings.length}\n  ambiguity:\n${r.unresolved_ambiguity.map((a) => `    - ${a}`).join('\n') || '    none'}`, r);
        break;
      }
      case 'map-claims': {
        const r = await mapClaims(root, { target: args.target, baseUrl: args.baseUrl, write: args.write, refDate: args.refDate });
        out(args, `map-claims: ${r.candidates.length} candidate claim(s)${args.write ? `, ${r.written} written to registry as candidate/review_required` : ' (dry run — use --write to save)'}\n` + r.candidates.map((c) => `  [${c.claim_type}${c.review_required ? ', REVIEW REQUIRED' : ''}] ${c.claim.slice(0, 100)}\n    at ${c.source_location}`).join('\n'), r);
        break;
      }
      case 'substantiate': {
        const r = substantiate(root, { write: args.write, refDate: args.refDate });
        out(args, `substantiate: ${r.assessments.length} claim(s) assessed${args.write ? ' (changes written)' : ' (dry run)'}\n` + r.assessments.map((a) => `  ${a.claim_id}: ${a.previous_status} → ${a.outcome}\n    ${a.reasons.join('; ')}${a.required_input.length ? `\n    required input: ${a.required_input.join(', ')}` : ''}`).join('\n'), r);
        break;
      }
      case 'schema': {
        const r = await schemaCommand(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, `schema: ${r.findings.length} finding(s), ${r.proposals.length} proposal(s), ${r.blocked.length} blocked (incomplete entity data)\n` + r.blocked.map((b) => `  BLOCKED ${b.entity_id}: needs ${b.required_input.join(', ')}`).join('\n'), r);
        break;
      }
      case 'validate': {
        const mode = args._[0] ?? 'registries';
        const r = await validate(root, { mode, target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, `validate ${mode}: ${r.ok ? 'OK' : 'PROBLEMS'}\n` + (r.problems.length ? r.problems.map((p) => `  - ${p}`).join('\n') : '  registries structurally valid') + (r.findings?.length ? `\n  detector findings: ${r.findings.length} (see run ${r.runId})` : ''), r);
        if (!r.ok) process.exitCode = 1;
        break;
      }
      case 'compare-snapshots': {
        const r = compareSnapshots(root, { runA: args._[0], runB: args._[1] });
        out(args, `compare ${r.runA} → ${r.runB}\n  new: ${r.summary.new_findings} (critical/high: ${r.summary.regression_critical_or_high})\n  resolved: ${r.summary.resolved_findings}\n  persisting: ${r.summary.persisting_findings}`, r);
        if (r.summary.regression_critical_or_high > 0) process.exitCode = 1;
        break;
      }
      case 'self-upgrade': {
        const output = await selfUpgradeCommand(argv.slice(1));
        console.log(output);
        process.exitCode = selfUpgradeExitCode(output);
        break;
      }
      case undefined:
        console.log(HELP);
        break;
      default:
        console.error(`unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exitCode = 2;
    }
  } catch (err) {
    console.error(`citable: ${err.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  if (Number.isInteger(code)) process.exitCode = code;
}
