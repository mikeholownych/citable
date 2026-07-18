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
  const packageJson = readJson(packageFile);
  const lock = readJson(lockFile);
  const changelog = fs.readFileSync(changelogFile, 'utf8');
  const roadmap = fs.readFileSync(roadmapFile, 'utf8');
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
  return { previousVersion, version, date };
}

export function validateRelease(root, version) {
  parseVersion(version);
  const packageJson = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const roadmap = fs.readFileSync(path.join(root, 'docs', 'ROADMAP.md'), 'utf8');
  const failures = [];
  if (packageJson.version !== version) failures.push(`package.json is ${packageJson.version}`);
  if (lock.version !== version) failures.push(`package-lock.json is ${lock.version}`);
  if (lock.packages?.['']?.version !== version) failures.push(`package-lock root is ${lock.packages?.['']?.version}`);
  if (!changelog.includes(`## ${version} `)) failures.push('release changelog heading is missing');
  if (changelogSection(changelog, '## Unreleased')) failures.push('Unreleased changelog must be empty after preparation');
  if (!roadmap.includes(`## Current State (v${version})`)) failures.push('roadmap version is inconsistent');
  if (failures.length) throw new Error(`release version mismatch: ${failures.join('; ')}`);
  return true;
}

export function releaseNotes(root, version) {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = changelog.match(new RegExp(`^## ${version} [^\\n]*$`, 'm'))?.[0];
  if (!heading) throw new Error(`CHANGELOG.md release ${version} is missing`);
  const notes = changelogSection(changelog, heading);
  if (!notes) throw new Error(`CHANGELOG.md release ${version} is empty`);
  return notes;
}

function usage() {
  return 'usage: node scripts/release-process.js <prepare|validate|notes> <version> [output-file]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, version, output] = process.argv.slice(2);
  if (!command || !version) throw new Error(usage());
  if (command === 'prepare') prepareRelease(process.cwd(), version);
  else if (command === 'validate') validateRelease(process.cwd(), version);
  else if (command === 'notes') {
    const notes = `${releaseNotes(process.cwd(), version)}\n`;
    if (output) fs.writeFileSync(output, notes);
    else process.stdout.write(notes);
  } else throw new Error(usage());
}
