import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildConsensusMatrix,
  loadConsensusRuns,
  renderConsensusHtml,
  renderConsensusMarkdown,
} from '../../src/reporting/consensus.js';
import { reportConsensus } from '../../src/commands/reportConsensus.js';
import { init } from '../../src/commands/init.js';

function createMockConsensusRun(runsDir, runId, observations, manifest = {}) {
  const runDir = path.join(runsDir, runId);
  const obsDir = path.join(runDir, 'observations');
  fs.mkdirSync(obsDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({
    command: 'observe consensus',
    timestamp: '2026-09-08T00:00:00Z',
    target: { location: 'https://example.test' },
    ...manifest,
  }));
  observations.forEach((obs, idx) => {
    fs.writeFileSync(
      path.join(obsDir, `${String(idx + 1).padStart(4, '0')}-canonical_freshness.json`),
      JSON.stringify(obs),
    );
  });
}

test('loadConsensusRuns loads runs containing canonical_freshness observations and filters by window', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-load-consensus-'));
  init(root);
  const runsDir = path.join(root, '.citable', 'runs');

  createMockConsensusRun(runsDir, '2026-09-01T00:00:00Z-consensus-1', [{
    kind: 'canonical_freshness',
    data: { url: 'https://example.test/1', canonical_consensus: true },
  }]);
  createMockConsensusRun(runsDir, '2026-09-02T00:00:00Z-consensus-2', [{
    kind: 'canonical_freshness',
    data: { url: 'https://example.test/2', canonical_consensus: true },
  }]);

  // All runs
  const all = loadConsensusRuns(root);
  assert.equal(all.included.length, 2);

  // Filter since
  const since = loadConsensusRuns(root, { since: '2026-09-02' });
  assert.equal(since.included.length, 1);
  assert.equal(since.included[0].run_id, '2026-09-02T00:00:00Z-consensus-2');

  // Filter last
  const last = loadConsensusRuns(root, { last: 1 });
  assert.equal(last.included.length, 1);
  assert.equal(last.included[0].run_id, '2026-09-02T00:00:00Z-consensus-2');

  // Specific runId
  const specific = loadConsensusRuns(root, { runId: '2026-09-01T00:00:00Z-consensus-1' });
  assert.equal(specific.included.length, 1);

  // Missing runId
  assert.throws(() => loadConsensusRuns(root, { runId: 'missing-run' }), /run not found/);
});

test('buildConsensusMatrix detects consensus, internal conflicts, and engine discrepancies', () => {
  const runs = [{
    run_id: 'run-1',
    manifest: { target: { location: 'https://example.test' } },
    observations: [
      {
        kind: 'canonical_freshness',
        data: {
          url: 'https://example.test/clean',
          signals: {
            final_url: 'https://example.test/clean',
            html_canonical: 'https://example.test/clean',
            open_graph_url: 'https://example.test/clean',
            sitemap_present: true,
          },
          canonical_consensus: true,
          date_signals: [{ valid: true, normalized_date: '2026-09-01' }, { valid: true, normalized_date: '2026-09-01' }],
          date_consensus: true,
          freshness_assessment: 'aligned_signals',
          content_snapshot: { changed_since_snapshot: false, current_content_hash: 'abc123' },
          engine_selected_canonical: [
            { engine: 'Google', selected_canonical: 'https://example.test/clean', indexed: true },
          ],
          canonical_consensus_with_engines: true,
        },
      },
      {
        kind: 'canonical_freshness',
        data: {
          url: 'https://example.test/conflict',
          signals: {
            final_url: 'https://example.test/conflict',
            html_canonical: 'https://example.test/consolidated',
            open_graph_url: 'https://example.test/conflict',
            sitemap_present: false,
          },
          canonical_consensus: false,
          date_signals: [{ valid: true, normalized_date: '2026-08-01' }, { valid: true, normalized_date: '2026-09-01' }],
          date_consensus: false,
          freshness_assessment: 'conflicting_signals',
          content_snapshot: { changed_since_snapshot: true, current_content_hash: 'def456' },
          engine_selected_canonical: [
            { engine: 'Google', selected_canonical: 'https://example.test/conflict', indexed: true },
          ],
          canonical_consensus_with_engines: false,
        },
      },
    ],
  }];

  const matrix = buildConsensusMatrix(runs);
  assert.equal(matrix.total_urls, 2);
  assert.equal(matrix.full_canonical_consensus, 1);
  assert.equal(matrix.canonical_conflicts, 1);
  assert.equal(matrix.engine_discrepancies, 1);
  assert.equal(matrix.freshness_aligned, 1);
  assert.equal(matrix.freshness_conflicts, 1);

  // Check discrepancy breakdowns
  assert.equal(matrix.discrepancies.length, 1);
  const conflictItem = matrix.discrepancies[0];
  assert.equal(conflictItem.url, 'https://example.test/conflict');
  const types = new Set(conflictItem.discrepancies.map((d) => d.type));
  assert.ok(types.has('non_self_canonical'));
  assert.ok(types.has('og_disagrees_with_canonical'));
  assert.ok(types.has('missing_from_sitemap'));
  assert.ok(types.has('engine_canonical_discrepancy'));
  assert.ok(types.has('conflicting_freshness_dates'));
});

test('renderConsensusMarkdown and renderConsensusHtml format tables and disclaimers', () => {
  const matrix = {
    latest_run_id: 'run-1',
    target: 'https://example.test',
    total_urls: 1,
    full_canonical_consensus: 1,
    canonical_conflicts: 0,
    engine_discrepancies: 0,
    freshness_aligned: 1,
    freshness_conflicts: 0,
    freshness_insufficient: 0,
    rows: [{
      url: 'https://example.test/',
      html_canonical: 'https://example.test/',
      open_graph_url: 'https://example.test/',
      sitemap_present: true,
      canonical_consensus: true,
      engine_canonicals: [{ engine: 'Google', selected_canonical: 'https://example.test/' }],
      freshness_assessment: 'aligned_signals',
      content_changed: false,
      discrepancies: [],
    }],
    discrepancies: [],
  };

  const md = renderConsensusMarkdown(matrix);
  assert.match(md, /# Canonical Discovery & Freshness Consensus Matrix/);
  assert.match(md, /Operating boundary:/);
  assert.match(md, /Total URLs Evaluated \| 1 \| 100\.0%/);
  assert.match(md, /https:\/\/example\.test\//);

  const html = renderConsensusHtml(matrix);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Canonical Discovery & Freshness Consensus Matrix/);
  assert.match(html, /badge-pass/);
  assert.match(html, /Consensus/);
});

test('reportConsensus command creates reports and fails when no runs exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-report-consensus-'));
  init(root);

  // Fails when no consensus runs
  assert.throws(
    () => reportConsensus(root),
    /No consensus observation runs found in \.citable\/runs/,
  );

  // Add mock run
  const runsDir = path.join(root, '.citable', 'runs');
  createMockConsensusRun(runsDir, '2026-09-08T00:00:00Z-consensus', [{
    kind: 'canonical_freshness',
    data: {
      url: 'https://example.test/home',
      signals: { final_url: 'https://example.test/home', html_canonical: 'https://example.test/home', sitemap_present: true },
      canonical_consensus: true,
      freshness_assessment: 'aligned_signals',
    },
  }]);

  const res = reportConsensus(root);
  assert.equal(res.urls_evaluated, 1);
  assert.equal(res.canonical_consensus_count, 1);
  assert.ok(fs.existsSync(res.path_md));
  assert.ok(fs.existsSync(res.path_html));
});
