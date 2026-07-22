import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createDeploymentReceipt } from '../src/release/governance.js';
import { writeJson } from '../src/shared/io.js';

const USAGE = 'usage: node scripts/collect-deployment-receipts.js <manifest-file> <output-dir> [--region <region>] [--identity <identity>]';

function flagValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

/** Build the receipt observation input from one live HTTP response. */
export function observationFromResponse(surface, response, bodyBytes, collector, collectedAt) {
  const headers = {};
  for (const [name, value] of response.headers) headers[name.toLowerCase()] = value;
  return {
    surface_id: surface.surface_id,
    url: surface.url,
    response_hash: createHash('sha256').update(bodyBytes).digest('hex'),
    http: {
      status: response.status,
      final_url: response.url || surface.url,
      redirect_chain: [],
      headers,
    },
    collector,
    collected_at: collectedAt,
    limitations: ['Direct publisher probe without redirect following; controlled surfaces must answer at their declared URL.'],
  };
}

/**
 * Probe every controlled surface in the manifest and write one
 * deployment-receipt-<surface_id>.json per surface. Receipts are written even
 * when verification fails — a failed probe is evidence, not an absence — but
 * the process exits non-zero unless every required surface verifies.
 */
export async function collectDeploymentReceipts(manifest, outputDir, collector, fetchImpl = fetch) {
  const results = [];
  for (const surface of manifest.controlled_surfaces) {
    const collectedAt = new Date().toISOString();
    // Controlled surfaces must answer at their declared URL; a redirect is a
    // failed observation, not something to follow silently.
    const response = await fetchImpl(surface.url, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
    const bodyBytes = Buffer.from(await response.arrayBuffer());
    const observation = observationFromResponse(surface, response, bodyBytes, collector, collectedAt);
    const receipt = createDeploymentReceipt(manifest, observation);
    const file = path.join(outputDir, `deployment-receipt-${surface.surface_id}.json`);
    writeJson(file, receipt);
    results.push({ surface_id: surface.surface_id, required: surface.required_for_finalization, status: receipt.verification_status, file });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const [manifestFile, outputDir] = args;
  if (!manifestFile || !outputDir) throw new Error(USAGE);
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestFile), 'utf8'));
  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const collector = {
    identity: flagValue(args, '--identity', 'citable-release-operator'),
    version: `citable/${packageJson.version}`,
    method: 'node-fetch-direct',
    request_identity: 'publisher',
    region: flagValue(args, '--region', 'operator-local'),
  };
  const results = await collectDeploymentReceipts(manifest, path.resolve(outputDir), collector);
  let failed = false;
  for (const result of results) {
    console.log(`${result.surface_id}: ${result.status}${result.required ? '' : ' (not required for finalization)'} -> ${result.file}`);
    if (result.required && result.status !== 'verified') failed = true;
  }
  if (failed) {
    console.error('one or more required surfaces did not verify; receipts were still written as evidence');
    process.exitCode = 1;
  }
}
