import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  verifyCustomerArtifact,
  verifyCustomerArtifactCommand,
  CustomerArtifactVerificationError,
} from '../../src/artifacts/verifyCustomerArtifact.js';
import { generateSow } from '../../src/sow/generateSow.js';
import { buildExecutiveSearchReport } from '../../src/reporting/executiveSearchReport.js';
import { buildExecutiveCroReport } from '../../src/reporting/executiveCroReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('verifyCustomerArtifact passes valid SOW, Search Report, and CRO Report artifacts', async () => {
  // 1. Valid SOW
  const sow = await generateSow(repoRoot, {
    client: 'Acme Enterprise',
    budget: 50000,
    termDays: 60,
    sample: true,
  });
  const sowResult = await verifyCustomerArtifact(sow);
  assert.equal(sowResult.valid, true, `SOW verification failed: ${sowResult.errors.join('; ')}`);
  assert.equal(sowResult.artifact_type, 'SOW');

  // 2. Valid Search Report
  const searchReport = await buildExecutiveSearchReport(repoRoot, {
    sample: true,
    clientName: 'Acme Corp',
  });
  const searchResult = await verifyCustomerArtifact(searchReport);
  assert.equal(searchResult.valid, true, `Search report verification failed: ${searchResult.errors.join('; ')}`);
  assert.equal(searchResult.artifact_type, 'SEARCH_REPORT');

  // 3. Valid CRO Report
  const fixtureSite = path.resolve(repoRoot, 'tests/fixtures/golden-corpus');
  const croReport = await buildExecutiveCroReport(repoRoot, {
    target: fixtureSite,
    baseUrl: 'https://example.test',
    clientName: 'Acme SaaS',
  });
  const croResult = await verifyCustomerArtifact(croReport);
  assert.equal(croResult.valid, true, `CRO report verification failed: ${croResult.errors.join('; ')}`);
  assert.equal(croResult.artifact_type, 'CRO_REPORT');
});

test('verifyCustomerArtifact catches arithmetic drift and contractual violations in SOW', async () => {
  const baseSow = await generateSow(repoRoot, {
    client: 'Acme Corp',
    budget: 30000,
    termDays: 60,
    sample: true,
  });

  // Arithmetic mismatch
  const badMathSow = JSON.parse(JSON.stringify(baseSow));
  badMathMathSowFee: badMathSow.commercial_total_fee_minor = 3000001; // $30,000.01 vs $30,000.00
  const mathRes = await verifyCustomerArtifact(badMathSow);
  assert.equal(mathRes.valid, false);
  assert.ok(mathRes.errors.some((e) => e.includes('fee mismatch')));

  // Contractual mode with synthetic evidence
  const badContractualSow = JSON.parse(JSON.stringify(baseSow));
  badContractualSow.generation_mode = 'CONTRACTUAL';
  badContractualSow.synthetic_evidence = true;
  const contractRes = await verifyCustomerArtifact(badContractualSow);
  assert.equal(contractRes.valid, false);
  assert.ok(contractRes.errors.some((e) => e.includes('synthetic_evidence')));

  // Contractual mode with template default owner
  const badOwnerSow = JSON.parse(JSON.stringify(baseSow));
  badOwnerSow.generation_mode = 'CONTRACTUAL';
  badOwnerSow.synthetic_evidence = false;
  badOwnerSow.traceability_matrix[0].owner_source = 'built_in_template_default';
  const ownerRes = await verifyCustomerArtifact(badOwnerSow);
  assert.equal(ownerRes.valid, false);
  assert.ok(ownerRes.errors.some((e) => e.includes('built_in_template_default')));
});

test('verifyCustomerArtifact detects unescaped script and event injections', async () => {
  const baseSow = await generateSow(repoRoot, {
    client: 'Acme Corp',
    budget: 30000,
    sample: true,
  });

  const injectedSow = JSON.parse(JSON.stringify(baseSow));
  injectedSow.client.name = '<script>alert("xss")</script>';

  const res = await verifyCustomerArtifact(injectedSow);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Potential unescaped script')));

  // failClosed throws CustomerArtifactVerificationError
  await assert.rejects(
    async () => verifyCustomerArtifact(injectedSow, { failClosed: true }),
    CustomerArtifactVerificationError
  );
});

test('verifyCustomerArtifactCommand CLI verifies on-disk artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-artifact-test-'));
  const sowFile = path.join(tmpDir, 'sow.json');

  const sow = await generateSow(repoRoot, {
    client: 'CLI Test Client',
    budget: 25000,
    sample: true,
  });
  fs.writeFileSync(sowFile, JSON.stringify(sow, null, 2), 'utf8');

  const cliRes = await verifyCustomerArtifactCommand(sowFile, [], repoRoot);
  assert.equal(cliRes.valid, true);
  assert.ok(cliRes.message.includes('SUCCESS'));

  // Non-existent file
  const missingRes = await verifyCustomerArtifactCommand(path.join(tmpDir, 'nonexistent.json'), [], repoRoot);
  assert.equal(missingRes.valid, false);
  assert.ok(missingRes.errors[0].includes('not found'));
});
