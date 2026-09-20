import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './io.js';
import { validateAgainst } from './schemaValidator.js';

export class RunVerificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RunVerificationError';
    this.code = details.code || 'RUN_VERIFICATION_FAILED';
    this.details = details;
  }
}

function readStableBytes(file, runDir, relative) {
  const first = fs.readFileSync(file);
  const second = fs.readFileSync(file);
  if (!first.equals(second)) {
    throw new RunVerificationError(`Artifact changed while being verified: ${relative}`, {
      code: 'PACKAGE_MUTATION', runDir, file: relative,
    });
  }
  return first;
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
    ignoredFiles = [],
  } = options;

  if (!runDir || !fs.existsSync(runDir)) {
    throw new RunVerificationError(`Run directory not found: ${runDir}`, { code: 'RUN_NOT_FOUND', runDir });
  }
  let rootStat;
  try { rootStat = fs.lstatSync(runDir); } catch (error) {
    throw new RunVerificationError(`Run directory cannot be inspected: ${error.message}`, { code: 'RUN_NOT_FOUND', runDir });
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new RunVerificationError(`Run path is not a real directory: ${runDir}`, { code: 'RUN_PATH_INVALID', runDir });
  }

  const manifestPath = path.join(runDir, 'manifest.json');
  if (fs.existsSync(manifestPath) && fs.lstatSync(manifestPath).isSymbolicLink()) {
    throw new RunVerificationError('Run manifest.json is a symbolic link', { code: 'PACKAGE_SYMLINK', runDir, file: 'manifest.json' });
  }
  if (!fs.existsSync(manifestPath)) {
    throw new RunVerificationError(`Run package is missing manifest.json at ${manifestPath}`, {
      code: 'MANIFEST_MISSING',
      runDir,
    });
  }

  let manifest;
  try {
    manifest = JSON.parse(readStableBytes(manifestPath, runDir, 'manifest.json').toString('utf8'));
  } catch (err) {
    throw new RunVerificationError(`Run manifest.json is invalid JSON: ${err.message}`, {
      code: 'MANIFEST_INVALID',
      runDir,
    });
  }

  const schemaValidation = validateAgainst('run.schema.json', manifest);
  if (Object.prototype.hasOwnProperty.call(manifest, 'schema_version')
    && ![1, 2].includes(manifest.schema_version)) {
    throw new RunVerificationError(`Unsupported run manifest schema_version: ${String(manifest.schema_version)}`, {
      code: 'MANIFEST_SCHEMA_UNSUPPORTED', runDir, schema_version: manifest.schema_version,
    });
  }
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

  // A sealed run is closed-world: every regular file except the checksum
  // index itself must be listed, and every listed path must be safe.  Do not
  // use stat() here because it follows symlinks and could verify bytes outside
  // the package directory.
  const packageFiles = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(runDir, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new RunVerificationError(`Run package contains symbolic link: ${relative}`, {
          code: 'PACKAGE_SYMLINK', runDir, file: relative,
        });
      }
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) packageFiles.push(relative);
      else throw new RunVerificationError(`Run package contains unsupported filesystem entry: ${relative}`, {
        code: 'PACKAGE_ENTRY_INVALID', runDir, file: relative,
      });
    }
  };
  walk(runDir);
  const ignored = new Set(ignoredFiles);

  // Verify checksums.json
  const checksumsPath = path.join(runDir, 'checksums.json');
  let checksumsVerified = false;
  let artifactHashes = {};
  const artifactBytes = new Map();
  if (fs.existsSync(checksumsPath)) {
    if (fs.lstatSync(checksumsPath).isSymbolicLink()) throw new RunVerificationError('checksums.json is a symbolic link', { code: 'PACKAGE_SYMLINK', runDir, file: 'checksums.json' });
    let checksums;
    try {
      checksums = JSON.parse(readStableBytes(checksumsPath, runDir, 'checksums.json').toString('utf8'));
    } catch (err) {
      throw new RunVerificationError(`checksums.json is invalid JSON: ${err.message}`, {
        code: 'CHECKSUMS_INVALID',
        runDir,
      });
    }
    artifactHashes = checksums;

    const tamperedFiles = [];
    const missingFiles = [];

    const safePath = (value) => typeof value === 'string'
      && value.length > 0
      && !path.isAbsolute(value)
      && !value.includes('\\')
      && !value.split('/').includes('..')
      && !value.split('/').includes('')
      && !/^[a-z][a-z0-9+.-]*:/i.test(value);
    for (const [relPath, expectedHash] of Object.entries(checksums)) {
      if (!safePath(relPath) || relPath === 'checksums.json') {
        throw new RunVerificationError(`unsafe checksum path (escapes the run package): ${relPath}`, {
          code: 'CHECKSUM_PATH_INVALID', runDir, file: relPath,
        });
      }
      const artifactPath = path.join(runDir, relPath);
      if (!fs.existsSync(artifactPath)) {
        missingFiles.push(relPath);
        continue;
      }
      const artifactStat = fs.lstatSync(artifactPath);
      if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
        throw new RunVerificationError(`checksum artifact is not a regular file: ${relPath}`, { code: 'PACKAGE_SYMLINK', runDir, file: relPath });
      }
      const bytes = readStableBytes(artifactPath, runDir, relPath);
      artifactBytes.set(relPath, bytes);
      const actualHash = sha256(bytes);
      if (actualHash !== expectedHash) {
        tamperedFiles.push({ file: relPath, expected: expectedHash, actual: actualHash });
      }
    }

    const expectedFiles = Object.keys(checksums).sort();
    const actualFiles = packageFiles.filter((file) => file !== 'checksums.json' && !ignored.has(file)).sort();
    const unexpectedFiles = actualFiles.filter((file) => !expectedFiles.includes(file));
    const unlistedFiles = expectedFiles.filter((file) => !actualFiles.includes(file));
    if (tamperedFiles.length > 0 || missingFiles.length > 0 || unexpectedFiles.length > 0 || unlistedFiles.length > 0) {
      throw new RunVerificationError(
        `Cryptographic verification failed for run package (checksum mismatch; integrity failed; completeness failure; unsealed): ${tamperedFiles.length} tampered files, ${missingFiles.length + unlistedFiles.length} missing files, ${unexpectedFiles.length} unexpected files`,
        {
          code: 'CHECKSUM_MISMATCH',
          tamperedFiles,
          missingFiles: [...missingFiles, ...unlistedFiles],
          unexpectedFiles,
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
      if (fs.lstatSync(findingsPath).isSymbolicLink()) throw new Error('findings.json is a symbolic link');
      const findingsBytes = artifactBytes.get('findings.json') || readStableBytes(findingsPath, runDir, 'findings.json');
      artifactBytes.set('findings.json', findingsBytes);
      findings = JSON.parse(findingsBytes.toString('utf8'));
      if (!Array.isArray(findings)) {
        throw new Error('findings.json must contain an array of findings');
      }
      for (const [index, finding] of findings.entries()) {
        const findingValidation = validateAgainst('finding.schema.json', finding);
        if (!findingValidation.valid) {
          throw new Error(`finding[${index}] violates finding.schema.json: ${findingValidation.errors.join('; ')}`);
        }
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
    artifactHashes,
    artifactBytes,
  };
}
