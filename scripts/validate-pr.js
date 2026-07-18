import fs from 'node:fs';

const eventFile = process.env.GITHUB_EVENT_PATH;
if (!eventFile) throw new Error('GITHUB_EVENT_PATH is required');
const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
const title = event.pull_request?.title ?? '';
const body = event.pull_request?.body ?? '';
const branch = event.pull_request?.head?.ref ?? '';
const changedFile = process.argv[2];
const changed = changedFile ? fs.readFileSync(changedFile, 'utf8').trim().split('\n').filter(Boolean) : [];
const failures = [];

const conventional = /^(feat|fix|docs|test|build|ci|chore|refactor|perf|security|release)(\([a-z0-9-]+\))?!?: .+/;
if (!conventional.test(title)) failures.push('PR title must use Conventional Commits syntax');
for (const heading of ['## Summary', '## Validation', '## Release impact', '## Evidence and risk']) {
  if (!body.includes(heading)) failures.push(`PR body is missing ${heading}`);
}

const productChange = changed.some((file) => /^(src|skill|schemas|cli)\//.test(file) || file === 'package.json');
if (productChange && !changed.includes('CHANGELOG.md')) {
  failures.push('user-facing product changes must update CHANGELOG.md Unreleased');
}
if (branch.startsWith('release/')) {
  const version = branch.slice('release/v'.length);
  if (!branch.startsWith('release/v') || title !== `release: v${version}`) {
    failures.push('release PRs must use branch release/vX.Y.Z and title release: vX.Y.Z');
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}
console.log(`PR policy passed for ${changed.length} changed files`);
