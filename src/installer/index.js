import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  PROVIDERS,
  PROVIDER_IDS,
  parseProviderList,
  providerBundleSkillPath,
  providerDestination,
  providerSkillsDir,
} from './providers.js';

export { PROVIDERS, PROVIDER_IDS, parseProviderList, normalizeProviderId } from './providers.js';

export const EXIT_CODES = Object.freeze({
  success: 0,
  generalFailure: 1,
  invalidArguments: 2,
  noValidProvider: 3,
  installationCollision: 4,
  integrityFailure: 5,
  unsupportedEnvironment: 6,
  partialFailure: 7,
  updateAvailable: 10,
  interrupt: 130,
});

const INSTALLER_COMMANDS = new Set(['install', 'update', 'check', 'uninstall', 'list', 'doctor']);
const HELP_COMMANDS = new Set(['help', '--help', '-h']);
const REQUIRED_SKILL_ENTRIES = [
  'SKILL.md',
  'VERSION',
  'manifest.json',
  'commands',
  'references',
  'rubrics',
  'policies',
  'templates',
  'schemas',
  'scripts',
];

export function isInstallerCommand(command) {
  return INSTALLER_COMMANDS.has(command) || HELP_COMMANDS.has(command) || command === '--version' || command === '-v';
}

export class CitableInstallerError extends Error {
  constructor(message, exitCode = EXIT_CODES.generalFailure, details = {}) {
    super(message);
    this.name = 'CitableInstallerError';
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function loadPackageInfo(root = packageRoot()) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}

export function getPackageVersion(root = packageRoot()) {
  return loadPackageInfo(root).version;
}

export function bundleRoot(root = packageRoot()) {
  return path.join(root, 'dist', 'universal');
}

function homeDir(env = process.env) {
  return path.resolve(env.CITABLE_HOME || env.HOME || env.USERPROFILE || os.homedir());
}

export function resolveProjectRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, '.git')) ||
      PROVIDER_IDS.some((id) => fs.existsSync(path.join(dir, PROVIDERS[id].projectDir)))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(cwd);
    dir = parent;
  }
}

export function parseInstallerArgs(argv) {
  const args = {
    providersRaw: null,
    providerSelection: null,
    scope: null,
    yes: false,
    dryRun: false,
    force: false,
    json: false,
    all: false,
    help: false,
    version: false,
    failOnUpdate: false,
    _: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-v') args.version = true;
    else if (arg === '--project' || arg === '--local') args.scope = mergeScope(args.scope, 'project');
    else if (arg === '--global' || arg === '--user') args.scope = mergeScope(args.scope, 'global');
    else if (arg === '--fail-on-update') args.failOnUpdate = true;
    else if (arg === '--providers') {
      if (i + 1 >= argv.length) throw new CitableInstallerError('--providers requires a value', EXIT_CODES.invalidArguments);
      args.providersRaw = argv[++i];
    } else if (arg.startsWith('--providers=')) {
      args.providersRaw = arg.slice('--providers='.length);
    } else if (arg === '--scope') {
      if (i + 1 >= argv.length) throw new CitableInstallerError('--scope requires a value', EXIT_CODES.invalidArguments);
      args.scope = mergeScope(args.scope, normalizeScopeValue(argv[++i]));
    } else if (arg.startsWith('--scope=')) {
      args.scope = mergeScope(args.scope, normalizeScopeValue(arg.slice('--scope='.length)));
    } else if (arg.startsWith('-')) {
      throw new CitableInstallerError(`unknown option: ${arg}`, EXIT_CODES.invalidArguments);
    } else {
      args._.push(arg);
    }
  }

  if (args.providersRaw !== null) {
    const parsed = parseProviderList(args.providersRaw);
    if (parsed.unknown.length) {
      const supported = PROVIDER_IDS.join(', ');
      throw new CitableInstallerError(
        `unknown provider(s): ${parsed.unknown.join(', ')}. Supported providers: ${supported}`,
        EXIT_CODES.invalidArguments,
        { unknown: parsed.unknown, supported: PROVIDER_IDS },
      );
    }
    args.providerSelection = parsed;
  }

  return args;
}

function normalizeScopeValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'project' || normalized === 'local') return 'project';
  if (normalized === 'global' || normalized === 'user') return 'global';
  throw new CitableInstallerError(`invalid scope: ${value}. Use project or global.`, EXIT_CODES.invalidArguments);
}

function mergeScope(existing, next) {
  if (existing && existing !== next) {
    throw new CitableInstallerError('conflicting scope flags: choose project or global, not both', EXIT_CODES.invalidArguments);
  }
  return next;
}

function rootsFor(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const projectRoot = path.resolve(options.projectRoot || resolveProjectRoot(cwd));
  const home = homeDir(options.env || process.env);
  return { cwd, projectRoot, home, packageRoot: path.resolve(options.packageRoot || packageRoot()) };
}

export function detectProviders(options = {}) {
  const roots = rootsFor(options);
  const detected = [];
  for (const id of PROVIDER_IDS) {
    const provider = PROVIDERS[id];
    const projectPath = path.resolve(roots.projectRoot, provider.projectDir);
    const projectSkillsPath = path.resolve(roots.projectRoot, provider.projectSkillsDir);
    const globalHintPaths = provider.globalHints.map((hint) => path.resolve(roots.home, hint));
    const globalSkillsPath = path.resolve(roots.home, provider.globalSkillsDir);
    const projectDetected = exists(projectPath) || exists(projectSkillsPath);
    const globalDetected = globalHintPaths.some((hint) => exists(hint)) || exists(globalSkillsPath);
    detected.push({
      id,
      displayName: provider.displayName,
      projectDetected,
      globalDetected,
      detected: projectDetected || globalDetected,
      projectPath,
      projectSkillsPath,
      globalHintPaths,
      globalSkillsPath,
    });
  }
  return detected;
}

function exists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function scopesForCommand(command, args) {
  if (args.scope) return [args.scope];
  if (command === 'install') return ['project'];
  return ['project', 'global'];
}

export function selectProviders(command, args, detection) {
  if (args.providerSelection?.kind === 'all') return PROVIDER_IDS;
  if (args.providerSelection?.kind === 'explicit') return args.providerSelection.providers;
  if (args.providerSelection?.kind === 'detected') {
    return detection.filter((entry) => entry.detected).map((entry) => entry.id);
  }

  if (command === 'install') {
    const projectDetected = detection.filter((entry) => entry.projectDetected).map((entry) => entry.id);
    if (projectDetected.length) return projectDetected;
    const globalDetected = detection.filter((entry) => entry.globalDetected).map((entry) => entry.id);
    if (globalDetected.length) return globalDetected;
    return [];
  }

  return PROVIDER_IDS;
}

export function resolveTargets(command, args, options = {}) {
  const roots = rootsFor(options);
  const detection = detectProviders({ ...options, ...roots });
  const providers = selectProviders(command, args, detection);
  const scopes = scopesForCommand(command, args);
  const targets = [];
  const seen = new Map();

  for (const scope of scopes) {
    for (const providerId of providers) {
      const skillsDir = providerSkillsDir(providerId, scope, roots);
      const destination = providerDestination(providerId, scope, roots);
      const realDestination = safeRealDestination(destination);
      const dedupeKey = realDestination || path.resolve(destination);
      const target = {
        providerId,
        provider: PROVIDERS[providerId],
        scope,
        skillsDir,
        destination,
        realDestination,
        dedupeKey,
        bundlePath: path.resolve(roots.packageRoot, providerBundleSkillPath(providerId)),
        scopeRoot: scope === 'project' ? roots.projectRoot : roots.home,
      };
      if (seen.has(dedupeKey)) {
        target.duplicateOf = seen.get(dedupeKey);
      } else {
        seen.set(dedupeKey, `${providerId}:${scope}`);
      }
      targets.push(target);
    }
  }

  return { roots, detection, providers, scopes, targets };
}

function safeRealDestination(destination) {
  try {
    return fs.realpathSync.native(destination);
  } catch {
    try {
      const parent = fs.realpathSync.native(path.dirname(destination));
      return path.join(parent, path.basename(destination));
    } catch {
      return null;
    }
  }
}

export function assertArchiveEntrySafe(entryName) {
  const text = String(entryName ?? '');
  if (!text || path.isAbsolute(text) || text.includes('\0')) {
    throw new CitableInstallerError(`unsafe archive entry path: ${entryName}`, EXIT_CODES.integrityFailure);
  }
  const normalized = path.posix.normalize(text.replace(/\\/g, '/'));
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new CitableInstallerError(`unsafe archive entry path: ${entryName}`, EXIT_CODES.integrityFailure);
  }
  return normalized;
}

export function validateUniversalBundle(options = {}) {
  const roots = rootsFor(options);
  const root = bundleRoot(roots.packageRoot);
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = readJson(manifestPath, 'bundle manifest');
  if (manifest.name !== 'citable-universal-bundle' || manifest.version !== loadPackageInfo(roots.packageRoot).version) {
    throw new CitableInstallerError('universal bundle manifest is missing or version-mismatched', EXIT_CODES.integrityFailure);
  }
  for (const id of PROVIDER_IDS) validateProviderBundle(id, { ...options, packageRoot: roots.packageRoot });
  return manifest;
}

export function validateProviderBundle(providerId, options = {}) {
  const roots = rootsFor(options);
  const source = path.resolve(roots.packageRoot, providerBundleSkillPath(providerId));
  const provider = PROVIDERS[providerId];
  if (!provider) throw new CitableInstallerError(`unknown provider: ${providerId}`, EXIT_CODES.invalidArguments);
  if (!isDirectory(source)) {
    throw new CitableInstallerError(
      `missing bundle for ${provider.displayName}: ${source}. Run npm run build:dist before packing or installing from source.`,
      EXIT_CODES.integrityFailure,
      { provider: providerId, source },
    );
  }
  for (const entry of REQUIRED_SKILL_ENTRIES) {
    if (!exists(path.join(source, entry))) {
      throw new CitableInstallerError(
        `bundle for ${provider.displayName} is missing required entry: ${entry}`,
        EXIT_CODES.integrityFailure,
        { provider: providerId, source, entry },
      );
    }
  }
  const manifest = readJson(path.join(source, 'manifest.json'), `${providerId} bundle manifest`);
  if (manifest.name !== 'citable' || manifest.provider !== providerId || manifest.managedBy !== 'citable-cli') {
    throw new CitableInstallerError(`bundle manifest for ${provider.displayName} is invalid`, EXIT_CODES.integrityFailure);
  }
  const tree = hashTree(source, { exclude: ['manifest.json'] });
  if (manifest.treeHash && manifest.treeHash !== tree.treeHash) {
    throw new CitableInstallerError(`bundle hash mismatch for ${provider.displayName}`, EXIT_CODES.integrityFailure);
  }
  return { source, manifest, tree };
}

function isDirectory(filePath) {
  try {
    return fs.lstatSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new CitableInstallerError(`could not read ${label}: ${err.message}`, EXIT_CODES.integrityFailure, { filePath });
  }
}

export function hashFile(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function hashTree(root, options = {}) {
  const exclude = new Set(options.exclude || []);
  const files = {};
  for (const rel of walkFiles(root)) {
    if (exclude.has(rel)) continue;
    files[rel] = hashFile(path.join(root, rel));
  }
  const treeHash = `sha256:${crypto.createHash('sha256').update(
    Object.entries(files).map(([rel, hash]) => `${rel}\0${hash}`).join('\n'),
  ).digest('hex')}`;
  return { files, treeHash };
}

function walkFiles(root, base = root, out = []) {
  if (!exists(root)) return out;
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    const rel = toPosix(path.relative(base, abs));
    assertArchiveEntrySafe(rel);
    if (entry.isSymbolicLink()) {
      throw new CitableInstallerError(`refusing to package symlinked bundle entry: ${rel}`, EXIT_CODES.integrityFailure);
    }
    if (entry.isDirectory()) walkFiles(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function makeInstalledManifest(target, packageInfo, tree) {
  return {
    name: 'citable',
    version: packageInfo.version,
    managedBy: 'citable-cli',
    provider: target.providerId,
    providerName: target.provider.displayName,
    installedAt: new Date().toISOString(),
    scope: target.scope,
    sourcePackage: `${packageInfo.name}@${packageInfo.version}`,
    treeHash: tree.treeHash,
    files: tree.files,
  };
}

export function inspectInstallation(target, options = {}) {
  const destination = target.realDestination || target.destination;
  const available = options.availableTree || null;
  if (!exists(destination)) {
    return { state: 'not installed', installed: null, path: destination, problems: [], localModifications: 'none' };
  }

  let stat;
  try {
    stat = fs.lstatSync(target.destination);
  } catch {
    stat = fs.lstatSync(destination);
  }
  const symlink = stat.isSymbolicLink();
  if (!isDirectory(destination)) {
    return { state: 'unmanaged', installed: null, path: destination, problems: ['destination is not a directory'], symlink, localModifications: 'unknown' };
  }

  const manifestPath = path.join(destination, 'manifest.json');
  if (!exists(manifestPath)) {
    const hasSkill = exists(path.join(destination, 'SKILL.md'));
    return {
      state: hasSkill ? 'unmanaged' : 'partial',
      installed: null,
      path: destination,
      problems: [hasSkill ? 'manifest.json missing from existing skill directory' : 'empty or partial directory'],
      symlink,
      localModifications: 'unknown',
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { state: 'corrupt', installed: null, path: destination, problems: [`manifest parse failed: ${err.message}`], symlink, localModifications: 'unknown' };
  }
  if (manifest.managedBy !== 'citable-cli' || manifest.name !== 'citable') {
    return { state: 'unmanaged', installed: manifest.version ?? null, path: destination, problems: ['manifest is not managed by citable-cli'], manifest, symlink, localModifications: 'unknown' };
  }

  const expectedFiles = manifest.files && typeof manifest.files === 'object' ? manifest.files : null;
  if (!expectedFiles) {
    return { state: 'corrupt', installed: manifest.version ?? null, path: destination, problems: ['manifest does not contain file hashes'], manifest, symlink, localModifications: 'unknown' };
  }

  const problems = [];
  const modified = [];
  const missing = [];
  for (const [rel, expectedHash] of Object.entries(expectedFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = path.join(destination, rel);
    if (!exists(filePath)) {
      missing.push(rel);
      continue;
    }
    if (!fs.lstatSync(filePath).isFile()) {
      modified.push(rel);
      continue;
    }
    const actualHash = hashFile(filePath);
    if (actualHash !== expectedHash) modified.push(rel);
  }

  const actualFiles = new Set(walkFiles(destination).filter((rel) => rel !== 'manifest.json'));
  const extras = [...actualFiles].filter((rel) => !Object.prototype.hasOwnProperty.call(expectedFiles, rel));
  if (missing.length) problems.push(`missing files: ${missing.join(', ')}`);
  if (modified.length) problems.push(`modified files: ${modified.join(', ')}`);
  if (extras.length) problems.push(`unmanaged extra files: ${extras.join(', ')}`);

  if (missing.length) {
    return { state: 'partial', installed: manifest.version, path: destination, problems, manifest, symlink, localModifications: modified.length || extras.length ? 'present' : 'none', missing, modified, extras };
  }
  if (modified.length || extras.length) {
    return { state: 'locally modified', installed: manifest.version, path: destination, problems, manifest, symlink, localModifications: 'present', missing, modified, extras };
  }

  if (!available) {
    return { state: 'unknown', installed: manifest.version, path: destination, problems: [], manifest, symlink, localModifications: 'none' };
  }

  const currentTreeHash = manifest.treeHash ?? hashTree(destination, { exclude: ['manifest.json'] }).treeHash;
  const availableVersion = options.availableVersion;
  const state = currentTreeHash === available.treeHash && manifest.version === availableVersion ? 'current' : 'update available';
  return { state, installed: manifest.version, path: destination, problems: [], manifest, symlink, localModifications: 'none', currentTreeHash };
}

export function createInstallPlan(command, args, options = {}) {
  const context = resolveTargets(command, args, options);
  const packageInfo = loadPackageInfo(context.roots.packageRoot);
  const selectedTargets = context.targets.filter((target) => !target.duplicateOf);
  const results = [];

  if (command === 'install' && selectedTargets.length === 0) {
    throw new CitableInstallerError(
      'no supported coding-agent provider was selected. Use --providers=claude,codex,cursor or create a supported harness directory.',
      EXIT_CODES.noValidProvider,
    );
  }

  for (const target of selectedTargets) {
    let bundle = null;
    try {
      bundle = validateProviderBundle(target.providerId, { ...options, packageRoot: context.roots.packageRoot });
    } catch (err) {
      results.push(targetResult(target, 'failed', err.message, { exitCode: err.exitCode ?? EXIT_CODES.integrityFailure }));
      continue;
    }
    const status = inspectInstallation(target, { availableTree: bundle.tree, availableVersion: packageInfo.version });
    const action = plannedAction(command, status, args);
    results.push({
      provider: target.providerId,
      providerName: target.provider.displayName,
      scope: target.scope,
      path: target.destination,
      realPath: target.realDestination || target.destination,
      state: status.state,
      installed: status.installed,
      available: packageInfo.version,
      action,
      filesToCreate: action === 'install' || action === 'replace' || action === 'update' ? Object.keys(bundle.tree.files) : [],
      filesToReplace: exists(target.realDestination || target.destination) ? Object.keys(bundle.tree.files) : [],
      filesToRemove: [],
      collisions: collisionProblems(status, args),
      localModifications: status.localModifications,
      validation: ['validate package bundle', 'validate provider target', 'validate staged skill', 'validate final installation'],
    });
  }

  return { command, dryRun: args.dryRun, package: { name: packageInfo.name, version: packageInfo.version }, ...context, targets: selectedTargets, results };
}

function plannedAction(command, status, args) {
  if (command === 'install') {
    if (status.state === 'current') return 'already current';
    if (status.state === 'not installed') return 'install';
    if (status.state === 'update available') return 'update';
    if ((status.state === 'locally modified' || status.state === 'unmanaged') && !args.force) return 'refuse';
    if (status.state === 'partial' || status.state === 'corrupt') return args.force ? 'repair' : 'refuse';
    return args.force ? 'replace' : 'refuse';
  }
  if (command === 'update') {
    if (status.state === 'current') return 'already current';
    if (status.state === 'update available') return 'update';
    if (status.state === 'not installed') return 'not installed';
    if ((status.state === 'locally modified' || status.state === 'unmanaged') && !args.force) return 'refuse';
    return args.force ? 'replace' : 'refuse';
  }
  if (command === 'uninstall') {
    if (status.state === 'not installed') return 'not installed';
    if (status.manifest?.managedBy === 'citable-cli') return 'remove';
    return 'refuse';
  }
  return 'inspect';
}

function collisionProblems(status, args) {
  if (status.state === 'unmanaged') return status.problems;
  if (status.state === 'locally modified' && !args.force) return status.problems;
  if ((status.state === 'partial' || status.state === 'corrupt') && !args.force) return status.problems;
  return [];
}

function targetResult(target, status, message, extra = {}) {
  return {
    provider: target.providerId,
    providerName: target.provider.displayName,
    scope: target.scope,
    path: target.destination,
    realPath: target.realDestination || target.destination,
    status,
    message,
    ...extra,
  };
}

export async function installCommand(args, options = {}) {
  if (!args.yes && canPrompt(options) && !args.providerSelection) {
    const interactive = await interactiveInstallArgs(args, options);
    args = { ...args, ...interactive };
  }
  const plan = createInstallPlan('install', args, options);
  if (args.dryRun) return { ok: true, command: 'install', dryRun: true, plan: plan.results };
  if (!args.yes && !canPrompt(options)) {
    throw new CitableInstallerError('install needs --yes in non-interactive mode', EXIT_CODES.noValidProvider);
  }
  const results = [];
  for (const target of plan.targets) {
    results.push(installOrUpdateTarget(target, args, options));
  }
  return finalizeMutatingResult('install', results);
}

export async function updateCommand(args, options = {}) {
  const plan = createInstallPlan('update', args, options);
  if (args.dryRun) return { ok: true, command: 'update', dryRun: true, plan: plan.results };
  const results = [];
  for (const target of plan.targets) {
    const status = inspectInstallationWithBundle(target, options);
    if (status.state === 'not installed') continue;
    results.push(installOrUpdateTarget(target, args, options, 'update'));
  }
  return finalizeMutatingResult('update', results);
}

export async function uninstallCommand(args, options = {}) {
  const plan = createInstallPlan('uninstall', args, options);
  if (args.dryRun) {
    for (const item of plan.results) {
      const status = inspectTargetByPlanItem(item);
      item.filesToRemove = status.manifest?.files ? [...Object.keys(status.manifest.files), 'manifest.json'] : [];
    }
    return { ok: true, command: 'uninstall', dryRun: true, plan: plan.results };
  }
  if (!args.yes && !canPrompt(options)) {
    throw new CitableInstallerError('uninstall needs --yes in non-interactive mode', EXIT_CODES.noValidProvider);
  }
  const results = [];
  for (const target of plan.targets) results.push(uninstallTarget(target, args));
  return finalizeMutatingResult('uninstall', results);
}

function inspectTargetByPlanItem(item) {
  return inspectInstallation({
    providerId: item.provider,
    provider: PROVIDERS[item.provider],
    scope: item.scope,
    destination: item.path,
    realDestination: item.realPath,
  });
}

function inspectInstallationWithBundle(target, options = {}) {
  const packageInfo = loadPackageInfo(options.packageRoot || packageRoot());
  const bundle = validateProviderBundle(target.providerId, options);
  return inspectInstallation(target, { availableTree: bundle.tree, availableVersion: packageInfo.version });
}

function installOrUpdateTarget(target, args, options = {}, command = 'install') {
  let stage = null;
  let backup = null;
  try {
    const packageInfo = loadPackageInfo(options.packageRoot || packageRoot());
    const bundle = validateProviderBundle(target.providerId, options);
    const before = inspectInstallation(target, { availableTree: bundle.tree, availableVersion: packageInfo.version });
    const action = plannedAction(command, before, args);
    if (action === 'already current') return targetResult(target, 'already current', 'already current', { before });
    if (action === 'not installed') return targetResult(target, 'skipped', 'not installed', { before });
    if (action === 'refuse') {
      const code = before.state === 'unmanaged' ? EXIT_CODES.installationCollision : EXIT_CODES.integrityFailure;
      return targetResult(target, 'failed', `${before.state}: ${before.problems.join('; ') || 'refusing to overwrite without --force'}`, { before, exitCode: code });
    }

    const installPath = target.realDestination || target.destination;
    const parent = path.dirname(installPath);
    fs.mkdirSync(parent, { recursive: true });
    ensureTargetInsideScope(parent, target.scopeRoot);
    stage = path.join(parent, `.citable-install-${process.pid}-${Date.now()}-${target.providerId}`);
    backup = path.join(parent, `.citable-backup-${Date.now()}-${target.providerId}`);
    copyDirSafe(bundle.source, stage);
    const stagedTree = hashTree(stage, { exclude: ['manifest.json'] });
    writeJsonFile(path.join(stage, 'manifest.json'), makeInstalledManifest(target, packageInfo, stagedTree));
    validateStagedSkill(stage, target.providerId);

    if (exists(installPath)) fs.renameSync(installPath, backup);
    fs.renameSync(stage, installPath);
    stage = null;

    const after = inspectInstallation(target, { availableTree: stagedTree, availableVersion: packageInfo.version });
    if (after.state !== 'current') {
      throw new CitableInstallerError(`final validation failed: ${after.state}`, EXIT_CODES.integrityFailure, { after });
    }
    return targetResult(target, action === 'update' ? 'updated' : 'installed', `${action} complete`, { before, after, backup: exists(backup) ? backup : null });
  } catch (err) {
    if (stage) safeRm(stage);
    const installPath = target.realDestination || target.destination;
    if (backup && exists(backup) && !exists(installPath)) {
      try {
        fs.renameSync(backup, installPath);
      } catch {
        // Keep the original failure. The retained backup path is reported below.
      }
    }
    return targetResult(target, 'failed', err.message, { exitCode: err.exitCode ?? EXIT_CODES.generalFailure, backup: backup && exists(backup) ? backup : null });
  }
}

function ensureTargetInsideScope(targetPath, scopeRoot) {
  // Use realpathSync when possible to resolve symlinks (e.g. /tmp → /private/tmp on macOS)
  // so that cross-symlink paths compare correctly.
  function realOrResolve(p) {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  }
  const resolvedTarget = realOrResolve(targetPath);
  const resolvedScope = realOrResolve(scopeRoot);
  const rel = path.relative(resolvedScope, resolvedTarget);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
  throw new CitableInstallerError(`refusing to write outside selected scope: ${resolvedTarget}`, EXIT_CODES.integrityFailure);
}

function copyDirSafe(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);
    const rel = path.relative(source, src);
    assertArchiveEntrySafe(toPosix(rel));
    if (entry.isSymbolicLink()) throw new CitableInstallerError(`refusing to copy symlinked bundle entry: ${rel}`, EXIT_CODES.integrityFailure);
    if (entry.isDirectory()) copyDirSafe(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

function validateStagedSkill(dir, providerId) {
  for (const entry of REQUIRED_SKILL_ENTRIES) {
    if (!exists(path.join(dir, entry))) {
      throw new CitableInstallerError(`staged ${providerId} skill is missing ${entry}`, EXIT_CODES.integrityFailure);
    }
  }
  const manifest = readJson(path.join(dir, 'manifest.json'), 'staged manifest');
  if (manifest.managedBy !== 'citable-cli' || manifest.provider !== providerId) {
    throw new CitableInstallerError(`staged ${providerId} manifest is invalid`, EXIT_CODES.integrityFailure);
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function safeRm(filePath) {
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
  } catch {
    // best effort cleanup only
  }
}

function uninstallTarget(target, args) {
  try {
    const status = inspectInstallation(target);
    if (status.state === 'not installed') return targetResult(target, 'skipped', 'not installed', { before: status });
    if (status.manifest?.managedBy !== 'citable-cli') {
      return targetResult(target, 'failed', `${status.state}: refusing to remove unmanaged content`, { before: status, exitCode: EXIT_CODES.installationCollision });
    }
    const destination = target.realDestination || target.destination;
    const relFiles = Object.keys(status.manifest.files || {}).sort((a, b) => b.localeCompare(a));
    for (const rel of relFiles) {
      assertArchiveEntrySafe(rel);
      safeUnlink(path.join(destination, rel));
    }
    safeUnlink(path.join(destination, 'manifest.json'));
    pruneEmptyDirs(destination, destination);
    try {
      if (fs.existsSync(destination) && fs.readdirSync(destination).length === 0) fs.rmdirSync(destination);
    } catch {
      // Directory contains user files; preserve it.
    }
    return targetResult(target, 'removed', 'removed managed files', { before: status, removedFiles: [...relFiles, 'manifest.json'] });
  } catch (err) {
    return targetResult(target, 'failed', err.message, { exitCode: err.exitCode ?? EXIT_CODES.generalFailure });
  }
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function pruneEmptyDirs(root, dir) {
  if (!exists(dir) || !fs.lstatSync(dir).isDirectory()) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(root, path.join(dir, entry.name));
  }
  if (dir !== root) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // preserve non-empty or inaccessible directories
    }
  }
}

function finalizeMutatingResult(command, results) {
  const failed = results.filter((result) => result.status === 'failed');
  const changed = results.filter((result) => ['installed', 'updated', 'removed'].includes(result.status));
  const ok = failed.length === 0 && (command !== 'install' || changed.length > 0 || results.some((result) => result.status === 'already current'));
  const exitCode = failed.length > 0 && changed.length > 0
    ? EXIT_CODES.partialFailure
    : failed[0]?.exitCode ?? (ok ? EXIT_CODES.success : EXIT_CODES.noValidProvider);
  return { ok, command, results, exitCode };
}

export async function checkCommand(args, options = {}) {
  return inspectCommand('check', args, options);
}

export async function listCommand(args, options = {}) {
  return inspectCommand('list', args, options);
}

async function inspectCommand(command, args, options = {}) {
  const context = resolveTargets(command, args, options);
  const packageInfo = loadPackageInfo(context.roots.packageRoot);
  const rows = [];
  for (const target of context.targets.filter((target) => !target.duplicateOf)) {
    let bundleTree = null;
    try {
      bundleTree = validateProviderBundle(target.providerId, { ...options, packageRoot: context.roots.packageRoot }).tree;
    } catch {
      // Check/list should still report installed state if the package bundle is broken.
    }
    const status = inspectInstallation(target, { availableTree: bundleTree, availableVersion: packageInfo.version });
    rows.push({
      provider: target.providerId,
      providerName: target.provider.displayName,
      scope: target.scope,
      path: target.destination,
      installed: status.installed,
      available: packageInfo.version,
      state: status.state,
      localModifications: status.localModifications,
      problems: status.problems,
      symlink: Boolean(status.symlink),
    });
  }
  const hasUpdate = rows.some((row) => row.state === 'update available');
  return { ok: true, command, providers: rows, exitCode: args.failOnUpdate && hasUpdate ? EXIT_CODES.updateAvailable : EXIT_CODES.success };
}

export async function doctorCommand(args, options = {}) {
  const context = resolveTargets('doctor', args, options);
  const packageInfo = loadPackageInfo(context.roots.packageRoot);
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  checks.push({ level: nodeMajor >= 20 ? 'PASS' : 'FAIL', message: `Node.js ${process.versions.node}` });
  checks.push({ level: 'PASS', message: `citable package ${packageInfo.version}` });
  checks.push({ level: 'PASS', message: `citable command ${process.argv[1] || 'unknown'}` });

  for (const entry of context.detection) {
    if (entry.projectDetected) checks.push({ level: 'PASS', message: `${entry.displayName} project harness detected at ${entry.projectPath}` });
    else if (entry.globalDetected) checks.push({ level: 'PASS', message: `${entry.displayName} global harness detected at ${entry.globalHintPaths.find((hint) => exists(hint)) || entry.globalSkillsPath}` });
    else checks.push({ level: 'WARN', message: `${entry.displayName} not detected` });
  }

  const realPaths = new Map();
  for (const target of context.targets.filter((target) => !target.duplicateOf)) {
    const status = inspectInstallationWithOptionalBundle(target, context.roots.packageRoot, packageInfo.version);
    const installedLabel = status.installed ? ` ${status.installed}` : '';
    const level = ['partial', 'corrupt'].includes(status.state) ? 'FAIL'
      : ['locally modified', 'unmanaged'].includes(status.state) ? 'WARN'
        : status.state === 'not installed' ? 'WARN' : 'PASS';
    checks.push({ level, message: `${target.provider.displayName} ${target.scope} Citable${installedLabel}: ${status.state} at ${target.destination}` });
    for (const problem of status.problems) checks.push({ level: level === 'FAIL' ? 'FAIL' : 'WARN', message: `${target.provider.displayName} ${target.scope}: ${problem}` });
    const real = target.realDestination || target.destination;
    if (realPaths.has(real)) checks.push({ level: 'WARN', message: `${target.provider.displayName} ${target.scope} shares real path with ${realPaths.get(real)}: ${real}` });
    else realPaths.set(real, `${target.provider.displayName} ${target.scope}`);
    const staleTemps = staleTempDirs(path.dirname(real));
    for (const temp of staleTemps) checks.push({ level: 'WARN', message: `stale installer directory: ${temp}` });
    try {
      if (exists(path.dirname(real))) fs.accessSync(path.dirname(real), fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      checks.push({ level: 'FAIL', message: `cannot read/write ${path.dirname(real)}` });
    }
  }

  const hasFail = checks.some((check) => check.level === 'FAIL');
  return { ok: !hasFail, command: 'doctor', checks, exitCode: hasFail ? EXIT_CODES.integrityFailure : EXIT_CODES.success };
}

function inspectInstallationWithOptionalBundle(target, packageRootPath, version) {
  try {
    const bundle = validateProviderBundle(target.providerId, { packageRoot: packageRootPath });
    return inspectInstallation(target, { availableTree: bundle.tree, availableVersion: version });
  } catch {
    return inspectInstallation(target);
  }
}

function staleTempDirs(parent) {
  if (!exists(parent) || !isDirectory(parent)) return [];
  return fs.readdirSync(parent)
    .filter((name) => name.startsWith('.citable-install-'))
    .map((name) => path.join(parent, name));
}

function canPrompt(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  return Boolean(stdin.isTTY && stdout.isTTY);
}

async function interactiveInstallArgs(args, options = {}) {
  const stdout = options.stdout || process.stdout;
  const stdin = options.stdin || process.stdin;
  const detection = detectProviders(options);
  const detected = detection.filter((entry) => entry.detected);
  stdout.write('Detected coding agents:\n\n');
  if (detected.length) {
    for (const entry of detected) {
      const where = entry.projectDetected ? entry.projectPath : (entry.globalHintPaths.find((hint) => exists(hint)) || entry.globalSkillsPath);
      stdout.write(`  ${entry.displayName.padEnd(16)} ${where}\n`);
    }
  } else {
    stdout.write('  none\n');
  }
  stdout.write('\n');

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const abort = new AbortController();
  rl.on('SIGINT', () => abort.abort());
  const ask = async (question) => {
    try {
      return await rl.question(question, { signal: abort.signal });
    } catch (err) {
      if (abort.signal.aborted || err?.name === 'AbortError') {
        throw new CitableInstallerError('installation aborted', EXIT_CODES.interrupt);
      }
      throw err;
    }
  };
  try {
    let selected = detected.map((entry) => entry.id);
    if (detected.length) {
      const mode = (await ask('Install to detected agents only? [Y/n/custom] ')).trim().toLowerCase();
      if (mode === 'n' || mode === 'no' || mode === 'custom' || mode === 'c') selected = await promptProviderList(ask);
    } else {
      selected = await promptProviderList(ask);
    }
    if (!selected.length) throw new CitableInstallerError('at least one provider must be selected', EXIT_CODES.noValidProvider);
    const scopeAnswer = (await ask('Install location [project/global] (project): ')).trim().toLowerCase();
    const scope = scopeAnswer ? normalizeScopeValue(scopeAnswer) : 'project';
    const roots = rootsFor(options);
    stdout.write('\nPlanned installation:\n\n');
    for (const providerId of selected) stdout.write(`  ${providerDestination(providerId, scope, roots)}\n`);
    stdout.write('\n');
    if (!args.yes) {
      const proceed = (await ask('Proceed? [y/N] ')).trim().toLowerCase();
      if (proceed !== 'y' && proceed !== 'yes') throw new CitableInstallerError('installation aborted', EXIT_CODES.interrupt);
    }
    return { providerSelection: { kind: 'explicit', providers: selected, unknown: [] }, scope, yes: true };
  } finally {
    rl.close();
  }
}

async function promptProviderList(ask) {
  const answer = (await ask(`Select agents (${PROVIDER_IDS.join(', ')} or all): `)).trim();
  const parsed = parseProviderList(answer);
  if (parsed.unknown.length) {
    throw new CitableInstallerError(`unknown provider(s): ${parsed.unknown.join(', ')}`, EXIT_CODES.invalidArguments);
  }
  return parsed.kind === 'all' ? PROVIDER_IDS : parsed.providers;
}

export async function runInstallerCommand(command, argv = [], options = {}) {
  if (HELP_COMMANDS.has(command) || command === undefined) {
    writeHuman(installerHelp(), false);
    return EXIT_CODES.success;
  }
  if (command === '--version' || command === '-v') {
    console.log(getPackageVersion(options.packageRoot || packageRoot()));
    return EXIT_CODES.success;
  }

  let args;
  try {
    args = parseInstallerArgs(argv);
    if (args.help) {
      writeHuman(installerHelp(), args.json);
      return EXIT_CODES.success;
    }
    if (args.version) {
      outputJsonOrHuman(args, { version: getPackageVersion(options.packageRoot || packageRoot()) }, getPackageVersion(options.packageRoot || packageRoot()));
      return EXIT_CODES.success;
    }
    let result;
    if (command === 'install') result = await installCommand(args, options);
    else if (command === 'update') result = await updateCommand(args, options);
    else if (command === 'uninstall') result = await uninstallCommand(args, options);
    else if (command === 'check') result = await checkCommand(args, options);
    else if (command === 'list') result = await listCommand(args, options);
    else if (command === 'doctor') result = await doctorCommand(args, options);
    else throw new CitableInstallerError(`unknown installer command: ${command}`, EXIT_CODES.invalidArguments);

    outputJsonOrHuman(args, result, renderHumanResult(result));
    return result.exitCode ?? (result.ok ? EXIT_CODES.success : EXIT_CODES.generalFailure);
  } catch (err) {
    const exitCode = err.exitCode ?? EXIT_CODES.generalFailure;
    if (args?.json) {
      console.log(JSON.stringify({ ok: false, error: err.message, exitCode, details: err.details ?? {} }, null, 2));
    } else {
      console.error(`citable: ${err.message}`);
    }
    return exitCode;
  }
}

function writeHuman(text, jsonMode) {
  if (jsonMode) console.error(text);
  else console.log(text);
}

function outputJsonOrHuman(args, data, human) {
  if (args.json) console.log(JSON.stringify(data, null, 2));
  else console.log(human);
}

function renderHumanResult(result) {
  if (result.command === 'check') return renderCheck(result);
  if (result.command === 'list') return renderList(result);
  if (result.command === 'doctor') return renderDoctor(result);
  if (result.dryRun) return renderDryRun(result);
  return renderMutation(result);
}

function renderMutation(result) {
  const lines = [`citable ${result.command}: ${result.ok ? 'OK' : 'PROBLEMS'}`];
  for (const row of result.results) {
    lines.push(`  ${row.providerName} (${row.scope}) ${row.status}: ${row.path}`);
    if (row.message) lines.push(`    ${row.message}`);
  }
  return lines.join('\n');
}

function renderDryRun(result) {
  const lines = [`citable ${result.command} dry run`];
  for (const row of result.plan) {
    lines.push(`\n${row.providerName}`);
    lines.push(`  Scope: ${row.scope}`);
    lines.push(`  Path: ${row.path}`);
    lines.push(`  State: ${row.state}`);
    lines.push(`  Planned action: ${row.action}`);
    lines.push(`  Files to create: ${row.filesToCreate.length}`);
    lines.push(`  Files to replace: ${row.filesToReplace.length}`);
    lines.push(`  Files to remove: ${row.filesToRemove.length}`);
    lines.push(`  Collisions: ${row.collisions.length ? row.collisions.join('; ') : 'none'}`);
    lines.push(`  Local modifications: ${row.localModifications}`);
    lines.push(`  Validation: ${row.validation.join('; ')}`);
  }
  return lines.join('\n');
}

function renderCheck(result) {
  const lines = [];
  for (const row of result.providers) {
    lines.push(`${row.providerName}`);
    lines.push(`  Scope: ${row.scope}`);
    lines.push(`  Path: ${row.path}`);
    lines.push(`  Installed: ${row.installed ?? 'not installed'}`);
    lines.push(`  Available: ${row.available}`);
    lines.push(`  State: ${row.state}`);
    lines.push(`  Local modifications: ${row.localModifications}`);
    if (row.problems.length) lines.push(`  Problems: ${row.problems.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderList(result) {
  const lines = ['Citable installations'];
  for (const row of result.providers) {
    lines.push(`  ${row.providerName.padEnd(16)} ${row.scope.padEnd(7)} ${row.state.padEnd(18)} ${row.installed ?? '-'}  ${row.path}`);
  }
  return lines.join('\n');
}

function renderDoctor(result) {
  return ['Citable doctor', '', ...result.checks.map((check) => `${check.level.padEnd(5)} ${check.message}`)].join('\n');
}

export function installerHelp() {
  return `citable — SEO / AEO / GEO audit, remediation, validation, and governance

Usage: citable <command> [options]

Installer commands
  install                   Install the Citable skill into coding-agent harnesses
  update                    Update managed Citable skill installations
  check                     Report installed and available Citable versions
  uninstall                 Remove managed Citable skill files
  list                      List detected providers and installation state
  doctor                    Diagnose installer, provider, and integrity problems
  help                      Show this help
  --version                 Print the citable package version

Install examples
  npx @nebulacomponents/citable install
  npx @nebulacomponents/citable install --yes
  npx @nebulacomponents/citable install --providers=claude,codex,cursor --project --yes
  npx @nebulacomponents/citable install --providers=all --global --dry-run

Options
  --providers=<list>        Provider ids, detected, or all
  --project, --local        Install/check project-local skill locations
  --global, --user          Install/check user-global skill locations
  --scope=<project|global>  Scope equivalent
  --yes, -y                 Confirm non-interactively
  --dry-run                 Preview filesystem changes without mutation
  --force                   Replace locally modified or unmanaged citable directory
  --json                    Machine-readable output on stdout
  --fail-on-update          check exits 10 when an update is available

Supported providers: ${PROVIDER_IDS.join(', ')}

No output of this tool guarantees crawling, indexing, ranking, citation,
recommendation, inclusion, sentiment, or conversion outcomes.`;
}
