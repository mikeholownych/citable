import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { buildContext } from './context.js';
import { runDetectors } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { remediateCommand } from './remediate.js';

const PKG_VERSION = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

const RESOLUTION_DEFINITION =
  'Resolved means the named detector no longer reports a finding for the same subject in the re-run. '
  + 'Detector absence is not a guarantee of conversion, ranking, or outcome; it is a mechanical re-check only.';

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function subjectKey(subject) {
  return subject?.identifier || subject?.url || JSON.stringify(subject) || 'unknown';
}

function newVerificationId() {
  return `VR-${nowIso().replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * `citable verify remediation` — closed loop: source-run finding -> patch ->
 * detector re-run -> before/after evidence bundle.
 *
 * Fail-closed: a missing source run, an unloadable re-check target, a refused
 * patch, or a failed detector re-run yields status `blocked`/`patch_refused`,
 * never a silent `verified`.
 */
export async function verifyRemediation(root, options = {}) {
  const { run: runId, finding, target, apply = false, subject = null } = options;
  const runDir = path.join(root, '.citable', 'runs', runId || '');
  const limitations = [
    RESOLUTION_DEFINITION,
    'The re-check observes the target as it exists now; unrelated concurrent changes are not attributable to the patch.',
    'Rendering-dependent conditions on URL targets are re-observed only if the original collection method is available.',
  ];

  const result = {
    verification_id: newVerificationId(),
    timestamp: nowIso(),
    status: 'blocked',
    tool_version: PKG_VERSION,
    repository_commit: null,
    source_run_id: runId || null,
    recheck_run_id: null,
    detector_id: finding ? String(finding).toUpperCase() : null,
    subject: null,
    verdict: { resolved: false, before_finding_ids: [], after_finding_ids: [], new_regressions: [], resolution_definition: RESOLUTION_DEFINITION },
    patch: null,
    provenance: { command: 'verify remediation', recheck_target: target || null, detectors_run: [], detectors_skipped: [], recheck_errors: [], recheck_warnings: [] },
    limitations,
    bundle_dir: null,
    bundle_checksums: {},
  };

  if (!runId || !fs.existsSync(path.join(runDir, 'findings.json'))) {
    result.provenance.recheck_errors.push(`source run not found: .citable/runs/${runId || '(none)'}`);
    result.limitations.push('required_input: run-id of the immutable source audit containing the finding.');
    return finalizeResult(result);
  }
  if (!finding) {
    result.provenance.recheck_errors.push('missing required input: --finding <detector-id>');
    return finalizeResult(result);
  }

  const beforeFindings = readJson(path.join(runDir, 'findings.json'));
  const manifest = fs.existsSync(path.join(runDir, 'manifest.json'))
    ? readJson(path.join(runDir, 'manifest.json'))
    : null;
  result.tool_version = manifest?.tool_version || PKG_VERSION;
  result.repository_commit = manifest?.repository_commit ?? null;

  const matches = beforeFindings.filter((f) =>
    (f.detector_id || '').toUpperCase() === result.detector_id
    && (!subject || subjectKey(f.subject) === subject));
  if (matches.length === 0) {
    result.provenance.recheck_errors.push(`finding ${result.detector_id} not present in source run ${runId}`);
    result.status = 'blocked';
    return finalizeResult(result);
  }
  result.verdict.before_finding_ids = matches.map((f) => f.finding_id);
  result.subject = { type: matches[0].subject?.type || 'unknown', identifier: subject || subjectKey(matches[0].subject) };

  // Optional gated patch application (production-safe pipeline from remediate.js)
  if (target && apply) {
    const targetPath = path.resolve(root, target);
    const beforeSha = fs.existsSync(targetPath) ? sha256(fs.readFileSync(targetPath, 'utf8')) : null;
    const patchRes = await remediateCommand(root, { finding: result.detector_id, target, write: true });
    result.patch = {
      target_file: target,
      framework: patchRes.framework?.framework ?? null,
      patcher_class: patchRes.patcher_class ?? null,
      confidence: patchRes.confidence?.score ?? null,
      validation_passed: Boolean(patchRes.validation?.ok),
      applied: Boolean(patchRes.written),
      refusal_reason: patchRes.refusal_reason ?? null,
      rollback_snapshot: patchRes.rollback?.snapshot_file ?? null,
      before_sha256: beforeSha,
      after_sha256: patchRes.written ? sha256(fs.readFileSync(targetPath, 'utf8')) : null,
    };
    if (!patchRes.written) {
      result.status = 'patch_refused';
      result.limitations.push('Patch was refused by the safety gate; no re-check verdict is possible until the patch is applied or refused intentionally.');
      return finalizeResult(result);
    }
  } else if (target) {
    const p = path.resolve(root, target);
    if (fs.existsSync(p)) {
      result.patch = { target_file: target, applied: true, before_sha256: null, after_sha256: sha256(fs.readFileSync(p, 'utf8')) };
    }
  }

  // Re-run the detector namespace against the original audit target (site dir
  // or URL) — deliberately independent from the patch file target.
  const recheckTarget = options.recheckTarget || manifest?.target?.location || target || null;
  if (!recheckTarget) {
    result.provenance.recheck_errors.push('no re-check target available (original run had no location and no --target supplied)');
    result.limitations.push('required_input: --target <dir|url> matching the source run target.');
    return finalizeResult(result);
  }
  result.provenance.recheck_target = recheckTarget;

  const namespace = result.detector_id.split('-')[0];
  let ctx;
  try {
    ctx = await buildContext(root, { target: recheckTarget, baseUrl: options.baseUrl, refDate: options.refDate });
  } catch (err) {
    result.provenance.recheck_errors.push(`re-check context failed: ${err.message}`);
    result.limitations.push('required_input: a readable target directory or URL for the detector re-run.');
    return finalizeResult(result);
  }
  if (!ctx.site) {
    result.provenance.recheck_errors.push('re-check target produced no site context; detector re-run impossible (fail closed)');
    return finalizeResult(result);
  }
  result.provenance.recheck_warnings.push(...(ctx.warnings || []));

  const { findings: afterFindings, detectorsRun, detectorsSkipped, errors } = runDetectors(
    selectDetectors({ namespaces: [namespace] }),
    ctx
  );
  result.provenance.detectors_run = detectorsRun;
  result.provenance.detectors_skipped = detectorsSkipped;
  result.provenance.recheck_errors.push(...errors);

  const afterMatches = afterFindings.filter((f) =>
    (f.detector_id || '').toUpperCase() === result.detector_id
    && subjectKey(f.subject) === subjectKey(matches[0].subject));
  result.verdict.after_finding_ids = afterMatches.map((f) => f.finding_id);

  const beforeKeys = new Set(beforeFindings.map((f) => `${f.detector_id}|${subjectKey(f.subject)}|${f.observation?.summary}`));
  const afterKeys = new Set(afterFindings.map((f) => `${f.detector_id}|${subjectKey(f.subject)}|${f.observation?.summary}`));
  result.verdict.new_regressions = afterFindings
    .filter((f) => ['critical', 'high'].includes(f.classification?.severity))
    .filter((f) => !beforeKeys.has(`${f.detector_id}|${subjectKey(f.subject)}|${f.observation?.summary}`))
    .map((f) => ({ finding_id: f.finding_id, detector_id: f.detector_id, severity: f.classification.severity, summary: f.observation?.summary }));

  const errorsDuringRecheck = result.provenance.recheck_errors.length > 0;
  if (errorsDuringRecheck) {
    result.status = 'blocked';
    result.verdict.resolved = false;
    result.limitations.push('Detector errors occurred during the re-check; resolution cannot be established from a failed observation.');
  } else if (afterMatches.length === 0) {
    result.status = 'verified';
    result.verdict.resolved = true;
  } else {
    result.status = 'not_resolved';
    result.verdict.resolved = false;
  }

  return finalizeResult(result, root);
}

function finalizeResult(result, root = null) {
  const { valid, errors } = validateAgainst('remediation-verification.schema.json', result);
  if (!valid) throw new Error(`verification record invalid: ${errors.join('; ')}`);

  if (root) {
    const bundleDir = path.join(root, '.citable', 'verification', result.verification_id);
    fs.mkdirSync(bundleDir, { recursive: true });
    writeJson(path.join(bundleDir, 'verification.json'), result);
    writeJson(path.join(bundleDir, 'before-findings.json'), { source_run_id: result.source_run_id, findings: result.verdict.before_finding_ids });
    const checksums = {};
    for (const name of fs.readdirSync(bundleDir)) {
      const p = path.join(bundleDir, name);
      if (fs.statSync(p).isFile()) checksums[name] = sha256(fs.readFileSync(p, 'utf8'));
    }
    result.bundle_dir = path.relative(root, bundleDir);
    result.bundle_checksums = checksums;
    writeJson(path.join(bundleDir, 'verification.json'), result);
    writeJson(path.join(bundleDir, 'checksums.json'), checksums);
  }
  return result;
}
