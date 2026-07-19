import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../release/governance.js';
import { nowIso, readJson, sha256, sha256File, writeJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const PACKAGE = readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'));
const ENVELOPE = 'citable-artifact.json';
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.isAbsolute(value)
    && !value.includes('\\')
    && !value.split('/').includes('..')
    && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function filesUnder(dir, current = dir, result = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(dir, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink()) throw new Error(`artifact package cannot contain symbolic links: ${relative}`);
    if (entry.isDirectory()) filesUnder(dir, absolute, result);
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`artifact package contains unsupported filesystem entry: ${relative}`);
  }
  return result.sort();
}

function validateRunPackage(runDir) {
  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) throw new Error(`run package not found: ${runDir}`);
  const manifestFile = path.join(runDir, 'manifest.json');
  const checksumsFile = path.join(runDir, 'checksums.json');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(checksumsFile)) throw new Error('run package requires manifest.json and checksums.json');
  const manifest = readJson(manifestFile);
  const manifestCheck = validateAgainst('run.schema.json', manifest);
  if (!manifestCheck.valid) throw new Error(`run manifest invalid: ${manifestCheck.errors.join('; ')}`);
  const checksums = readJson(checksumsFile);
  if (!checksums || Array.isArray(checksums) || typeof checksums !== 'object') throw new Error('checksums.json must be an object');
  const actualFiles = filesUnder(runDir).filter((name) => name !== ENVELOPE);
  const expectedFiles = [...Object.keys(checksums), 'checksums.json'].sort();
  if (new Set(expectedFiles).size !== expectedFiles.length) throw new Error('checksums.json contains duplicate package paths');
  for (const rel of Object.keys(checksums)) {
    if (!safeRelativePath(rel) || rel === ENVELOPE || rel === 'checksums.json') throw new Error(`unsafe checksum path: ${rel}`);
    const file = path.join(runDir, ...rel.split('/'));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`checksummed artifact is missing: ${rel}`);
    if (!/^[a-f0-9]{64}$/.test(checksums[rel]) || sha256File(file) !== checksums[rel]) throw new Error(`artifact checksum mismatch: ${rel}`);
  }
  const extras = actualFiles.filter((name) => !expectedFiles.includes(name));
  const missing = expectedFiles.filter((name) => !actualFiles.includes(name));
  if (extras.length || missing.length) throw new Error(`run package completeness failure${extras.length ? `; unsealed: ${extras.join(', ')}` : ''}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
  if (checksums['manifest.json'] !== sha256File(manifestFile)) throw new Error('manifest.json is not bound by checksums.json');
  return { manifest, files: actualFiles };
}

function artifactRecords(dir, files) {
  return files.map((relative) => {
    const file = path.join(dir, ...relative.split('/'));
    return { path: relative, sha256: sha256File(file), bytes: fs.statSync(file).size };
  });
}

function packageHash(envelope) {
  return sha256(canonicalJson({ ...envelope, package_hash: '' }));
}

export function verifyArtifactPackage(input) {
  const dir = path.resolve(input ?? '');
  const envelopeFile = path.join(dir, ENVELOPE);
  if (!fs.existsSync(envelopeFile)) throw new Error(`artifact interchange envelope not found: ${envelopeFile}`);
  const envelope = readJson(envelopeFile);
  const envelopeCheck = validateAgainst('artifact-interchange.schema.json', envelope);
  if (!envelopeCheck.valid) throw new Error(`artifact interchange envelope invalid: ${envelopeCheck.errors.join('; ')}`);
  if (packageHash(envelope) !== envelope.package_hash) throw new Error('artifact interchange package hash mismatch');
  const { manifest, files } = validateRunPackage(dir);
  if (manifest.run_id !== envelope.run.run_id) throw new Error('artifact run id does not match run manifest');
  if (manifest.command !== envelope.run.command || manifest.status !== envelope.run.status || manifest.timestamp !== envelope.run.timestamp) throw new Error('artifact run metadata does not match run manifest');
  if (manifest.tool_version !== envelope.run.tool_version || manifest.skill_version !== envelope.run.skill_version) throw new Error('artifact source versions do not match run manifest');
  if (sha256File(path.join(dir, 'manifest.json')) !== envelope.run.manifest_sha256) throw new Error('artifact manifest hash mismatch');
  if (sha256File(path.join(dir, 'checksums.json')) !== envelope.run.checksums_sha256) throw new Error('artifact checksums hash mismatch');
  const records = artifactRecords(dir, files);
  if (canonicalJson(records) !== canonicalJson(envelope.artifacts)) throw new Error('artifact inventory does not match package contents');
  return { valid: true, dir, envelope, manifest, artifacts: records };
}

export function exportArtifactPackage(root, { runId, output }) {
  if (!runId) throw new Error('usage: citable artifacts export <run-id> --output <directory>');
  if (!SAFE_RUN_ID.test(runId)) throw new Error('artifact export requires a safe run id');
  if (!output) throw new Error('artifact export requires --output <directory>');
  const source = path.join(root, '.citable', 'runs', runId);
  const validated = validateRunPackage(source);
  if (validated.manifest.run_id !== runId) throw new Error('requested run id does not match run manifest');
  const destination = path.resolve(root, output);
  if (fs.existsSync(destination)) throw new Error(`artifact export destination already exists: ${destination}`);
  if (destination === source || destination.startsWith(`${source}${path.sep}`)) throw new Error('artifact export destination cannot be inside the source run package');
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, `.${path.basename(destination)}-`));
  try {
    for (const relative of validated.files) {
      const sourceFile = path.join(source, ...relative.split('/'));
      const targetFile = path.join(stage, ...relative.split('/'));
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(sourceFile, targetFile);
    }
    const artifacts = artifactRecords(stage, validated.files);
    const envelope = {
      contract: 'citable-artifact-interchange',
      contract_version: 1,
      created_at: nowIso(),
      producer: { tool: 'citable', tool_version: PACKAGE.version, skill_version: PACKAGE.version },
      run: {
        run_id: validated.manifest.run_id,
        command: validated.manifest.command,
        status: validated.manifest.status,
        timestamp: validated.manifest.timestamp,
        tool_version: validated.manifest.tool_version,
        skill_version: validated.manifest.skill_version,
        manifest_sha256: sha256File(path.join(stage, 'manifest.json')),
        checksums_sha256: sha256File(path.join(stage, 'checksums.json')),
      },
      artifacts,
      package_hash: '',
      limitations: [
        'Checksums establish preservation of exported bytes, not source authenticity, completeness of external observations, or outcome causality.',
        'This portable package does not grant hosted storage, tenant, authentication, billing, or dashboard authority.',
      ],
    };
    envelope.package_hash = packageHash(envelope);
    writeJson(path.join(stage, ENVELOPE), envelope);
    verifyArtifactPackage(stage);
    fs.renameSync(stage, destination);
    return { output: destination, envelope, artifacts: artifacts.length };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function importArtifactPackage(root, { input }) {
  if (!input) throw new Error('artifact import requires --input <directory>');
  const verified = verifyArtifactPackage(input);
  if (!SAFE_RUN_ID.test(verified.manifest.run_id)) throw new Error('artifact import requires a safe run id');
  const runsDir = path.join(root, '.citable', 'runs');
  const destination = path.join(runsDir, verified.manifest.run_id);
  if (fs.existsSync(destination)) {
    let existing;
    try {
      existing = validateRunPackage(destination);
    } catch (error) {
      throw new Error(`run collision: ${verified.manifest.run_id} already exists but is not a valid sealed package (${error.message})`);
    }
    const existingRecords = artifactRecords(destination, existing.files);
    if (canonicalJson(existingRecords) === canonicalJson(verified.artifacts)) return { status: 'already_present', run_id: verified.manifest.run_id, destination };
    throw new Error(`run collision: ${verified.manifest.run_id} already exists with different artifacts`);
  }
  fs.mkdirSync(runsDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(runsDir, '.artifact-import-'));
  try {
    for (const relative of verified.artifacts.map((item) => item.path)) {
      const sourceFile = path.join(verified.dir, ...relative.split('/'));
      const targetFile = path.join(stage, ...relative.split('/'));
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(sourceFile, targetFile);
    }
    validateRunPackage(stage);
    fs.renameSync(stage, destination);
    return { status: 'imported', run_id: verified.manifest.run_id, destination, source_package_hash: verified.envelope.package_hash };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export const ARTIFACT_INTERCHANGE_ENVELOPE = ENVELOPE;
