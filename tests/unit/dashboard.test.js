import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildTimeSeries,
  loadRunHistory,
  renderDashboardHtml,
  renderDashboardMarkdown,
} from '../../src/reporting/dashboard.js';
import { writeJson } from '../../src/shared/io.js';

function makeRun(runId, timestamp, severity, posture) {
  return {
    run_id: runId,
    manifest: { timestamp, command: 'audit' },
    summary: {
      by_severity: severity,
      posture: posture ?? {
        retrieval_eligibility: { result: 'pass' },
        source_extraction_and_support: { result: 'pass' },
        observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.8 },
      },
    },
  };
}

test('buildTimeSeries maps loaded runs into parallel series arrays', () => {
  const runs = [
    makeRun('2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z', { critical: 3, high: 2, medium: 1 }, {
      retrieval_eligibility: { result: 'fail' },
      source_extraction_and_support: { result: 'partial' },
      observed_citation_behavior: { result: 'not_evidenced', citation_presence_rate: null },
    }),
    makeRun('2026-07-02T00:00:00Z-audit-2', '2026-07-02T00:00:00Z', { critical: 1, high: 1, medium: 2 }, {
      retrieval_eligibility: { result: 'partial' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.6 },
    }),
    makeRun('2026-07-03T00:00:00Z-audit-3', '2026-07-03T00:00:00Z', { critical: 0, high: 0, medium: 1 }, {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.95 },
    }),
  ];

  const series = buildTimeSeries(runs);
  assert.deepEqual(series.run_ids, [
    '2026-07-01T00:00:00Z-audit-1',
    '2026-07-02T00:00:00Z-audit-2',
    '2026-07-03T00:00:00Z-audit-3',
  ]);
  assert.deepEqual(series.timestamps, [
    '2026-07-01T00:00:00Z',
    '2026-07-02T00:00:00Z',
    '2026-07-03T00:00:00Z',
  ]);
  assert.deepEqual(series.by_severity_series, [
    { critical: 3, high: 2, medium: 1 },
    { critical: 1, high: 1, medium: 2 },
    { critical: 0, high: 0, medium: 1 },
  ]);
  assert.deepEqual(series.retrieval_eligibility_series, ['fail', 'partial', 'pass']);
  assert.deepEqual(series.source_extraction_series, ['partial', 'pass', 'pass']);
  assert.deepEqual(series.citation_presence_rate_series, [null, 0.6, 0.95]);
});

test('renderDashboardMarkdown renders a multi-run improving trend without insufficient history warning', () => {
  const runs = [
    makeRun('2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z', { critical: 2, high: 1, medium: 4 }, {
      retrieval_eligibility: { result: 'fail' },
      source_extraction_and_support: { result: 'fail' },
      observed_citation_behavior: { result: 'not_evidenced', citation_presence_rate: null },
    }),
    makeRun('2026-07-02T00:00:00Z-audit-2', '2026-07-02T00:00:00Z', { critical: 1, high: 0, medium: 2 }, {
      retrieval_eligibility: { result: 'partial' },
      source_extraction_and_support: { result: 'partial' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.5 },
    }),
    makeRun('2026-07-03T00:00:00Z-audit-3', '2026-07-03T00:00:00Z', { critical: 0, high: 0, medium: 1 }, {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.9 },
    }),
  ];

  const series = buildTimeSeries(runs);
  const md = renderDashboardMarkdown(series);

  assert.match(md, /# Citable evidence dashboard/);
  assert.match(md, /- Audit runs included: 3/);
  assert.match(md, /- Runs skipped: 0/);
  assert.match(md, /Window: `2026-07-01T00:00:00Z-audit-1` → `2026-07-03T00:00:00Z-audit-3`/);
  assert.doesNotMatch(md, /## Insufficient history/);
  assert.match(md, /\| `2026-07-01T00:00:00Z-audit-1` \| 2026-07-01T00:00:00Z \| 2 \| 1 \| 4 \| fail \| fail \| not evidenced \|/);
  assert.match(md, /\| `2026-07-02T00:00:00Z-audit-2` \| 2026-07-02T00:00:00Z \| 1 \| 0 \| 2 \| partial \| partial \| 50\.0% \|/);
  assert.match(md, /\| `2026-07-03T00:00:00Z-audit-3` \| 2026-07-03T00:00:00Z \| 0 \| 0 \| 1 \| pass \| pass \| 90\.0% \|/);
  assert.match(md, /A lower count is an observed difference between runs, not proof that a condition was fixed/);
});

test('renderDashboardMarkdown reports explicit insufficient history for 1 run', () => {
  const runs = [
    makeRun('2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z', { critical: 1, high: 2, medium: 0 }),
  ];
  const series = buildTimeSeries(runs);
  const md = renderDashboardMarkdown(series);

  assert.match(md, /## Insufficient history/);
  assert.match(md, /Only one audit run is available\. A single point establishes no trend/);
  assert.match(md, /## Run history/);
  assert.match(md, /\| `2026-07-01T00:00:00Z-audit-1` \|/);
});

test('renderDashboardMarkdown reports explicit insufficient history for 0 runs', () => {
  const series = buildTimeSeries([]);
  const md = renderDashboardMarkdown(series);

  assert.match(md, /## Insufficient history/);
  assert.match(md, /No audit run in `\.citable\/runs\/` recorded a summary\. No trend is established/);
  assert.doesNotMatch(md, /## Run history/);
});

test('renderDashboardMarkdown lists skipped runs with reasons', () => {
  const series = buildTimeSeries([]);
  const skipped = [
    { run_id: 'run-bad-json', reason: 'Unexpected token' },
    { run_id: 'run-observe', reason: 'summary.json records no by_severity or posture' },
  ];
  const md = renderDashboardMarkdown(series, skipped);

  assert.match(md, /- Runs skipped: 2/);
  assert.match(md, /## Skipped runs/);
  assert.match(md, /- `run-bad-json`: Unexpected token/);
  assert.match(md, /- `run-observe`: summary\.json records no by_severity or posture/);
});

test('renderDashboardHtml renders sparkline SVG and posture badges for 3 runs', () => {
  const runs = [
    makeRun('2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z', { critical: 2, high: 2, medium: 1 }, {
      retrieval_eligibility: { result: 'fail' },
      source_extraction_and_support: { result: 'fail' },
      observed_citation_behavior: { result: 'not_evidenced', citation_presence_rate: null },
    }),
    makeRun('2026-07-02T00:00:00Z-audit-2', '2026-07-02T00:00:00Z', { critical: 1, high: 1, medium: 2 }, {
      retrieval_eligibility: { result: 'partial' },
      source_extraction_and_support: { result: 'partial' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.4 },
    }),
    makeRun('2026-07-03T00:00:00Z-audit-3', '2026-07-03T00:00:00Z', { critical: 0, high: 0, medium: 1 }, {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.8 },
    }),
  ];

  const series = buildTimeSeries(runs);
  const html = renderDashboardHtml(series);

  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Citable evidence dashboard<\/title>/);
  assert.doesNotMatch(html, /class="insufficient"/);
  assert.match(html, /<polyline points="[^"]+" fill="none" stroke="#2f6f4f" stroke-width="2" \/>/);
  assert.match(html, /class="posture posture-fail"/);
  assert.match(html, /class="posture posture-partial"/);
  assert.match(html, /class="posture posture-pass"/);
  assert.match(html, /<td><code>2026-07-01T00:00:00Z-audit-1<\/code><\/td>/);
});

test('renderDashboardHtml renders insufficient history section when fewer than 2 runs', () => {
  const runs = [
    makeRun('2026-07-01T00:00:00Z-audit-1', '2026-07-01T00:00:00Z', { critical: 1, high: 0, medium: 1 }),
  ];
  const series = buildTimeSeries(runs);
  const html = renderDashboardHtml(series);

  assert.match(html, /class="insufficient"/);
  assert.match(html, /Only one audit run is available/);
  assert.match(html, /Fewer than two runs recorded a numeric value for this series/);
});

test('loadRunHistory handles valid, malformed, and non-audit runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-load-history-'));
  const runsDir = path.join(dir, '.citable', 'runs');

  // Valid audit run 1
  const r1 = path.join(runsDir, '2026-07-01T00:00:00Z-audit-1');
  fs.mkdirSync(r1, { recursive: true });
  writeJson(path.join(r1, 'manifest.json'), { timestamp: '2026-07-01T00:00:00Z', command: 'audit' });
  writeJson(path.join(r1, 'summary.json'), {
    by_severity: { critical: 1, high: 0, medium: 1 },
    posture: {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.8 },
    },
  });

  // Valid audit run 2
  const r2 = path.join(runsDir, '2026-07-02T00:00:00Z-audit-2');
  fs.mkdirSync(r2, { recursive: true });
  writeJson(path.join(r2, 'manifest.json'), { timestamp: '2026-07-02T00:00:00Z', command: 'audit' });
  writeJson(path.join(r2, 'summary.json'), {
    by_severity: { critical: 0, high: 0, medium: 0 },
    posture: {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
      observed_citation_behavior: { result: 'observed', citation_presence_rate: 0.9 },
    },
  });

  // Run with malformed summary.json
  const rBadJson = path.join(runsDir, '2026-07-03T00:00:00Z-audit-badjson');
  fs.mkdirSync(rBadJson, { recursive: true });
  writeJson(path.join(rBadJson, 'manifest.json'), { timestamp: '2026-07-03T00:00:00Z' });
  fs.writeFileSync(path.join(rBadJson, 'summary.json'), '{ this is not valid json }');

  // Observation run (no by_severity or posture)
  const rObserve = path.join(runsDir, '2026-07-04T00:00:00Z-observe-probe');
  fs.mkdirSync(rObserve, { recursive: true });
  writeJson(path.join(rObserve, 'manifest.json'), { timestamp: '2026-07-04T00:00:00Z' });
  writeJson(path.join(rObserve, 'summary.json'), { total_probes: 5, responses: 5 });

  // Run with missing manifest.json
  const rNoManifest = path.join(runsDir, '2026-07-05T00:00:00Z-audit-nomanifest');
  fs.mkdirSync(rNoManifest, { recursive: true });
  writeJson(path.join(rNoManifest, 'summary.json'), {
    by_severity: { critical: 0, high: 0, medium: 0 },
    posture: {
      retrieval_eligibility: { result: 'pass' },
      source_extraction_and_support: { result: 'pass' },
    },
  });

  const { included, skipped } = loadRunHistory(dir);
  assert.equal(included.length, 2);
  assert.equal(included[0].run_id, '2026-07-01T00:00:00Z-audit-1');
  assert.equal(included[1].run_id, '2026-07-02T00:00:00Z-audit-2');

  assert.equal(skipped.length, 3);
  const skippedMap = new Map(skipped.map((s) => [s.run_id, s.reason]));
  assert.ok(skippedMap.has('2026-07-03T00:00:00Z-audit-badjson'));
  assert.ok(skippedMap.get('2026-07-04T00:00:00Z-observe-probe').includes('records no by_severity or posture'));
  assert.ok(skippedMap.has('2026-07-05T00:00:00Z-audit-nomanifest'));

  // Test since filter
  const sinceResult = loadRunHistory(dir, { since: '2026-07-02' });
  assert.equal(sinceResult.included.length, 1);
  assert.equal(sinceResult.included[0].run_id, '2026-07-02T00:00:00Z-audit-2');

  // Test last filter
  const lastResult = loadRunHistory(dir, { last: 1 });
  assert.equal(lastResult.included.length, 1);
  assert.equal(lastResult.included[0].run_id, '2026-07-02T00:00:00Z-audit-2');
});
