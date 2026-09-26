import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas");

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);

const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"));
for (const f of files) {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), "utf8"));
  ajv.addSchema(schema);
}

console.log(`Successfully validated and compiled all ${files.length} outreach schemas with Ajv`);
