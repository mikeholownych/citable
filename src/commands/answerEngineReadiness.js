import { buildContext } from './context.js';
import { safePath } from '../detectors/framework.js';
import { evaluateAnswerEngineReadiness } from '../analysis/readiness.js';

/**
 * `citable inspect readiness <page>` — evaluate page extraction and readiness across
 * Perplexity, Bing Copilot, and ChatGPT / SearchGPT.
 */
export async function inspectReadiness(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect readiness requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  return evaluateAnswerEngineReadiness(page, ctx);
}

/**
 * Format terminal output for `citable inspect readiness <page>`
 */
export function formatReadinessOutput(r) {
  const lines = [
    `Answer-Engine Readiness: ${r.url}`,
    `==============================================`,
    `Composite Readiness Score: ${r.composite_readiness_score} / 100`,
    ``,
    `ENGINE EVALUATIONS:`,
    `  Perplexity:   ${r.engines.perplexity.score}/100 [${r.engines.perplexity.status.toUpperCase()}] (Bot: ${r.engines.perplexity.primary_bot})`,
    `  Bing Copilot: ${r.engines.bing_copilot.score}/100 [${r.engines.bing_copilot.status.toUpperCase()}] (Bot: ${r.engines.bing_copilot.primary_bot})`,
    `  ChatGPT:      ${r.engines.chatgpt.score}/100 [${r.engines.chatgpt.status.toUpperCase()}] (Bot: ${r.engines.chatgpt.primary_bot})`,
    ``,
    `CROSS-ENGINE CAPABILITY MATRIX:`,
  ];

  for (const row of r.comparison_matrix) {
    lines.push(`  - ${row.capability.padEnd(28)} | Perplexity: ${row.perplexity.padEnd(10)} | Copilot: ${row.bing_copilot.padEnd(14)} | ChatGPT: ${row.chatgpt}`);
  }

  if (r.recommendations.length) {
    lines.push(``, `PRIORITIZED ACTIONS:`);
    for (const rec of r.recommendations) {
      lines.push(`  [${rec.priority.toUpperCase()}] (${rec.engine.toUpperCase()}) ${rec.action}`);
    }
  }

  return lines.join('\n');
}
