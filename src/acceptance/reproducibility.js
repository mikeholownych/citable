import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../release/governance.js';
import { nowIso, readJson, sha256, sha256File, writeJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const INCLUDED_FIELDS = [
  'property.target', 'property.source_commit', 'property.content_hashes',
  'detectors', 'configuration.hash', 'observation_method', 'toolchain',
  'external_systems', 'canonical_artifacts', 'execution.status',
  'execution.unavailable_observations', 'execution.errors',
];

const EXCLUDED_FIELDS = [
  'run_id', 'execution.started_at', 'execution.receipt_created_at',
  'execution.locale', 'execution.region', 'property.working_tree_state',
  'host identity', 'filesystem paths', 'runtime duration', 'memory consumption',
];

function sortedObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizedArguments(argv = []) {
  const pathFlags = new Set(['--target', '--input', '--resume-run']);
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index]);
    normalized.push(value);
    if (pathFlags.has(value) && index + 1 < argv.length) {
      normalized.push('<excluded-path-or-run>');
      index += 1;
    } else if (path.isAbsolute(value)) {
      normalized[normalized.length - 1] = '<excluded-path>';
    }
  }
  return normalized;
}

function verifyRunPackage(runDir, manifest) {
  const manifestCheck = validateAgainst('run.schema.json', manifest);
  if (!manifestCheck.valid) throw new Error(`run manifest violates contract: ${manifestCheck.errors.join('; ')}`);
  const checksumsFile = path.join(runDir, 'checksums.json');
  if (!fs.existsSync(checksumsFile)) throw new Error(`run ${manifest.run_id} has no checksums.json`);
  const checksums = readJson(checksumsFile);
  if (!checksums || Array.isArray(checksums) || typeof checksums !== 'object') throw new Error('run checksums must be an object');
  const failures = [];
  for (const [relative, expected] of Object.entries(checksums)) {
    const file = path.resolve(runDir, relative);
    if (path.isAbsolute(relative) || (!file.startsWith(`${path.resolve(runDir)}${path.sep}`))) failures.push(`${relative} escapes the run package`);
    else if (!/^[a-f0-9]{64}$/.test(expected)) failures.push(`${relative} has an invalid checksum`);
    else if (!fs.existsSync(file)) failures.push(`${relative} is missing`);
    else if (sha256File(file) !== expected) failures.push(`${relative} checksum differs`);
  }
  if (failures.length) throw new Error(`run package integrity failed: ${failures.join('; ')}`);
  return checksums;
}

function fingerprintPayload(receipt) {
  return {
    property: { target: receipt.property.target, source_commit: receipt.property.source_commit, content_hashes: receipt.property.content_hashes },
    detectors: receipt.detectors,
    configuration: receipt.configuration,
    observation_method: receipt.observation_method,
    toolchain: receipt.toolchain,
    external_systems: receipt.external_systems,
    canonical_artifacts: receipt.canonical_artifacts,
    execution: { status: receipt.execution.status, unavailable_observations: receipt.execution.unavailable_observations, errors: receipt.execution.errors },
  };
}

export function createAcceptanceReceipt(root, { runId, context = {}, createdAt = nowIso() }) {
  if (!runId) throw new Error('corpus receipt requires --run <run-id>');
  const contextCheck = validateAgainst('acceptance-run-context.schema.json', context);
  if (!contextCheck.valid) throw new Error(`acceptance context violates contract: ${contextCheck.errors.join('; ')}`);
  const runDir = path.join(root, '.citable', 'runs', runId);
  const manifestFile = path.join(runDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`run ${runId} not found`);
  const manifest = readJson(manifestFile);
  if (manifest.run_id !== runId) throw new Error(`run manifest id ${manifest.run_id} does not match requested run ${runId}`);
  const checksums = verifyRunPackage(runDir, manifest);
  const canonicalArtifacts = sortedObject(Object.fromEntries(
    Object.entries(checksums).filter(([name]) => name !== 'manifest.json'),
  ));
  const unavailable = [...new Set([...(manifest.incomplete_checks || []), ...(context.unavailable_observations || [])])].sort();
  const receipt = {
    schema_version: 1,
    receipt_id: `ACCEPTANCE-RECEIPT-${sha256(`${runId}:${createdAt}`).slice(0, 20).toUpperCase()}`,
    run_id: runId,
    property: {
      target: manifest.target || {},
      source_commit: context.source_commit ?? manifest.repository_commit ?? null,
      working_tree_state: manifest.working_tree_state ?? null,
      content_hashes: sortedObject({ ...(manifest.input_hashes || {}), ...(context.content_hashes || {}) }),
    },
    detectors: {
      run: [...(manifest.detectors_run || [])].sort(),
      skipped: [...(manifest.detectors_skipped || [])].sort((a, b) => a.detector_id.localeCompare(b.detector_id)),
    },
    configuration: { hash: manifest.configuration_hash ?? null },
    observation_method: {
      command: manifest.command,
      arguments: normalizedArguments(manifest.argv || []),
      target_kind: manifest.target?.kind ?? null,
      collectors: sortedObject(context.collectors || {}),
    },
    toolchain: {
      citable_version: manifest.tool_version,
      skill_version: manifest.skill_version,
      node_version: context.node_version || process.version,
    },
    external_systems: sortedObject(context.external_systems || {}),
    execution: {
      started_at: manifest.timestamp,
      receipt_created_at: createdAt,
      locale: context.locale || manifest.locale || 'und',
      region: context.region ?? null,
      status: manifest.status,
      partial: manifest.status !== 'completed' || unavailable.length > 0 || (manifest.errors || []).length > 0,
      unavailable_observations: unavailable,
      errors: [...(manifest.errors || [])],
    },
    canonical_artifacts: canonicalArtifacts,
    reproducibility: { fingerprint: '', included_fields: INCLUDED_FIELDS, excluded_environment_fields: EXCLUDED_FIELDS },
    limitations: [
      'Fingerprint equality establishes only equality of the declared canonical inputs, methods, tools, external-system versions, and artifacts.',
      'Locale, region, timestamps, host identity, runtime, memory, and filesystem paths are execution context and are excluded from fingerprint equality.',
    ],
  };
  receipt.reproducibility.fingerprint = sha256(canonicalJson(fingerprintPayload(receipt)));
  receipt.receipt_hash = sha256(canonicalJson(receipt));
  const check = validateAgainst('acceptance-run-receipt.schema.json', receipt);
  if (!check.valid) throw new Error(`acceptance receipt violates contract: ${check.errors.join('; ')}`);
  const output = path.join(root, '.citable', 'corpus', 'receipts', `${receipt.receipt_id}.json`);
  writeJson(output, receipt);
  return { receipt, output };
}

export function verifyAcceptanceReceipt(receipt) {
  const check = validateAgainst('acceptance-run-receipt.schema.json', receipt);
  const failures = check.valid ? [] : [...check.errors];
  const { receipt_hash: ignored, ...unsigned } = receipt;
  if (receipt.receipt_hash !== sha256(canonicalJson(unsigned))) failures.push('receipt hash is inconsistent');
  if (receipt.reproducibility?.fingerprint !== sha256(canonicalJson(fingerprintPayload(receipt)))) failures.push('reproducibility fingerprint is inconsistent');
  return { valid: failures.length === 0, failures };
}

function changed(left, right) {
  return canonicalJson(left) !== canonicalJson(right);
}

export function compareAcceptanceReceipts(left, right) {
  const leftCheck = verifyAcceptanceReceipt(left);
  const rightCheck = verifyAcceptanceReceipt(right);
  if (!leftCheck.valid || !rightCheck.valid) throw new Error(`acceptance receipt integrity failed: ${[...leftCheck.failures, ...rightCheck.failures].join('; ')}`);
  const dimensions = {
    property_changed: changed({ target: left.property.target, source_commit: left.property.source_commit, content_hashes: left.property.content_hashes }, { target: right.property.target, source_commit: right.property.source_commit, content_hashes: right.property.content_hashes }),
    detector_changed: changed(left.detectors, right.detectors),
    configuration_changed: changed(left.configuration, right.configuration),
    observation_method_changed: changed(left.observation_method, right.observation_method),
    tool_changed: changed(left.toolchain, right.toolchain),
    external_system_changed: changed(left.external_systems, right.external_systems),
  };
  const canonicalArtifactsChanged = changed(left.canonical_artifacts, right.canonical_artifacts);
  return {
    receipt_a: left.receipt_id,
    receipt_b: right.receipt_id,
    fingerprint_equal: left.reproducibility.fingerprint === right.reproducibility.fingerprint,
    canonical_artifacts_changed: canonicalArtifactsChanged,
    change_dimensions: dimensions,
    partial_runs: [left, right].filter((item) => item.execution.partial).map((item) => ({ receipt_id: item.receipt_id, status: item.execution.status, unavailable_observations: item.execution.unavailable_observations, errors: item.execution.errors })),
    comparable: !Object.values(dimensions).some(Boolean),
    limitation: 'Comparability identifies declared envelope differences. It does not establish causation, external-system stability, or performance on untested properties.',
  };
}

export function readAndCompareAcceptanceReceipts(leftFile, rightFile) {
  if (!leftFile || !rightFile) throw new Error('corpus compare-receipts requires two receipt files');
  return compareAcceptanceReceipts(readJson(leftFile), readJson(rightFile));
}
