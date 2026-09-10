import fs from 'node:fs';
import path from 'node:path';
import { generateSow, exportSow, renderSowMarkdown } from '../sow/generateSow.js';
import { validateAgainst } from '../shared/schemaValidator.js';
import { readJson } from '../shared/io.js';

/**
 * `citable sow` command handler
 */
export async function sowCommand(argv = [], root = process.cwd()) {
  const sub = argv[0];

  if (sub === 'validate') {
    const file = argv[1];
    if (!file) throw new Error('usage: citable sow validate <file.json>');
    const filePath = path.resolve(root, file);
    if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
    const data = readJson(filePath);
    const { valid, errors } = validateAgainst('sow.schema.json', data);
    return {
      command: 'sow validate',
      file,
      valid,
      errors: errors || [],
      message: valid ? 'SOW conforms strictly to schemas/sow.schema.json contract' : `SOW schema validation failed: ${errors?.join(', ')}`,
    };
  }

  // Default: generate SOW
  const args = parseSowArgs(argv);
  const result = await exportSow(root, {
    target: args.target,
    baseUrl: args.baseUrl,
    runId: args.runId,
    live: args.live,
    sample: args.sample,
    demo: args.demo,
    draft: args.draft,
    client: args.client || 'Enterprise Customer',
    clientContact: args.clientContact || 'procurement@customer.test',
    supplier: args.supplier || 'Nebula Components & Citable Advisory Practice',
    supplierContact: args.supplierContact || 'advisory@nebulacomponents.test',
    budget: args.budget ? Number(args.budget) : 45000,
    budgetMinor: args.budgetMinor ? Number(args.budgetMinor) : null,
    termDays: args.term ? Number(args.term) : 90,
    format: args.format || 'markdown',
    output: args.output,
    inScopeProperties: args.inScope ? args.inScope.split(',').map((s) => s.trim()) : [],
    scopeMode: args.scopeMode || 'HOST_AND_SUBDOMAINS',
    minIceScore: args.minIce ? Number(args.minIce) : 8.0,
  });

  return result;
}

function parseSowArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i];
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--run') args.runId = argv[++i];
    else if (a === '--live') args.live = true;
    else if (a === '--sample') args.sample = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--draft') args.draft = true;
    else if (a === '--client') args.client = argv[++i];
    else if (a === '--client-contact') args.clientContact = argv[++i];
    else if (a === '--supplier') args.supplier = argv[++i];
    else if (a === '--supplier-contact') args.supplierContact = argv[++i];
    else if (a === '--budget') args.budget = argv[++i];
    else if (a === '--budget-minor') args.budgetMinor = argv[++i];
    else if (a === '--term') args.term = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--json') args.format = 'json';
    else if (a === '--scope-mode' || a === '--scope') args.scopeMode = argv[++i];
    else if (a === '--in-scope') args.inScope = argv[++i];
    else if (a === '--min-ice') args.minIce = argv[++i];
    else args._.push(a);
  }
  return args;
}

