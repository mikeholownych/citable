import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportDashboard } from '../../src/commands/reportDashboard.js';
import { init } from '../../src/commands/init.js';
import { writeJson } from '../../src/shared/io.js';

function createProjectWithRuns() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-dash-int-'));
  init(dir);
  const runsDir = path.join(dir, '.citable', 'runs');

  const runs = [
    {
      id: '2026-07-01T00:00:00Z-audit-aaa',
      manifest: { timestamp: '2026-07-01T00:00:00Z', command: 'audit' },
      summary: {
        by_severity: { critical: 3, high: 2, medium: 1 },
        posture: {
          retrieval_eligibility: { result: 'fail' },
          source_extraction_and_support: { result: 'fail' },
          observed_citation_behavior: { result: 'not_evidenced', citation_presence_rate: null },
        },
      },
    },
    {
      id: '2026-07-02T00:00:00Z-audit-bbb',
      manifest: { timestamp: '2026-07-02T00:00:00Z', command: 'audit' },
      summary: {
        by_severity: { critical: 1, high: 1, medium: 0 },
        posture: {
          retrieval_eligibility: { result: 'partial' },
          source_extraction_and_support: { result: 'partial' },
          observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.5 },
        },
      },
    },
    {
      id: '2026-07-03T00:00:00Z-audit-ccc',
      manifest: { timestamp: '2026-07-03T00:00:00Z', command: 'audit' },
      summary: {
        by_severity: { critical: 0, high: 0, medium: 0 },
        posture: {
          retrieval_eligibility: { result: 'pass' },
          source_extraction_and_support: { result: 'pass' },
          observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.9 },
        },
      },
    },
  ];

  for (const run of runs) {
    const runPath = path.join(runsDir, run.id);
    fs.mkdirSync(runPath, { recursive: true });
    writeJson(path.join(runPath, 'manifest.json'), run.manifest);
    writeJson(path.join(runPath, 'summary.json'), run.summary);
  }

  return { dir, runs };
}

test('reportDashboard produces Markdown and HTML artifacts from audit run history', () => {
  const { dir, runs } = createProjectWithRuns();

  const result = reportDashboard(dir);
  assert.equal(result.included, 3);
  assert.equal(result.skipped, 0);
  assert.equal(result.dir, path.join(dir, '.citable', 'reports'));
  assert.ok(fs.existsSync(result.path_md));
  assert.ok(fs.existsSync(result.path_html));

  const md = fs.readFileSync(result.path_md, 'utf8');
  assert.match(md, /# Citable evidence dashboard/);
  assert.match(md, /- Audit runs included: 3/);
  assert.match(md, /- Runs skipped: 0/);
  assert.doesNotMatch(md, /## Insufficient history/);
  for (const run of runs) {
    assert.match(md, new RegExp(run.id));
  }
  assert.match(md, /\| `2026-07-01T00:00:00Z-audit-aaa` \| 2026-07-01T00:00:00Z \| 3 \| 2 \| 1 \| fail \| fail \| not evidenced \|/);
  assert.match(md, /\| `2026-07-02T00:00:00Z-audit-bbb` \| 2026-07-02T00:00:00Z \| 1 \| 1 \| 0 \| partial \| partial \| 50\.0% \|/);
  assert.match(md, /\| `2026-07-03T00:00:00Z-audit-ccc` \| 2026-07-03T00:00:00Z \| 0 \| 0 \| 0 \| pass \| pass \| 90\.0% \|/);

  const html = fs.readFileSync(result.path_html, 'utf8');
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Citable evidence dashboard<\/title>/);
  assert.match(html, /<polyline points="[^"]+" fill="none" stroke="#2f6f4f"/);
  assert.match(html, /2026-07-01T00:00:00Z-audit-aaa/);
  assert.match(html, /2026-07-03T00:00:00Z-audit-ccc/);
});

test('reportDashboard filters by --last and --since', () => {
  const { dir } = createProjectWithRuns();

  // Test --last 2
  const lastRes = reportDashboard(dir, { last: 2 });
  assert.equal(lastRes.included, 2);
  const lastMd = fs.readFileSync(lastRes.path_md, 'utf8');
  assert.doesNotMatch(lastMd, /2026-07-01T00:00:00Z-audit-aaa/);
  assert.match(lastMd, /2026-07-02T00:00:00Z-audit-bbb/);
  assert.match(lastMd, /2026-07-03T00:00:00Z-audit-ccc/);

  // Test --since
  const sinceRes = reportDashboard(dir, { since: '2026-07-02T00:00:00Z-audit-bbb' });
  assert.equal(sinceRes.included, 2);
  const sinceMd = fs.readFileSync(sinceRes.path_md, 'utf8');
  assert.doesNotMatch(sinceMd, /2026-07-01T00:00:00Z-audit-aaa/);
  assert.match(sinceMd, /2026-07-02T00:00:00Z-audit-bbb/);
  assert.match(sinceMd, /2026-07-03T00:00:00Z-audit-ccc/);

  // Test --last 1 (produces insufficient history state)
  const singleRes = reportDashboard(dir, { last: 1 });
  assert.equal(singleRes.included, 1);
  const singleMd = fs.readFileSync(singleRes.path_md, 'utf8');
  assert.match(singleMd, /## Insufficient history/);
  assert.match(singleMd, /Only one audit run is available/);
});

test('reportDashboard rejects non-positive-integer --last', () => {
  const { dir } = createProjectWithRuns();

  assert.throws(() => reportDashboard(dir, { last: 0 }), /--last must be a positive integer/);
  assert.throws(() => reportDashboard(dir, { last: -2 }), /--last must be a positive integer/);
  assert.throws(() => reportDashboard(dir, { last: 1.5 }), /--last must be a positive integer/);
  assert.throws(() => reportDashboard(dir, { last: 'invalid' }), /--last must be a positive integer/);
});

test('reportDashboard handles zero prior runs without error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-dash-empty-'));
  init(dir);

  const result = reportDashboard(dir);
  assert.equal(result.included, 0);
  assert.equal(result.skipped, 0);
  assert.ok(fs.existsSync(result.path_md));
  assert.ok(fs.existsSync(result.path_html));

  const md = fs.readFileSync(result.path_md, 'utf8');
  assert.match(md, /## Insufficient history/);
  assert.match(md, /No audit run in `\.citable\/runs\/` recorded a summary/);
});

test('reportDashboard reports skipped runs in markdown and html', () => {
  const { dir } = createProjectWithRuns();
  const runsDir = path.join(dir, '.citable', 'runs');

  // Corrupted run
  const corruptDir = path.join(runsDir, '2026-07-04T00:00:00Z-audit-corrupt');
  fs.mkdirSync(corruptDir, { recursive: true });
  fs.writeFileSync(path.join(corruptDir, 'summary.json'), '{ invalid json');

  // Observation run (no by_severity)
  const observeDir = path.join(runsDir, '2026-07-05T00:00:00Z-observe-bing');
  fs.mkdirSync(observeDir, { recursive: true });
  writeJson(path.join(observeDir, 'manifest.json'), { timestamp: '2026-07-05T00:00:00Z' });
  writeJson(path.join(observeDir, 'summary.json'), { queries_checked: 10 });

  const result = reportDashboard(dir);
  assert.equal(result.included, 3);
  assert.equal(result.skipped, 2);

  const md = fs.readFileSync(result.path_md, 'utf8');
  assert.match(md, /## Skipped runs/);
  assert.match(md, /`2026-07-04T00:00:00Z-audit-corrupt`/);
  assert.match(md, /`2026-07-05T00:00:00Z-observe-bing`/);

  const html = fs.readFileSync(result.path_html, 'utf8');
  assert.match(html, /<h2>Skipped runs<\/h2>/);
  assert.match(html, /2026-07-04T00:00:00Z-audit-corrupt/);
  assert.match(html, /2026-07-05T00:00:00Z-observe-bing/);
});
