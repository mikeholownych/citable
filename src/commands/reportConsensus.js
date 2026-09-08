import fs from 'node:fs';
import path from 'node:path';
import {
  buildConsensusMatrix,
  loadConsensusRuns,
  renderConsensusHtml,
  renderConsensusMarkdown,
} from '../reporting/consensus.js';

/**
 * `citable report consensus` — compile recorded consensus observations into an
 * auditable Discovery Consensus Matrix covering HTML canonical, Open Graph URL,
 * sitemap presence, and search engine observations.
 */
export function reportConsensus(root, { runId, since, last } = {}) {
  if (last != null && (!Number.isInteger(last) || last < 1)) {
    throw new Error('--last must be a positive integer');
  }

  const { included, skipped } = loadConsensusRuns(root, { runId, since, last });
  if (included.length === 0) {
    throw new Error('No consensus observation runs found in .citable/runs. Run "citable observe consensus --target <dir|url>" first.');
  }

  const matrix = buildConsensusMatrix(included);
  const dir = path.join(root, '.citable', 'reports');
  const pathMd = path.join(dir, 'consensus.md');
  const pathHtml = path.join(dir, 'consensus.html');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathMd, renderConsensusMarkdown(matrix, { runId: matrix.latest_run_id, skipped }));
  fs.writeFileSync(pathHtml, renderConsensusHtml(matrix, { runId: matrix.latest_run_id, skipped }));

  return {
    dir,
    runs_included: included.length,
    skipped: skipped.length,
    latest_run_id: matrix.latest_run_id,
    urls_evaluated: matrix.total_urls,
    canonical_consensus_count: matrix.full_canonical_consensus,
    conflicts_count: matrix.canonical_conflicts,
    engine_discrepancies_count: matrix.engine_discrepancies,
    freshness_aligned_count: matrix.freshness_aligned,
    path_md: pathMd,
    path_html: pathHtml,
    matrix,
  };
}
