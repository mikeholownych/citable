import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const SEVERITY = { critical: 0, high: 1, medium: 2, low: 3, informational: 3, experimental: 3 };
const PHASE = { unblock: 0, governance: 1, content: 2, optimization: 3 };
const GOVERNANCE = new Set(['CLAIM', 'EVD', 'ENTITY', 'LIFE', 'MEAS', 'CRAWL']);

function latestRun(runsDir) {
  const runs = fs.readdirSync(runsDir)
    .filter((run) => fs.existsSync(path.join(runsDir, run, 'findings.json')))
    .sort();
  if (!runs.length) throw new Error('no audit runs with findings found');
  return runs.at(-1);
}

function semanticGates(finding) {
  const gates = new Set();
  if (finding.discipline.includes('aeo')) {
    gates.add('intent-alignment');
    gates.add('answer-extractability');
  }
  if (finding.discipline.includes('geo')) {
    gates.add('entity-clarity');
    gates.add('recommendation-eligibility');
    gates.add('narrative-accuracy');
  }
  if (['CLAIM', 'EVD'].includes(finding.detector_id.split('-')[0])) {
    gates.add('claim-boundedness');
    gates.add('evidence-strength');
  }
  return [...gates];
}

function phaseFor(finding) {
  if (['critical', 'high'].includes(finding.classification.severity) && ['TECH', 'CRAWL', 'GEO'].includes(finding.detector_id.split('-')[0])) return 'unblock';
  if (GOVERNANCE.has(finding.detector_id.split('-')[0])) return 'governance';
  if (['PAGE', 'ANS', 'ARCH', 'LINK', 'SCHEMA', 'RECO'].includes(finding.detector_id.split('-')[0])) return 'content';
  return 'optimization';
}

function renderPlan(plan) {
  const lines = [
    '# Citable action plan', '',
    `- Source audit: \`${plan.source_run_id}\``,
    `- Actions: ${plan.summary.total_actions}; ready: ${plan.summary.ready}; blocked: ${plan.summary.blocked}`,
    '',
    '> This plan prioritizes observed findings. It does not guarantee ranking, citation, recommendation, or conversion outcomes.',
    '',
  ];
  for (const phase of ['unblock', 'governance', 'content', 'optimization']) {
    const actions = plan.actions.filter((action) => action.phase === phase);
    if (!actions.length) continue;
    lines.push(`## ${phase[0].toUpperCase()}${phase.slice(1)}`, '');
    for (const action of actions) {
      lines.push(`### ${action.priority.toUpperCase()} · ${action.action_id} · ${action.status}`);
      lines.push('', `- Subject: \`${action.subject}\``, `- Action: ${action.action}`);
      lines.push(`- Owner: ${action.owner ?? 'unassigned'}`);
      if (action.required_input.length) lines.push(`- Required input: ${action.required_input.join(', ')}`);
      if (action.semantic_gates.length) lines.push(`- Semantic gates: ${action.semantic_gates.join(', ')}`);
      lines.push(`- Verify: \`${action.verification.command}\``, '');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function actionPlan(root, { runId } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('no audit runs recorded yet');
  const sourceRunId = runId ?? latestRun(runsDir);
  const sourceDir = path.join(runsDir, sourceRunId);
  const findingsFile = path.join(sourceDir, 'findings.json');
  if (!fs.existsSync(findingsFile)) throw new Error(`run ${sourceRunId} has no findings.json`);
  const rawFindings = fs.readFileSync(findingsFile, 'utf8');
  const findings = JSON.parse(rawFindings);
  const manifest = readJson(path.join(sourceDir, 'manifest.json'));
  const target = manifest.target?.location;
  const actions = findings.map((finding) => {
    const owner = finding.remediation.owner ?? null;
    const blocked = finding.remediation.review_required && !owner;
    const scope = finding.discipline.length === 1 && ['aeo', 'geo', 'seo'].includes(finding.discipline[0]) ? ` ${finding.discipline[0]}` : '';
    return {
      action_id: `ACT-${finding.finding_id.replace(/^F-/, '')}`,
      finding_ids: [finding.finding_id],
      phase: phaseFor(finding),
      priority: ['informational', 'experimental'].includes(finding.classification.severity) ? 'low' : finding.classification.severity,
      subject: finding.subject.identifier,
      action: finding.remediation.preferred,
      owner,
      status: blocked ? 'blocked' : 'ready',
      required_input: blocked ? ['accountable owner'] : [],
      semantic_gates: semanticGates(finding),
      unsafe_shortcuts: finding.remediation.unsafe_shortcuts || [],
      verification: {
        method: finding.verification.method,
        detector: finding.verification.detector_to_rerun,
        command: `citable audit${scope} --target ${JSON.stringify(target)}`,
        expected_result: finding.verification.expected_result,
      },
    };
  }).sort((a, b) => PHASE[a.phase] - PHASE[b.phase] || SEVERITY[a.priority] - SEVERITY[b.priority] || a.action_id.localeCompare(b.action_id));
  const plan = {
    source_run_id: sourceRunId,
    source_findings_hash: sha256(rawFindings),
    generated_at: nowIso(),
    summary: {
      total_actions: actions.length,
      ready: actions.filter((action) => action.status === 'ready').length,
      blocked: actions.filter((action) => action.status === 'blocked').length,
    },
    actions,
  };
  const validation = validateAgainst('action-plan.schema.json', plan);
  if (!validation.valid) throw new Error(`action plan invalid: ${validation.errors.join('; ')}`);
  const dir = path.join(root, '.citable', 'actions', sourceRunId);
  writeJson(path.join(dir, 'action-plan.json'), plan);
  fs.writeFileSync(path.join(dir, 'action-plan.md'), renderPlan(plan));
  return { ...plan, dir };
}
