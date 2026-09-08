import { buildContext } from './context.js';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/**
 * `citable inspect aeo <page>` — evaluate page answer extractability, question density,
 * direct lead conciseness, grounded quantitative metrics, and synthesis readiness.
 */
export async function inspectAeo(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect aeo requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  const reg = registryPageFor(ctx, page);

  // Evaluate findings for this single page across ANS namespace
  const single = { ...ctx, site: { ...ctx.site, pages: [page] } };
  const { findings } = runDetectors(selectDetectors({ namespaces: ['ANS'] }), single);
  const aeoFindings = findings.filter((f) => f.subject.identifier === page.url || f.subject.url === page.url);

  // Analyze question headings and answer leads
  const QUESTION_RX = /^(?:how|what|why|when|where|who|can|is|does|which|should)\b|\?$/i;
  const questionHeadings = (page.headings || []).filter((h) => QUESTION_RX.test(h.text.trim()));

  // Definitional copula check
  const COPULA_RX = /\b(?:is|are|refers\s+to|denotes|represents|means)\b/i;
  const firstParagraph = (page.paragraphs && page.paragraphs[0]) || '';
  const hasCopularDefinition = COPULA_RX.test(firstParagraph.slice(0, 140));

  // Structured elements
  const tablesCount = (page.tables || []).length;
  const listsCount = (page.orderedLists || []).length;

  // Executive summary
  const SUMMARY_RX = /\b(?:executive\s+summary|key\s+takeaways?|summary|overview|at\s+a\s+glance|tl;?dr|quick\s+summary|highlights?)\b/i;
  const hasExecutiveSummary = (page.headings || []).some((h) => SUMMARY_RX.test(h.text));

  // Determine synthesis posture
  let extractabilityStatus = 'optimal';
  if (aeoFindings.some((f) => f.classification.severity === 'high')) {
    extractabilityStatus = 'obstructed';
  } else if (aeoFindings.length >= 2) {
    extractabilityStatus = 'suboptimal';
  } else if (aeoFindings.length === 1) {
    extractabilityStatus = 'minor_improvements';
  }

  return {
    url: page.url,
    sourceFile: page.sourceFile,
    status: page.status,
    page_type: reg?.page_type ?? null,
    word_count: page.rawVisibleWordCount || page.wordCount || 0,
    extractability_status: extractabilityStatus,
    headings: {
      total: (page.headings || []).length,
      questions: questionHeadings.map((h) => ({ level: h.level, text: h.text })),
    },
    answer_structure: {
      has_copular_definition: hasCopularDefinition,
      has_executive_summary: hasExecutiveSummary,
      tables_count: tablesCount,
      ordered_lists_count: listsCount,
    },
    findings: aeoFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      summary: f.observation.summary,
    })),
  };
}
