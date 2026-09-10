import fs from 'node:fs';
import path from 'node:path';
import { readJson, sha256File } from './io.js';
import { validateAgainst } from './schemaValidator.js';

export class RunVerificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RunVerificationError';
    this.code = details.code || 'RUN_VERIFICATION_FAILED';
    this.details = details;
  }
}

/**
 * Verifies the cryptographic and structural integrity of an audit run evidence package.
 *
 * Checks:
 * 1. Existence of run directory and manifest.json
 * 2. Manifest compliance with run.schema.json
 * 3. Existence and validity of checksums.json
 * 4. Exact sha256 hash match for all sealed artifacts in checksums.json
 * 5. Run completion status (rejecting failed or partial runs in contractual contexts)
 * 6. Findings structural validity
 */
export function verifyRunPackage(runDir, options = {}) {
  const {
    requireFindings = true,
    requireCompleted = false,
    requireChecksums = true,
  } = options;

  if (!runDir || !fs.existsSync(runDir)) {
    throw new RunVerificationError(`Run directory not found: ${runDir}`, { code: 'RUN_NOT_FOUND', runDir });
  }

  const manifestPath = path.join(runDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new RunVerificationError(`Run package is missing manifest.json at ${manifestPath}`, {
      code: 'MANIFEST_MISSING',
      runDir,
    });
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (err) {
    throw new RunVerificationError(`Run manifest.json is invalid JSON: ${err.message}`, {
      code: 'MANIFEST_INVALID',
      runDir,
    });
  }

  const schemaValidation = validateAgainst('run.schema.json', manifest);
  if (!schemaValidation.valid) {
    throw new RunVerificationError(`Run manifest violates run.schema.json: ${schemaValidation.errors.join('; ')}`, {
      code: 'MANIFEST_SCHEMA_INVALID',
      errors: schemaValidation.errors,
      runDir,
    });
  }

  if (requireCompleted && manifest.status !== 'completed' && manifest.status !== 'success') {
    throw new RunVerificationError(`Run status is "${manifest.status}"; expected completed/success`, {
      code: 'RUN_INCOMPLETE',
      status: manifest.status,
      runDir,
    });
  }

  // Verify checksums.json
  const checksumsPath = path.join(runDir, 'checksums.json');
  let checksumsVerified = false;
  if (fs.existsSync(checksumsPath)) {
    let checksums;
    try {
      checksums = readJson(checksumsPath);
    } catch (err) {
      throw new RunVerificationError(`checksums.json is invalid JSON: ${err.message}`, {
        code: 'CHECKSUMS_INVALID',
        runDir,
      });
    }

    const tamperedFiles = [];
    const missingFiles = [];

    for (const [relPath, expectedHash] of Object.entries(checksums)) {
      const artifactPath = path.join(runDir, relPath);
      if (!fs.existsSync(artifactPath)) {
        missingFiles.push(relPath);
        continue;
      }
      const actualHash = sha256File(artifactPath);
      if (actualHash !== expectedHash) {
        tamperedFiles.push({ file: relPath, expected: expectedHash, actual: actualHash });
      }
    }

    if (tamperedFiles.length > 0 || missingFiles.length > 0) {
      throw new RunVerificationError(
        `Cryptographic verification failed for run package: ${tamperedFiles.length} tampered files, ${missingFiles.length} missing files`,
        {
          code: 'CHECKSUM_MISMATCH',
          tamperedFiles,
          missingFiles,
          runDir,
        }
      );
    }
    checksumsVerified = true;
  } else if (requireChecksums) {
    throw new RunVerificationError(`Run package is missing checksums.json at ${checksumsPath}`, {
      code: 'CHECKSUMS_MISSING',
      runDir,
    });
  }

  // Findings verification if present or required
  const findingsPath = path.join(runDir, 'findings.json');
  let findings = null;
  if (fs.existsSync(findingsPath)) {
    try {
      findings = readJson(findingsPath);
      if (!Array.isArray(findings)) {
        throw new Error('findings.json must contain an array of findings');
      }
    } catch (err) {
      throw new RunVerificationError(`findings.json is malformed: ${err.message}`, {
        code: 'FINDINGS_MALFORMED',
        runDir,
      });
    }
  } else if (requireFindings) {
    throw new RunVerificationError(`Run package is missing findings.json at ${findingsPath}`, {
      code: 'FINDINGS_MISSING',
      runDir,
    });
  }

  return {
    valid: true,
    runId: manifest.run_id,
    timestamp: manifest.timestamp,
    status: manifest.status,
    manifest,
    checksumsVerified,
    findingsPath: fs.existsSync(findingsPath) ? findingsPath : null,
    findingsCount: Array.isArray(findings) ? findings.length : 0,
    findings,
  };
}
