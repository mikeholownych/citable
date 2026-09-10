import fs from 'node:fs';
import path from 'node:path';
import { readJson, sha256, sha256File } from './io.js';
import { verifyRunPackage, RunVerificationError } from './runPackageVerifier.js';
import { buildContext } from '../commands/context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, indexTargets } from '../detectors/framework.js';

export class SourceResolutionError extends Error {
  constructor(message, code = 'SOURCE_RESOLUTION_ERROR', details = {}) {
    super(message);
    this.name = 'SourceResolutionError';
    this.code = code;
    this.details = details;
  }
}

export class RunNotFoundError extends SourceResolutionError {
  constructor(runId) {
    super(`Specified run not found: ${runId}`, 'RUN_NOT_FOUND', { runId });
    this.runId = runId;
  }
}

export class FindingsMissingError extends SourceResolutionError {
  constructor(runId, filePath) {
    super(`Run ${runId} is missing findings.json at ${filePath}`, 'FINDINGS_MISSING', { runId, filePath });
    this.runId = runId;
    this.filePath = filePath;
  }
}

export class FindingsInvalidError extends SourceResolutionError {
  constructor(runId, message) {
    super(`Run ${runId} contains malformed or invalid findings: ${message}`, 'FINDINGS_INVALID', { runId, message });
    this.runId = runId;
  }
}

export class LiveInspectionFailedError extends SourceResolutionError {
  constructor(target, reason) {
    super(`Live target inspection failed for ${target}: ${reason}`, 'LIVE_INSPECTION_FAILED', { target, reason });
    this.target = target;
  }
}

export class NoFindingsAvailableError extends SourceResolutionError {
  constructor(source, mode = 'CONTRACTUAL') {
    super(
      `No verified audit findings available from ${source} for ${mode} generation. Production generation requires authoritative findings. (Use --sample or --demo to generate non-contractual sample)`,
      'NO_FINDINGS',
      { source, mode }
    );
  }
}

/**
 * Extract canonical timestamp (epoch ms) from run package
 * Hierarchy:
 * 1. manifest.json `timestamp` or `created_at` ISO string
 * 2. Run ID timestamp prefix (YYYYMMDDTHHmmss)
 * 3. findings.json mtime
 * 4. run directory mtime
 */
export function getCanonicalRunTimestamp(runDir, runId = '') {
  // 1. manifest.json
  const manifestPath = path.join(runDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.timestamp) {
        const ms = Date.parse(manifest.timestamp);
        if (!Number.isNaN(ms)) return ms;
      }
      if (manifest.created_at) {
        const ms = Date.parse(manifest.created_at);
        if (!Number.isNaN(ms)) return ms;
      }
    } catch {}
  }

  // 2. Run ID timestamp prefix (YYYYMMDDTHHmmss)
  const m = String(runId).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return ms;
  }

  // 3. findings.json mtime
  const findPath = path.join(runDir, 'findings.json');
  if (fs.existsSync(findPath)) {
    try {
      return fs.statSync(findPath).mtimeMs;
    } catch {}
  }

  // 4. Directory mtime
  try {
    return fs.statSync(runDir).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Sort run candidate directory names by chronological timestamp descending,
 * with deterministic lexicographical tie-breaking.
 * Invariant:
 *   latest run = max(canonical run timestamp)
 *   tie = deterministic secondary key
 */
export function sortRunCandidatesChronologically(runsDir, candidateRunIds = []) {
  return [...candidateRunIds].sort((a, b) => {
    const timeA = getCanonicalRunTimestamp(path.join(runsDir, a), a);
    const timeB = getCanonicalRunTimestamp(path.join(runsDir, b), b);
    if (timeB !== timeA) {
      return timeB - timeA; // Descending: latest timestamp first
    }
    return b.localeCompare(a); // Deterministic tie-breaker
  });
}

/**
 * Unified Canonical Evidence Source Resolver
 *
 * Enforces strict precedence and fail-closed integrity across SOW and Executive Reports:
 * 1. DIRECT_FINDINGS (in-memory findings array)
 * 2. EXPLICIT_RUN (--run <id>): verified via runPackageVerifier
 * 3. LIVE_INSPECTION (--live or target): executed on demand
 * 4. LATEST_RECORDED_RUN: chronologically latest run in .citable/runs verified via runPackageVerifier
 * 5. SAMPLE: synthetic demonstration sample
 */
export async function resolveEvidenceSource(root, options = {}) {
  const {
    findings: inputFindings = null,
    runId = null,
    target = null,
    live = false,
    baseUrl = null,
    refDate = null,
    sample = false,
    demo = false,
    draft = false,
    contractual = false,
    scopes = ['technical', 'seo', 'aeo', 'geo', 'schema', 'entity', 'cro'],
  } = options;

  const isSample = Boolean(sample || demo);
  const isDraft = Boolean(draft);
  const generationMode = isSample ? 'NON_CONTRACTUAL_SAMPLE' : (isDraft ? 'DRAFT' : 'CONTRACTUAL');

  // 1. Direct findings in memory
  if (Array.isArray(inputFindings)) {
    const findingsJson = JSON.stringify(inputFindings);
    return {
      source_type: 'DIRECT_FINDINGS',
      source_identifier: 'in_memory',
      findings: inputFindings,
      findings_count: inputFindings.length,
      integrity_hash: sha256(findingsJson),
      generation_mode: generationMode,
      run_metadata: null,
    };
  }

  // 2. Explicit run requested via runId
  if (runId) {
    const runsDir = path.join(root, '.citable', 'runs');
    const runPath = path.join(runsDir, runId);
    if (!fs.existsSync(runPath)) {
      throw new RunNotFoundError(runId);
    }
    const findPath = path.join(runPath, 'findings.json');
    if (!fs.existsSync(findPath)) {
      throw new FindingsMissingError(runId, findPath);
    }

    try {
      const verification = verifyRunPackage(runPath, {
        requireFindings: true,
        requireCompleted: generationMode === 'CONTRACTUAL',
        requireChecksums: true,
      });

      return {
        source_type: 'HISTORICAL_RUN',
        source_identifier: runId,
        findings: verification.findings,
        findings_count: verification.findingsCount,
        integrity_hash: sha256File(findPath),
        generation_mode: generationMode,
        run_metadata: verification.manifest,
        checksums_verified: verification.checksumsVerified,
      };
    } catch (err) {
      if (err instanceof RunVerificationError) {
        throw new FindingsInvalidError(runId, err.message);
      }
      throw err;
    }
  }

  // 3. Live target inspection
  if (live || target) {
    if (!target) {
      throw new SourceResolutionError('Target is required for live inspection (e.g. --target <url|dir>)', 'TARGET_REQUIRED');
    }
    try {
      const ctx = await buildContext(root, { target, baseUrl, refDate });
      if (!ctx?.site) {
        throw new Error(`Target ${target} did not produce a valid site context`);
      }
      indexTargets(ctx);
      const detectors = selectDetectors({ scopes });
      const res = runDetectors(detectors, ctx);
      const liveFindings = res.findings || [];

      return {
        source_type: 'LIVE_INSPECTION',
        source_identifier: target,
        findings: liveFindings,
        findings_count: liveFindings.length,
        integrity_hash: sha256(JSON.stringify(liveFindings)),
        generation_mode: generationMode,
        run_metadata: null,
        context: ctx,
      };
    } catch (err) {
      throw new LiveInspectionFailedError(target, err.message);
    }
  }

  // 4. Latest recorded run in .citable/runs
  const runsDir = path.join(root, '.citable', 'runs');
  if (fs.existsSync(runsDir)) {
    const candidateDirs = fs.readdirSync(runsDir).filter((name) => {
      const p = path.join(runsDir, name);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'findings.json'));
    });

    if (candidateDirs.length > 0) {
      const sorted = sortRunCandidatesChronologically(runsDir, candidateDirs);
      for (const candidateId of sorted) {
        const runPath = path.join(runsDir, candidateId);
        const findPath = path.join(runPath, 'findings.json');
        try {
          const verification = verifyRunPackage(runPath, {
            requireFindings: true,
            requireCompleted: false, // allow non-completed in discovery if valid
            requireChecksums: false,
          });

          return {
            source_type: 'LATEST_RECORDED_RUN',
            source_identifier: candidateId,
            findings: verification.findings,
            findings_count: verification.findingsCount,
            integrity_hash: sha256File(findPath),
            generation_mode: generationMode,
            run_metadata: verification.manifest,
          };
        } catch {
          // Try next candidate
          continue;
        }
      }
    }
  }

  // 5. Sample / Demo mode
  if (isSample) {
    return {
      source_type: 'SAMPLE',
      source_identifier: 'synthetic_sample_template',
      findings: [],
      findings_count: 0,
      integrity_hash: null,
      generation_mode: 'NON_CONTRACTUAL_SAMPLE',
      run_metadata: null,
    };
  }

  // If we reach here in contractual mode, fail closed
  throw new NoFindingsAvailableError('.citable/runs or input target', generationMode);
}
