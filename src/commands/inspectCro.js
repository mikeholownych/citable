import { buildContext } from './context.js';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/**
 * `citable inspect cro <page>` — evaluate page conversion readiness, CTA visibility, form friction, and trust badges.
 */
export async function inspectCro(root, pageRef, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('inspect cro requires a site target (built output directory or URL)');
  const wanted = safePath(pageRef, ctx.site.baseUrl);
  const page = ctx.site.pages.find((p) => safePath(p.url) === wanted || p.sourceFile === pageRef);
  if (!page) throw new Error(`page not found in audited output: ${pageRef}`);

  const reg = registryPageFor(ctx, page);
  const declaredAction = reg?.conversion_action ?? null;

  // Evaluate findings for this single page
  const single = { ...ctx, site: { ...ctx.site, pages: [page] } };
  const { findings } = runDetectors(selectDetectors({ namespaces: ['CRO'] }), single);
  const croFindings = findings.filter((f) => f.subject.identifier === page.url || f.subject.url === page.url);

  const ctas = page.ctas || [];
  const forms = page.forms || [];
  const trustBadges = page.trustBadges || [];

  let status = 'ready';
  if (croFindings.some((f) => f.classification.severity === 'high')) {
    status = 'critical_friction';
  } else if (croFindings.length > 0) {
    status = 'needs_attention';
  } else if (!declaredAction && ctas.length === 0) {
    status = 'unmonitored';
  }

  const titleStem = page.title ? page.title.split(/[|—–-]/)[0].trim() : '';
  const h1Text = page.h1s?.[0]?.text || '';

  return {
    url: page.url,
    sourceFile: page.sourceFile,
    status: page.status,
    declared_conversion_action: declaredAction,
    primary_intent: reg?.primary_intent ?? null,
    page_type: reg?.page_type ?? null,
    conversion_status: status,
    title_to_h1_alignment: {
      titleStem,
      h1Text,
      hasScentGap: croFindings.some((f) => f.detector_id === 'CRO-005'),
    },
    hero_cta_count: ctas.filter((c) => c.inHero).length,
    has_choice_overload: croFindings.some((f) => f.detector_id === 'CRO-010'),
    analytics_installed: (page.analyticsTags || []).length > 0,
    analytics_tags: page.analyticsTags || [],
    nav_links_count: page.navLinksCount || 0,
    ctas: ctas.map((c) => ({
      text: c.text,
      tag: c.tag,
      target: c.target,
      isPrimary: c.isPrimary,
      inHero: c.inHero || false,
      inNav: c.inNav || false,
    })),
    forms: forms.map((f) => ({
      action: f.action,
      method: f.method,
      fieldCount: f.fieldCount,
      hasSubmit: f.hasSubmit,
      fields: f.inputs.map((inp) => inp.name || inp.type),
      inputsWithAutocomplete: f.inputs.filter((inp) => Boolean(inp.autocomplete)).length,
      inputsWithLabel: f.inputs.filter((inp) => Boolean(inp.hasLabel)).length,
    })),
    trustBadges: trustBadges.map((t) => t.signal),
    findings: croFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      summary: f.observation.summary,
    })),
  };
}
