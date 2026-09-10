import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGENTS = path.join(ROOT, 'skill', 'agents');

function readProfile(name) {
  const file = path.join(AGENTS, `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
  assert.ok(match, `${name} must have YAML frontmatter and a prompt body`);
  return { file, raw, frontmatter: loadYaml(match[1]), body: match[2] };
}

test('canonical Citable profiles have distinct evidence-phase routing', () => {
  const auditor = readProfile('citable-auditor');
  const reviewer = readProfile('citable-semantic-reviewer');

  assert.equal(auditor.frontmatter.name, 'citable-auditor');
  assert.match(auditor.frontmatter.description, /audit|collect/i);
  assert.match(auditor.frontmatter.description, /sealed|immutable|evidence/i);
  assert.match(auditor.frontmatter.description, /do not use|not for/i);

  assert.equal(reviewer.frontmatter.name, 'citable-semantic-reviewer');
  assert.match(reviewer.frontmatter.description, /existing.*(run|finding|artifact)/i);
  assert.match(reviewer.frontmatter.description, /semantic/i);
  assert.match(reviewer.frontmatter.description, /do not use|not for/i);
  assert.notEqual(auditor.frontmatter.description, reviewer.frontmatter.description);
});

test('Citable profiles use least privilege and preload the canonical skill', () => {
  const auditor = readProfile('citable-auditor');
  const reviewer = readProfile('citable-semantic-reviewer');

  assert.deepEqual(auditor.frontmatter.skills, ['citable']);
  assert.deepEqual(reviewer.frontmatter.skills, ['citable']);
  assert.equal(auditor.frontmatter.model, 'inherit');
  assert.equal(reviewer.frontmatter.model, 'inherit');
  assert.ok(auditor.frontmatter.maxTurns <= 20);
  assert.ok(reviewer.frontmatter.maxTurns <= 15);

  const auditorTools = new Set(auditor.frontmatter.tools);
  assert.deepEqual([...auditorTools].sort(), ['Bash', 'Glob', 'Grep', 'Read']);
  assert.ok(!auditorTools.has('Edit'));
  assert.ok(!auditorTools.has('Write'));
  assert.ok(!auditorTools.has('WebFetch'));

  const reviewerTools = new Set(reviewer.frontmatter.tools);
  assert.deepEqual([...reviewerTools].sort(), ['Glob', 'Grep', 'Read']);
  assert.ok(!reviewerTools.has('Bash'));
  assert.ok(!reviewerTools.has('Edit'));
  assert.ok(!reviewerTools.has('Write'));
});

test('auditor profile creates only Citable evidence and preserves incomplete states', () => {
  const { body } = readProfile('citable-auditor');

  assert.match(body, /citable doctor/);
  assert.match(body, /citable plan-audit/);
  assert.match(body, /citable audit/);
  assert.match(body, /citable observe/);
  assert.match(body, /do not (use|run).*(curl|wget)|never (use|run).*(curl|wget)/is);
  assert.match(body, /do not edit|never edit/i);
  assert.match(body, /not_evidenced/);
  assert.match(body, /not_established/);
  assert.match(body, /blocked|incomplete/);
  assert.match(body, /run id/i);
  assert.match(body, /limitations|unknowns/i);
});

test('semantic reviewer cannot upgrade evidence or mutate source artifacts', () => {
  const { body } = readProfile('citable-semantic-reviewer');

  assert.match(body, /fact.*inference|inference.*fact/is);
  assert.match(body, /claim boundedness/i);
  assert.match(body, /evidence strength/i);
  assert.match(body, /answer extractability/i);
  assert.match(body, /narrative accuracy/i);
  assert.match(body, /do not.*verified|never.*verified/is);
  assert.match(body, /do not edit|never edit/i);
  assert.match(body, /review_required/);
  assert.match(body, /adjudication_required/);
  assert.match(body, /source run|finding hash/i);
});

test('remediator profile requires closed-loop verification and safe AST patching', () => {
  const remediator = readProfile('citable-remediator');

  assert.equal(remediator.frontmatter.name, 'citable-remediator');
  assert.deepEqual(remediator.frontmatter.skills, ['citable']);
  assert.equal(remediator.frontmatter.model, 'inherit');
  assert.ok(remediator.frontmatter.maxTurns <= 25);

  const tools = new Set(remediator.frontmatter.tools);
  assert.deepEqual([...tools].sort(), ['Bash', 'Glob', 'Grep', 'Read']);
  assert.ok(!tools.has('Edit'));
  assert.ok(!tools.has('Write'));

  const { body } = remediator;
  assert.match(body, /citable remediate/);
  assert.match(body, /citable verify remediation/);
  assert.match(body, /citable kit export/);
  assert.match(body, /AST validation|AST patch/i);
  assert.match(body, /rollback snapshot/i);
  assert.match(body, /no.*ranking|never promise/i);
});

test('SOW architect profile enforces admissibility gates and minor-unit arithmetic', () => {
  const architect = readProfile('citable-sow-architect');

  assert.equal(architect.frontmatter.name, 'citable-sow-architect');
  assert.deepEqual(architect.frontmatter.skills, ['citable']);
  assert.equal(architect.frontmatter.model, 'inherit');
  assert.ok(architect.frontmatter.maxTurns <= 25);

  const tools = new Set(architect.frontmatter.tools);
  assert.deepEqual([...tools].sort(), ['Bash', 'Glob', 'Grep', 'Read']);
  assert.ok(!tools.has('Edit'));
  assert.ok(!tools.has('Write'));

  const { body } = architect;
  assert.match(body, /citable sow generate/);
  assert.match(body, /citable sow validate/);
  assert.match(body, /citable report search/);
  assert.match(body, /citable report cro/);
  assert.match(body, /admissibility gate/i);
  assert.match(body, /traceability/i);
  assert.match(body, /integer minor-unit/i);
  assert.match(body, /no search engine crawling.*guaranteed|never promise/i);
});

test('distribution generates discoverable Claude profiles and fails closed for unverified hosts', () => {
  const build = spawnSync(process.execPath, ['scripts/build-dist.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr);

  const claudeSkill = path.join(ROOT, 'dist', 'universal', '.claude', 'skills', 'citable');
  const claudeProfiles = path.join(ROOT, 'dist', 'universal', '.claude', 'agents', 'citable');
  const auditor = path.join(claudeProfiles, 'citable-auditor.md');
  const reviewer = path.join(claudeProfiles, 'citable-semantic-reviewer.md');
  const remediator = path.join(claudeProfiles, 'citable-remediator.md');
  const architect = path.join(claudeProfiles, 'citable-sow-architect.md');

  assert.equal(fs.readFileSync(auditor, 'utf8'), fs.readFileSync(path.join(AGENTS, 'citable-auditor.md'), 'utf8'));
  assert.equal(fs.readFileSync(reviewer, 'utf8'), fs.readFileSync(path.join(AGENTS, 'citable-semantic-reviewer.md'), 'utf8'));
  assert.equal(fs.readFileSync(remediator, 'utf8'), fs.readFileSync(path.join(AGENTS, 'citable-remediator.md'), 'utf8'));
  assert.equal(fs.readFileSync(architect, 'utf8'), fs.readFileSync(path.join(AGENTS, 'citable-sow-architect.md'), 'utf8'));

  const profileManifest = JSON.parse(fs.readFileSync(path.join(claudeProfiles, 'manifest.json'), 'utf8'));
  assert.equal(profileManifest.name, 'citable-agent-profiles');
  assert.equal(profileManifest.provider, 'claude');
  assert.deepEqual(Object.keys(profileManifest.files).sort(), [
    'citable-auditor.md',
    'citable-remediator.md',
    'citable-semantic-reviewer.md',
    'citable-sow-architect.md',
  ]);
  assert.match(profileManifest.treeHash, /^sha256:[a-f0-9]{64}$/);

  const skillManifest = JSON.parse(fs.readFileSync(path.join(claudeSkill, 'manifest.json'), 'utf8'));
  assert.equal(skillManifest.agentProfiles.status, 'available');
  assert.equal(skillManifest.agentProfiles.path, '.claude/agents/citable');
  assert.equal(skillManifest.agentProfiles.treeHash, profileManifest.treeHash);

  const codexManifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'dist', 'universal', '.agents', 'skills', 'citable', 'manifest.json'),
    'utf8',
  ));
  assert.equal(codexManifest.agentProfiles.status, 'unsupported');
  assert.match(codexManifest.agentProfiles.reason, /not verified/i);
  assert.equal(fs.existsSync(path.join(ROOT, 'dist', 'universal', '.agents', 'agents', 'citable')), false);
});
