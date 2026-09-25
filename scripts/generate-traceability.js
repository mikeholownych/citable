#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALL_DETECTORS } from '../src/detectors/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX_PATH = path.join(ROOT, 'docs', 'architecture', 'traceability-matrix.md');

const BEGIN_MARKER = '<!-- BEGIN GENERATED DETECTOR TRACEABILITY MATRIX -->';
const END_MARKER = '<!-- END GENERATED DETECTOR TRACEABILITY MATRIX -->';

export function sortDetectors(detectors) {
  return [...detectors].sort((a, b) => {
    const partsA = a.id.split('-');
    const partsB = b.id.split('-');
    if (partsA[0] !== partsB[0]) return partsA[0].localeCompare(partsB[0]);
    const numA = Number.parseInt(partsA[1], 10) || 0;
    const numB = Number.parseInt(partsB[1], 10) || 0;
    return numA - numB;
  });
}

export function buildDetectorMatrixTable(detectors = ALL_DETECTORS) {
  const sorted = sortDetectors(detectors);
  const rows = [
    '| Detector ID | Name | Namespace | Severity | Applicable Requirement |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const d of sorted) {
    const req = (d.applicable_requirement || '').replace(/\|/g, '\\|').trim();
    const name = (d.name || '').replace(/\|/g, '\\|').trim();
    rows.push(`| ${d.id} | ${name} | ${d.namespace} | ${d.severity} | ${req} |`);
  }

  return rows.join('\n');
}

export function generateMatrixDocument(currentContent, detectors = ALL_DETECTORS) {
  const generatedTable = buildDetectorMatrixTable(detectors);
  const block = `${BEGIN_MARKER}\n${generatedTable}\n${END_MARKER}`;

  if (currentContent.includes(BEGIN_MARKER) && currentContent.includes(END_MARKER)) {
    const start = currentContent.indexOf(BEGIN_MARKER);
    const end = currentContent.indexOf(END_MARKER) + END_MARKER.length;
    return `${currentContent.slice(0, start)}${block}${currentContent.slice(end)}`;
  }

  // If markers not present, append section at the end
  const trimmed = currentContent.trimEnd();
  return `${trimmed}\n\n## Shipped Detector Traceability Matrix\n\n${block}\n`;
}

export function checkTraceabilityMatrix(root = ROOT) {
  const filePath = path.join(root, 'docs', 'architecture', 'traceability-matrix.md');
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Traceability matrix file not found: ${filePath}` };
  }
  const currentContent = fs.readFileSync(filePath, 'utf8');
  const expectedContent = generateMatrixDocument(currentContent, ALL_DETECTORS);
  if (currentContent !== expectedContent) {
    return {
      ok: false,
      error: 'Committed traceability matrix differs from generated matrix. Run "node scripts/generate-traceability.js" to reconcile.',
    };
  }
  return { ok: true, detectorCount: ALL_DETECTORS.length };
}

export function updateTraceabilityMatrix(root = ROOT) {
  const filePath = path.join(root, 'docs', 'architecture', 'traceability-matrix.md');
  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const expectedContent = generateMatrixDocument(currentContent, ALL_DETECTORS);
  fs.writeFileSync(filePath, expectedContent);
  return { updated: true, detectorCount: ALL_DETECTORS.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const isCheck = process.argv.includes('--check');
  if (isCheck) {
    const result = checkTraceabilityMatrix(ROOT);
    if (!result.ok) {
      console.error(`ERROR: ${result.error}`);
      process.exit(1);
    }
    console.log(`OK: Traceability matrix matches generated detector metadata (${result.detectorCount} detectors).`);
  } else {
    const result = updateTraceabilityMatrix(ROOT);
    console.log(`Updated ${MATRIX_PATH} with ${result.detectorCount} detectors.`);
  }
}
