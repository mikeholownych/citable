import { buildContext } from './context.js';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/**
 * `citable inspect geo <page>` — evaluate page RAG chunkability, section word distribution,
 * entity density, and citation anchoring for generative engine retrieval.
 */
export async function inspectGeo(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect geo requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  const reg = registryPageFor(ctx, page);

  // Evaluate findings for this single page across GEO and RECO namespaces
  const single = { ...ctx, site: { ...ctx.site, pages: [page] } };
  const { findings } = runDetectors(selectDetectors({ namespaces: ['GEO', 'RECO'] }), single);
  const geoFindings = findings.filter((f) => f.subject.identifier === page.url || f.subject.url === page.url || f.subject.identifier?.startsWith(page.url));

  const totalWords = page.rawVisibleWordCount || page.wordCount || 0;
  const estimatedChunks = Math.max(1, Math.ceil(totalWords / 300));

  let retrievalPosture = 'optimal';
  if (geoFindings.some((f) => f.classification.severity === 'high')) {
    retrievalPosture = 'erased_or_severed';
  } else if (geoFindings.length > 0) {
    retrievalPosture = 'needs_chunk_optimization';
  }

  return {
    url: page.url,
    sourceFile: page.sourceFile,
    status: page.status,
    page_type: reg?.page_type ?? null,
    word_count: totalWords,
    retrieval_posture: retrievalPosture,
    rag_metrics: {
      estimated_chunks_300w: estimatedChunks,
      total_headings: (page.headings || []).length,
      average_words_per_chunk: Math.round(totalWords / estimatedChunks),
    },
    findings: geoFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      summary: f.observation.summary,
    })),
  };
}
