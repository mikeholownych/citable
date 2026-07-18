/**
 * self-upgrade command
 *
 * Checks npm for the latest @nebulacomponents/citable version and upgrades
 * the running npx cache if a newer version is available.
 *
 * Usage:
 *   npx @nebulacomponents/citable self-upgrade
 *   npx @nebulacomponents/citable self-upgrade --check   (check only, no upgrade)
 *   npx @nebulacomponents/citable self-upgrade --json    (machine-readable output)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PACKAGE_NAME = '@nebulacomponents/citable';
const REGISTRY = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch the latest published version from the npm registry.
 * Uses Node's built-in fetch (Node 22+); no extra dependencies.
 *
 * @returns {Promise<string>} latest semver string
 */
async function fetchLatestVersion() {
  const url = `${REGISTRY}/${encodeURIComponent(PACKAGE_NAME)}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`registry returned ${res.status}`);
    const data = await res.json();
    if (!data.version) throw new Error('no version field in registry response');
    return data.version;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compare two semver strings. Returns:
 *   1  if a > b
 *   0  if a === b
 *  -1  if a < b
 */
function compareSemver(a, b) {
  const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

/**
 * Re-execute the current command via npx at the new version.
 * Used to trigger the npx cache refresh as a side-effect.
 */
function triggerNpxRefresh(latestVersion) {
  // npx --yes ensures no prompt; @version pins to latest
  const result = spawnSync(
    'npx',
    ['--yes', `${PACKAGE_NAME}@${latestVersion}`, '--version'],
    { stdio: 'pipe', timeout: 60_000 },
  );
  return result.status === 0;
}

export async function selfUpgradeCommand(args) {
  const checkOnly = args.includes('--check');
  const jsonOutput = args.includes('--json');

  // Resolve current version from our own package.json
  let currentVersion;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = path.resolve(fileURLToPath(import.meta.url), '../../../package.json');
    currentVersion = req(pkgPath).version;
  } catch {
    const err = { ok: false, error: 'could not read local package.json version' };
    if (jsonOutput) return JSON.stringify(err, null, 2);
    return `error: ${err.error}`;
  }

  // Fetch latest from registry
  let latestVersion;
  try {
    latestVersion = await fetchLatestVersion();
  } catch (err) {
    const result = { ok: false, current: currentVersion, error: `registry fetch failed: ${err.message}` };
    if (jsonOutput) return JSON.stringify(result, null, 2);
    return `error: ${result.error}\nCurrent version: ${currentVersion}`;
  }

  const cmp = compareSemver(latestVersion, currentVersion);

  if (cmp <= 0) {
    // Already current or ahead (local dev)
    const result = { ok: true, current: currentVersion, latest: latestVersion, status: 'current' };
    if (jsonOutput) return JSON.stringify(result, null, 2);
    return `citable ${currentVersion} is already up to date (latest: ${latestVersion})`;
  }

  // Update available
  if (checkOnly) {
    const result = { ok: true, current: currentVersion, latest: latestVersion, status: 'update-available' };
    if (jsonOutput) return JSON.stringify(result, null, 2);
    return [
      `Update available: ${currentVersion} → ${latestVersion}`,
      `Run: npx ${PACKAGE_NAME}@latest self-upgrade`,
    ].join('\n');
  }

  // Perform upgrade: warm the npx cache at the new version
  const refreshed = triggerNpxRefresh(latestVersion);

  const result = {
    ok: refreshed,
    current: currentVersion,
    latest: latestVersion,
    status: refreshed ? 'upgraded' : 'upgrade-failed',
  };

  if (jsonOutput) return JSON.stringify(result, null, 2);

  if (refreshed) {
    return [
      `citable upgraded: ${currentVersion} → ${latestVersion}`,
      `Run your next command with:  npx ${PACKAGE_NAME}@latest <command>`,
      `Or pin globally:             npm install -g ${PACKAGE_NAME}@latest`,
    ].join('\n');
  }

  return [
    `Upgrade attempt failed (npx returned non-zero).`,
    `Current: ${currentVersion}  Latest: ${latestVersion}`,
    `Manual upgrade:  npx ${PACKAGE_NAME}@${latestVersion} <command>`,
  ].join('\n');
}

export function selfUpgradeExitCode(output) {
  try {
    const parsed = JSON.parse(output);
    return parsed.ok === false ? 1 : 0;
  } catch {
    return /^(error:|Upgrade attempt failed)/.test(output) ? 1 : 0;
  }
}
