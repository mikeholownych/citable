#!/usr/bin/env node
import { auditCroSuite, formatCroSuiteOutput } from "../commands/croSuite.js";
import { formatBacklogMarkdown } from "../commands/croBacklog.js";
import { formatCroRoadmapMarkdown } from "../analysis/croRoadmap.js";
import { sweepTechnical, formatSweepOutput } from "../commands/sweep.js";
import { inspectEeat, formatEeatOutput } from "../commands/inspectEeat.js";
import { inspectReadiness, formatReadinessOutput } from "../commands/answerEngineReadiness.js";
import { auditBacklinks, formatBacklinksOutput } from "../commands/auditBacklinks.js";
import { roadmapCommand } from "../commands/roadmapCmd.js";
import { sowCommand } from "../commands/sowCmd.js";
import { buildIceMatrix, formatIceMatrixOutput } from "../analysis/iceMatrix.js";
import { verifyCustomerArtifactCommand } from "../artifacts/verifyCustomerArtifact.js";
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { init } from '../commands/init.js';
import { audit } from '../commands/audit.js';
import { auditEdgeCode } from '../commands/edgeSecurity.js';
import { planAudit } from '../commands/planAudit.js';
import { demo } from '../commands/demo.js';
import { validate } from '../commands/validate.js';
import { mapClaims } from '../commands/mapClaims.js';
import { substantiate } from '../commands/substantiate.js';
import { inspect } from '../commands/inspect.js';
import { inspectSerp } from '../commands/inspectSerp.js';
import { inspectCro } from '../commands/inspectCro.js';
import { inspectAeo } from '../commands/inspectAeo.js';
import { inspectGeo } from '../commands/inspectGeo.js';
import { testFunnel } from '../commands/testFunnel.js';
import { planExperiment } from '../commands/planExperiment.js';
import { fleetSummary, fleetAudit } from '../commands/fleet.js';
import { exportEdgeRules, testEdgeRules } from '../commands/edgeRules.js';
import { probeEngine } from '../commands/probe.js';
import { lintComponents } from '../commands/lintComponents.js';
import { exportExecutiveReport } from '../reporting/executiveExport.js';
import { attributeImpact } from '../commands/attributeImpact.js';
import { remediateCommand } from '../commands/remediate.js';
import { verifyRemediation } from '../commands/verifyRemediation.js';
import { exportImplementationKit } from '../commands/implementationKit.js';
import { compatibilityCommand, verifyPage } from '../commands/compatibility.js';
import { runVisualRegression } from '../commands/visualRegression.js';
import { checkExperiment } from '../commands/experimentGuardrails.js';
import { runGoldenBenchmark } from '../commands/goldenCorpus.js';
import { previewCroCommand } from '../commands/previewCro.js';
import { schemaCommand } from '../commands/schemaCmd.js';
import { compareSnapshots } from '../commands/compareSnapshots.js';
import { isInstallerCommand, runInstallerCommand } from '../installer/index.js';
import { projectGithub, runSchedule } from '../commands/delivery.js';
import { actionPlan } from '../commands/actionPlan.js';
import { observe } from '../commands/observe.js';
import { applyRemediation } from '../commands/applyRemediation.js';
import { monitor, monitorAndAlert } from '../commands/monitor.js';
import { reportDashboard } from '../commands/reportDashboard.js';
import { reportShareOfVoice } from '../commands/reportShareOfVoice.js';
import { reportConsensus } from '../commands/reportConsensus.js';
import { evaluateObjective, importMetrics, initializeObjective, validateObjectives } from '../commands/measurement.js';
import { configureConnection, connectionStatus, discoverConnections, disconnectConnection, syncConnection, validateConnection, readCmsContent, applyCmsRemediation, submitIndexNow, collectMcpEvidence } from '../commands/connect.js';
import { generateLlmsTxt } from '../commands/generateLlmsTxt.js';
import { evaluateDispositions, validateGovernance } from '../commands/governance.js';
import { listExceptions, renewException, invalidateException } from '../commands/exceptions.js';
import { evaluateReviews, initializeSamplingPlan, prioritizeReviews, queueReviews, selectSample } from '../commands/reviews.js';
import { selfUpgradeCommand, selfUpgradeExitCode } from '../commands/selfUpgrade.js';
// Executive reporting suite
import { kpiCommand } from '../commands/kpi.js';
import { varianceCommand } from '../commands/variance.js';
import { outcomesCommand } from '../commands/outcomes.js';
import { riskCommand } from '../commands/risk.js';
import { executiveReviewCommand } from '../commands/executiveReview.js';
import { boardReportCommand } from '../commands/boardReport.js';
import { decisionMemoCommand } from '../commands/decisionMemo.js';
import { assumptionAuditCommand } from '../commands/assumptionAudit.js';
import { scenarioCommand } from '../commands/scenario.js';
import { prioritizeCommand } from '../commands/prioritize.js';
import { competitiveIntelCommand } from '../commands/competitiveIntel.js';
import { executiveCommand } from '../commands/executive.js';
import { evaluateCorpus, publishCorpus } from '../commands/corpus.js';
import { createAcceptanceReceipt, readAndCompareAcceptanceReceipts } from '../acceptance/reproducibility.js';
import { readJson } from '../shared/io.js';
import { exportArtifactPackage, importArtifactPackage, verifyArtifactPackage } from '../artifacts/interchange.js';

const HELP = `citable — SEO / AEO / GEO audit, remediation, validation, and governance

Usage: citable <command> [options]

Commands
  install                   Install the Citable skill into coding-agent harnesses
  update                    Update managed Citable skill installations
  check                     Report installed and available Citable versions
  uninstall                 Remove managed Citable skill files
  list                      List detected providers and installation state
  doctor [--mcp]            Diagnose installer, provider, MCP transport, and integrity problems
  init [--seed <name>]      Initialize .citable/ context and registries (non-destructive)
  demo                      Run the detector engine against a bundled offline example (no setup, no network)
  audit [scope]             Run detectors; scopes: technical seo aeo geo architecture entity
                            claims evidence schema lifecycle corroboration
  plan-audit                Inspect target signals and propose an evidence-bounded audit plan
  inspect <page>            Profile one page (URL path or source file)
  inspect serp <page>       Simulate Google SERP title/snippet truncation and rich results
  inspect cro <page>        Evaluate page conversion readiness, CTA visibility, and friction
  inspect saliency <page>   Evaluate privacy-first algorithmic visual attention and CTA conspicuity
  inspect aeo <page>        Evaluate answer extractability, question density, and structure
  inspect geo <page>        Evaluate RAG chunkability, section density, and retrieval posture
  preview cro <page>        Interactive split-screen visual preview of original vs remediated page
  remediate [finding]       Synthesize accessible Nebula Components; safe patches with diff, validation, confidence, rollback (--write gated, fail closed)
  test funnel [id]          Test multi-step conversion funnel continuity and parameter persistence
  test visual               Deterministic layout-contract checks + viewport/variant screenshot matrix (screenshots need playwright)
  plan experiment           Calculate statistical sample size and duration for A/B testing
  check experiment          Experiment guardrails: SRM, stopping, power, contamination, lifecycle status
  map-claims                Extract material claim candidates from pages (--write to save)
  substantiate              Assess claim/evidence status (--write to apply downgrades)
  cro [audit]               Full CRO intelligence suite: funnel, ATF clarity, trust, cognitive load, ICE matrix, roadmap
  cro backlog               Generate A/B experimentation backlog with falsifiable hypotheses & guardrails
  cro roadmap               30/90/180-day CRO roadmap tied to measurable conversion outcomes
  sweep [technical]         Run technical SEO sweep with Core Web Vitals metrics
  inspect eeat <page>       Evaluate on-page content against Google E-E-A-T rubric (0-5 scale)
  inspect readiness <page>  Evaluate answer-engine readiness across Perplexity, Bing Copilot, and ChatGPT
  audit backlinks           Audit off-page authority and identify toxic domains (--input <file>)
  prioritize matrix         Impact/Effort/Confidence (ICE) scoring matrix for roadmap & findings
  roadmap [generate|show]   30/90/180-day strategic roadmap with milestone horizons
  schema                    Validate deployed JSON-LD and propose registry-derived schema
  validate [mode]           registries (default) | claims | evidence | schema | links
  compare-snapshots [a b]   Regression diff between two audit runs
  action-plan [run]         Turn audit findings into ordered remediation work
  observe <mode>            Collect render, index, citation, log, Bing, passage,
                            consensus, performance, corroboration, crawler or regional probes,
                            media evidence, or representation evidence
  apply                     Apply a reviewed, hash-locked remediation spec
  monitor [runA runB]       Compare observation runs and emit regression alerts [--webhook <url>] [--min-severity <level>]
  report dashboard [--last N] [--since <run-id>]   Render a cross-run evidence trend as Markdown + HTML
  report share-of-voice [--last N]                 Compute first-party and competitor citation share
  report consensus [--last N] [--since <run-id>]   Render Canonical Discovery Consensus Matrix (Markdown + HTML)
  report search [--target <dir|url>] [--run <id>]  Enterprise Search Intelligence & AEO/GEO Executive Briefing (19 pillars)
  report cro [--target <dir|url>] [--input <file>] Enterprise CRO & Customer Journey Executive Briefing (25 pillars)
  metrics import            Import declared metric observations from CSV/JSON
  connect status            List optional connectors and configured connections
  connect configure         Configure non-secret connection state (--write to save)
  connect discover          Discover provider properties using environment auth
  connect validate          Verify configured property access
  connect sync              Collect declared metrics into immutable observations
  connect read              Read CMS content and hash for remediation targeting
  connect apply             Apply reviewed, hash-locked CMS remediation (--write to apply)
  connect disconnect        Remove optional connection state (--write to confirm)
  connect indexnow          Submit changed or discovered URLs to IndexNow engines (--write to submit)
  connect mcp               Collect evidence via allowlisted read-only MCP transport adapter
  objectives init           Validate/add one objective from --input (--write to save)
  objectives validate       Validate objective contracts and metric references
  evaluate [objective-id]   Compare objective baseline and evaluation windows
  governance validate       Validate reviewer, policy, and exception controls
  governance evaluate [run] Produce immutable enforcement dispositions without changing findings
  exceptions list           List governed exceptions with expiry status [--expired]
  exceptions renew          Renew governed exception with reviewer/evidence controls (--write to save)
  exceptions invalidate     Revoke governed exception with mandatory audit reason (--write to save)
  reviews queue [run policy] Create semantic review work from heuristic findings
  reviews prioritize        Rank review work from explicit materiality inputs
  reviews plan              Validate/add a sampling plan from --input
  reviews sample [plan]     Select a reproducible census or seeded random sample
  reviews evaluate          Detect stale decisions and require disagreement adjudication
  schedules run [id]        Execute an active version-pinned schedule [--monitor] [--webhook <url>]
  project github [run]      Render non-authoritative GitHub annotations from a run
  corpus evaluate           Evaluate a disclosed real-property acceptance corpus
  corpus publish            Validate and project an owner-authorized public corpus
  corpus receipt            Create a reproducibility receipt for a sealed run
  corpus benchmark          Run the labeled golden fixture corpus and report per-detector precision/recall
  corpus compare-receipts   Compare two acceptance-run receipt envelopes
  artifacts export         Export one sealed run as a portable verified directory
  artifacts verify         Verify an exported artifact interchange directory
  verify remediation       Closed loop: re-run the detector after a patch and emit a before/after evidence bundle
  verify page <page>       Run all detectors scoped to one page and report posture (pass/attention/blocked)
  compatibility            Pre-flight: Node engine, optional adapters, browser, framework, registries, edge limits
  kit export               Customer-ready implementation kit: finding, diff, evidence, acceptance tests, deployment
  artifacts import         Import a verified run without changing its canonical bytes
  self-upgrade              Check for a newer version and upgrade the npx cache
  kpi [list|show|validate]  KPI architecture — govern metric definitions, sources, targets
  variance [list|validate|material]  Variance analysis — explain target-vs-actual without narrative smoothing
  outcomes [list|summary|validate]   Customer outcomes — separate activity from validated impact
  risk [list|top|validate]  Risk register — top risks, controls, residual exposure, KRIs
  executive-review [--period YYYY-MM]  Monthly executive operating review (evidence-first)
  board-report [--quarter YYYY-QN]     Quarterly board pack (governed statements only)
  decision-memo [list|show|validate|new]  Bounded decision record with trade-offs and evidence
  assumption-audit [list|expired|critical|validate]  Assumption validity tracking
  scenario [list|show|triggers|validate]  Compound risk scenario war room
  prioritize [list|rank|validate]     Initiative prioritization with transparent scoring
  competitive-intel [list|stale|validate]  Competitive intelligence (provenance-controlled)
  executive <request>       Chief-of-staff router — routes to the correct reporting skill

Options
  --target <dir|url>        Built output directory or deployed URL to audit
  --base-url <url>          Base URL for path resolution of a built output dir
  --ref-date <YYYY-MM-DD>   Reference date for expiry/staleness checks (default: today)
  --input <file>            Import evidence, remediation, or browser plan
  --output <path>           Explicit output path for a corpus or artifact export
  --run <run-id>            Sealed run used to create an acceptance receipt
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
  --interactions            Exercise bounded disclosure, tab, and load-more controls
  --resume-run <run-id>     Reuse successful immutable render profiles
  --surface-id <id>         Controlled publisher surface for representation evidence
  --region <label>          Disclosed collector region for representation evidence
  --user-agent <value>      Disclosed request identity for representation evidence
  --lighthouse              Run local, repeated Lighthouse lab observations
  --ocr                     Explicitly request optional OCR for media images
  --seed <name>             Overlay a bundled starter registry seed (all entries default to unverified)
  --urls <file|list>        URL list or file for IndexNow submission
  --sitemap <url|file>      Sitemap URL or file for URL discovery and submission
  --host <hostname>         Target host for IndexNow submission
  --key <key>               IndexNow key (or INDEXNOW_KEY environment variable)
  --key-location <url>      Custom location of IndexNow key file
  --skip-key-verify         Skip pre-flight key verification HTTP probe
  --server <id>             Allowlisted MCP server identifier
  --tool <name>             Allowlisted read-only MCP tool name
  --transport <stdio|http>  MCP transport protocol (stdio or http)
  --server-script <path>    Local script path for stdio MCP server
  --tool-args <json>        JSON arguments string for MCP tool call
  --until <YYYY-MM-DD>      Target expiration date for exception renewal
  --reason <text>           Required justification for exception invalidation
  --evidence <id>           Evidence ID to link to exception renewal
  --note <text>             Optional note for exception renewal audit trail
  --expired                 Filter exception list to expired records only
  --expiring-soon <days>    Threshold days to flag expiring exceptions (default: 14)
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
    else if (a === '--ocr') args.ocr = true;
    else if (a === '--interactions') args.interactions = true;
    else if (a === '--lighthouse') args.lighthouse = true;
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--ref-date') args.refDate = argv[++i];
    else if (a === '--viewport') args.viewport = argv[++i];
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--run') args.runId = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--last') args.last = argv[++i];
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
    else if (a === '--resume-run') args.resumeRun = argv[++i];
    else if (a === '--surface-id') args.surfaceId = argv[++i];
    else if (a === '--region') args.region = argv[++i];
    else if (a === '--user-agent') args.userAgent = argv[++i];
    else if (a === '--timeout') args.timeout = Number(argv[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '--seed') args.seed = argv[++i];
     else if (a === '--webhook') args.webhook = argv[++i];
    else if (a === '--min-severity') args.minSeverity = argv[++i];
    else if (a === '--monitor') args.monitor = true;
    else if (a === '--mcp') args.mcp = true;
    else if (a === '--target-id') args.targetId = argv[++i];
    else if (a === '--reviewer') args.reviewer = argv[++i];
    else if (a === '--entity') args.entity = argv[++i];
    else if (a === '--urls') args.urls = argv[++i];
    else if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else if (a === '--key-location') args.keyLocation = argv[++i];
    else if (a === '--skip-key-verify') args.skipKeyVerify = true;
    else if (a === '--allow-private-for-test') args.allowPrivateForTest = true;
    else if (a === '--server') args.serverId = argv[++i];
    else if (a === '--tool') args.toolName = argv[++i];
    else if (a === '--transport') args.transportType = argv[++i];
    else if (a === '--server-script') args.serverScript = argv[++i];
    else if (a === '--tool-args' || a === '--args') args.toolArgs = argv[++i];
    else if (a === '--site-url') args.siteUrl = argv[++i];
    else if (a === '--until') args.until = argv[++i];
    else if (a === '--reason') args.reason = argv[++i];
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--evidence') args.evidence = argv[++i];
    else if (a === '--note') args.note = argv[++i];
    else if (a === '--expired') args.expiredOnly = true;
    else if (a === '--expiring-soon') args.expiringSoonDays = Number(argv[++i]);
    else if (a === '--finding') args.finding = argv[++i];
    else if (a === '--component') args.component = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--strict') args.strict = true;
    else if (a === '--export') args.export = argv[++i];
    else if (a === '--apply') args.apply = true;
    else if (a === '--preview-file') args['preview-file'] = argv[++i];
    else if (a === '--observed-control') args['observed-control'] = argv[++i];
    else if (a === '--observed-variant') args['observed-variant'] = argv[++i];
    else if (a === '--days-running') args['days-running'] = argv[++i];
    else if (a === '--baseline-rate') args['baseline-rate'] = argv[++i];
    else if (a === '--p-value') args['p-value'] = argv[++i];
    else if (a === '--matrix') args.matrix = true;
    else if (a === '--roadmap') args.roadmap = true;
    else if (a === '--engines') args.engines = true;
    else if (a === '--funnel') args.funnel = argv[++i];
    else if (a === '--client') args.client = argv[++i];
    else if (a === '--type') args.type = argv[++i];
    else if (a === '--revenue-claimed') args['revenue-claimed'] = true;
    else args._.push(a);
  }
  return args;
}

const TOOL_VERSION_CLI = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

// Set by main(); read by out() for the JSON envelope. Kept off `args` because
// several commands spread parsed args directly into option objects.
let CURRENT_COMMAND = null;

/**
 * Stable machine-readable output contract (citable_output_schema 1.0):
 * every command's --json payload is wrapped in this envelope so CI systems
 * and agencies can consume results without parsing terminal text. The
 * envelope version changes only on breaking envelope changes; command
 * payloads evolve backward-compatibly inside `result`.
 */
const OUTPUT_SCHEMA_VERSION = '1.0';

function out(args, human, data, command = null) {
  if (args.json) {
    console.log(JSON.stringify({
      citable_output_schema: OUTPUT_SCHEMA_VERSION,
      tool_version: TOOL_VERSION_CLI,
      command: command ?? CURRENT_COMMAND,
      generated_at: new Date().toISOString(),
      result: data,
    }, null, 2));
  } else {
    console.log(human);
  }
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const cmd = argv[0];
  if (['help', '--help', '-h'].includes(cmd)) {
    console.log(HELP);
    return 0;
  }
  if (isInstallerCommand(cmd)) return runInstallerCommand(cmd, argv.slice(1), options);
  const args = parseArgs(argv.slice(1));
  CURRENT_COMMAND = cmd;
  const root = options.cwd ?? process.cwd();

  try {
    switch (cmd) {
      case 'init': {
        const r = init(root, { force: args.force, seed: args.seed });
        const seedLines = r.seed
          ? `\n  seed "${r.seed.seedName}@${r.seed.seedVersion}": ` +
            Object.entries(r.seed.registriesTouched).map(([k, v]) => `${k}(+${v.added}/skip ${v.skipped})`).join(', ') +
            (r.seed.warnings.length ? `\n  seed warnings:\n${r.seed.warnings.map((w) => `    - ${w}`).join('\n')}` : '')
          : '';
        out(args, `Initialized .citable/\n  created: ${r.created.join(', ') || 'nothing'}\n  skipped: ${r.skipped.join(', ') || 'nothing'}\n  detected framework: ${r.detected.framework ?? 'unknown'}\n  unresolved assumptions:\n${r.unresolved.map((u) => `    - ${u}`).join('\n') || '    none'}${seedLines}`, r);
        break;
      }
      case 'demo': {
        const r = await demo();
        const nsLines = Object.entries(r.summary.by_namespace)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ns, n]) => `  ${ns}: ${n} finding(s)`).join('\n') || '  no findings';
        out(args,
          `citable demo — offline audit of a bundled synthetic example site (not live, not a real company)\n${nsLines}\n\n` +
          `This is a fixed demonstration fixture, not your site. Run "citable init" to set up your own governed context, ` +
          `then "citable audit --target <dir|url>" against your real site.`,
          r);
        break;
      }
      case 'audit': {
        if (args._[0] === 'cro') {
          const r = await auditCroSuite(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, input: args.input, funnelId: args.funnel });
          out(args, formatCroSuiteOutput(r), r);
          break;
        }
        if (args._[0] === 'backlinks') {
          const r = await auditBacklinks(root, { input: args.input, target: args.target, minSeverity: args.minSeverity });
          out(args, formatBacklinksOutput(r), r);
          break;
        }
        if (args._[0] === 'edge') {
          const file = args._[1];
          if (!file || !args.format) throw new Error('usage: citable audit edge <file> --format <cloudflare-worker|cloudflare-cro|vercel-middleware|shopify-snippet|html>');
          const content = fs.readFileSync(path.resolve(root, file), 'utf8');
          const r = auditEdgeCode(content, { format: args.format, name: file });
          const txt = `audit edge ${file} (${r.format}, ${r.byte_size} bytes)
  Findings: ${r.finding_count} (high:${r.high} medium:${r.medium} advisory:${r.advisory})
${r.findings.map((f) => `  [${f.rule_id}] (${f.severity}) ${f.summary}\n    Fix: ${f.remediation}`).join('\n') || '  no risk patterns found'}
  Methodology: ${r.methodology}`;
          out(args, txt, r);
          break;
        }
        const scope = args._[0];
        const r = await audit(root, { target: args.target, scope, baseUrl: args.baseUrl, refDate: args.refDate, viewport: args.viewport });
        out(args, `Audit ${r.runId}: ${r.summary.total} finding(s) [${Object.entries(r.summary.by_severity).map(([k, v]) => `${k}:${v}`).join(' ')}]\nEvidence package: ${r.dir}\nReport: ${path.join(r.dir, 'report.md')}\nStatus: ${r.manifest.status}${r.manifest.incomplete_checks.length ? `\nIncomplete: ${r.manifest.incomplete_checks.join('; ')}` : ''}`, { runId: r.runId, dir: r.dir, summary: r.summary, status: r.manifest.status });
        break;
      }
      case 'plan-audit': {
        const r = await planAudit(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        const profiles = r.classification.profiles.map((profile) => `${profile.id}:${profile.confidence}`).join(', ') || 'none established';
        const collectors = r.collectors.map((collector) => `  ${collector.id}: ${collector.status}`).join('\n');
        out(args, `plan-audit\nProfiles (inference): ${profiles}\nAudit: ${r.audit.command}\nCollectors:\n${collectors}\n\nNo audit or observation package was created.`, r);
        break;
      }
      case 'inspect': {
        if (!args._[0]) throw new Error('usage: citable inspect <page> --target <dir|url> OR citable inspect serp <page> OR citable inspect cro <page> OR citable inspect aeo <page> OR citable inspect geo <page>');
        if (args._[0] === 'eeat' || args._[0] === 'content') {
          if (!args._[1]) throw new Error('usage: citable inspect eeat <page> --target <dir|url>');
          const r = await inspectEeat(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          out(args, formatEeatOutput(r), r);
          break;
        }
        if (args._[0] === 'readiness' || args._[0] === 'engines') {
          if (!args._[1]) throw new Error('usage: citable inspect readiness <page> --target <dir|url>');
          const r = await inspectReadiness(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          out(args, formatReadinessOutput(r), r);
          break;
        }
        if (args._[0] === 'serp') {
          if (!args._[1]) throw new Error('usage: citable inspect serp <page> --target <dir|url>');
          const r = await inspectSerp(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const richList = Object.entries(r.richSnippets).map(([k, v]) => `    ${k}: ${v.status}${v.issues?.length ? ` (${v.issues.join('; ')})` : ''}`).join('\n');
          const txt = `Inspect SERP ${r.url}\n${r.visualCard}
  Desktop Preview (max ~600px):
    Breadcrumb: ${r.desktop.breadcrumb}
    Title:      ${r.desktop.title} (${r.desktop.titlePixelWidth}px${r.desktop.isTitleTruncated ? ' [TRUNCATED]' : ''})
    Snippet:    ${r.desktop.snippet}${r.desktop.isSnippetTruncated ? ' [TRUNCATED]' : ''}
  Mobile Preview:
    Breadcrumb: ${r.mobile.breadcrumb}
    Title:      ${r.mobile.title}${r.mobile.isTitleTruncated ? ' [TRUNCATED]' : ''}
    Snippet:    ${r.mobile.snippet}${r.mobile.isSnippetTruncated ? ' [TRUNCATED]' : ''}
  Rich Snippet Eligibility:
${richList}
  Schema Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
          out(args, txt, r);
          break;
        }
        if (args._[0] === 'cro') {
          if (!args._[1]) throw new Error('usage: citable inspect cro <page> --target <dir|url>');
          const r = await inspectCro(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const txt = `Inspect CRO ${r.url}
  Status: ${r.conversion_status} (Conversion Readiness: ${r.conversion_readiness_score ?? 'N/A'}/100)
  Above-the-Fold Clarity: ${r.atf_clarity?.score ?? 'N/A'}/100 (Scent: ${r.atf_clarity?.scent_match ? 'CONGRUENT' : 'GAP'})
  Trust & Credibility: ${r.trust_and_credibility?.score ?? 'N/A'}/100
  Friction Surface Area: ${r.friction_surface_area}
  Declared Conversion Action: ${r.declared_conversion_action || 'none'}
  Page Type: ${r.page_type || 'unregistered'}; Intent: ${r.primary_intent || 'unregistered'}
  Analytics Instrumentation: ${r.analytics_installed ? `INSTALLED (${r.analytics_tags.length} tag${r.analytics_tags.length === 1 ? '' : 's'})` : 'NOT DETECTED'}
  Hero CTAs: ${r.hero_cta_count}; Choice Overload: ${r.has_choice_overload ? 'YES (paralysis risk)' : 'no'}
  Primary CTA Conspicuity: ${r.saliency?.primary_cta_conspicuity_index ?? 'N/A'} (${r.saliency?.pci_assessment ?? 'unassessed'}) — modeled heuristic index, not observed attention
  Keystroke Effort: ${r.keystroke_effort?.autofill_coverage_pct}% autofill coverage (${r.keystroke_effort?.keystroke_reduction_pct}% modeled mobile friction reduction)
  Payment Wallet Readiness: ${r.express_checkout_readiness?.payment_wallet_readiness?.supported ? 'SUPPORTED' : 'NOT DETECTED (CRO-021)'}
  Authentication Readiness (passkeys/WebAuthn): ${r.express_checkout_readiness?.authentication_readiness?.supported ? 'DETECTED' : 'NOT DETECTED'} (informational index; authentication, not payment)
  CTAs (${r.ctas.length}):
${r.ctas.map((c) => `    [${c.isPrimary ? 'PRIMARY' : 'SECONDARY'}${c.inHero ? ' - HERO' : ''}] "${c.text}" (${c.tag}) → ${c.target || 'no target'}`).join('\n') || '    none'}
  Forms (${r.forms.length}):
${r.forms.map((f, i) => `    Form ${i + 1}: ${f.fieldCount} fields (autocomplete: ${f.inputsWithAutocomplete}/${f.fieldCount}, labels: ${f.inputsWithLabel}/${f.fieldCount}), submit: ${f.hasSubmit ? 'yes' : 'NO'} → ${f.action || 'default'}`).join('\n') || '    none'}
  Trust Signals: ${r.trustBadges.join(', ') || 'none'}
  CRO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
          out(args, txt, r);
          break;
        }
        if (args._[0] === 'saliency') {
          if (!args._[1]) throw new Error('usage: citable inspect saliency <page> --target <dir|url>');
          const r = await inspectCro(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const sal = r.saliency;
          const gazeLines = (sal?.predicted_gaze_path || []).map((g) => `    ${g.order}. [${g.type.toUpperCase()}] "${g.label}" (salience: ${Math.round(g.salience_score * 100)}%)`).join('\n');
          const txt = `Inspect Saliency ${r.url}
  Primary CTA Conspicuity Index: ${sal?.primary_cta_conspicuity_index ?? 'N/A'} [${sal?.pci_assessment ?? 'unassessed'}]
  Visual Clutter Risk: ${sal?.visual_clutter ?? 'clean'} (${sal?.competing_hero_elements_count ?? 0} high-salience hero elements)
  Predicted Gaze Path (First 3 Fixations):
${gazeLines || '    none predicted'}
  SVG Attention Heatmap: generated (${sal?.elements_evaluated ?? 0} elements mapped)`;
          out(args, txt, { url: r.url, saliency: sal });
          break;
        }
        if (args._[0] === 'aeo') {
          if (!args._[1]) throw new Error('usage: citable inspect aeo <page> --target <dir|url>');
          const r = await inspectAeo(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const txt = `Inspect AEO ${r.url}
  Extractability Status: ${r.extractability_status}
  Page Type: ${r.page_type || 'unregistered'}; Word Count: ${r.word_count}
  Headings (${r.headings.total} total, ${r.headings.questions.length} questions):
${r.headings.questions.map((q) => `    [H${q.level}] "${q.text}"`).join('\n') || '    none'}
  Answer Structure:
    Definitional Copula: ${r.answer_structure.has_copular_definition ? 'YES' : 'NO'}
    Executive Summary / Key Takeaways: ${r.answer_structure.has_executive_summary ? 'YES' : 'NO'}
    Tables: ${r.answer_structure.tables_count}; Ordered Lists: ${r.answer_structure.ordered_lists_count}
  AEO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
          out(args, txt, r);
          break;
        }
        if (args._[0] === 'geo') {
          if (!args._[1]) throw new Error('usage: citable inspect geo <page> --target <dir|url>');
          const r = await inspectGeo(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const txt = `Inspect GEO ${r.url}
  Retrieval Posture: ${r.retrieval_posture}
  Page Type: ${r.page_type || 'unregistered'}; Word Count: ${r.word_count}
  RAG Metrics:
    Estimated 300w Chunks: ${r.rag_metrics.estimated_chunks_300w}
    Headings: ${r.rag_metrics.total_headings}
    Average Words/Chunk: ${r.rag_metrics.average_words_per_chunk}
  GEO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
          out(args, txt, r);
          break;
        }
        const r = await inspect(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, `Inspect ${r.url}\n  title: ${r.title}\n  status: ${r.status}; canonical: ${r.canonicals.join(', ') || 'none'}; robots: ${r.robotsDirectives.join(',') || 'default'}\n  intent: ${r.primary_intent ?? 'undeclared'}; conversion: ${r.conversion_action ?? 'undeclared'}\n  entities: ${r.entities.map((e) => e.name).join(', ') || 'none'}\n  claims: ${r.claims.length}; findings: ${r.findings.length}\n  ambiguity:\n${r.unresolved_ambiguity.map((a) => `    - ${a}`).join('\n') || '    none'}`, r);
        break;
      }
      case 'inspect-serp': {
        if (!args._[0]) throw new Error('usage: citable inspect-serp <page> --target <dir|url>');
        const r = await inspectSerp(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        const richList = Object.entries(r.richSnippets).map(([k, v]) => `    ${k}: ${v.status}${v.issues?.length ? ` (${v.issues.join('; ')})` : ''}`).join('\n');
        const txt = `Inspect SERP ${r.url}\n${r.visualCard}
  Desktop Preview (max ~600px):
    Breadcrumb: ${r.desktop.breadcrumb}
    Title:      ${r.desktop.title} (${r.desktop.titlePixelWidth}px${r.desktop.isTitleTruncated ? ' [TRUNCATED]' : ''})
    Snippet:    ${r.desktop.snippet}${r.desktop.isSnippetTruncated ? ' [TRUNCATED]' : ''}
  Mobile Preview:
    Breadcrumb: ${r.mobile.breadcrumb}
    Title:      ${r.mobile.title}${r.mobile.isTitleTruncated ? ' [TRUNCATED]' : ''}
    Snippet:    ${r.mobile.snippet}${r.mobile.isSnippetTruncated ? ' [TRUNCATED]' : ''}
  Rich Snippet Eligibility:
${richList}
  Schema Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
        out(args, txt, r);
        break;
      }
      case 'inspect-cro': {
        if (!args._[0]) throw new Error('usage: citable inspect-cro <page> --target <dir|url>');
        const r = await inspectCro(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        const txt = `Inspect CRO ${r.url}
  Status: ${r.conversion_status}
  Declared Conversion Action: ${r.declared_conversion_action || 'none'}
  Page Type: ${r.page_type || 'unregistered'}; Intent: ${r.primary_intent || 'unregistered'}
  Analytics Instrumentation: ${r.analytics_installed ? `INSTALLED (${r.analytics_tags.length} tag${r.analytics_tags.length === 1 ? '' : 's'})` : 'NOT DETECTED'}
  Hero CTAs: ${r.hero_cta_count}; Choice Overload: ${r.has_choice_overload ? 'YES (paralysis risk)' : 'no'}
  CTAs (${r.ctas.length}):
${r.ctas.map((c) => `    [${c.isPrimary ? 'PRIMARY' : 'SECONDARY'}${c.inHero ? ' - HERO' : ''}] "${c.text}" (${c.tag}) → ${c.target || 'no target'}`).join('\n') || '    none'}
  Forms (${r.forms.length}):
${r.forms.map((f, i) => `    Form ${i + 1}: ${f.fieldCount} fields (autocomplete: ${f.inputsWithAutocomplete}/${f.fieldCount}, labels: ${f.inputsWithLabel}/${f.fieldCount}), submit: ${f.hasSubmit ? 'yes' : 'NO'} → ${f.action || 'default'}`).join('\n') || '    none'}
  Trust Signals: ${r.trustBadges.join(', ') || 'none'}
  CRO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
        out(args, txt, r);
        break;
      }
      case 'inspect-aeo': {
        if (!args._[0]) throw new Error('usage: citable inspect-aeo <page> --target <dir|url>');
        const r = await inspectAeo(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        const txt = `Inspect AEO ${r.url}
  Extractability Status: ${r.extractability_status}
  Page Type: ${r.page_type || 'unregistered'}; Word Count: ${r.word_count}
  Headings (${r.headings.total} total, ${r.headings.questions.length} questions):
${r.headings.questions.map((q) => `    [H${q.level}] "${q.text}"`).join('\n') || '    none'}
  Answer Structure:
    Definitional Copula: ${r.answer_structure.has_copular_definition ? 'YES' : 'NO'}
    Executive Summary / Key Takeaways: ${r.answer_structure.has_executive_summary ? 'YES' : 'NO'}
    Tables: ${r.answer_structure.tables_count}; Ordered Lists: ${r.answer_structure.ordered_lists_count}
  AEO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
        out(args, txt, r);
        break;
      }
      case 'inspect-geo': {
        if (!args._[0]) throw new Error('usage: citable inspect-geo <page> --target <dir|url>');
        const r = await inspectGeo(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        const txt = `Inspect GEO ${r.url}
  Retrieval Posture: ${r.retrieval_posture}
  Page Type: ${r.page_type || 'unregistered'}; Word Count: ${r.word_count}
  RAG Metrics:
    Estimated 300w Chunks: ${r.rag_metrics.estimated_chunks_300w}
    Headings: ${r.rag_metrics.total_headings}
    Average Words/Chunk: ${r.rag_metrics.average_words_per_chunk}
  GEO Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
        out(args, txt, r);
        break;
      }
      case 'preview': {
        const sub = args._[0];
        if (sub !== 'cro') throw new Error('usage: citable preview cro <page> [--target <dir|url>] [--export <path>]');
        const page = args._[1] || 'home';
        const r = await previewCroCommand(root, page, { target: args.target, export: args.export });
        const txt = `Preview CRO ${r.url}
  Friction Surface Area (Before): ${r.fsa_before}
  Friction Surface Area (Modeled Target): ${r.fsa_after} (modeled index, not a measured outcome)
  Resolved Findings: ${r.findings_count}
  HTML Preview: ${r.saved_file || 'rendered in memory (use --export <file.html> to save)'}`;
        out(args, txt, r);
        break;
      }
      case 'remediate': {
        const r = await remediateCommand(root, {
          finding: args.finding || args._[0],
          component: args.component,
          target: args.target,
          format: args.format || 'react',
          write: args.write,
        });
        if (r.target) {
          const parts = [`Remediate ${r.finding_id} → ${r.recommended_component}`, `  Rationale: ${r.rationale}`, `  Scaffold Command: ${r.scaffold_command}`];
          parts.push(`  Target File: ${r.target}`);
          parts.push(`  Framework: ${r.framework?.framework || 'unknown'} (detection confidence ${r.framework?.confidence ?? 0})`);
          parts.push(`  Patch: ${r.changed ? `${r.match_count} match(es)` : 'no match (already remediated or not applicable)'}, idempotent: ${r.idempotent}, class: ${r.patcher_class}`);
          if (r.validation) {
            for (const c of r.validation.checks) parts.push(`  Check ${c.check_id}: ${c.passed ? 'PASS' : 'FAIL'} — ${c.detail}`);
            if (r.validation.methodology) parts.push(`  Methodology: ${r.validation.methodology}`);
          }
          if (r.confidence) {
            parts.push(`  Confidence: ${r.confidence.score} (write threshold ${r.write_policy?.min_confidence ?? 0.7})`);
            for (const f of r.confidence.factors) parts.push(`    - ${f.factor}: ${f.weight} (${f.detail})`);
          }
          parts.push(r.written
            ? `  Written. Rollback snapshot: ${r.rollback?.snapshot_file}`
            : r.write_refused
              ? `  Write REFUSED (fail closed): ${r.refusal_reason}`
              : `  Dry run — unified diff below. Use --write to apply.`);
          if (r.diff) parts.push('Unified Diff:', r.diff.trimEnd());
          parts.push('', 'Code Snippet (recommended component):', '--------------------------------------------------', r.code, '--------------------------------------------------');
          out(args, parts.join('\n'), r);
          break;
        }
        const txt = r.recommended_component
          ? `Remediate ${r.finding_id} → ${r.recommended_component}
  Rationale: ${r.rationale}
  Scaffold Command: ${r.scaffold_command}
Code Snippet (${r.format}):
--------------------------------------------------
${r.code}
--------------------------------------------------`
          : r.component
            ? `Remediate Component: ${r.component}
  Scaffold Command: ${r.scaffold_command}
Code Snippet:
--------------------------------------------------
${r.code}
--------------------------------------------------`
            : `Available Components:
${(r.available_components || []).map((c) => `  - ${c.name} (${c.id}): ${c.description}`).join('\n')}
Supported Findings: ${(r.supported_findings || []).join(', ')}`;
        out(args, txt, r);
        break;
      }
      case 'test-funnel':
      case 'test': {
        if (cmd === 'test' && args._[0] === 'visual') {
          const preview = args['preview-file'] ? fs.readFileSync(path.resolve(root, args['preview-file']), 'utf8') : null;
          const r = await runVisualRegression(root, { previewHtml: preview, output: args.output });
          const txt = `test visual
  Contract checks: ${r.contract.ok ? 'ALL PASS' : 'FAIL'} (${r.contract.checks.filter((c) => c.passed).length}/${r.contract.checks.length})
${r.contract.checks.map((c) => `  ${c.passed ? '✔' : '✖'} ${c.check_id}: ${c.detail}`).join('\n')}
  Matrix cells: ${r.matrix_cells.length}
  Screenshots: ${r.screenshots.status}${r.screenshots.required_input ? ` (required_input: ${r.screenshots.required_input})` : ` (${r.screenshots.captured.length} captured)`}`;
          out(args, txt, r);
          break;
        }
        if (cmd === 'test-funnel' || args._[0] === 'funnel') {
          const funnelId = cmd === 'test-funnel' ? args._[0] : args._[1];
          const r = await testFunnel(root, funnelId, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          const txt = `Test Funnel ${r.funnel_id} (${r.name})
  Status: ${r.status}
  Primary Goal: ${r.primary_goal}
  Steps Verified: ${r.steps_verified}/${r.total_steps}
  Steps:
${r.steps.map((s) => `    [${s.role.toUpperCase()}] ${s.name} (${s.url_pattern}) → HTTP ${s.status || 'not found'}${s.next_step_linked ? ' (linked)' : ''}`).join('\n')}
  Issues (${r.issues.length}):
${r.issues.map((iss) => `    - ${iss}`).join('\n') || '    none'}
  Funnel Findings: ${r.findings.length ? r.findings.map((f) => `${f.detector_id} (${f.severity}): ${f.summary}`).join('; ') : 'none'}`;
          out(args, txt, r);
          break;
        }
        if (args._[0] === 'edge') {
          const r = await testEdgeRules(root, { provider: args.provider, baseUrl: args.baseUrl });
          out(args, `Test Edge (${r.provider}): ${r.status.toUpperCase()} (${r.passed_checks}/${r.total_checks} checks passed)`, r);
          break;
        }
        throw new Error('usage: citable test funnel [funnel_id] --target <dir|url> OR citable test edge [--provider cloudflare]');
      }
      case 'fleet': {
        const sub = args._[0] ?? 'summary';
        if (sub === 'summary') {
          const r = await fleetSummary(root);
          out(args, `Fleet Summary (${r.total_properties} properties, ${r.active_properties} active)\n` + r.properties.map((p) => `  [${p.environment.toUpperCase()}] ${p.name} (${p.primary_domain})`).join('\n'), r);
        } else if (sub === 'audit') {
          const r = await fleetAudit(root, { propertyId: args.property, environment: args.env, scope: args.scope });
          out(args, `Fleet Audit: ${r.fleet_size} properties audited (health: ${r.fleet_health.toUpperCase()})\nTotal findings: ${r.total_findings} (critical: ${r.total_critical}, high: ${r.total_high})`, r);
        } else {
          throw new Error('usage: citable fleet [summary|audit] [--property <id>] [--env <environment>]');
        }
        break;
      }
      case 'probe': {
        const query = args._[0];
        if (!query) throw new Error('usage: citable probe <query|prompt_id> [--engine <perplexity|openai|gemini>] [--domain <domain>]');
        const r = await probeEngine(root, query, { engine: args.engine, targetDomain: args.domain, output: args.output });
        out(args, `Probe [${r.data.provider}]: ${r.data.property_cited ? 'CITING' : 'NOT CITING'} ${r.data.target_domain}\n${r.data.raw_response}`, r);
        break;
      }
      case 'lint': {
        const sub = args._[0];
        if (sub === 'components') {
          const dir = args._[1] || 'src/components';
          const r = await lintComponents(dir);
          out(args, `Lint Components: ${r.total_files_scanned} files scanned (${r.status.toUpperCase()})\nFindings: ${r.total_findings}\n` + r.findings.map((f) => `  [${f.rule_id}] ${f.file}:${f.line} - ${f.name}`).join('\n'), r);
          break;
        }
        throw new Error('usage: citable lint components [dir]');
      }
      case 'export': {
        const sub = args._[0];
        if (sub === 'edge') {
          const format = args.format || 'cloudflare-redirects';
          const r = await exportEdgeRules(root, { format, output: args.output });
          const sec = r.security;
          out(args, `Exported ${r.rules_count} edge rule(s) in format "${r.format}"${r.output_path ? ` to ${r.output_path}` : ''}\nSecurity audit: ${sec.high} high, ${sec.medium} medium, ${sec.advisory} advisory finding(s)\n${sec.findings.map((f) => `  [${f.rule_id}] (${f.severity}) ${f.summary}`).join('\n') || '  no risk patterns found'}\n${r.content}`, r);
          break;
        }
        throw new Error('usage: citable export edge [--format <cloudflare-redirects|cloudflare-waf|cloudflare-worker>]');
      }
      case 'attribute': {
        const sub = args._[0];
        if (sub === 'impact') {
          const r = await attributeImpact(root, { beforeRunId: args.before, afterRunId: args.after, metricKey: args.metric, baselineValue: args.baseline ? Number(args.baseline) : undefined, observedValue: args.observed ? Number(args.observed) : undefined });
          out(args, `Attribute Impact (${r.metric}):\n  Treatment Lift: ${r.treatment.relative_change_percent}%\n  Control Lift: ${r.control.relative_change_percent}%\n  Diff-in-Diff Adjusted Lift: ${r.difference_in_differences_lift_percent}%\n  Verdict: ${r.attribution_verdict}\n\nNotice: ${r.statistical_caveat}`, r);
          break;
        }
        throw new Error('usage: citable attribute impact --before <run> --after <run>');
      }
      case 'plan-experiment':
      case 'plan': {
        if (cmd === 'plan-experiment' || args._[0] === 'experiment') {
          const r = await planExperiment(root, args);
          const txt = `Plan A/B Experiment
  Baseline Conversion Rate: ${(r.baseline_conversion_rate * 100).toFixed(1)}%
  Target Conversion Rate: ${(r.target_conversion_rate * 100).toFixed(2)}% (+${Math.round(r.minimum_detectable_effect_relative * 100)}% relative lift)
  Statistical Power: ${Math.round(r.statistical_power * 100)}% (alpha = ${r.significance_level_alpha})
  Sample Size Required: ${r.sample_size_per_variant.toLocaleString()} per variant (${r.total_sample_size.toLocaleString()} total)
  Daily Visitors: ${r.daily_visitors.toLocaleString()}
  Estimated Duration: ${r.estimated_duration_days} days
  Risk Level: ${r.risk_level.toUpperCase()}
  Recommendations:
${r.recommendations.map((rec) => `    - ${rec}`).join('\n')}`;
          out(args, txt, r);
          break;
        }
        if (cmd === 'plan' && args._[0] === 'audit') {
          const p = await planAudit(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
          out(args, formatPlan(p), p);
          break;
        }
        throw new Error('usage: citable plan experiment --baseline-rate <0.02> --mde <0.10> --daily-visitors <500> OR citable plan-audit');
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
        if (args.matrix) {
          const r = await prioritizeCommand(['matrix', ...(args._[0] ? ['--run', args._[0]] : ['--findings'])], root);
          out(args, r.formatted || JSON.stringify(r, null, 2), r);
          break;
        }
        if (args.roadmap) {
          const r = await roadmapCommand(root, { runId: args._[0], target: args.target, write: args.write !== false });
          out(args, r.markdown, r);
          break;
        }
        const r = actionPlan(root, { runId: args._[0] });
        out(args, `action-plan: ${r.summary.total_actions} action(s) [ready:${r.summary.ready} blocked:${r.summary.blocked}]\nPlan: ${path.join(r.dir, 'action-plan.md')}\nSource audit: ${r.source_run_id}`, r);
        break;
      }
      case 'observe': {
        const mode = args._[0];
        const r = await observe(root, mode, args);
        const claimDiffLine = r.summary.citation_metrics?.claim_diff
          ? `\nClaim diff: ${Object.entries(r.summary.citation_metrics.claim_diff).map(([k, v]) => `${k}:${v}`).join(' ')}` : '';
        const stanceLine = r.summary.stance_metrics
          ? `\nStance summary: favorable:${r.summary.stance_metrics.favorable} neutral:${r.summary.stance_metrics.neutral} unfavorable:${r.summary.stance_metrics.unfavorable} mixed:${r.summary.stance_metrics.mixed} review_required:${r.summary.stance_metrics.review_required}` : '';
        out(args, `observe ${mode}: ${r.summary.total} observation(s) [${Object.entries(r.summary.by_state).map(([k, v]) => `${k}:${v}`).join(' ')}]${claimDiffLine}${stanceLine}\nEvidence package: ${r.dir}\nStatus: ${r.manifest.status}`, r);
        break;
      }
      case 'apply': {
        const r = applyRemediation(root, args);
        out(args, `apply: ${r.operations.length} operation(s) ${r.write ? 'applied' : 'proposed (dry run)'}\nEvidence package: ${r.dir}\nSource audit: ${r.source_run_id}`, r);
        break;
      }
      case 'monitor': {
        const r = await monitorAndAlert(root, {
          runA: args._[0],
          runB: args._[1],
          webhookUrl: args.webhook,
          minSeverity: args.minSeverity,
          allowPrivateForTest: args.allowPrivateForTest,
        });
        let msg = `monitor ${r.run_a} → ${r.run_b}: ${r.summary.alerts} alert(s), ${r.summary.critical_or_high} critical/high\nReport: ${path.join(r.dir, 'latest.json')}`;
        if (r.delivery) {
          if (r.delivery.skipped) msg += `\nDelivery: skipped (${r.delivery.reason})`;
          else if (r.delivery.success) {
            msg += `\nDelivery: webhook dispatched to ${r.delivery.target_url} (HTTP ${r.delivery.status_code})`;
            if (r.delivery.signature) msg += ` (signed: ${r.delivery.signature.slice(0, 16)}...)`;
          } else {
            msg += `\nDelivery: webhook FAILED (${r.delivery.error})`;
          }
        }
        out(args, msg, r);
        if (r.summary.critical_or_high > 0) process.exitCode = 1;
        break;
      }
      case 'report': {
        const sub = args._[0];
        if (sub === 'dashboard') {
          const r = reportDashboard(root, { since: args.since, last: args.last ? Number(args.last) : undefined });
          out(args, `report dashboard: ${r.included} audit run(s) included, ${r.skipped} skipped\nMarkdown: ${r.path_md}\nHTML: ${r.path_html}`, r);
        } else if (sub === 'share-of-voice' || sub === 'citations' || sub === 'share') {
          const r = reportShareOfVoice(root, { since: args.since, last: args.last ? Number(args.last) : undefined });
          out(args, `report share-of-voice: ${r.included} citation run(s) included, ${r.competitors_evaluated} competitor(s) evaluated\nMarkdown: ${r.path_md}\nHTML: ${r.path_html}`, r);
        } else if (sub === 'consensus') {
          const r = reportConsensus(root, { runId: args.runId, since: args.since, last: args.last ? Number(args.last) : undefined });
          out(args, `report consensus: ${r.urls_evaluated} URL(s) evaluated (${r.canonical_consensus_count} consensus, ${r.conflicts_count} conflict(s))\nMarkdown: ${r.path_md}\nHTML: ${r.path_html}`, r);
        } else if (sub === 'search' || sub === 'seo') {
          const r = await exportExecutiveReport(root, args.runId, {
            type: 'search',
            format: args.format || 'markdown',
            clientName: args.client,
            output: args.output,
            target: args.target,
            baseUrl: args.baseUrl,
            refDate: args.refDate,
            input: args.input,
          });
          out(args, r.content, r.data);
        } else if (sub === 'cro') {
          const r = await exportExecutiveReport(root, args.runId, {
            type: 'cro',
            format: args.format || 'markdown',
            clientName: args.client,
            output: args.output,
            target: args.target,
            baseUrl: args.baseUrl,
            refDate: args.refDate,
            input: args.input,
            funnelId: args.funnel,
          });
          out(args, r.content, r.data);
        } else if (sub === 'export') {
          const r = await exportExecutiveReport(root, args.runId, {
            format: args.format,
            clientName: args.client,
            output: args.output,
            type: args.type,
            target: args.target,
            baseUrl: args.baseUrl,
            refDate: args.refDate,
            input: args.input,
            funnelId: args.funnel,
          });
          out(args, `Executive Report Exported (${r.format}) for "${r.client_name}"${r.output_path ? ` to ${r.output_path}` : ''}\n\n${r.content}`, r);
        } else {
          throw new Error('usage: citable report <dashboard|share-of-voice|consensus|search|cro|export> [--last <n>] [--since <run-id>] [--run <run-id>] [--format <md|html|json>]');
        }
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
        } else if (mode === 'read') {
          const r = await readCmsContent(root, args);
          out(args, `connect read ${r.connection_id} [${r.target_id}]: title="${r.content.title}" hash=${r.content.content_hash.slice(0, 12)}…\nURL: ${r.content.url || 'n/a'}`, r);
        } else if (mode === 'apply') {
          const r = await applyCmsRemediation(root, args);
          out(args, `connect apply ${r.connection_id} [${r.target_id}]: ${r.status} ${r.dry_run ? '(dry run; use --write to apply)' : 'applied'}\nBefore: ${r.before_hash?.slice(0, 12)}… After: ${r.after_hash?.slice(0, 12)}…\nReviewer: ${r.reviewer}`, r);
        } else if (mode === 'disconnect') {
          const r = disconnectConnection(root, args);
          out(args, `connect disconnect ${r.connection_id}: ${r.disconnected ? 'removed' : 'dry run; use --write to remove'}`, r);
        } else if (mode === 'indexnow') {
          const r = await submitIndexNow(root, args);
          const batchInfo = r.batch_count > 1 ? ` in ${r.batch_count} batch(es)` : '';
          const actionDesc = r.dry_run ? '(dry run; use --write to submit)' : (r.success ? `submitted (status: ${r.batches[0]?.status_code ?? 200})` : `FAILED (${r.error})`);
          out(args, `connect indexnow: ${r.url_count} URL(s)${batchInfo} for ${r.host} ${actionDesc}\nReceipt: ${r.receipt_file}`, r);
          if (!r.success) process.exitCode = 1;
        } else if (mode === 'mcp') {
          const toolArgs = args.toolArgs ? JSON.parse(args.toolArgs) : (args.target ? { url: args.target } : (args.urls ? { url: args.urls } : {}));
          if (args.target && !toolArgs.url) toolArgs.url = args.target;
          if (args.siteUrl && !toolArgs.siteUrl) toolArgs.siteUrl = args.siteUrl;
          else if (args.target && !toolArgs.siteUrl && args.serverId === 'gsc-mcp') {
            try { toolArgs.siteUrl = new URL(args.target).origin; } catch { toolArgs.siteUrl = args.target; }
          }
          if (args.startDate && !toolArgs.startDate) toolArgs.startDate = args.startDate;
          if (args.endDate && !toolArgs.endDate) toolArgs.endDate = args.endDate;
          const r = await collectMcpEvidence(root, {
            ...args,
            args: toolArgs,
          });
          out(args, `connect mcp: tool "${r.transportEnvelope.tool.name}" on server "${r.transportEnvelope.server.server_id}" executed via ${r.transportEnvelope.transport.type} (status: ${r.transportEnvelope.status})\nRun: ${r.runId}\nPackage: ${r.dir}`, r);
          if (r.transportEnvelope.status !== 'success') process.exitCode = 1;
        } else throw new Error('usage: citable connect <status|configure|discover|validate|sync|read|apply|disconnect|indexnow|mcp> [options]');
        break;
      }
      case 'generate': {
        const sub = args._[0];
        if (sub === 'llms-txt' || sub === 'llms.txt') {
          const r = generateLlmsTxt(root, { output: args.output, siteUrl: args.siteUrl, write: args.write });
          out(args, `generate llms-txt: ${r.written ? 'written' : 'dry run (use --write to save)'}\nOutput: ${r.outputDir}\nPages indexed: ${r.pageCount}\nClaims declared: ${r.claimCount}`, r);
        } else throw new Error('usage: citable generate <llms-txt> [--output <path>] [--site-url <url>] [--write]');
        break;
      }
      case 'generate-llms-txt': {
        const r = generateLlmsTxt(root, { output: args.output, siteUrl: args.siteUrl, write: args.write });
        out(args, `generate llms-txt: ${r.written ? 'written' : 'dry run (use --write to save)'}\nOutput: ${r.outputDir}\nPages indexed: ${r.pageCount}\nClaims declared: ${r.claimCount}`, r);
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
      case 'exceptions': {
        const mode = args._[0];
        if (mode === 'list') {
          const r = listExceptions(root, {
            expiredOnly: args.expiredOnly,
            expiringSoonDays: args.expiringSoonDays,
            refDate: args.refDate,
          });
          const rows = r.exceptions.map((e) =>
            `  ${e.exception_id} [${e.computed_status}]: expires ${e.expires_at.slice(0, 10)} (${e.days_remaining}d remaining, renewed ${e.renewal_count}/${e.renewal_limit}) - ${e.reason}`
          );
          out(args, `exceptions list: ${r.exceptions.length} exception(s) (total: ${r.summary.total}, active: ${r.summary.active}, expiring soon: ${r.summary.expiring_soon}, expired: ${r.summary.expired})\n` + (rows.length ? rows.join('\n') : '  (no matching exceptions)'), r);
        } else if (mode === 'renew') {
          const r = renewException(root, {
            id: args.id || args._[1],
            until: args.until,
            reviewer: args.reviewer,
            evidence: args.evidence,
            note: args.note || args.reason,
            write: args.write,
            refDate: args.refDate,
          });
          out(args, `exceptions renew: ${r.exception_id} extended to ${r.expires_at} (renewal count: ${r.renewal_count}/${r.renewal_limit}) ${r.written ? 'written' : '(dry run; use --write to save)'}`, r);
        } else if (mode === 'invalidate') {
          const r = invalidateException(root, {
            id: args.id || args._[1],
            reason: args.reason,
            reviewer: args.reviewer,
            write: args.write,
          });
          out(args, `exceptions invalidate: ${r.exception_id} marked revoked ${r.written ? 'written' : '(dry run; use --write to save)'}`, r);
        } else throw new Error('usage: citable exceptions <list|renew|invalidate> [options]');
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
      case 'schedules': {
        if (args._[0] !== 'run') throw new Error('usage: citable schedules run <schedule-id> [--ref-date YYYY-MM-DD] [--webhook <url>] [--monitor]');
        const r = await runSchedule(root, {
          scheduleId: args._[1],
          refDate: args.refDate,
          webhook: args.webhook,
          monitor: args.monitor,
          minSeverity: args.minSeverity,
        });
        let msg = `schedule ${r.schedule_execution.schedule_id}: audit ${r.runId}\nEvidence package: ${r.dir}\nExecution record: ${r.execution_file}`;
        if (r.schedule_execution.monitor) {
          const m = r.schedule_execution.monitor;
          if (m.status === 'insufficient_history') {
            msg += `\nMonitor: insufficient history (${m.message})`;
          } else {
            msg += `\nMonitor: compared to ${m.baseline_run} (${m.regressions_count} regression(s), ${m.summary.regression_critical_or_high} critical/high)`;
          }
        }
        if (r.schedule_execution.alert_delivery) {
          const d = r.schedule_execution.alert_delivery;
          if (d.skipped) msg += `\nAlert delivery: skipped (${d.reason})`;
          else if (d.success) msg += `\nAlert delivery: dispatched to ${d.target_url} (HTTP ${d.status_code})`;
          else msg += `\nAlert delivery: FAILED (${d.error})`;
        }
        out(args, msg, r);
        break;
      }
      case 'project': {
        if(args._[0]!=='github') throw new Error('usage: citable project github <run-id>');
        const r=projectGithub(root,{runId:args._[1]});
        out(args,`project github ${r.source_run_id}: ${r.annotations.length} annotation(s)\nProjection: ${path.join(r.dir,'annotations.json')}`,r);
        break;
      }
      case 'corpus': {
        const mode = args._[0];
        if (mode === 'evaluate') {
          const r = evaluateCorpus(root, { input: args.input });
          out(args, `corpus evaluate ${r.metrics.corpus_id}: ${r.metrics.population.detector_cases} detector case(s)\nEvidence package: ${r.dir}`, r);
        } else if (mode === 'publish') {
          const r = publishCorpus(root, { input: args.input, output: args.output });
          out(args, `corpus publish ${r.receipt.corpus_id}: ${r.receipt.property_ids.length} approved property record(s)\nCorpus: ${r.output}\nMetrics: ${r.metricsFile}\nReport: ${r.reportFile}\nReceipt: ${r.receiptFile}\nEvidence package: ${r.dir}`, r);
        } else if (mode === 'receipt') {
          const context = args.input ? readJson(args.input) : {};
          const r = createAcceptanceReceipt(root, { runId: args.runId, context });
          out(args, `corpus receipt ${r.receipt.receipt_id}\nFingerprint: ${r.receipt.reproducibility.fingerprint}\nReceipt: ${r.output}${r.receipt.execution.partial ? '\nStatus: partial' : ''}`, r);
        } else if (mode === 'compare-receipts') {
          const r = readAndCompareAcceptanceReceipts(args._[1], args._[2]);
          out(args, `corpus compare-receipts ${r.receipt_a} → ${r.receipt_b}\nComparable envelope: ${r.comparable}\nFingerprint equal: ${r.fingerprint_equal}\nPartial runs: ${r.partial_runs.length}`, r);
        } else if (mode === 'benchmark') {
          const r = await runGoldenBenchmark(root, { corpusDir: args.input, writeReport: args.output });
          const txt = `corpus benchmark v${r.corpus_version}: ${r.pages_evaluated} page(s) across ${r.sites_evaluated} site(s)
  Gate: ${r.gate.ok ? 'PASS' : 'FAIL'} (violations: ${r.gate.violation_count}, recall failures: ${r.gate.recall_failures.join(', ') || 'none'}, precision failures: ${r.gate.precision_failures.join(', ') || 'none'})
${r.per_detector.filter((d) => d.true_positives + d.false_negatives + d.false_positives > 0).map((d) => `  ${d.detector_id}: TP ${d.true_positives}, FP ${d.false_positives}, FN ${d.false_negatives}, P ${d.precision ?? 'n/a'}, R ${d.recall ?? 'n/a'}`).join('\n')}
  Limitations: ${r.limitations[0]}`;
          out(args, txt, r);
        } else throw new Error('usage: citable corpus <evaluate|publish|receipt|compare-receipts|benchmark> [options]');
        break;
      }
      case 'artifacts': {
        const mode = args._[0];
        if (mode === 'export') {
          const r = exportArtifactPackage(root, { runId: args._[1], output: args.output });
          out(args, `artifacts export ${r.envelope.run.run_id}: ${r.artifacts} sealed file(s)\nPackage: ${r.output}\nPackage hash: ${r.envelope.package_hash}`, r);
        } else if (mode === 'verify') {
          const r = verifyArtifactPackage(args.input);
          out(args, `artifacts verify ${r.manifest.run_id}: valid\nArtifacts: ${r.artifacts.length}\nPackage hash: ${r.envelope.package_hash}`, { valid: r.valid, run_id: r.manifest.run_id, artifacts: r.artifacts.length, package_hash: r.envelope.package_hash });
        } else if (mode === 'import') {
          const r = importArtifactPackage(root, { input: args.input });
          out(args, `artifacts import ${r.run_id}: ${r.status}\nRun package: ${r.destination}`, r);
        } else if (mode === 'verify-customer') {
          const filePath = args._[1];
          if (!filePath) throw new Error('usage: citable artifacts verify-customer <file>');
          const r = await verifyCustomerArtifactCommand(filePath, argv.slice(3), root);
          out(args, r.message, r);
          if (!r.valid) process.exitCode = 1;
        } else throw new Error('usage: citable artifacts <export <run-id> --output <directory>|verify --input <directory>|import --input <directory>|verify-customer <file>>');
        break;
      }
      case 'verify': {
        const mode = args._[0];
        if (mode === 'page') {
          const r = await verifyPage(root, args._[1], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, viewport: args.viewport });
          const sev = Object.entries(r.by_severity).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(' ') || 'none';
          const txt = `verify page ${r.page}
  Status: ${r.status}
  Findings: ${r.finding_count} (${sev})
  Detectors run: ${r.provenance.detectors_run.length}
  Definition: ${r.provenance.definition}`;
          out(args, txt, r);
          break;
        }
        if (mode !== 'remediation') throw new Error('usage: citable verify <remediation --run <run-id> --finding <detector-id> [|page <page>] [--target <dir|file>] [--apply]');
        const r = await verifyRemediation(root, {
          run: args.runId || args._[1],
          finding: args.finding,
          target: args.target,
          apply: args.apply,
          subject: args.subject,
          baseUrl: args['base-url'],
          refDate: args['ref-date'],
        });
        const subject = r.subject?.identifier || 'unknown subject';
        const patchLine = r.patch
          ? `\n  Patch: applied=${r.patch.applied}${r.patch.refusal_reason ? ` (refused: ${r.patch.refusal_reason})` : ''}${r.patch.rollback_snapshot ? `\n  Rollback snapshot: ${r.patch.rollback_snapshot}` : ''}`
          : '';
        const txt = `verify remediation ${r.detector_id} on ${subject}
  Verdict: ${r.status}${r.verdict.resolved ? ' (finding no longer reported)' : ''}
  Before finding(s): ${r.verdict.before_finding_ids.join(', ') || 'none'}
  After finding(s): ${r.verdict.after_finding_ids.join(', ') || 'none'}
  New critical/high regressions: ${r.verdict.new_regressions.length}${patchLine}
  Re-check target: ${r.provenance.recheck_target || 'n/a'}
  Resolution criterion: detector absence for the same subject; not an outcome guarantee
  Bundle: ${r.bundle_dir || 'not written'}`;
        out(args, txt, r);
        break;
      }
      case 'kit': {
        if (args._[0] !== 'export') throw new Error('usage: citable kit export --run <run-id> --finding <detector-id> [--target <file>] [--subject <id|url>] [--output <dir>]');
        const r = await exportImplementationKit(root, {
          run: args.runId,
          finding: args.finding,
          target: args.target,
          subject: args.subject,
          output: args.output,
          format: args.format,
        });
        const txt = `kit export ${r.detector_id}
  Kit directory: ${r.kit_dir}
  Files: ${r.files.length}
  Rendering evidence files: ${r.rendering_evidence_count}
  Patch diff included: ${r.has_patch_diff}`;
        out(args, txt, r);
        break;
      }
      case 'compatibility': {
        const r = await compatibilityCommand(root, args);
        const txt = `compatibility (citable ${r.tool_version}, Node ${r.node})
${r.checks.map((c) => `  [${c.severity.toUpperCase()}] ${c.check_id}: ${c.detail}`).join('\n')}
  Blockers: ${r.blocker_count}
  Note: ${r.note}`;
        out(args, txt, r);
        break;
      }
      case 'check': {
        if (args._[0] === 'experiment') {
          const r = await checkExperiment(root, {
            experimentId: args._[1],
            observedControl: args['observed-control'] !== undefined ? Number(args['observed-control']) : undefined,
            observedVariant: args['observed-variant'] !== undefined ? Number(args['observed-variant']) : undefined,
            daysRunning: args['days-running'] !== undefined ? Number(args['days-running']) : undefined,
            baselineRate: args['baseline-rate'],
            mde: args.mde,
            pValue: args['p-value'],
            revenueClaimed: args['revenue-claimed'],
          });
          const txt = `check experiment ${r.experiment_id}
  Lifecycle: ${r.lifecycle} — ${r.lifecycle_definition}
  Guardrails: ${r.guardrail_count} finding(s)
${r.findings.map((f) => `  [${f.guardrail_id}] (${f.severity}) ${f.summary}`).join('\n') || '  no guardrail findings'}
  Note: ${r.note}`;
          out(args, txt, r);
          break;
        }
        throw new Error('usage: citable check experiment <id> [--observed-control N --observed-variant N --days-running N --p-value X --revenue-claimed]');
      }
      case 'self-upgrade': {
        const output = await selfUpgradeCommand(argv.slice(1));
        console.log(output);
        process.exitCode = selfUpgradeExitCode(output);
        break;
      }
      // Executive reporting suite
      case 'kpi': {
        const r = await kpiCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'variance': {
        const r = await varianceCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'outcomes': {
        const r = await outcomesCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'risk': {
        const r = await riskCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'executive-review': {
        const r = await executiveReviewCommand(argv.slice(1), root);
        out(args, typeof r === 'string' ? r : JSON.stringify(r, null, 2), r);
        break;
      }
      case 'board-report': {
        const r = await boardReportCommand(argv.slice(1), root);
        out(args, typeof r === 'string' ? r : JSON.stringify(r, null, 2), r);
        break;
      }
      case 'decision-memo': {
        const r = await decisionMemoCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'assumption-audit': {
        const r = await assumptionAuditCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'scenario': {
        const r = await scenarioCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'prioritize': {
        const r = await prioritizeCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'competitive-intel': {
        const r = await competitiveIntelCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'executive': {
        const r = await executiveCommand(argv.slice(1), root);
        out(args, JSON.stringify(r, null, 2), r);
        break;
      }
      case 'cro': {
        const sub = args._[0];
        if (sub === 'backlog') {
          const r = await auditCroSuite(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, input: args.input });
          out(args, formatBacklogMarkdown(r.experiment_backlog), r.experiment_backlog);
          break;
        }
        if (sub === 'roadmap') {
          const r = await auditCroSuite(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, input: args.input });
          out(args, formatCroRoadmapMarkdown(r.strategic_roadmap), r.strategic_roadmap);
          break;
        }
        const r = await auditCroSuite(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, input: args.input, funnelId: args.funnel });
        out(args, formatCroSuiteOutput(r), r);
        break;
      }
      case 'sweep': {
        const sub = args._[0];
        if (sub && sub !== 'technical') throw new Error('usage: citable sweep technical [--target <dir|url>]');
        const r = await sweepTechnical(root, { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate, page: args._[1] });
        out(args, formatSweepOutput(r), r);
        break;
      }
      case 'matrix': {
        const r = await prioritizeCommand(['matrix', ...argv.slice(1)], root);
        out(args, r.formatted || JSON.stringify(r, null, 2), r);
        break;
      }
      case 'roadmap': {
        const r = await roadmapCommand(root, { runId: args.runId, target: args.target, write: args.write !== false });
        out(args, r.markdown, r);
        break;
      }
      case 'sow': {
        const r = await sowCommand(argv.slice(1), root);
        out(args, r.content || r.message || JSON.stringify(r, null, 2), r.data || r);
        break;
      }
      case 'inspect-eeat': {
        if (!args._[0]) throw new Error('usage: citable inspect-eeat <page> --target <dir|url>');
        const r = await inspectEeat(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, formatEeatOutput(r), r);
        break;
      }
      case 'inspect-readiness': {
        if (!args._[0]) throw new Error('usage: citable inspect-readiness <page> --target <dir|url>');
        const r = await inspectReadiness(root, args._[0], { target: args.target, baseUrl: args.baseUrl, refDate: args.refDate });
        out(args, formatReadinessOutput(r), r);
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
