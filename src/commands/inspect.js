import { buildContext } from './context.js';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/** `citable inspect <page>` — profile one page: intent, entities, claims, metadata, links, lifecycle, ambiguity. */
export async function inspect(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  const reg = registryPageFor(ctx, page);
  const claims = (ctx.registries.claims?.entries || []).filter((c) => (reg?.published_claims || []).includes(c.claim_id) || (c.publication_surfaces || []).some((s) => page.url.includes(s)));
  const entities = (ctx.registries.entities?.entries || []).filter((e) => (reg?.primary_entities || []).includes(e.entity_id) || page.text.toLowerCase().includes(e.canonical_name.toLowerCase()));

  // Answer-bearing passages: first paragraph + paragraphs following question headings
  const answerPassages = [];
  if (page.paragraphs[0]) answerPassages.push({ role: 'opening', text: page.paragraphs[0].slice(0, 300) });
  for (const h of page.headings.filter((h) => h.text.endsWith('?'))) {
    answerPassages.push({ role: `after heading "${h.text}"`, text: '(verify prose follows; see ANS-002)' });
  }

  // Per-page detector pass
  const single = { ...ctx, site: { ...ctx.site, pages: [page] } };
  const { findings } = runDetectors(selectDetectors({}), single);
  const pageFindings = findings.filter((f) => f.subject.identifier === page.url || f.subject.url === page.url);

  const ambiguities = [];
  if (!reg) ambiguities.push('Page has no registry entry: intent, target queries, owner, and lifecycle are undeclared.');
  if (reg && !reg.primary_intent) ambiguities.push('Registry entry declares no primary intent.');
  if (reg && !reg.conversion_action) ambiguities.push('No conversion action declared; commercial role unknown.');
  if (entities.length === 0) ambiguities.push('No registered entity matched on this page.');

  return {
    url: page.url,
    sourceFile: page.sourceFile,
    status: page.status,
    title: page.title,
    metaDescription: page.metaDescription,
    canonicals: page.canonicals,
    robotsDirectives: page.robotsDirectives,
    headings: page.headings,
    wordCount: page.wordCount,
    registry: reg,
    primary_intent: reg?.primary_intent ?? null,
    conversion_action: reg?.conversion_action ?? null,
    lifecycle: reg ? { class: reg.lifecycle_class, owner: reg.content_owner, reviewer: reg.factual_reviewer, next_review: reg.next_review_date } : null,
    entities: entities.map((e) => ({ entity_id: e.entity_id, name: e.canonical_name, type: e.entity_type })),
    claims: claims.map((c) => ({ claim_id: c.claim_id, type: c.claim_type, status: c.status, claim: c.claim })),
    schemaBlocks: page.jsonLd.map((j) => ({ parseError: j.parseError, types: j.blocks.map((b) => b['@type']) })),
    internalLinks: {
      inbound: (ctx.site.inbound.get(ctx.site.normalize(page.url)) || []).length,
      outbound: (ctx.site.outbound.get(ctx.site.normalize(page.url)) || []).length,
    },
    answerPassages,
    findings: pageFindings,
    unresolved_ambiguity: ambiguities,
  };
}
