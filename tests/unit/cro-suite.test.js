import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCroSuite, formatCroSuiteOutput } from '../../src/commands/croSuite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('auditCroSuite runs end-to-end CRO intelligence audit over site fixture', async () => {
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const result = await auditCroSuite(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.com',
  });

  assert.equal(result.fact_status, 'modeled_cro_evaluation');
  assert.ok(result.total_pages_audited >= 1);
  assert.ok(typeof result.summary.conversion_readiness_score === 'number');
  assert.ok(typeof result.summary.atf_clarity_score === 'number');
  assert.ok(typeof result.summary.trust_credibility_score === 'number');
  assert.ok(result.experiment_backlog);
  assert.ok(result.ice_matrix);
  assert.ok(result.strategic_roadmap);
  assert.equal(result.strategic_roadmap.horizons.length, 3);

  const formatted = formatCroSuiteOutput(result);
  assert.ok(formatted.includes('Conversion Rate Optimization (CRO) & Journey Intelligence Suite'));
  assert.ok(formatted.includes('CORE PILLAR SCORES:'));
  assert.ok(formatted.includes('EXPERIMENTATION BACKLOG'));
  assert.ok(formatted.includes('30 / 90 / 180-DAY CRO STRATEGIC ROADMAP:'));
});
