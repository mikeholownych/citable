import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DETECTORS } from '../../src/detectors/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function getActualDetectorNamespaces() {
  return [...new Set(ALL_DETECTORS.map((d) => d.namespace))].sort();
}

export function parseReadmeNamespaces(readmeContent) {
  const match = readmeContent.match(/\*\*(\d+)\s+detectors\*\*\s+across\s+(\d+)\s+namespaces\s*\(([^)]+)\)/i);
  if (!match) throw new Error('Could not find detector namespace list in README.md');
  const count = Number.parseInt(match[1], 10);
  const nsCount = Number.parseInt(match[2], 10);
  const namespaces = match[3]
    .replace(/\s+/g, ' ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  return { count, nsCount, namespaces };
}

export function parseRoadmapCounters(roadmapContent) {
  const detectorMatch = roadmapContent.match(/\|\s*Detectors\s*\|\s*(\d+)\s+across\s+(\d+)\s+namespaces\s*\|/i);
  const testMatch = roadmapContent.match(/\|\s*Tests\s*\|\s*(\d+)\s+pass/i);
  const schemaMatch = roadmapContent.match(/\|\s*Schemas\s*\|\s*(\d+)\s+schema\s+definitions\s*\|/i);
  const registryMatch = roadmapContent.match(/\|\s*Registries\s*\|\s*(\d+)\s+schema-validated\s*\|/i);

  return {
    detectorCount: detectorMatch ? Number.parseInt(detectorMatch[1], 10) : null,
    namespaceCount: detectorMatch ? Number.parseInt(detectorMatch[2], 10) : null,
    testCount: testMatch ? Number.parseInt(testMatch[1], 10) : null,
    schemaCount: schemaMatch ? Number.parseInt(schemaMatch[1], 10) : null,
    registryCount: registryMatch ? Number.parseInt(registryMatch[1], 10) : null,
  };
}

export function countActualTests(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countActualTests(full);
    } else if (entry.name.endsWith('.test.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const matches = content.match(/(?:^|\s)(?:test|it)\s*\(/g);
      if (matches) count += matches.length;
    }
  }
  return count;
}

test('README detector namespaces match ALL_DETECTORS exactly', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const { count, nsCount, namespaces } = parseReadmeNamespaces(readme);
  const actualNamespaces = getActualDetectorNamespaces();

  assert.equal(count, ALL_DETECTORS.length);
  assert.equal(nsCount, actualNamespaces.length);
  assert.deepEqual(namespaces, actualNamespaces);
});

test('README namespace assertion rejects non-namespaces (AEO, EXP, CONF, SEC mutation proof)', () => {
  const badReadme = '- **181 detectors** across 19 namespaces (TECH, CRAWL, ARCH, PAGE, ANS, SCHEMA, CWV, GEO, AEO, CLAIM, EVD, LIFE, AGENT, MEAS, EXP, CONF, SEC, LINK, CRO)';
  const { namespaces } = parseReadmeNamespaces(badReadme);
  const actualNamespaces = getActualDetectorNamespaces();

  assert.notDeepEqual(namespaces, actualNamespaces);
  const bogus = ['AEO', 'EXP', 'CONF', 'SEC'];
  for (const b of bogus) {
    assert.ok(namespaces.includes(b), `bad list must include ${b}`);
    assert.ok(!actualNamespaces.includes(b), `tree must NOT have ${b} as detector namespace`);
  }
  const missingFromBad = ['ENTITY', 'EXT', 'HREFLANG', 'RECO'];
  for (const m of missingFromBad) {
    assert.ok(!namespaces.includes(m), `bad list must omit ${m}`);
    assert.ok(actualNamespaces.includes(m), `tree must have ${m}`);
  }
});

test('ROADMAP and README counters match source tree detector and schema counts', () => {
  const roadmap = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
  const counters = parseRoadmapCounters(roadmap);
  const actualNamespaces = getActualDetectorNamespaces();

  assert.equal(counters.detectorCount, ALL_DETECTORS.length);
  assert.equal(counters.namespaceCount, actualNamespaces.length);

  const schemaFiles = fs.readdirSync(path.join(ROOT, 'schemas')).filter((f) => f.endsWith('.json'));
  assert.equal(counters.schemaCount, schemaFiles.length);

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const readmeSchemaMatch = readme.match(/\|\s*`schemas\/`\s*\|\s*(\d+)\s+JSON\s+Schemas/i);
  assert.ok(readmeSchemaMatch, 'README must state schema count');
  assert.equal(Number.parseInt(readmeSchemaMatch[1], 10), schemaFiles.length);
});

test('ROADMAP test counter matches tree test count', () => {
  const roadmap = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
  const counters = parseRoadmapCounters(roadmap);
  const treeTestCount = countActualTests(path.join(ROOT, 'tests'));

  assert.equal(counters.testCount, treeTestCount);
});
