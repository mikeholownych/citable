import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyPersistence,
  loadFindingsIndex,
  getFindingIdentity,
  reconcileFindingIdentities,
} from '../../src/evidence/findingIdentity.js';
import { audit } from '../../src/commands/audit.js';
import { init } from '../../src/commands/init.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';
import { readJson } from '../../src/shared/io.js';

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-finding-id-'));
  init(dir);
  return dir;
}

test('classifyPersistence correctly maps occurrence counts to TRANSIENT, RECURRENT, and PERSISTENT', () => {
  assert.equal(classifyPersistence(1), 'TRANSIENT');
  assert.equal(classifyPersistence(2), 'RECURRENT');
  assert.equal(classifyPersistence(3), 'PERSISTENT');
  assert.equal(classifyPersistence(10), 'PERSISTENT');
});

test('reconcileFindingIdentities tracks identity, first_seen, and persistence across multiple runs', () => {
  const root = tmpDir();
  const findingId = 'F-test123';
  const t1 = '2026-07-01T10:00:00.000Z';
  const t2 = '2026-07-02T10:00:00.000Z';
  const t3 = '2026-07-03T10:00:00.000Z';

  // Run 1
  const findings1 = [{
    finding_id: findingId,
    detector_id: 'TECH-001',
    timestamp: t1,
    status: { state: 'open' },
  }];
  reconcileFindingIdentities(root, findings1, { runId: 'run-1', timestamp: t1 });

  assert.equal(findings1[0].status.first_seen, t1);
  assert.equal(findings1[0].status.last_seen, t1);
  assert.equal(findings1[0].status.occurrence_count, 1);
  assert.equal(findings1[0].status.persistence, 'TRANSIENT');

  // Verify index directly without reading run directory
  const indexed1 = getFindingIdentity(root, findingId);
  assert.ok(indexed1);
  assert.equal(indexed1.first_seen, t1);
  assert.equal(indexed1.occurrence_count, 1);
  assert.equal(indexed1.persistence, 'TRANSIENT');

  // Run 2
  const findings2 = [{
    finding_id: findingId,
    detector_id: 'TECH-001',
    timestamp: t2,
    status: { state: 'open' },
  }];
  reconcileFindingIdentities(root, findings2, { runId: 'run-2', timestamp: t2 });

  assert.equal(findings2[0].status.first_seen, t1, 'first_seen must reflect earliest run');
  assert.equal(findings2[0].status.last_seen, t2);
  assert.equal(findings2[0].status.occurrence_count, 2);
  assert.equal(findings2[0].status.persistence, 'RECURRENT');

  // Run 3
  const findings3 = [{
    finding_id: findingId,
    detector_id: 'TECH-001',
    timestamp: t3,
    status: { state: 'open' },
  }];
  reconcileFindingIdentities(root, findings3, { runId: 'run-3', timestamp: t3 });

  assert.equal(findings3[0].status.first_seen, t1, 'first_seen must persist from run 1');
  assert.equal(findings3[0].status.last_seen, t3);
  assert.equal(findings3[0].status.occurrence_count, 3);
  assert.equal(findings3[0].status.persistence, 'PERSISTENT');

  const finalIndexed = getFindingIdentity(root, findingId);
  assert.equal(finalIndexed.occurrence_count, 3);
  assert.equal(finalIndexed.persistence, 'PERSISTENT');
});

test('audit command integrates finding persistence across repeated runs without re-reading run directories', async () => {
  const root = tmpDir();
  const siteDir = path.join(root, 'site');
  fs.mkdirSync(siteDir, { recursive: true });
  // Create an index-target page with missing title and empty H1 to trigger deterministic detectors
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><html><head></head><body><h1></h1></body></html>');

  const run1 = await audit(root, { target: siteDir });
  assert.ok(run1.findings.length > 0);
  const sample1 = run1.findings[0];
  assert.equal(sample1.status.occurrence_count, 1);
  assert.equal(sample1.status.persistence, 'TRANSIENT');
  const firstSeen = sample1.status.first_seen;
  assert.ok(firstSeen);

  // Validate run 1 findings against schema
  for (const f of run1.findings) {
    const { valid, errors } = validateAgainst('finding.schema.json', f);
    assert.ok(valid, `Finding ${f.finding_id} must be schema-valid: ${errors?.join('; ')}`);
  }

  // Second audit on same property
  const run2 = await audit(root, { target: siteDir });
  const sample2 = run2.findings.find((f) => f.finding_id === sample1.finding_id);
  assert.ok(sample2);
  assert.equal(sample2.status.first_seen, firstSeen, 'first_seen must match earliest run');
  assert.equal(sample2.status.occurrence_count, 2);
  assert.equal(sample2.status.persistence, 'RECURRENT');

  // Verify findings-index.json exists in .citable and contains the finding
  const index = loadFindingsIndex(root);
  assert.ok(index.findings[sample1.finding_id]);
  assert.equal(index.findings[sample1.finding_id].occurrence_count, 2);
  assert.equal(index.findings[sample1.finding_id].persistence, 'RECURRENT');
  assert.equal(index.findings[sample1.finding_id].first_seen, firstSeen);
});
