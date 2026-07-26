#!/usr/bin/env node
/**
 * Build the universal provider bundle from canonical Citable sources.
 *
 * Canonical inputs:
 *   - skill/
 *   - schemas/
 *
 * Generated output:
 *   - dist/universal/<provider skills dir>/citable/
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, PROVIDER_IDS } from '../src/installer/providers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skill');
const AGENT_PROFILES = path.join(SKILL, 'agents');
const SCHEMAS = path.join(ROOT, 'schemas');
const DIST = path.join(ROOT, 'dist');
const UNIVERSAL = path.join(DIST, 'universal');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing to package symlink: ${from}`);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function hashFile(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function assertSafeRel(rel) {
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || path.isAbsolute(normalized)) {
    throw new Error(`unsafe generated path: ${rel}`);
  }
  return normalized;
}

function walkFiles(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    const rel = assertSafeRel(toPosix(path.relative(base, abs)));
    if (entry.isSymbolicLink()) throw new Error(`refusing to hash symlink: ${rel}`);
    if (entry.isDirectory()) walkFiles(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function hashTree(dir, exclude = new Set()) {
  const files = {};
  for (const rel of walkFiles(dir)) {
    if (exclude.has(rel)) continue;
    files[rel] = hashFile(path.join(dir, rel));
  }
  const treeHash = `sha256:${crypto.createHash('sha256').update(
    Object.entries(files).map(([rel, hash]) => `${rel}\0${hash}`).join('\n'),
  ).digest('hex')}`;
  return { files, treeHash };
}

function buildAgentProfiles(providerId) {
  if (providerId !== 'claude') {
    return {
      status: 'unsupported',
      reason: 'native agent profile discovery and permission contract not verified for this host',
    };
  }
  const profileDir = path.join(UNIVERSAL, '.claude', 'agents', 'citable');
  copyDir(AGENT_PROFILES, profileDir);
  const tree = hashTree(profileDir);
  writeFile(path.join(profileDir, 'manifest.json'), `${JSON.stringify({
    name: 'citable-agent-profiles',
    version: pkg.version,
    managedBy: 'citable-cli',
    provider: providerId,
    sourcePackage: `${pkg.name}@${pkg.version}`,
    files: tree.files,
    treeHash: tree.treeHash,
  }, null, 2)}\n`);
  return {
    status: 'available',
    path: '.claude/agents/citable',
    files: tree.files,
    treeHash: tree.treeHash,
  };
}

function buildSkillTree(providerId, agentProfiles) {
  const provider = PROVIDERS[providerId];
  const skillDir = path.join(UNIVERSAL, provider.projectSkillsDir, 'citable');
  copyDir(SKILL, skillDir);
  copyDir(SCHEMAS, path.join(skillDir, 'schemas'));
  writeFile(path.join(skillDir, 'scripts', 'README.md'), `# Citable skill scripts

This directory is part of the installed Citable skill payload. The initial
installer adds only verified provider agent profiles declared by the bundle
manifest. It does not add hooks, MCP configuration, telemetry, or unrelated
agent settings.
`);
  writeFile(path.join(skillDir, 'VERSION'), `${pkg.version}\n`);
  writeFile(path.join(skillDir, 'manifest.json'), `${JSON.stringify({
    name: 'citable',
    version: pkg.version,
    managedBy: 'citable-cli',
    provider: providerId,
    providerName: provider.displayName,
    scope: 'bundle',
    sourcePackage: `${pkg.name}@${pkg.version}`,
    agentProfiles,
    files: {},
    treeHash: null,
  }, null, 2)}\n`);
  const tree = hashTree(skillDir, new Set(['manifest.json']));
  writeFile(path.join(skillDir, 'manifest.json'), `${JSON.stringify({
    name: 'citable',
    version: pkg.version,
    managedBy: 'citable-cli',
    provider: providerId,
    providerName: provider.displayName,
    scope: 'bundle',
    sourcePackage: `${pkg.name}@${pkg.version}`,
    variantPath: toPosix(path.relative(UNIVERSAL, skillDir)),
    agentProfiles,
    files: tree.files,
    treeHash: tree.treeHash,
  }, null, 2)}\n`);
  return {
    provider: providerId,
    providerName: provider.displayName,
    path: toPosix(path.relative(UNIVERSAL, skillDir)),
    files: Object.keys(tree.files).length,
    treeHash: tree.treeHash,
  };
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(UNIVERSAL, { recursive: true });

const providers = {};
for (const providerId of PROVIDER_IDS) {
  const agentProfiles = buildAgentProfiles(providerId);
  providers[providerId] = buildSkillTree(providerId, agentProfiles);
  console.error(`built dist/universal/${providers[providerId].path} (${providers[providerId].files} files)`);
}

const bundleTree = hashTree(UNIVERSAL, new Set(['manifest.json']));
writeFile(path.join(UNIVERSAL, 'manifest.json'), `${JSON.stringify({
  name: 'citable-universal-bundle',
  version: pkg.version,
  sourcePackage: `${pkg.name}@${pkg.version}`,
  providers,
  files: bundleTree.files,
  treeHash: bundleTree.treeHash,
}, null, 2)}\n`);

console.error('dist/universal/manifest.json written');
