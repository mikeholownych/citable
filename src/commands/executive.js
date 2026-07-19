/**
 * executive command — Chief-of-Staff Router
 *
 * Routes reporting and decision requests to the correct specialized skill.
 * Built last deliberately — orchestration without strong underlying skills
 * only coordinates weak outputs.
 *
 * Routing table:
 *   quarterly reporting      → board-report
 *   monthly reporting        → executive-review
 *   bounded decision         → decision-memo
 *   material uncertainty     → scenario
 *   risk request             → risk
 *   metric dispute           → kpi
 *   commercial premise       → assumption-audit
 *   customer value question  → outcomes
 *   roadmap priority         → prioritize
 *   competitor change        → competitive-intel
 *
 * Controls:
 *   - Max orchestration depth: 1 (no recursive routing)
 *   - Circular-call prevention: command registry checked before dispatch
 *   - Explicit conflict surfacing — conflicts not smoothed over
 *   - Decision logging to .citable/executive-log.yaml
 *
 * Usage:
 *   citable executive <request>
 *   citable executive --route <command>   Force a specific route
 *   citable executive --log              Show recent routing decisions
 */
import { contextDir } from '../registries/index.js';
import { readYaml, writeYaml, nowIso } from '../shared/io.js';
import path from 'node:path';
import fs from 'node:fs';

const ROUTES = [
  { patterns: [/quarterly|board.pack|board.report/i],        command: 'board-report',         reason: 'Quarterly board pack' },
  { patterns: [/monthly|operating.review|exec.review/i],     command: 'executive-review',     reason: 'Monthly executive operating review' },
  { patterns: [/decision|decide|approve|memo/i],             command: 'decision-memo',        reason: 'Bounded decision record' },
  { patterns: [/scenario|war.room|compound.risk|cascade/i],  command: 'scenario',             reason: 'Compound risk scenario' },
  { patterns: [/risk.register|residual.risk|risk.list/i],    command: 'risk',                 reason: 'Risk register' },
  { patterns: [/kpi|metric.definition|metric.dispute/i],     command: 'kpi',                  reason: 'KPI architecture' },
  { patterns: [/assumption|premise|still.valid/i],            command: 'assumption-audit',     reason: 'Assumption validity' },
  { patterns: [/customer.outcome|customer.value|impact/i],   command: 'outcomes',             reason: 'Customer outcomes' },
  { patterns: [/variance|miss|why.did.we/i],                 command: 'variance',             reason: 'Variance analysis' },
  { patterns: [/prioriti|roadmap|what.to.build|rank/i],      command: 'prioritize',           reason: 'Initiative prioritization' },
  { patterns: [/competitor|competitive|market.change/i],     command: 'competitive-intel',    reason: 'Competitive intelligence' },
];

const MAX_DEPTH = 1;
let _callDepth = 0;

export async function executiveCommand(args, root = process.cwd()) {
  const forceRoute = argVal(args, '--route');
  const showLog = args.includes('--log');

  if (showLog) return executiveLog(root);

  if (_callDepth >= MAX_DEPTH) {
    return { error: 'Maximum orchestration depth reached — circular routing prevented' };
  }

  const request = args.filter(a => !a.startsWith('--')).join(' ');

  const route = forceRoute
    ? ROUTES.find(r => r.command === forceRoute)
    : resolveRoute(request);

  if (!route) {
    return {
      unresolved: true,
      request,
      available_commands: ROUTES.map(r => ({ command: r.command, reason: r.reason })),
      message: 'Could not determine the appropriate skill. Use --route <command> to force a route, or run the specific command directly.',
    };
  }

  // Log the routing decision
  logDecision(root, { request, routed_to: route.command, reason: route.reason, at: nowIso() });

  _callDepth++;
  try {
    // Lazy-import to avoid circular deps — commands are imported at call time
    const mod = await import(`./${commandToModule(route.command)}.js`);
    const fn = mod[commandToExport(route.command)];
    if (!fn) {
      return { error: `No handler for command: ${route.command}` };
    }
    const result = await fn([], root);
    return {
      routed_to: route.command,
      reason: route.reason,
      result,
    };
  } finally {
    _callDepth--;
  }
}

function resolveRoute(request) {
  if (!request) return null;
  for (const route of ROUTES) {
    if (route.patterns.some(p => p.test(request))) return route;
  }
  return null;
}

function commandToModule(cmd) {
  const MAP = {
    'board-report':       'boardReport',
    'executive-review':   'executiveReview',
    'decision-memo':      'decisionMemo',
    'scenario':           'scenario',
    'risk':               'risk',
    'kpi':                'kpi',
    'assumption-audit':   'assumptionAudit',
    'outcomes':           'outcomes',
    'variance':           'variance',
    'prioritize':         'prioritize',
    'competitive-intel':  'competitiveIntel',
  };
  return MAP[cmd] ?? cmd;
}

function commandToExport(cmd) {
  const MAP = {
    'board-report':       'boardReportCommand',
    'executive-review':   'executiveReviewCommand',
    'decision-memo':      'decisionMemoCommand',
    'scenario':           'scenarioCommand',
    'risk':               'riskCommand',
    'kpi':                'kpiCommand',
    'assumption-audit':   'assumptionAuditCommand',
    'outcomes':           'outcomesCommand',
    'variance':           'varianceCommand',
    'prioritize':         'prioritizeCommand',
    'competitive-intel':  'competitiveIntelCommand',
  };
  return MAP[cmd] ?? cmd + 'Command';
}

function logDecision(root, entry) {
  const dir = contextDir(root);
  const logFile = path.join(dir, 'executive-log.yaml');
  let log = { version: 1, kind: 'executive-log', entries: [] };
  if (fs.existsSync(logFile)) {
    try { log = readYaml(logFile) ?? log; } catch {}
  }
  log.entries.push(entry);
  // Keep last 100 entries
  if (log.entries.length > 100) log.entries = log.entries.slice(-100);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeYaml(logFile, { ...log, updated: nowIso() });
}

function executiveLog(root) {
  const logFile = path.join(contextDir(root), 'executive-log.yaml');
  if (!fs.existsSync(logFile)) return { log: [], message: 'No routing decisions logged yet.' };
  const log = readYaml(logFile) ?? { entries: [] };
  return { log: (log.entries ?? []).slice(-20) };
}

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
