import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ALL_DETECTORS, detectorsByNamespace } from '../detectors/index.js';
import { REGISTRY_SPECS } from '../registries/index.js';
import { PROVIDERS } from '../installer/providers.js';
import { sha256, writeJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const SOURCE_PROJECTIONS = [
  ['package-json', 'package.json'],
  ['package-lock', 'package-lock.json'],
  ['skill-metadata', 'skill/SKILL.md'],
  ['npm-readme', 'README.md'],
  ['changelog', 'CHANGELOG.md'],
  ['roadmap', 'docs/ROADMAP.md'],
  ['controlled-surfaces', 'release/surfaces.json'],
  ['distribution-manifest', 'dist/universal/manifest.json'],
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function manifestHash(manifest) {
  const { manifest_hash: ignored, ...unsigned } = manifest;
  return sha256(canonicalJson(unsigned));
}

function projection(id, relativePath, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { projection_id: id, path: relativePath, sha256: sha256(buffer), bytes: buffer.length, authority: 'control_plane' };
}

function currentCommit(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

export function verifyRepositoryBinding(root, commit) {
  try {
    const head = currentCommit(root);
    const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim();
    const failures = [];
    if (head !== commit) failures.push(`manifest commit ${commit} differs from HEAD ${head}`);
    if (trackedChanges) failures.push('tracked working tree is not clean');
    return { ok: failures.length === 0, failures };
  } catch (error) {
    return { ok: false, failures: [`repository binding unavailable: ${error.message}`] };
  }
}

function distributionFileCount(root) {
  const manifestFile = path.join(root, 'dist', 'universal', 'manifest.json');
  if (!fs.existsSync(manifestFile)) return 0;
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const first = Object.values(manifest.providers || {})[0];
  if (Array.isArray(first)) return first.length;
  if (Array.isArray(first?.files)) return first.files.length;
  if (Number.isInteger(first?.files) && first.files >= 0) return first.files;
  return 0;
}

export function releaseFacts(root) {
  return {
    detectors: ALL_DETECTORS.length,
    namespaces: Object.keys(detectorsByNamespace()).length,
    registries: REGISTRY_SPECS.length,
    providers: Object.keys(PROVIDERS).length,
    distribution_files_per_provider: distributionFileCount(root),
  };
}

export function resourceProjection(version, facts, commit) {
  return {
    schema_version: 1,
    product: 'Citable',
    version,
    commit,
    facts,
    boundary: 'Citable does not guarantee crawling, indexing, ranking, citation, recommendation, or conversion.',
    canonical_repository: 'https://github.com/mikeholownych/citable',
    npm_package: 'https://www.npmjs.com/package/@nebulacomponents/citable',
  };
}

export function llmsProjection(version, facts, commit) {
  return `# Citable\n\nCitable is the evidence and change-control layer for defensible search and AI citation readiness.\n\n- Version: ${version}\n- Release commit: ${commit}\n- Detectors: ${facts.detectors} across ${facts.namespaces} namespaces\n- Schema-validated registries: ${facts.registries}\n- Agent providers: ${facts.providers}\n- Canonical repository: https://github.com/mikeholownych/citable\n- npm: https://www.npmjs.com/package/@nebulacomponents/citable\n\nCitable does not guarantee crawling, indexing, ranking, citation, recommendation, or conversion.\n`;
}

export function generateReleaseManifest(root, { commit = currentCommit(root), generatedAt = new Date().toISOString(), outputDir } = {}) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const facts = releaseFacts(root);
  const generated = {
    'release/resource-data.json': `${JSON.stringify(resourceProjection(version, facts, commit), null, 2)}\n`,
    'release/llms.txt': llmsProjection(version, facts, commit),
  };
  const projections = SOURCE_PROJECTIONS.map(([id, relativePath]) => {
    const file = path.join(root, relativePath);
    if (!fs.existsSync(file)) throw new Error(`required release projection is missing: ${relativePath}`);
    return projection(id, relativePath, fs.readFileSync(file));
  });
  projections.push(projection('resource-data', 'release/resource-data.json', generated['release/resource-data.json']));
  projections.push(projection('llms-txt', 'release/llms.txt', generated['release/llms.txt']));
  const surfaceConfig = JSON.parse(fs.readFileSync(path.join(root, 'release', 'surfaces.json'), 'utf8'));
  const manifest = {
    schema_version: 1,
    release_id: `RELEASE-v${version}`,
    version,
    commit,
    generated_at: generatedAt,
    toolchain: { node: process.version, citable: version },
    facts,
    projections,
    controlled_surfaces: surfaceConfig.controlled_surfaces,
  };
  manifest.manifest_hash = manifestHash(manifest);
  const check = validateAgainst('release-manifest.schema.json', manifest);
  if (!check.valid) throw new Error(`release manifest violates contract: ${check.errors.join('; ')}`);
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [relativePath, content] of Object.entries(generated)) {
      const file = path.join(outputDir, path.basename(relativePath));
      fs.writeFileSync(file, content);
    }
    writeJson(path.join(outputDir, 'release-manifest.json'), manifest);
  }
  return { manifest, generated };
}

function assertedCount(text, pattern, label) {
  const match = pattern.exec(text);
  return match ? { label, value: Number(match[1]) } : null;
}

export function validateReleaseManifest(root, manifest, generated = {}) {
  const failures = [];
  const check = validateAgainst('release-manifest.schema.json', manifest);
  if (!check.valid) return { ok: false, failures: check.errors };
  if (manifest.manifest_hash !== manifestHash(manifest)) failures.push('manifest hash is inconsistent');
  const actual = generateReleaseManifest(root, { commit: manifest.commit, generatedAt: manifest.generated_at });
  if (canonicalJson(actual.manifest.facts) !== canonicalJson(manifest.facts)) failures.push('release facts differ from executable sources');
  const actualProjections = new Map(actual.manifest.projections.map((item) => [item.projection_id, item]));
  for (const expected of manifest.projections) {
    const observed = actualProjections.get(expected.projection_id);
    if (!observed) failures.push(`${expected.projection_id}: projection is missing`);
    else if (observed.sha256 !== expected.sha256 || observed.bytes !== expected.bytes) failures.push(`${expected.projection_id}: projection checksum differs`);
  }
  for (const [relativePath, content] of Object.entries(actual.generated)) {
    if (generated[relativePath] != null && generated[relativePath] !== content) failures.push(`${relativePath}: generated projection differs`);
  }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const roadmap = fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8');
  const assertions = [
    assertedCount(readme, /\*\*(\d+) detectors\*\*/, 'README detector count'),
    assertedCount(readme, /across (\d+) namespaces/, 'README namespace count'),
    assertedCount(roadmap, /\| Detectors \| (\d+) across/, 'roadmap detector count'),
    assertedCount(roadmap, /\| Registries \| (\d+) schema-validated/, 'roadmap registry count'),
    assertedCount(roadmap, /\| Distribution \| (\d+) packaged files per provider/, 'roadmap distribution count'),
  ].filter(Boolean);
  const expected = { 'README detector count': manifest.facts.detectors, 'README namespace count': manifest.facts.namespaces, 'roadmap detector count': manifest.facts.detectors, 'roadmap registry count': manifest.facts.registries, 'roadmap distribution count': manifest.facts.distribution_files_per_provider };
  for (const assertion of assertions) if (assertion.value !== expected[assertion.label]) failures.push(`${assertion.label} is ${assertion.value}; executable source is ${expected[assertion.label]}`);
  return { ok: failures.length === 0, failures };
}

export function verifyManifestIntegrity(manifest) {
  const failures = [];
  const check = validateAgainst('release-manifest.schema.json', manifest);
  if (!check.valid) failures.push(...check.errors);
  if (manifest.manifest_hash !== manifestHash(manifest)) failures.push('manifest hash is inconsistent');
  return { ok: failures.length === 0, failures };
}

export function createDeploymentReceipt(manifest, input) {
  const surface = manifest.controlled_surfaces.find((item) => item.surface_id === input.surface_id);
  if (!surface) throw new Error(`unknown controlled surface: ${input.surface_id}`);
  if (input.url !== surface.url) throw new Error(`receipt URL does not match controlled surface ${surface.surface_id}`);
  const expected = manifest.projections.find((item) => item.projection_id === surface.projection_id);
  if (!expected) throw new Error(`manifest projection is missing for surface ${surface.surface_id}`);
  const collectedAt = input.collected_at || new Date().toISOString();
  const expiresAt = input.expires_at || new Date(new Date(collectedAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  if (!(new Date(expiresAt) > new Date(collectedAt))) throw new Error('receipt expiry must be after collection');
  let verificationStatus = 'verified';
  if (input.http.status < 200 || input.http.status >= 300) verificationStatus = 'failed';
  else if (!input.observed_projection_hash) verificationStatus = 'insufficient_evidence';
  else if (input.observed_projection_hash !== expected.sha256) verificationStatus = 'contradictory';
  const receipt = {
    schema_version: 1,
    receipt_id: `RECEIPT-${sha256(`${manifest.manifest_hash}:${surface.surface_id}:${collectedAt}`).slice(0, 20).toUpperCase()}`,
    release_id: manifest.release_id,
    manifest_hash: manifest.manifest_hash,
    surface_id: surface.surface_id,
    url: surface.url,
    projection_id: expected.projection_id,
    expected_projection_hash: expected.sha256,
    observed_projection_hash: input.observed_projection_hash || null,
    response_hash: input.response_hash,
    http: input.http,
    collector: input.collector,
    collected_at: collectedAt,
    expires_at: expiresAt,
    authority: {
      source_authority: 'owner_controlled',
      collection_authority: 'synthetic_probe',
      authenticity_status: 'checksum_protected_only',
      representativeness: 'single_observation',
      limitations: ['Publisher-collected execution evidence; not independent attestation.'],
    },
    verification_status: verificationStatus,
    limitations: [...(input.limitations || []), 'Receipt verifies one publisher-controlled retrieval at one time and region.'],
  };
  receipt.receipt_hash = sha256(canonicalJson(receipt));
  const check = validateAgainst('deployment-receipt.schema.json', receipt);
  if (!check.valid) throw new Error(`deployment receipt violates contract: ${check.errors.join('; ')}`);
  return receipt;
}

export function verifyDeploymentReceipt(manifest, receipt, { at = new Date() } = {}) {
  const failures = [];
  const check = validateAgainst('deployment-receipt.schema.json', receipt);
  if (!check.valid) failures.push(...check.errors);
  const { receipt_hash: ignored, ...unsigned } = receipt;
  if (receipt.receipt_hash !== sha256(canonicalJson(unsigned))) failures.push('receipt hash is inconsistent');
  if (receipt.release_id !== manifest.release_id) failures.push('receipt release differs from manifest');
  if (receipt.manifest_hash !== manifest.manifest_hash) failures.push('receipt manifest hash differs');
  const surface = manifest.controlled_surfaces.find((item) => item.surface_id === receipt.surface_id);
  if (!surface) failures.push('receipt surface is not controlled by the manifest');
  else {
    if (receipt.url !== surface.url) failures.push('receipt URL differs from controlled surface');
    if (receipt.projection_id !== surface.projection_id) failures.push('receipt projection differs from controlled surface');
  }
  const expected = manifest.projections.find((item) => item.projection_id === receipt.projection_id);
  if (!expected || expected.sha256 !== receipt.expected_projection_hash) failures.push('receipt expected projection is inconsistent');
  if (receipt.verification_status !== 'verified') failures.push(`receipt status is ${receipt.verification_status}`);
  if (receipt.authority?.source_authority !== 'owner_controlled' || receipt.authority?.collection_authority !== 'synthetic_probe' || receipt.authority?.representativeness !== 'single_observation') failures.push('receipt authority is not publisher-controlled single-observation execution evidence');
  if (new Date(receipt.expires_at) <= at) failures.push('receipt is expired');
  return { ok: failures.length === 0, failures };
}

function stateHash(value) {
  const { state_hash: ignored, ...unsigned } = value;
  return sha256(canonicalJson(unsigned));
}

function assertState(value) {
  const check = validateAgainst('release-state.schema.json', value);
  if (!check.valid) throw new Error(`release state violates contract: ${check.errors.join('; ')}`);
  if (value.state_hash !== stateHash(value)) throw new Error('release state hash is inconsistent');
}

export function initializeReleaseState(manifest, { actor, at = new Date().toISOString(), maxDwellHours = 24, policyVersion = 'ADR-002' }) {
  const integrity = verifyManifestIntegrity(manifest);
  if (!integrity.ok) throw new Error(`cannot initialize state from invalid manifest: ${integrity.failures.join('; ')}`);
  const state = {
    schema_version: 1,
    release_id: manifest.release_id,
    manifest_hash: manifest.manifest_hash,
    state: 'candidate',
    max_dwell_hours: maxDwellHours,
    created_at: at,
    published_at: null,
    finalized_at: null,
    resolved_at: null,
    resolution_reason: null,
    superseding_release_id: null,
    receipt_refs: [],
    transitions: [{ from: null, to: 'candidate', actor, timestamp: at, reason: 'Release candidate created from validated manifest.', policy_version: policyVersion, evidence_refs: [manifest.manifest_hash] }],
  };
  state.state_hash = stateHash(state);
  assertState(state);
  return state;
}

export function releaseDwellStatus(state, at = new Date()) {
  if (state.state !== 'published_unfinalized') return { expired: false, deadline: null };
  const deadline = new Date(new Date(state.published_at).getTime() + state.max_dwell_hours * 60 * 60 * 1000);
  return { expired: at >= deadline, deadline: deadline.toISOString() };
}

export function transitionRelease(state, to, { actor, reason, evidenceRefs = [], receipts = [], manifest, phaseOne, at = new Date().toISOString(), policyVersion = 'ADR-002', supersedingReleaseId = null } = {}) {
  assertState(state);
  if (['finalized', 'superseded', 'withdrawn'].includes(state.state)) throw new Error(`release state ${state.state} is terminal`);
  const allowed = { candidate: ['published_unfinalized'], published_unfinalized: ['finalized', 'superseded', 'withdrawn'] };
  if (!allowed[state.state]?.includes(to)) throw new Error(`invalid release transition: ${state.state} -> ${to}`);
  if (!actor || !reason) throw new Error('release transition requires actor and reason');
  if (state.state === 'candidate' && (!phaseOne?.ok || phaseOne.manifest_hash !== state.manifest_hash)) throw new Error('bound phase-one projection validation is required before publication');
  const next = structuredClone(state);
  if (to === 'published_unfinalized') next.published_at = at;
  if (to === 'finalized') {
    if (releaseDwellStatus(state, new Date(at)).expired) throw new Error('finalization deadline expired; resolve as withdrawn or superseded');
    if (!manifest || manifest.manifest_hash !== state.manifest_hash) throw new Error('finalization requires the bound release manifest');
    const required = manifest.controlled_surfaces.filter((surface) => surface.required_for_finalization);
    const validReceiptIds = [];
    for (const surface of required) {
      const candidates = receipts.filter((receipt) => receipt.surface_id === surface.surface_id);
      if (candidates.length !== 1) throw new Error(`${surface.surface_id}: exactly one required deployment receipt must be supplied`);
      const result = verifyDeploymentReceipt(manifest, candidates[0], { at: new Date(at) });
      if (!result.ok) throw new Error(`${surface.surface_id}: ${result.failures.join('; ')}`);
      validReceiptIds.push(candidates[0].receipt_id);
    }
    next.receipt_refs = validReceiptIds;
    next.finalized_at = at;
  }
  if (to === 'superseded' || to === 'withdrawn') {
    if (!releaseDwellStatus(state, new Date(at)).expired) throw new Error(`${to} requires the published_unfinalized dwell deadline to expire`);
    if (to === 'superseded' && !supersedingReleaseId) throw new Error('superseded resolution requires superseding release id');
    next.resolved_at = at;
    next.resolution_reason = reason;
    next.superseding_release_id = supersedingReleaseId;
  }
  next.state = to;
  next.transitions.push({ from: state.state, to, actor, timestamp: at, reason, policy_version: policyVersion, evidence_refs: [...evidenceRefs, ...next.receipt_refs] });
  next.state_hash = stateHash(next);
  assertState(next);
  return next;
}

export { canonicalJson, manifestHash };
