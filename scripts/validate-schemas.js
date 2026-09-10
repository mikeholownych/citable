import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_DIR = path.join(ROOT, 'schemas');

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);

const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json')).sort();
const schemas = [];

// Phase 1: Parse and add all schemas to Ajv for $ref resolution
for (const f of schemaFiles) {
  const p = path.join(SCHEMAS_DIR, f);
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  schemas.push({ file: f, parsed });
  ajv.addSchema(parsed);
}

// Phase 2: Compile and validate each schema
let errors = 0;
for (const { file, parsed } of schemas) {
  try {
    const validate = ajv.compile(parsed);
    if (!validate) {
      console.error(`FAILED: ${file}: compile returned falsy validator`);
      errors++;
    }
  } catch (err) {
    console.error(`FAILED: ${file}: ${err.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`Schema validation failed: ${errors} errors across ${schemas.length} schemas`);
  process.exit(1);
}

console.log(`Successfully validated and compiled all ${schemas.length} schemas with Ajv`);
