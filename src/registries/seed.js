import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, nowIso, sha256 } from '../shared/io.js';
import { loadRegistries, saveRegistry, REGISTRY_SPECS } from './index.js';

const SEEDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'seeds');

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

/** Deterministic, key-order-independent serialization for content fingerprinting. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Fingerprint an entry's content, excluding provenance (which carries the fingerprint itself). */
function contentFingerprint(entry) {
  const { provenance, ...rest } = entry;
  return sha256(stableStringify(rest));
}

/**
 * Overlay a bundled starter registry seed onto the caller's `.citable/` registries.
 *
 * Fail-closed guarantees, enforced in code (never trusted from the seed file itself):
 *   - every written entry is stamped `status: unverified` unconditionally, regardless of
 *     what status the seed bundle declares (candidate, active, verified — all forced);
 *   - an existing entry is only ever refreshed (even with `force`) if its current content
 *     still matches the fingerprint recorded at seed time — `provenance.seededFrom` being
 *     present is not by itself proof the entry is unedited, since a user can edit a field
 *     while leaving provenance untouched; a fingerprint mismatch means the owner changed
 *     it, and a seed can never clobber that edit.
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
      if (already) {
        const seededFrom = already.provenance?.seededFrom;
        const unedited = seededFrom && seededFrom.contentFingerprint === contentFingerprint(already);
        if (!force || !unedited) { skipped++; continue; }
      }

      if (entry.status !== 'unverified') {
        result.warnings.push(`${kind}/${id}: seed attempted status "${entry.status}"; forced to "unverified"`);
        entry.status = 'unverified';
      }
      entry.provenance = {
        ...(entry.provenance || {}),
        seededFrom: { seedName: name, seedVersion: manifest.version, importedAt: appliedAt, contentFingerprint: contentFingerprint(entry) },
      };

      if (already) Object.assign(already, entry);
      else existing.entries.push(entry);
      added++;
    }

    saveRegistry(root, kind, existing);
    result.registriesTouched[kind] = { added, skipped };
  }

  return result;
}
