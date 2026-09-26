#!/usr/bin/env node
import { validateConditionRegistry } from '../src/conditions/registry.js';

const result = validateConditionRegistry();

if (!result.ok) {
  console.error(`Condition registry validation failed with ${result.errors.length} error(s):`);
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`OK: Condition registry valid (${result.total_conditions} conditions verified).`);
