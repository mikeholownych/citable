import { parse as parseHtml } from 'node-html-parser';
import { calculateVisualSaliency } from './saliency.js';
import { registryPageFor, safePath } from '../detectors/framework.js';

const GENERIC_CTA_RX = /^(?:submit|click\s*here|continue|next|send|ok|go|learn\s*more|more)$/i;
const VALUE_CTA_RX = /\b(get|start|try|claim|unlock|explore|join|download|access|calculate|book|schedule|request)\b/i;
const RISK_REVERSAL_RX = /\b(no\s*credit\s*card\s*required|cancel\s*anytime|money-back\s*guarantee|\d+-day\s*guarantee|risk-free|free\s*(?:\d+-day\s*)?trial|no\s*commitment|guaranteed)\b/i;
const SOCIAL_PROOF_RX = /\b(trusted\s*by|over\s*\d+[\d,]*\s*(?:users|customers|teams|companies)|customer\s*reviews?|what\s*(?:our\s*)?customers\s*say|case\s*studies|testimonials?)\b/i;
const OBJECTION_RX = /\b(frequently\s*asked\s*questions|faq|common\s*questions|how\s*much|pricing\s*details|cancel\s*policy|security\s*standards)\b/i;

/**
 * Perform comprehensive CRO audit on a page model
 */
export function auditPageCro(page, ctx = {}) {
  const html = page.html || '';
  const root = parseHtml(html);
  const text = (page.text || root.textContent || '').replace(/\s+/g, ' ').trim();
  const ctas = page.ctas || [];
  const forms = page.forms || [];
  const trustBadges = page.trustBadges || [];
  const headings = page.headings || [];

  // -------------------------------------------------------------
  // 1. ABOVE-THE-FOLD (ATF) CLARITY & MESSAGE-MATCH (0-100)
  // -------------------------------------------------------------
  let atfScore = 0;
  const atfSignals = [];
  const atfGaps = [];

  // Scent match: Title to H1 alignment
  const titleStem = page.title ? page.title.split(/[|—–-]/)[0].trim().toLowerCase() : '';
  const h1Text = (headings.find((h) => h.level === 1)?.text || '').trim();
  const h1Lower = h1Text.toLowerCase();

  let scentMatch = false;
  if (titleStem && h1Lower) {
    const titleWords = titleStem.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = titleWords.filter((w) => h1Lower.includes(w));
    if (matchedWords.length >= 1 || titleStem.includes(h1Lower) || h1Lower.includes(titleStem)) {
      scentMatch = true;
    }
  }

  if (scentMatch) {
    atfScore += 30;
    atfSignals.push(`Strong information scent: Title and primary H1 corroborate core value proposition ("${h1Text.slice(0, 50)}")`);
  } else if (h1Text) {
    atfScore += 15;
    atfGaps.push(`Scent gap: Primary H1 ("${h1Text.slice(0, 40)}") diverges from title tag ("${titleStem.slice(0, 40)}")`);
  } else {
    atfGaps.push('Missing H1 headline above the fold to establish page purpose');
  }

  // Hero CTA presence & conspicuity
  const heroCtas = ctas.filter((c) => c.inHero);
  const primaryHeroCta = heroCtas.find((c) => c.isPrimary) || heroCtas[0];

  const saliency = calculateVisualSaliency({
    ctas: ctas.map((c) => ({ ...c, isPrimary: c.isPrimary })),
    headings: headings.map((h) => ({ level: h.level || 1, text: h.text })),
    forms: forms.map((f) => ({ fieldCount: f.fieldCount })),
  });

  const pci = saliency.primary_cta_conspicuity_index || 0;

  if (primaryHeroCta && pci >= 0.60) {
    atfScore += 30;
    atfSignals.push(`Prominent hero CTA with optimal conspicuity (${Math.round(pci * 100)}% PCI score)`);
  } else if (primaryHeroCta) {
    atfScore += 20;
    atfSignals.push(`Hero CTA present ("${primaryHeroCta.text}") but visual conspicuity is diluted (${Math.round(pci * 100)}% PCI score)`);
  } else {
    atfGaps.push('No primary CTA visible above the fold in the hero viewport');
  }

  // Choice overload penalty
  if (heroCtas.filter((c) => c.isPrimary).length > 1) {
    atfScore -= 10;
    atfGaps.push(`Choice overload: ${heroCtas.filter((c) => c.isPrimary).length} competing primary CTAs in hero zone induce decision paralysis`);
  }

  // Value proposition lead copy (opening 80 words)
  const firstP = page.paragraphs?.[0] || '';
  if (firstP.length >= 40 && firstP.length <= 400) {
    atfScore += 25;
    atfSignals.push('Concise value proposition paragraph immediately supports hero headline');
  } else if (firstP.length > 400) {
    atfScore += 15;
    atfGaps.push('Opening hero lead text is too verbose (>400 chars); condense into clear benefit bullets');
  } else {
    atfGaps.push('Missing explanatory sub-headline or lead benefit description above the fold');
  }

  // Supporting micro-signals (risk reversal near hero)
  const heroText = (h1Text + ' ' + firstP + ' ' + (primaryHeroCta?.text || '')).toLowerCase();
  if (RISK_REVERSAL_RX.test(heroText)) {
    atfScore += 15;
    atfSignals.push('Friction-reducing risk reversal (e.g. "No credit card required") placed directly proximate to hero CTA');
  } else {
    atfGaps.push('Add an explicit risk-reversal micro-copy badge under hero CTA (e.g. "Free 14-day trial • No credit card required")');
  }

  atfScore = Math.min(100, Math.max(0, atfScore));

  // -------------------------------------------------------------
  // 2. UX FRICTION, COGNITIVE LOAD & ABANDONMENT ANALYSIS
  // -------------------------------------------------------------
  const frictionIssues = [];
  let frictionPoints = 0;

  // Form field count & Keystroke Effort Index (KEI)
  const totalInputs = forms.reduce((sum, f) => sum + (f.fieldCount || 0), 0);
  const inputsWithAutocomplete = forms.reduce((sum, f) => sum + f.inputs.filter((inp) => Boolean(inp.autocomplete)).length, 0);
  const manualKeystrokes = totalInputs * 14;
  const autofillKeystrokes = totalInputs > 0 && inputsWithAutocomplete > 0
    ? (totalInputs - inputsWithAutocomplete) * 14 + 1
    : manualKeystrokes;
  const keystrokeReductionPct = manualKeystrokes > 0
    ? Math.round(((manualKeystrokes - autofillKeystrokes) / manualKeystrokes) * 100)
    : 0;

  for (const f of forms) {
    if (f.fieldCount > 6) {
      frictionPoints += 20;
      frictionIssues.push({
        severity: 'high',
        type: 'form_length',
        issue: `Form contains ${f.fieldCount} fields (recommend <= 4 fields for top-of-funnel lead capture)`,
        remediation: 'Progressive profiling: reduce initial form fields to work email and name; capture details on subsequent step',
      });
    }

    const missingAuto = f.inputs.filter((inp) => !inp.autocomplete && ['email', 'tel', 'text', 'name'].includes(inp.type));
    if (missingAuto.length > 0) {
      frictionPoints += 10;
      frictionIssues.push({
        severity: 'medium',
        type: 'autocomplete_missing',
        issue: `${missingAuto.length} input field(s) lack HTML5 autocomplete attributes, increasing mobile entry friction`,
        remediation: 'Add standard autocomplete attributes (e.g. autocomplete="email", autocomplete="name", autocomplete="tel")',
      });
    }

    if (!f.hasSubmit) {
      frictionPoints += 30;
      frictionIssues.push({
        severity: 'critical',
        type: 'missing_submit',
        issue: 'Form has no explicit submit button or trigger mechanism',
        remediation: 'Add an accessible <button type="submit"> element with clear action microcopy',
      });
    }
  }

  // Navigation distraction on conversion surfaces (leaks)
  const reg = registryPageFor(ctx, page);
  const isCheckoutOrCapture = ['checkout', 'pricing', 'signup', 'demo', 'cart'].some((t) => (page.url || '').toLowerCase().includes(t));
  const navLinks = page.navLinksCount || root.querySelectorAll('header nav a, footer a').length;

  if (isCheckoutOrCapture && navLinks > 15) {
    frictionPoints += 15;
    frictionIssues.push({
      severity: 'medium',
      type: 'funnel_leak',
      issue: `High-intent conversion page contains ${navLinks} external/header navigation links (funnel leak)`,
      remediation: 'Enclose conversion funnel: remove non-essential header navigation and social links during checkout/signup',
    });
  }

  // Cognitive load index
  let cognitiveLoad = 'minimal';
  if (frictionPoints >= 40) cognitiveLoad = 'critical_friction';
  else if (frictionPoints >= 25) cognitiveLoad = 'high_cognitive_load';
  else if (frictionPoints >= 10) cognitiveLoad = 'moderate';

  // -------------------------------------------------------------
  // 3. TRUST, CREDIBILITY, OBJECTIONS & RISK-REVERSAL (0-100)
  // -------------------------------------------------------------
  let trustScore = 0;
  const trustSignals = [];
  const trustGaps = [];

  // Social proof
  const hasSocialProof = SOCIAL_PROOF_RX.test(text) || trustBadges.some((b) => /rating|review|g2|capterra|trustpilot/i.test(b.signal || ''));
  if (hasSocialProof) {
    trustScore += 25;
    trustSignals.push('Customer social proof and review signals detected');
  } else {
    trustGaps.push('Add customer social proof (client logos, quantitative adoption stats, or verified review quotes)');
  }

  // Security credentials & badges
  const hasSecurityBadge = trustBadges.some((b) => /security|ssl|soc-?2|iso|hipaa|pci|verified/i.test(b.signal || '')) ||
    Boolean(root.querySelector('[class*="security"], [class*="trust"], [class*="badge"]'));
  if (hasSecurityBadge) {
    trustScore += 25;
    trustSignals.push('Security compliance, SSL, or verification badges present');
  } else {
    trustGaps.push('Display enterprise security credentials (SOC-2, ISO, HIPAA, or encryption badges) proximate to conversion action');
  }

  // Risk reversal
  const hasRiskReversal = RISK_REVERSAL_RX.test(text);
  if (hasRiskReversal) {
    trustScore += 25;
    trustSignals.push('Explicit risk-reversal guarantees present (money-back guarantee, free trial, or cancel anytime)');
  } else {
    trustGaps.push('Eliminate buyer perceived risk with explicit guarantees ("Cancel anytime", "30-day money back guarantee")');
  }

  // Objection handling (FAQ or comparison)
  const hasObjectionHandling = OBJECTION_RX.test(text) || root.querySelectorAll('details, .faq, #faq').length > 0;
  if (hasObjectionHandling) {
    trustScore += 25;
    trustSignals.push('Pre-purchase objection handling and structured FAQ content detected');
  } else {
    trustGaps.push('Include a pre-purchase FAQ addressing common pricing, onboarding, and contract objections');
  }

  trustScore = Math.min(100, Math.max(0, trustScore));

  // -------------------------------------------------------------
  // 4. OFFER ARCHITECTURE & CTA HIERARCHY
  // -------------------------------------------------------------
  const offerFindings = [];
  let primaryCtaCount = 0;
  let genericCtaCount = 0;

  for (const cta of ctas) {
    if (cta.isPrimary) primaryCtaCount++;
    if (GENERIC_CTA_RX.test(cta.text)) {
      genericCtaCount++;
      offerFindings.push({
        cta: cta.text,
        type: 'generic_microcopy',
        remediation: `Replace low-intent generic copy "${cta.text}" with high-value benefit action copy (e.g. "Get Started Free", "Claim Your Audit")`,
      });
    }
  }

  const ctaHierarchy = {
    total_ctas: ctas.length,
    primary_ctas: primaryCtaCount,
    secondary_ctas: ctas.length - primaryCtaCount,
    generic_microcopy_count: genericCtaCount,
    hierarchy_status: primaryCtaCount === 1 ? 'optimal' : primaryCtaCount > 1 ? 'choice_overload' : 'missing_primary',
  };

  // Express checkout
  const walletRx = /apple\s*pay|google\s*pay|paypal|one-click/i;
  const hasExpressPayment = ctas.some((c) => walletRx.test(c.text || '')) ||
    trustBadges.some((t) => walletRx.test(t.signal || ''));

  // -------------------------------------------------------------
  // OVERALL CONVERSION READINESS SCORE (0-100)
  // -------------------------------------------------------------
  const conversionReadiness = Math.round(
    (atfScore * 0.35) +
    (trustScore * 0.30) +
    (Math.max(0, 100 - frictionPoints) * 0.25) +
    (ctaHierarchy.hierarchy_status === 'optimal' ? 10 : 5)
  );

  return {
    url: page.url,
    fact_status: 'modeled_cro_evaluation',
    conversion_readiness_score: conversionReadiness,
    atf_clarity: {
      score: atfScore,
      scent_match: scentMatch,
      title_stem: titleStem,
      h1_headline: h1Text,
      pci_score_pct: Math.round(pci * 100),
      signals: atfSignals,
      gaps: atfGaps,
    },
    cognitive_load_and_friction: {
      load_assessment: cognitiveLoad,
      friction_points: frictionPoints,
      keystroke_effort: {
        total_inputs: totalInputs,
        inputs_with_autocomplete: inputsWithAutocomplete,
        keystroke_reduction_pct: keystrokeReductionPct,
      },
      issues: frictionIssues,
    },
    trust_and_credibility: {
      score: trustScore,
      signals: trustSignals,
      gaps: trustGaps,
      social_proof_detected: hasSocialProof,
      security_badges_detected: hasSecurityBadge,
      risk_reversal_detected: hasRiskReversal,
      objection_handling_detected: hasObjectionHandling,
    },
    offer_architecture: {
      cta_hierarchy: ctaHierarchy,
      express_checkout_supported: hasExpressPayment,
      findings: offerFindings,
    },
  };
}
