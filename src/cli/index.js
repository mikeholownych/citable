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
import { actionPlan } from '../commands/actionPlan.js';
import { observe } from '../commands/observe.js';
import { applyRemediation } from '../commands/applyRemediation.js';
import { monitor } from '../commands/monitor.js';
import { evaluateObjective, importMetrics, initializeObjective, validateObjectives } from '../commands/measurement.js';
import { configureConnection, connectionStatus, discoverConnections, disconnectConnection, syncConnection, validateConnection } from '../commands/connect.js';
import { evaluateDispositions, validateGovernance } from '../commands/governance.js';
import { evaluateReviews, initializeSamplingPlan, prioritizeReviews, queueReviews, selectSample } from '../commands/reviews.js';

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
  action-plan [run]         Turn audit findings into ordered remediation work
  observe <mode>            Collect render, index, citation, log, Bing, passage,
                            consensus, performance, or corroboration evidence
  apply                     Apply a reviewed, hash-locked remediation spec
  monitor [runA runB]       Compare observation runs and emit regression alerts
  metrics import            Import declared metric observations from CSV/JSON
  connect status            List optional connectors and configured connections
  connect configure         Configure non-secret connection state (--write to save)
  connect discover          Discover provider properties using environment auth
  connect validate          Verify configured property access
  connect sync              Collect declared metrics into immutable observations
  connect disconnect        Remove optional connection state (--write to confirm)
  objectives init           Validate/add one objective from --input (--write to save)
  objectives validate       Validate objective contracts and metric references
  evaluate [objective-id]   Compare objective baseline and evaluation windows
  governance validate       Validate reviewer, policy, and exception controls
  governance evaluate [run] Produce immutable enforcement dispositions without changing findings
  reviews queue [run policy] Create semantic review work from heuristic findings
  reviews prioritize        Rank review work from explicit materiality inputs
  reviews plan              Validate/add a sampling plan from --input
  reviews sample [plan]     Select a reproducible census or seeded random sample
  reviews evaluate          Detect stale decisions and require disagreement adjudication
  self-upgrade              Check for a newer version and upgrade the npx cache

Options
  --target <dir|url>        Built output directory or deployed URL to audit
  --base-url <url>          Base URL for path resolution of a built output dir
  --ref-date <YYYY-MM-DD>   Reference date for expiry/staleness checks (default: today)
  --input <file>            Import file or remediation specification
  --provider <name>         Provider label for imported observations
  --dataset <name>          Provider export dataset (for example ai_performance)
  --connection-id <id>      Connection registry identifier
  --property-id <id>        Provider property or site identifier
  --credential-env <name>   Environment variable containing the access token
  --start-date <YYYY-MM-DD> Connector collection window start
  --end-date <YYYY-MM-DD>   Connector collection window end
  --api-key <key>           API key (prefer provider environment variables)
  --site-url <property>     Search Console property for live URL inspection
  --access-token <token>    OAuth token (prefer provider environment variables)
  --endpoint <url>          Controlled citation adapter endpoint
  --repeat <count>          Repetitions per prompt for citation experiments
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
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--provider') args.provider = argv[++i];
    else if (a === '--dataset') args.dataset = argv[++i];
    else if (a === '--connection-id') args.connectionId = argv[++i];
    else if (a === '--property-id') args.propertyId = argv[++i];
    else if (a === '--credential-env') args.credentialEnv = argv[++i];
    else if (a === '--start-date') args.startDate = argv[++i];
    else if (a === '--end-date') args.endDate = argv[++i];
    else if (a === '--api-key') args.apiKey = argv[++i];
    else if (a === '--site-url') args.siteUrl = argv[++i];
    else if (a === '--access-token') args.accessToken = argv[++i];
    else if (a === '--endpoint') args.endpoint = argv[++i];
    else if (a === '--repeat') args.repeat = Number(argv[++i]);
    else if (a === '--timeout') args.timeout = Number(argv[++i]);
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
  if (['help', '--help', '-h'].includes(cmd)) {
    console.log(HELP);
    return 0;
  }
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
      case 'action-plan': {
        const r = actionPlan(root, { runId: args._[0] });
        out(args, `action-plan: ${r.summary.total_actions} action(s) [ready:${r.summary.ready} blocked:${r.summary.blocked}]\nPlan: ${path.join(r.dir, 'action-plan.md')}\nSource audit: ${r.source_run_id}`, r);
        break;
      }
      case 'observe': {
        const mode = args._[0];
        const r = await observe(root, mode, args);
        out(args, `observe ${mode}: ${r.summary.total} observation(s) [${Object.entries(r.summary.by_state).map(([k, v]) => `${k}:${v}`).join(' ')}]\nEvidence package: ${r.dir}\nStatus: ${r.manifest.status}`, r);
        break;
      }
      case 'apply': {
        const r = applyRemediation(root, args);
        out(args, `apply: ${r.operations.length} operation(s) ${r.write ? 'applied' : 'proposed (dry run)'}\nEvidence package: ${r.dir}\nSource audit: ${r.source_run_id}`, r);
        break;
      }
      case 'monitor': {
        const r = monitor(root, { runA: args._[0], runB: args._[1] });
        out(args, `monitor ${r.run_a} → ${r.run_b}: ${r.summary.alerts} alert(s), ${r.summary.critical_or_high} critical/high\nReport: ${path.join(r.dir, 'latest.json')}`, r);
        if (r.summary.critical_or_high > 0) process.exitCode = 1;
        break;
      }
      case 'metrics': {
        if (args._[0] !== 'import') throw new Error('usage: citable metrics import --provider <name> --input <csv|json>');
        const r = importMetrics(root, { input: args.input, provider: args.provider });
        out(args, `metrics import: ${r.summary.total} observation(s) from ${args.provider}\nEvidence package: ${r.dir}`, r);
        break;
      }
      case 'connect': {
        const mode = args._[0];
        if (mode === 'status') {
          const r = connectionStatus(root);
          out(args, `connect status: ${r.connections.length} configured connection(s)\n` + r.available.map((item) => `  ${item.provider}: token via ${item.credential_env}`).join('\n'), r);
        } else if (mode === 'configure') {
          const r = configureConnection(root, args);
          out(args, `connect configure: ${r.connection.connection_id} ${r.written ? 'written' : 'valid (dry run; use --write to save)'}`, r);
        } else if (mode === 'discover') {
          const r = await discoverConnections(root, args);
          out(args, `connect discover ${r.provider}: ${r.properties.length} accessible property/properties`, r);
        } else if (mode === 'validate') {
          const r = await validateConnection(root, args);
          out(args, `connect validate ${r.connection_id}: ${r.valid ? 'accessible' : 'not accessible'}`, r);
          if (!r.valid) process.exitCode = 1;
        } else if (mode === 'sync') {
          const r = await syncConnection(root, args);
          out(args, `connect sync ${r.connection_id}: ${r.summary.total} metric observation(s)\nEvidence package: ${r.dir}`, r);
        } else if (mode === 'disconnect') {
          const r = disconnectConnection(root, args);
          out(args, `connect disconnect ${r.connection_id}: ${r.disconnected ? 'removed' : 'dry run; use --write to remove'}`, r);
        } else throw new Error('usage: citable connect <status|configure|discover|validate|sync> [options]');
        break;
      }
      case 'objectives': {
        const mode = args._[0];
        if (mode === 'init') {
          const r = initializeObjective(root, { input: args.input, write: args.write });
          out(args, `objectives init: ${r.objective.objective_id} ${r.written ? 'written' : 'valid (dry run; use --write to save)'}`, r);
        } else if (mode === 'validate') {
          const r = validateObjectives(root);
          out(args, `objectives validate: ${r.ok ? 'OK' : 'PROBLEMS'} (${r.count} objective(s))${r.problems.length ? `\n${r.problems.map((problem) => `  - ${problem}`).join('\n')}` : ''}`, r);
          if (!r.ok) process.exitCode = 1;
        } else throw new Error('usage: citable objectives <init|validate> [--input <json|yaml>] [--write]');
        break;
      }
      case 'evaluate': {
        const r = evaluateObjective(root, { objectiveId: args._[0], refDate: args.refDate });
        out(args, `evaluate ${r.objective_id}: ${r.status}\n` + r.metrics.map((metric) => `  ${metric.metric_id}: ${metric.state}${metric.state === 'observed' ? ` (${metric.baseline} → ${metric.evaluation})` : ''}`).join('\n') + `\n${r.interpretation}`, r);
        break;
      }
      case 'governance': {
        const mode = args._[0];
        if (mode === 'validate') {
          const r = validateGovernance(root, { refDate: args.refDate });
          out(args, `governance validate: ${r.ok ? 'OK' : 'PROBLEMS'} (${r.counts.reviewers} reviewer(s), ${r.counts.policies} policy/policies, ${r.counts.exceptions} exception(s))${r.problems.length ? `\n${r.problems.map((problem) => `  - ${problem}`).join('\n')}` : ''}`, r);
          if (!r.ok) process.exitCode = 1;
        } else if (mode === 'evaluate') {
          const r = evaluateDispositions(root, { runId: args._[1], refDate: args.refDate });
          const accepted = r.dispositions.filter((item) => item.enforcement_disposition === 'accepted_exception').length;
          out(args, `governance evaluate ${r.source_run_id}: ${r.dispositions.length} failed finding(s), ${accepted} accepted exception(s)\nEvidence package: ${r.dir}`, r);
          if (r.dispositions.some((item) => item.enforcement_disposition === 'blocked_ambiguous_exception')) process.exitCode = 1;
        } else throw new Error('usage: citable governance <validate|evaluate [run-id]> [--ref-date YYYY-MM-DD]');
        break;
      }
      case 'reviews': {
        const mode=args._[0]; let r;
        if(mode==='queue') r=queueReviews(root,{runId:args._[1],policyId:args._[2],write:args.write});
        else if(mode==='prioritize') r=prioritizeReviews(root,{write:args.write});
        else if(mode==='plan') r=initializeSamplingPlan(root,{input:args.input,write:args.write});
        else if(mode==='sample') r=selectSample(root,{planId:args._[1],write:args.write});
        else if(mode==='evaluate') { r=evaluateReviews(root); if(!r.ok) process.exitCode=1; }
        else throw new Error('usage: citable reviews <queue|prioritize|plan|sample|evaluate> [options]');
        out(args,`reviews ${mode}: ${r.created?.length ?? r.items?.length ?? r.selected_item_ids?.length ?? r.results?.length ?? 1} item(s)${args.write?' written':' (dry run)'}`,r);
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
