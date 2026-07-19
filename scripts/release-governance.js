import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  createDeploymentReceipt,
  generateReleaseManifest,
  initializeReleaseState,
  transitionRelease,
  validateReleaseManifest,
  verifyManifestIntegrity,
  verifyRepositoryBinding,
} from '../src/release/governance.js';
import { writeJson } from '../src/shared/io.js';

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function generatedFiles(dir) {
  const files = {};
  for (const [name, key] of [['resource-data.json', 'release/resource-data.json'], ['llms.txt', 'release/llms.txt']]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) files[key] = fs.readFileSync(file, 'utf8');
  }
  return files;
}

function requireArg(value, usage) {
  if (!value) throw new Error(usage);
  return value;
}

export function runReleaseGovernance(argv, root = process.cwd()) {
  const [command, ...args] = argv;
  if (command === 'manifest') {
    const outputDir = path.resolve(requireArg(args[0], 'manifest requires <output-dir>'));
    const commit = args[1];
    const boundCommit = commit || execFileCommit(root);
    const binding = verifyRepositoryBinding(root, boundCommit);
    if (!binding.ok) throw new Error(`release source binding failed: ${binding.failures.join('; ')}`);
    const result = generateReleaseManifest(root, { outputDir, commit: boundCommit });
    return { command, output: path.join(outputDir, 'release-manifest.json'), manifest: result.manifest };
  }
  if (command === 'validate') {
    const manifestFile = path.resolve(requireArg(args[0], 'validate requires <manifest-file>'));
    const projectionDir = path.resolve(args[1] || path.dirname(manifestFile));
    const manifest = read(manifestFile);
    const binding = verifyRepositoryBinding(root, manifest.commit);
    if (!binding.ok) throw new Error(`release source binding failed: ${binding.failures.join('; ')}`);
    const result = validateReleaseManifest(root, manifest, generatedFiles(projectionDir));
    if (!result.ok) throw new Error(`phase-one release validation failed: ${result.failures.join('; ')}`);
    return { command, ok: true };
  }
  if (command === 'state-init') {
    const manifestFile = path.resolve(requireArg(args[0], 'state-init requires <manifest-file> <output-file> <actor>'));
    const outputFile = path.resolve(requireArg(args[1], 'state-init requires <manifest-file> <output-file> <actor>'));
    const actor = requireArg(args[2], 'state-init requires <manifest-file> <output-file> <actor>');
    const manifest = read(manifestFile);
    const integrity = verifyManifestIntegrity(manifest);
    if (!integrity.ok) throw new Error(`manifest integrity failed: ${integrity.failures.join('; ')}`);
    const state = initializeReleaseState(manifest, { actor, maxDwellHours: Number(process.env.CITABLE_RELEASE_DWELL_HOURS || 24) });
    writeJson(outputFile, state);
    return { command, output: outputFile, state };
  }
  if (command === 'state-publish') {
    const manifestFile = path.resolve(requireArg(args[0], 'state-publish requires <manifest-file> <state-file> <actor>'));
    const stateFile = path.resolve(requireArg(args[1], 'state-publish requires <manifest-file> <state-file> <actor>'));
    const actor = requireArg(args[2], 'state-publish requires <manifest-file> <state-file> <actor>');
    const manifest = read(manifestFile);
    const binding = verifyRepositoryBinding(root, manifest.commit);
    if (!binding.ok) throw new Error(`release source binding failed: ${binding.failures.join('; ')}`);
    const phaseOne = validateReleaseManifest(root, manifest, generatedFiles(path.dirname(manifestFile)));
    if (!phaseOne.ok) throw new Error(`phase-one release validation failed: ${phaseOne.failures.join('; ')}`);
    const state = transitionRelease(read(stateFile), 'published_unfinalized', { actor, reason: 'Immutable npm package and release references published.', phaseOne: { ok: true, manifest_hash: manifest.manifest_hash }, evidenceRefs: [manifest.manifest_hash, `https://www.npmjs.com/package/@nebulacomponents/citable/v/${manifest.version}`] });
    writeJson(stateFile, state);
    return { command, output: stateFile, state };
  }
  if (command === 'receipt') {
    const manifestFile = path.resolve(requireArg(args[0], 'receipt requires <manifest-file> <observation-file> <output-file>'));
    const observationFile = path.resolve(requireArg(args[1], 'receipt requires <manifest-file> <observation-file> <output-file>'));
    const outputFile = path.resolve(requireArg(args[2], 'receipt requires <manifest-file> <observation-file> <output-file>'));
    const receipt = createDeploymentReceipt(read(manifestFile), read(observationFile));
    writeJson(outputFile, receipt);
    return { command, output: outputFile, receipt };
  }
  if (command === 'state-finalize') {
    const manifestFile = path.resolve(requireArg(args[0], 'state-finalize requires <manifest-file> <state-file> <actor> <receipt...>'));
    const stateFile = path.resolve(requireArg(args[1], 'state-finalize requires <manifest-file> <state-file> <actor> <receipt...>'));
    const actor = requireArg(args[2], 'state-finalize requires <manifest-file> <state-file> <actor> <receipt...>');
    const receiptFiles = args.slice(3);
    if (!receiptFiles.length) throw new Error('state-finalize requires at least one receipt');
    const manifest = read(manifestFile);
    const receipts = receiptFiles.map((file) => read(path.resolve(file)));
    const state = transitionRelease(read(stateFile), 'finalized', { actor, reason: 'All required publisher-controlled surfaces verified.', manifest, receipts, evidenceRefs: receipts.map((item) => item.receipt_hash) });
    writeJson(stateFile, state);
    return { command, output: stateFile, state };
  }
  if (command === 'state-resolve') {
    const stateFile = path.resolve(requireArg(args[0], 'state-resolve requires <state-file> <withdrawn|superseded> <actor> <reason> [superseding-release-id]'));
    const to = requireArg(args[1], 'state-resolve requires a terminal state');
    const actor = requireArg(args[2], 'state-resolve requires an actor');
    const reason = requireArg(args[3], 'state-resolve requires a reason');
    const state = transitionRelease(read(stateFile), to, { actor, reason, supersedingReleaseId: args[4] || null });
    writeJson(stateFile, state);
    return { command, output: stateFile, state };
  }
  throw new Error('usage: release-governance <manifest|validate|state-init|state-publish|receipt|state-finalize|state-resolve> ...');
}

function execFileCommit(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runReleaseGovernance(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`release-governance: ${error.message}\n`);
    process.exitCode = 1;
  }
}
