import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas');

let ajv = null;

export function getAjv() {
  if (ajv) return ajv;
  ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(SCHEMA_DIR)) {
    if (f.endsWith('.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')));
  }
  return ajv;
}

export function validateAgainst(schemaName, data) {
  const validator = getAjv().getSchema(`citable://schemas/${schemaName}`);
  if (!validator) throw new Error(`unknown schema: ${schemaName}`);
  const valid = validator(data);
  return {
    valid,
    errors: (validator.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`),
  };
}
