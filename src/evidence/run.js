import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { writeJson, sha256, sha256File, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { readJson } from '../shared/io.js';
import { fileURLToPath } from 'node:url';

const PKG = readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'));

export function newRunId(command) {
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  return `${t}-${command.replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
}

function gitInfo(root) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().length > 0;
    return { commit, state: dirty ? 'dirty' : 'clean' };
  } catch {
    return { commit: null, state: null };
  }
}

/** Create a run evidence package under <root>/.citable/runs/<run-id>/. */
export function createRun(root, { command, argv = [], target, locale = process.env.LANG || 'en', jurisdiction = null, configHash = null }) {
  const runId = newRunId(command);
  const dir = path.join(root, '.citable', 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  const git = gitInfo(root);
  const manifest = {
    schema_version: 2,
    run_id: runId,
    command,
    argv,
    tool_version: PKG.version,
    skill_version: PKG.version,
    repository_commit: git.commit,
    working_tree_state: git.state,
    target,
    timestamp: nowIso(),
    locale,
    jurisdiction,
    configuration_hash: configHash,
    input_hashes: {},
    output_hashes: {},
    detectors_run: [],
    detectors_skipped: [],
    incomplete_checks: [],
    errors: [],
    warnings: [],
    status: 'incomplete',
    execution_status: 'completed',
    coverage_status: 'not_applicable',
    determination_status: 'not_applicable',
  };
  return {
    runId,
    dir,
    manifest,
    addInput(name, content) {
      manifest.input_hashes[name] = sha256(typeof content === 'string' ? content : JSON.stringify(content));
    },
    writeArtifact(relPath, data) {
      const file = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (typeof data === 'string' || Buffer.isBuffer(data)) fs.writeFileSync(file, data);
      else writeJson(file, data);
      manifest.output_hashes[relPath] = sha256File(file);
      return file;
    },
    finalize(status) {
      manifest.status = status;
      const { valid, errors } = validateAgainst('run.schema.json', manifest);
      if (!valid) throw new Error(`run manifest invalid: ${errors.join('; ')}`);
      const stage = `${dir}.sealing-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      fs.rmSync(stage, { recursive: true, force: true });
      fs.cpSync(dir, stage, { recursive: true, dereference: false, errorOnExist: true });
      writeJson(path.join(stage, 'manifest.json'), manifest);
      const summaryFile = path.join(stage, 'summary.json');
      if (fs.existsSync(summaryFile)) {
        const now = new Date();
        fs.utimesSync(summaryFile, now, now);
      }
      // checksums over every artifact in the package
      const checksumEntries = [];
      const walk = (d) => {
        for (const name of fs.readdirSync(d)) {
          const p = path.join(d, name);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (name !== 'checksums.json') checksumEntries.push([path.relative(stage, p).split(path.sep).join('/'), sha256File(p)]);
        }
      };
      walk(stage);
      const checksums = Object.fromEntries(checksumEntries.sort(([a], [b]) => a.localeCompare(b)));
      writeJson(path.join(stage, 'checksums.json'), checksums);
      for (const file of [path.join(stage, 'manifest.json'), path.join(stage, 'checksums.json')]) {
        const handle = fs.openSync(file, 'r');
        try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
      }
      const parent = path.dirname(dir);
      const displaced = `${dir}.partial-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      fs.renameSync(dir, displaced);
      try {
        fs.renameSync(stage, dir);
        const parentHandle = fs.openSync(parent, 'r');
        try { fs.fsyncSync(parentHandle); } finally { fs.closeSync(parentHandle); }
        fs.rmSync(displaced, { recursive: true, force: true });
      } catch (error) {
        if (!fs.existsSync(dir) && fs.existsSync(displaced)) fs.renameSync(displaced, dir);
        fs.rmSync(stage, { recursive: true, force: true });
        throw error;
      }
      return dir;
    },
  };
}
