import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAeo } from '../../src/commands/inspectAeo.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('inspectAeo evaluates answer extractability, question density, and structure', async () => {
  const root = path.join(FIX, 'site-clean');
  const res = await inspectAeo(root, '/learn/execution-governance/', {
    target: path.join(FIX, 'site-clean'),
    baseUrl: 'https://example.test',
  });

  assert.ok(res.url);
  assert.equal(res.status, 200);
  assert.ok(res.extractability_status);
  assert.ok(res.headings.total >= 1);
  assert.equal(res.answer_structure.has_copular_definition, true);
  assert.ok(Array.isArray(res.headings.questions));
  assert.ok(Array.isArray(res.findings));
});
