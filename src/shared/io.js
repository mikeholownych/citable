import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

export function readYaml(file) {
  return yamlLoad(fs.readFileSync(file, 'utf8'));
}

export function writeYaml(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yamlDump(data, { lineWidth: 100, noRefs: true, sortKeys: false }));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseRefDate(value) {
  if (value == null) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('ref-date must be a valid date in YYYY-MM-DD format');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('ref-date must be a valid date in YYYY-MM-DD format');
  }
  return date;
}

export function isPastDate(isoDate, ref = new Date()) {
  if (!isoDate) return false;
  const d = new Date(String(isoDate).slice(0, 10) + 'T23:59:59Z');
  return !Number.isNaN(d.getTime()) && d < ref;
}

export function listFiles(dir, predicate = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.citable') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) listFiles(p, predicate, out);
    else if (predicate(p)) out.push(p);
  }
  return out;
}
