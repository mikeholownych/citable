import { auditPageCro } from "../analysis/croAudit.js";
import { buildContext } from './context.js';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';
import { calculateVisualSaliency } from '../analysis/saliency.js';

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

  // Visual attention saliency modeling
  const saliency = calculateVisualSaliency({
    ctas: ctas.map((c) => ({ ...c, isPrimary: c.isPrimary })),
    headings: (page.h1s || []).map((h) => ({ level: 1, text: h.text })),
    forms: forms.map((f) => ({ fieldCount: f.fieldCount })),
  });

  // Keystroke Effort Index (KEI) across all forms
  const totalInputs = forms.reduce((sum, f) => sum + (f.fieldCount || 0), 0);
  const inputsWithAutocomplete = forms.reduce((sum, f) => sum + f.inputs.filter((inp) => Boolean(inp.autocomplete)).length, 0);
  const manualKeystrokes = totalInputs * 14; // Average 14 keystrokes + focus taps per field
  const autofillKeystrokes = totalInputs > 0 && inputsWithAutocomplete > 0
    ? (totalInputs - inputsWithAutocomplete) * 14 + 1
    : manualKeystrokes;
  const keystrokeReductionPct = manualKeystrokes > 0
    ? Math.round(((manualKeystrokes - autofillKeystrokes) / manualKeystrokes) * 100)
    : 0;

  // Express checkout readiness: payment wallets and authentication tracked separately.
  // Apple Pay / Google Pay / PayPal are payment methods; WebAuthn/passkeys are account
  // authentication. Conflating them produces misleading "biometric readiness" claims.
  const walletRx = /apple\s*pay|google\s*pay|paypal|one-click/i;
  const authRx = /passkey|webauthn/i;
  const walletCtas = ctas.filter((c) => walletRx.test(c.text || ''));
  const authCtas = ctas.filter((c) => authRx.test(c.text || ''));
  const walletViaBadgeOrHtml = trustBadges.some((t) => walletRx.test(t.signal || '')) ||
    Boolean(page.rawHtml && /data-express-payment|apple-pay|google-pay|paypal-button/i.test(page.rawHtml));
  const authViaHtml = Boolean(page.rawHtml && /passkey|webauthn|publickey-credentials/i.test(page.rawHtml));

  // Friction Surface Area (FSA) — a modeled heuristic index, not a measured
  // revenue or conversion outcome.
  const fsaScore = croFindings.reduce((acc, f) => {
    const w = f.classification.severity === 'critical' ? 15 : f.classification.severity === 'high' ? 10 : f.classification.severity === 'medium' ? 5 : 2;
    return acc + w;
  }, 0);

  const pageCroAudit = auditPageCro(page, ctx);

  return {
    url: page.url,
    conversion_readiness_score: pageCroAudit.conversion_readiness_score,
    atf_clarity: pageCroAudit.atf_clarity,
    trust_and_credibility: pageCroAudit.trust_and_credibility,
    offer_architecture: pageCroAudit.offer_architecture,
    sourceFile: page.sourceFile,
    status: page.status,
    declared_conversion_action: declaredAction,
    primary_intent: reg?.primary_intent ?? null,
    page_type: reg?.page_type ?? null,
    conversion_status: status,
    friction_surface_area: fsaScore,
    friction_surface_area_note: 'modeled heuristic index (severity-weighted mechanical defect count); not a measured conversion or revenue outcome',
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
    saliency,
    keystroke_effort: {
      total_inputs: totalInputs,
      inputs_with_autocomplete: inputsWithAutocomplete,
      autofill_coverage_pct: totalInputs > 0 ? Math.round((inputsWithAutocomplete / totalInputs) * 100) : 100,
      manual_keystrokes_required: manualKeystrokes,
      autofill_keystrokes_required: autofillKeystrokes,
      keystroke_reduction_pct: keystrokeReductionPct,
    },
    express_checkout_readiness: {
      payment_wallet_readiness: {
        supported: walletCtas.length > 0 || walletViaBadgeOrHtml,
        detected_triggers: walletCtas.map((c) => c.text),
        note: 'payment wallets are payment methods (Apple Pay, Google Pay, PayPal)',
      },
      authentication_readiness: {
        supported: authCtas.length > 0 || authViaHtml,
        detected_triggers: authCtas.map((c) => c.text),
        note: 'WebAuthn/passkeys are account authentication, not a payment method; this is an informational readiness index, not observed usage',
      },
    },
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
