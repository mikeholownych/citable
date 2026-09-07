import fs from 'node:fs';
import path from 'node:path';
import { buildTimeSeries, loadRunHistory, renderDashboardHtml, renderDashboardMarkdown } from '../reporting/dashboard.js';

/**
 * `citable report dashboard` — fold the summary already recorded by each audit
 * run into a cross-run Markdown table and a self-contained HTML page. Derived
 * output only: it never reads, edits, or re-derives an immutable run package.
 */
export function reportDashboard(root, { since, last } = {}) {
  if (last != null && (!Number.isInteger(last) || last < 1)) throw new Error('--last must be a positive integer');
  const { included, skipped } = loadRunHistory(root, { since, last });
  const series = buildTimeSeries(included);
  const dir = path.join(root, '.citable', 'reports');
  const pathMd = path.join(dir, 'dashboard.md');
  const pathHtml = path.join(dir, 'dashboard.html');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathMd, renderDashboardMarkdown(series, skipped));
  fs.writeFileSync(pathHtml, renderDashboardHtml(series, skipped));
  return { dir, included: included.length, skipped: skipped.length, path_md: pathMd, path_html: pathHtml };
}
