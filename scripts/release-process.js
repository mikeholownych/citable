import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(value) {
  const match = VERSION_RE.exec(String(value ?? '').trim());
  if (!match) throw new Error(`invalid stable semantic version: ${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function changelogSection(changelog, heading) {
  const start = changelog.indexOf(heading);
  if (start < 0) return null;
  const contentStart = start + heading.length;
  const next = changelog.indexOf('\n## ', contentStart);
  return changelog.slice(contentStart, next < 0 ? undefined : next).trim();
}

export function prepareRelease(root, version, date = new Date().toISOString().slice(0, 10)) {
  parseVersion(version);
  const packageFile = path.join(root, 'package.json');
  const lockFile = path.join(root, 'package-lock.json');
  const changelogFile = path.join(root, 'CHANGELOG.md');
  const roadmapFile = path.join(root, 'docs', 'ROADMAP.md');
  const skillFile = path.join(root, 'skill', 'SKILL.md');
  const packageJson = readJson(packageFile);
  const lock = readJson(lockFile);
  const changelog = fs.readFileSync(changelogFile, 'utf8');
  const roadmap = fs.readFileSync(roadmapFile, 'utf8');
  const skill = fs.readFileSync(skillFile, 'utf8');
  const previousVersion = packageJson.version;
  if (compareVersions(version, packageJson.version) <= 0) {
    throw new Error(`release ${version} must be greater than current version ${packageJson.version}`);
  }
  if (!lock.packages?.[''] || lock.version !== previousVersion || lock.packages[''].version !== previousVersion) {
    throw new Error('package-lock.json root version is inconsistent with package.json');
  }
  const unreleased = changelogSection(changelog, '## Unreleased');
  if (!unreleased) throw new Error('CHANGELOG.md Unreleased section is empty');
  if (changelog.includes(`## ${version} `)) throw new Error(`CHANGELOG.md already contains ${version}`);
  if (!/^## Current State \(v\d+\.\d+\.\d+\)$/m.test(roadmap)) {
    throw new Error('docs/ROADMAP.md current-version heading is missing');
  }
  if (!/^version: \d+\.\d+\.\d+$/m.test(skill)) throw new Error('skill/SKILL.md version field is missing');

  packageJson.version = version;
  writeJson(packageFile, packageJson);
  lock.version = version;
  lock.packages[''].version = version;
  writeJson(lockFile, lock);
  fs.writeFileSync(
    changelogFile,
    changelog.replace('## Unreleased', `## Unreleased\n\n## ${version} — ${date}`),
  );
  fs.writeFileSync(roadmapFile, roadmap.replace(/^## Current State \(v\d+\.\d+\.\d+\)$/m, `## Current State (v${version})`));
  fs.writeFileSync(skillFile, skill.replace(/^version: \d+\.\d+\.\d+$/m, `version: ${version}`));
  return { previousVersion, version, date };
}

import { checkTraceabilityMatrix } from './generate-traceability.js';
import { ALL_DETECTORS } from '../src/detectors/index.js';

export function countTests(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countTests(full);
    } else if (entry.name.endsWith('.test.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const matches = content.match(/(?:^|\s)(?:test|it)\s*\(/g);
      if (matches) count += matches.length;
    }
  }
  return count;
}

export function validateRelease(root, version) {
  parseVersion(version);
  const packageJson = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const roadmap = fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8');
  const skill = fs.readFileSync(path.join(root, 'skill', 'SKILL.md'), 'utf8');
  const failures = [];
  if (packageJson.version !== version) failures.push(`package.json is ${packageJson.version}`);
  if (lock.version !== version) failures.push(`package-lock.json is ${lock.version}`);
  if (lock.packages?.['']?.version !== version) failures.push(`package-lock root is ${lock.packages?.['']?.version}`);
  if (!changelog.includes(`## ${version} `)) failures.push('release changelog heading is missing');
  if (changelogSection(changelog, '## Unreleased')) failures.push('Unreleased changelog must be empty after preparation');
  if (!roadmap.includes(`## Current State (v${version})`)) failures.push('roadmap version is inconsistent');
  if (!skill.includes(`version: ${version}`)) failures.push('skill version is inconsistent');

  // Documentation counters & drift gates
  const actualNs = [...new Set(ALL_DETECTORS.map((d) => d.namespace))].sort();
  const readmePath = path.join(root, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8');
    const nsMatch = readme.match(/\*\*(\d+)\s+detectors\*\*\s+across\s+(\d+)\s+namespaces\s*\(([^)]+)\)/i);
    if (nsMatch) {
      const count = Number.parseInt(nsMatch[1], 10);
      const nsCount = Number.parseInt(nsMatch[2], 10);
      const namespaces = nsMatch[3].replace(/\s+/g, ' ').split(',').map((s) => s.trim()).filter(Boolean).sort();
      if (count !== ALL_DETECTORS.length) failures.push(`README detector count is ${count}, expected ${ALL_DETECTORS.length}`);
      if (nsCount !== actualNs.length) failures.push(`README namespace count is ${nsCount}, expected ${actualNs.length}`);
      if (JSON.stringify(namespaces) !== JSON.stringify(actualNs)) {
        failures.push(`README namespace list does not match tree: [${namespaces.join(', ')}] vs [${actualNs.join(', ')}]`);
      }
    }
    const schemaMatch = readme.match(/\|\s*`schemas\/`\s*\|\s*(\d+)\s+JSON\s+Schemas/i);
    const schemasDir = path.join(root, 'schemas');
    if (schemaMatch && fs.existsSync(schemasDir)) {
      const actualSchemaCount = fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json')).length;
      const count = Number.parseInt(schemaMatch[1], 10);
      if (count !== actualSchemaCount) failures.push(`README schema count is ${count}, expected ${actualSchemaCount}`);
    }
  }

  // ROADMAP counters
  const roadmapDetectorMatch = roadmap.match(/\|\s*Detectors\s*\|\s*(\d+)\s+across\s+(\d+)\s+namespaces\s*\|/i);
  if (roadmapDetectorMatch) {
    const count = Number.parseInt(roadmapDetectorMatch[1], 10);
    const nsCount = Number.parseInt(roadmapDetectorMatch[2], 10);
    if (count !== ALL_DETECTORS.length) failures.push(`ROADMAP detector count is ${count}, expected ${ALL_DETECTORS.length}`);
    if (nsCount !== actualNs.length) failures.push(`ROADMAP namespace count is ${nsCount}, expected ${actualNs.length}`);
  }

  const roadmapSchemaMatch = roadmap.match(/\|\s*Schemas\s*\|\s*(\d+)\s+schema\s+definitions\s*\|/i);
  const schemasDir = path.join(root, 'schemas');
  if (roadmapSchemaMatch && fs.existsSync(schemasDir)) {
    const actualSchemaCount = fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json')).length;
    const count = Number.parseInt(roadmapSchemaMatch[1], 10);
    if (count !== actualSchemaCount) failures.push(`ROADMAP schema count is ${count}, expected ${actualSchemaCount}`);
  }

  const roadmapTestMatch = roadmap.match(/\|\s*Tests\s*\|\s*(\d+)\s+pass/i);
  const testsDir = path.join(root, 'tests');
  if (roadmapTestMatch && fs.existsSync(testsDir)) {
    const expectedTests = Number.parseInt(roadmapTestMatch[1], 10);
    const actualTests = countTests(testsDir);
    if (expectedTests !== actualTests) {
      failures.push(`ROADMAP test counter is ${expectedTests}, expected ${actualTests}`);
    }
  }

  // Traceability matrix drift
  const matrixPath = path.join(root, 'docs', 'architecture', 'traceability-matrix.md');
  if (fs.existsSync(matrixPath)) {
    const matrixCheck = checkTraceabilityMatrix(root);
    if (!matrixCheck.ok) failures.push(matrixCheck.error);
  }

  if (failures.length) throw new Error(`release validation failed: ${failures.join('; ')}`);
  return true;
}

export function releaseNotes(root, version) {
  parseVersion(version);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## ${version} `));
  if (!heading) throw new Error(`CHANGELOG.md release ${version} is missing`);
  const notes = changelogSection(changelog, heading);
  if (!notes) throw new Error(`CHANGELOG.md release ${version} is empty`);
  return notes;
}

function usage() {
  return 'usage: node scripts/release-process.js <prepare|validate|notes> [version] [output-file]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, versionArg, output] = process.argv.slice(2);
  const root = process.cwd();
  const packageJson = fs.existsSync(path.join(root, 'package.json')) ? readJson(path.join(root, 'package.json')) : null;
  const version = versionArg || (command === 'validate' && packageJson ? packageJson.version : null);
  if (!command || !version) throw new Error(usage());
  if (command === 'prepare') prepareRelease(process.cwd(), version);
  else if (command === 'validate') validateRelease(process.cwd(), version);
  else if (command === 'notes') {
    const notes = `${releaseNotes(process.cwd(), version)}\n`;
    if (output) fs.writeFileSync(output, notes);
    else process.stdout.write(notes);
  } else throw new Error(usage());
}
