import fs from 'node:fs';
import path from 'node:path';
import { readJson, sha256File } from './io.js';
import { verifyRunPackage, RunVerificationError } from './runPackageVerifier.js';
import { validateAgainst } from './schemaValidator.js';

export const VERIFIED_RUN_LOADER_VERSION = 'verified-run-loader-v1';

export class VerifiedRunLoadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'VerifiedRunLoadError';
    this.code = details.code || 'VERIFIED_RUN_LOAD_FAILED';
    this.details = details;
  }
}

function readContractArtifact(runDir, file, schema, { required = true } = {}) {
  const filePath = path.join(runDir, file);
  if (!fs.existsSync(filePath)) {
    if (required) throw new VerifiedRunLoadError(`Verified run is missing ${file}`, { code: 'ARTIFACT_MISSING', file });
    return null;
  }
  let value;
  try {
    value = readJson(filePath);
  } catch (error) {
    throw new VerifiedRunLoadError(`${file} is invalid JSON: ${error.message}`, { code: 'ARTIFACT_INVALID', file });
  }
  const validation = schema ? validateAgainst(schema, value) : { valid: true, errors: [] };
  if (!validation.valid) {
    throw new VerifiedRunLoadError(`${file} violates ${schema}: ${validation.errors.join('; ')}`, {
      code: 'ARTIFACT_SCHEMA_INVALID', file, errors: validation.errors,
    });
  }
  return value;
}

/**
 * Load a run only after its closed-world checksum seal and execution contracts
 * have been verified. Consumers must use this API rather than reading
 * findings.json directly: the returned findings are bound to the verified
 * package, manifest, and (when present) coverage artifact.
 *
 * Legacy packages can be opened explicitly for migration. Their coverage is
 * indeterminate and never receives a synthesized complete default.
 */
export function loadVerifiedRun(runDir, {
  requireCompletedExecution = true,
  allowLegacy = false,
  requireCoverage = !allowLegacy,
} = {}) {
  try {
    const verification = verifyRunPackage(runDir, {
      requireFindings: true,
      requireCompleted: requireCompletedExecution,
      requireChecksums: true,
    });

    const coveragePath = path.join(runDir, 'coverage.json');
    const hasCoverage = fs.existsSync(coveragePath);
    if (!hasCoverage && !allowLegacy && requireCoverage) {
      throw new VerifiedRunLoadError('Verified run is missing coverage.json; use explicit legacy mode to open historical packages', {
        code: 'COVERAGE_MISSING',
      });
    }
    const coverage = hasCoverage ? readContractArtifact(runDir, 'coverage.json', 'audit-coverage.schema.json') : null;
    const summary = readContractArtifact(runDir, 'summary.json', null, { required: false });

    return {
      ...verification,
      verified: true,
      verification_version: VERIFIED_RUN_LOADER_VERSION,
      integrity_mode: 'sealed',
      package_dir: path.resolve(runDir),
      package_hash: sha256File(path.join(runDir, 'checksums.json')),
      findings: verification.findings,
      coverage,
      summary,
      legacy: !hasCoverage,
      coverage_status: coverage?.coverage_status || 'indeterminate',
      determination_status: coverage ? verification.manifest.determination_status : 'indeterminate',
    };
  } catch (error) {
    if (error instanceof VerifiedRunLoadError) throw error;
    if (error instanceof RunVerificationError) {
      throw new VerifiedRunLoadError(error.message, { code: error.code, cause: error });
    }
    throw new VerifiedRunLoadError(error.message, { cause: error });
  }
}
