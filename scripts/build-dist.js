#!/usr/bin/env node
/**
 * Build per-environment distribution packages from the canonical skill/ source.
 * Single source of truth: skill/. No manually maintained divergent copies.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skill');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function skillBody() {
  // canonical SKILL.md without frontmatter
  const raw = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  return raw.replace(/^---[\s\S]*?---\n/, '');
}

const targets = {
  'claude-code': (dir) => {
    // Claude Code plugin-style skill: SKILL.md with frontmatter + support dirs
    copyDir(SKILL, path.join(dir, 'skills', 'citable'));
    fs.writeFileSync(path.join(dir, 'README.md'),
`# Citable for Claude Code

Install: copy \`skills/citable/\` into \`.claude/skills/\` (project) or \`~/.claude/skills/\` (user),
and ensure the citable CLI is on PATH (\`npm install -g\` from the repo root, or \`npx citable\`).

Invocation: Claude loads the skill automatically for SEO/AEO/GEO tasks, or explicitly via /citable.
Requires: Node >= 20. Permissions: file read/write in the project, optional network for URL audits.
`);
  },
  codex: (dir) => {
    copyDir(SKILL, path.join(dir, 'citable'));
    fs.writeFileSync(path.join(dir, 'AGENTS.md'),
`# Citable — agent instructions (Codex-compatible)

Read \`citable/SKILL.md\` before any SEO/AEO/GEO task; follow its premises and
the command contracts in \`citable/commands/\`. Run the deterministic core via
the \`citable\` CLI (Node >= 20). Never fabricate facts, citations, evidence,
or corroboration; fail closed per the templates in \`citable/templates/\`.
`);
  },
  cursor: (dir) => {
    fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cursor', 'rules', 'citable.mdc'),
`---
description: Citable — SEO/AEO/GEO governance skill. Applies to discoverability, structured data, claims, and crawler-policy work.
alwaysApply: false
---
${skillBody()}
`);
    copyDir(SKILL, path.join(dir, 'citable-skill'));
  },
  gemini: (dir) => {
    copyDir(SKILL, path.join(dir, 'citable'));
    fs.writeFileSync(path.join(dir, 'GEMINI.md'),
`# Citable — Gemini CLI instructions

${skillBody()}
`);
  },
  generic: (dir) => {
    copyDir(SKILL, path.join(dir, 'skill'));
    fs.writeFileSync(path.join(dir, 'INSTALL.md'),
`# Citable — generic agent-skill package

1. Make \`skill/SKILL.md\` available to your agent as a system/tool instruction.
2. Install the CLI: \`npm install -g citable\` (Node >= 20) or vendor this repo.
3. Wire the command contracts in \`skill/commands/\` to your agent's command system.
Version: ${pkg.version}
`);
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
const manifest = { version: pkg.version, built_at: new Date().toISOString(), targets: {} };
for (const [name, build] of Object.entries(targets)) {
  const dir = path.join(DIST, name);
  build(dir);
  // reproducibility: content hash over sorted file list
  const hashes = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else hashes.push(`${path.relative(dir, p)}:${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  manifest.targets[name] = {
    files: hashes.length,
    content_hash: crypto.createHash('sha256').update(hashes.join('\n')).digest('hex'),
  };
  console.log(`built dist/${name} (${hashes.length} files)`);
}
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('dist/manifest.json written');
