import { buildContext } from './context.js';
import { safePath } from '../detectors/framework.js';
import { evaluateEeat } from '../analysis/eeat.js';

/**
 * `citable inspect eeat <page>` — evaluate on-page content against the E-E-A-T rubric (0-5 scale).
 */
export async function inspectEeat(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect eeat requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  return evaluateEeat(page, ctx);
}

/**
 * Format terminal output for `citable inspect eeat <page>`
 */
export function formatEeatOutput(r) {
  const lines = [
    `Inspect E-E-A-T: ${r.url}`,
    `========================================`,
    `Composite Score: ${r.composite_score} / 5.0 [${r.overall_rating.toUpperCase()}]`,
    `Status: ${r.fact_status} (Google Search Quality Rater Guidelines rubric)`,
    ``,
    `DIMENSIONS (0.0 - 5.0 scale):`,
    `  Experience:        ${r.dimensions.experience.score} / 5.0`,
    `  Expertise:         ${r.dimensions.expertise.score} / 5.0 (Author: ${r.dimensions.expertise.author || 'unattributed'})`,
    `  Authoritativeness: ${r.dimensions.authoritativeness.score} / 5.0`,
    `  Trustworthiness:   ${r.dimensions.trustworthiness.score} / 5.0 (Foundational Base)`,
    ``,
    `OBSERVED POSITIVE SIGNALS:`,
  ];

  for (const [dim, val] of Object.entries(r.dimensions)) {
    if (val.signals.length) {
      lines.push(`  ${dim.toUpperCase()}:`);
      for (const s of val.signals) lines.push(`    ✓ ${s}`);
    }
  }

  if (r.actionable_improvements.length) {
    lines.push(``, `ACTIONABLE IMPROVEMENTS:`);
    for (const item of r.actionable_improvements) {
      lines.push(`  - [${item.dimension.toUpperCase()}] ${item.recommendation}`);
    }
  }

  lines.push(``, `Note: ${r.disclaimer}`);
  return lines.join('\n');
}
