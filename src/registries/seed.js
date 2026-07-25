import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, nowIso } from '../shared/io.js';
import { loadRegistries, saveRegistry, REGISTRY_SPECS } from './index.js';

const SEEDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'seeds');

// A seed bundle's own claimed status is never trusted for these values — seeded data
// can never enter the repo already looking human-verified.
const NEVER_PRESEEDED_STATUSES = new Set(['verified', 'verified_narrowed', 'reviewed']);

export function listSeeds(seedsDir = SEEDS_DIR) {
  if (!fs.existsSync(seedsDir)) return [];
  return fs.readdirSync(seedsDir).filter((name) => fs.existsSync(path.join(seedsDir, name, 'seed.json')));
}

function loadSeedManifest(name, seedsDir) {
  const dir = path.join(seedsDir, name);
  const manifestFile = path.join(dir, 'seed.json');
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`unknown seed: ${name}; available seeds: ${listSeeds(seedsDir).join(', ') || 'none bundled'}`);
  }
  return { dir, manifest: JSON.parse(fs.readFileSync(manifestFile, 'utf8')) };
}

/**
 * Overlay a bundled starter registry seed onto the caller's `.citable/` registries.
 *
 * Fail-closed guarantees, enforced in code (never trusted from the seed file itself):
 *   - every written entry is stamped `status: unverified` and `provenance.seededFrom`,
 *     regardless of what the seed bundle declares;
 *   - an existing entry is only ever overwritten (even with `force`) if that specific
 *     entry already carries `provenance.seededFrom` — a seed can never clobber
 *     something the owner wrote or edited themselves.
 */
export function applySeed(root, name, { force = false, seedsDir = SEEDS_DIR } = {}) {
  const { dir, manifest } = loadSeedManifest(name, seedsDir);
  const { registries } = loadRegistries(root);
  const appliedAt = nowIso();
  const result = { seedName: name, seedVersion: manifest.version, appliedAt, registriesTouched: {}, warnings: [] };

  for (const kind of manifest.registries) {
    const spec = REGISTRY_SPECS.find((s) => s.kind === kind);
    if (!spec) { result.warnings.push(`seed "${name}" references unknown registry kind "${kind}"; skipped`); continue; }
    const seedFile = path.join(dir, spec.file);
    if (!fs.existsSync(seedFile)) continue;
    const seedRegistry = readYaml(seedFile);
    const existing = registries[kind];
    const existingById = new Map(existing.entries.map((e) => [e[spec.idField], e]));
    let added = 0;
    let skipped = 0;

    for (const entry of seedRegistry.entries) {
      const id = entry[spec.idField];
      const already = existingById.get(id);
      if (already && (!force || !already.provenance?.seededFrom)) { skipped++; continue; }

      if (NEVER_PRESEEDED_STATUSES.has(entry.status)) {
        result.warnings.push(`${kind}/${id}: seed attempted status "${entry.status}"; forced to "unverified"`);
        entry.status = 'unverified';
      }
      entry.provenance = { ...(entry.provenance || {}), seededFrom: { seedName: name, seedVersion: manifest.version, importedAt: appliedAt } };

      if (already) Object.assign(already, entry);
      else existing.entries.push(entry);
      added++;
    }

    saveRegistry(root, kind, existing);
    result.registriesTouched[kind] = { added, skipped };
  }

  return result;
}
