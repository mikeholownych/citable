import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGeo } from '../../src/commands/inspectGeo.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('inspectGeo evaluates RAG chunkability, section density, and retrieval posture', async () => {
  const root = path.join(FIX, 'site-clean');
  const res = await inspectGeo(root, '/products/gatekeeper/', {
    target: path.join(FIX, 'site-clean'),
    baseUrl: 'https://example.test',
  });

  assert.ok(res.url);
  assert.equal(res.status, 200);
  assert.ok(res.retrieval_posture);
  assert.ok(res.rag_metrics.estimated_chunks_300w >= 1);
  assert.ok(typeof res.rag_metrics.average_words_per_chunk === 'number');
  assert.ok(Array.isArray(res.findings));
});
