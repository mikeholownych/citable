import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './audit.js';
import { compareSnapshots } from './compareSnapshots.js';
import { buildAlertPayload, dispatchAlertWebhook, filterAlerts } from '../monitoring/alertDelivery.js';
import { loadRegistries } from '../registries/index.js';
import { readJson, sha256, writeJson, nowIso } from '../shared/io.js';

const PKG = readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'));

export async function runSchedule(root, {
  scheduleId,
  refDate,
  webhook,
  monitor: flagMonitor,
  minSeverity,
  fetchImpl,
  lookup,
  allowPrivateForTest = false,
} = {}) {
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const schedule = registries.schedules.entries.find((item) => item.schedule_id === scheduleId);
  if (!schedule) throw new Error(`schedule not found: ${scheduleId}`);
  if (schedule.status !== 'active') throw new Error(`schedule ${scheduleId} is ${schedule.status}`);
  if (schedule.expected_tool_version !== PKG.version) throw new Error(`schedule ${scheduleId} expects Citable ${schedule.expected_tool_version}, current version is ${PKG.version}`);
  const result = await audit(root, { target: schedule.audit.target, scope: schedule.audit.scope, baseUrl: schedule.audit.base_url, refDate });

  const shouldMonitor = flagMonitor || Boolean(schedule.monitor?.enabled);
  let monitorResult = null;
  let alertDelivery = null;

  if (shouldMonitor) {
    const runsDir = path.join(root, '.citable', 'runs');
    const runs = fs.existsSync(runsDir)
      ? fs.readdirSync(runsDir).filter((r) => r !== result.runId && fs.existsSync(path.join(runsDir, r, 'findings.json'))).sort()
      : [];
    const prevRunId = runs.at(-1);

    if (prevRunId) {
      const comparison = compareSnapshots(root, { runA: prevRunId, runB: result.runId });
      monitorResult = {
        baseline_run: prevRunId,
        comparable: comparison.comparability.comparable,
        summary: comparison.summary,
        regressions_count: comparison.regressions.length,
      };

      const targetWebhook = webhook || schedule.monitor?.webhook_url;
      const targetMinSev = minSeverity || schedule.monitor?.min_severity || 'medium';

      if (targetWebhook) {
        const alerts = comparison.regressions.map((f) => ({
          severity: f.classification?.severity || 'medium',
          type: 'finding_regression',
          detector_id: f.detector_id,
          key: `${f.detector_id}|${f.subject?.identifier || f.subject?.source_file || 'unknown'}`,
          message: f.observation?.summary || '',
        }));

        const qualifyingAlerts = filterAlerts(alerts, targetMinSev);
        if (qualifyingAlerts.length > 0) {
          const payload = buildAlertPayload({
            runA: prevRunId,
            runB: result.runId,
            source: 'schedule',
            summary: {
              schedule_id: scheduleId,
              ...comparison.summary,
            },
            alerts: qualifyingAlerts,
          });
          alertDelivery = await dispatchAlertWebhook(root, payload, {
            webhookUrl: targetWebhook,
            fetchImpl,
            lookup,
            allowPrivateForTest,
          });
        } else {
          alertDelivery = { skipped: true, reason: `no regressions meet min_severity: ${targetMinSev}` };
        }
      }
    } else {
      monitorResult = {
        status: 'insufficient_history',
        message: 'No prior audit run available for regression comparison',
      };
    }
  }

  const execution = {
    schedule_id: scheduleId,
    cron: schedule.cron,
    owner: schedule.owner,
    executed_at: nowIso(),
    run_id: result.runId,
    manifest_hash: sha256(fs.readFileSync(path.join(result.dir, 'manifest.json'))),
    limitations: schedule.limitations,
    ...(monitorResult ? { monitor: monitorResult } : {}),
    ...(alertDelivery ? { alert_delivery: alertDelivery } : {}),
  };
  const executionFile = path.join(root, '.citable', 'schedule-executions', `${result.runId}.json`);
  writeJson(executionFile, execution);
  return { ...result, schedule_execution: execution, execution_file: executionFile };
}

function annotationLevel(severity) {
  if (['critical', 'high'].includes(severity)) return 'failure';
  if (severity === 'medium') return 'warning';
  return 'notice';
}

export function projectGithub(root, { runId } = {}) {
  if (!runId) throw new Error('projection requires a source run id');
  const runDir = path.join(root, '.citable', 'runs', runId);
  const findingsFile = path.join(runDir, 'findings.json');
  const manifestFile = path.join(runDir, 'manifest.json');
  if (!fs.existsSync(findingsFile) || !fs.existsSync(manifestFile)) throw new Error(`run ${runId} is missing findings or manifest evidence`);
  const findingsBytes = fs.readFileSync(findingsFile);
  const manifestBytes = fs.readFileSync(manifestFile);
  const annotations = JSON.parse(findingsBytes).map((finding) => ({
    level: annotationLevel(finding.classification.severity),
    title: `${finding.detector_id}: ${finding.classification.severity}`,
    message: finding.observation.summary,
    path: finding.subject.source_file || null,
    line: finding.subject.source_location ? Number(String(finding.subject.source_location).match(/\d+/)?.[0]) || null : null,
    finding_id: finding.finding_id,
  }));
  const projection = { source_run_id: runId, source_manifest_hash: sha256(manifestBytes), source_findings_hash: sha256(findingsBytes), generated_at: nowIso(), projection: 'github-check-annotations', authoritative: false, annotations };
  const dir = path.join(root, '.citable', 'projections', 'github', runId);
  writeJson(path.join(dir, 'annotations.json'), projection);
  return { ...projection, dir };
}
