import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../evidence/run.js';
import { readJson, sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function inside(root, candidate) {
  const base = path.resolve(root) + path.sep;
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(base) || resolved.includes(`${path.sep}.git${path.sep}`) || resolved.includes(`${path.sep}.citable${path.sep}`)) {
    throw new Error(`remediation file escapes editable source boundary: ${candidate}`);
  }
  return resolved;
}

export function applyRemediation(root, { input, write = false } = {}) {
  if (!input || !fs.existsSync(input)) throw new Error('apply requires --input <remediation-spec.json>');
  const raw = fs.readFileSync(input, 'utf8');
  const spec = readJson(input);
  const valid = validateAgainst('remediation-spec.schema.json', spec);
  if (!valid.valid) throw new Error(`remediation spec invalid: ${valid.errors.join('; ')}`);
  const manifestFile = path.join(root, '.citable', 'runs', spec.source_run_id, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`source run not found: ${spec.source_run_id}`);
  const findingsFile = path.join(root, '.citable', 'runs', spec.source_run_id, 'findings.json');
  if (!fs.existsSync(findingsFile)) throw new Error(`source run has no findings: ${spec.source_run_id}`);
  const sourceFindingIds = new Set(readJson(findingsFile).map((finding) => finding.finding_id));
  const results = [];
  const pending = [];
  for (const operation of spec.operations) {
    const unknownFindings = operation.finding_ids.filter((id) => !sourceFindingIds.has(id));
    if (unknownFindings.length) throw new Error(`operation ${operation.operation_id} references findings outside source run: ${unknownFindings.join(', ')}`);
    const file = inside(root, operation.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`remediation target is not a file: ${operation.file}`);
    const before = fs.readFileSync(file, 'utf8');
    if (sha256(before) !== operation.expected_file_hash) throw new Error(`stale remediation refused for ${operation.file}: file hash changed`);
    if (!operation.reviewer) throw new Error(`reviewer required for operation ${operation.operation_id}`);
    const matches = before.split(operation.find).length - 1;
    if (matches !== 1) throw new Error(`operation ${operation.operation_id} expected exactly one match, observed ${matches}`);
    const after = before.replace(operation.find, operation.replace);
    pending.push({ file, before, after });
    results.push({ operation_id: operation.operation_id, file: operation.file, finding_ids: operation.finding_ids, reviewer: operation.reviewer, before_hash: sha256(before), after_hash: sha256(after), status: write ? 'applied' : 'proposed' });
  }
  if (write) {
    const written = [];
    try {
      for (const change of pending) { fs.writeFileSync(change.file, change.after); written.push(change); }
    } catch (error) {
      for (const change of written.reverse()) fs.writeFileSync(change.file, change.before);
      throw new Error(`remediation write failed and prior writes were rolled back: ${error.message}`);
    }
  }
  const run = createRun(root, { command: 'apply', argv: process.argv.slice(2), target: { kind: 'source', location: root, environment: 'local' } });
  run.addInput('remediation_spec', raw);
  run.writeArtifact('remediation/results.json', { source_run_id: spec.source_run_id, write, operations: results });
  run.manifest.warnings.push(write ? 'Source changes applied; build, test, re-audit, and snapshot comparison remain required.' : 'Dry run only; no source files were changed.');
  return { runId: run.runId, dir: run.finalize('completed_with_warnings'), source_run_id: spec.source_run_id, write, operations: results };
}
