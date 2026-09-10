import { parse as parseHtml } from 'node-html-parser';
import { registryPageFor, safePath } from '../detectors/framework.js';
import { isAuthoritativeDomain } from '../shared/domainUtils.js';

/**
 * Evaluates on-page content against Google's E-E-A-T rubric on a 0.0 - 5.0 scale.
 *
 * Premise 2 compliance:
 * - fact_status: 'modeled_rubric_evaluation'
 * - E-E-A-T is an evaluative framework from the Search Quality Rater Guidelines,
 *   NOT a direct algorithmic ranking factor or search engine API metric.
 */
export function evaluateEeat(page, ctx = {}) {
  const html = page.html || '';
  const root = parseHtml(html);
  const text = (page.text || root.textContent || '').replace(/\s+/g, ' ').trim();
  const lowerText = text.toLowerCase();
  const reg = registryPageFor(ctx, page);

  // -------------------------------------------------------------
  // 1. EXPERIENCE (0.0 - 5.0)
  // -------------------------------------------------------------
  const expSignals = [];
  const expMissing = [];
  let expScore = 1.0;

  // First-person practitioner indicators
  const FIRST_PERSON_RX = /\b(?:we tested|in our testing|we evaluated|our evaluation|we measured|our analysis|we observed|our findings|in our experience|our team found|hands-on|case study|we verified|we deployed)\b/i;
  if (FIRST_PERSON_RX.test(text)) {
    expScore += 1.2;
    expSignals.push('First-person practitioner observations and testing language detected');
  } else {
    expMissing.push('Add first-hand testing observations, case studies, or practitioner findings');
  }

  // Original media / demonstrations / code artifacts
  const codeBlocks = root.querySelectorAll('pre, code, table');
  if (codeBlocks.length >= 2) {
    expScore += 1.0;
    expSignals.push(`Structured demonstration artifacts present (${codeBlocks.length} code/table blocks)`);
  } else {
    expMissing.push('Include original demonstration tables, code snippets, or walkthroughs');
  }

  // Original images with descriptive captions/alt text
  const images = page.images || root.querySelectorAll('img');
  const validImages = images.filter((img) => {
    const alt = typeof img === 'object' && img.getAttribute ? img.getAttribute('alt') : img.alt;
    return Boolean(alt && alt.length > 5);
  });
  if (validImages.length >= 1) {
    expScore += 0.8;
    expSignals.push(`Descriptive contextual images present (${validImages.length} with detailed alt text)`);
  }

  // Quantitative measurement / benchmark data
  const METRIC_DATA_RX = /(?:\b\d+(?:\.\d+)?%|\b\d+\s*ms\b|\b\d+\s*s\b|\$\d+(?:,\d{3})*|\bbenchmark\b|\bresults showed\b)/i;
  if (METRIC_DATA_RX.test(text)) {
    expScore += 1.0;
    expSignals.push('Quantitative experimental or benchmark metrics presented');
  } else {
    expMissing.push('Include verifiable quantitative benchmark data or empirical results');
  }

  expScore = Math.min(5.0, Math.max(0.0, Math.round(expScore * 10) / 10));

  // -------------------------------------------------------------
  // 2. EXPERTISE (0.0 - 5.0)
  // -------------------------------------------------------------
  const expertSignals = [];
  const expertMissing = [];
  let expertScore = 1.0;

  // Author attribution in page or schema
  let authorName = null;
  let authorSameAs = null;
  for (const j of (page.jsonLd || [])) {
    for (const b of (j.blocks || [])) {
      if (b.author) {
        const authorObj = Array.isArray(b.author) ? b.author[0] : b.author;
        authorName = authorObj?.name || (typeof authorObj === 'string' ? authorObj : null);
        authorSameAs = authorObj?.sameAs || null;
      }
    }
  }

  // Visible byline check
  const BYLINE_RX = /\b(?:written by|authored by|author:|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i;
  const bylineMatch = text.match(BYLINE_RX);
  if (!authorName && bylineMatch) {
    authorName = bylineMatch[1];
  }

  if (authorName) {
    expertScore += 1.5;
    expertSignals.push(`Attributed author identified: "${authorName}"`);
  } else {
    expertMissing.push('Add explicit author byline with credentials or Person schema');
  }

  // Author credentials / biography / authoritative profiles
  const BIO_RX = /\b(?:ph\.?d|m\.?d|engineer|architect|researcher|director|specialist|consultant|analyst|professor|founder|lead)\b/i;
  if (authorSameAs || BIO_RX.test(text)) {
    expertScore += 1.2;
    expertSignals.push(authorSameAs ? 'Author disambiguation profile linked' : 'Author professional title or credentials indicator detected');
  } else {
    expertMissing.push('Link author to authoritative profile (sameAs: LinkedIn, ORCID, GitHub) and list credentials');
  }

  // Content depth & semantic heading hierarchy
  const wordCount = page.rawVisibleWordCount || page.wordCount || text.split(/\s+/).filter(Boolean).length;
  const headings = page.headings || [];
  if (wordCount >= 600 && headings.length >= 3) {
    expertScore += 1.3;
    expertSignals.push(`Substantive technical depth (${wordCount} words, ${headings.length} headings)`);
  } else if (wordCount < 300) {
    expertMissing.push('Expand content depth to address topic comprehensively (currently thin <300 words)');
  }

  expertScore = Math.min(5.0, Math.max(0.0, Math.round(expertScore * 10) / 10));

  // -------------------------------------------------------------
  // 3. AUTHORITATIVENESS (0.0 - 5.0)
  // -------------------------------------------------------------
  const authSignals = [];
  const authMissing = [];
  let authScore = 1.0;

  // External primary source citations (.edu, .gov, standards, docs)
  const links = page.links || root.querySelectorAll('a').map((a) => ({
    href: a.getAttribute('href') || '',
    text: a.text.trim(),
  }));

  const externalLinks = links.filter((l) => /^https?:\/\//i.test(l.href));
  const authoritativeDomains = externalLinks.filter((l) => isAuthoritativeDomain(l.href));

  if (authoritativeDomains.length >= 2) {
    authScore += 1.5;
    authSignals.push(`Primary authority citations present (${authoritativeDomains.length} citations to academic/standard/industry domains)`);
  } else if (externalLinks.length >= 1) {
    authScore += 0.8;
    authSignals.push(`External citations present (${externalLinks.length} external links)`);
    authMissing.push('Cite recognized primary sources (standards organizations, academic research, official documentation)');
  } else {
    authMissing.push('Add outbound citations to primary sources and industry standards');
  }

  // Registry claim grounding (strictly page-scoped)
  const claims = ctx.registries?.claims?.entries || [];
  const pageClaims = claims.filter((c) => {
    if (!c) return false;
    const target = c.canonical_url || c.subject?.url || c.page_id;
    return Boolean(target && (target === page.url || target === page.canonicalUrl));
  });
  const verifiedClaims = pageClaims.filter((c) => c.status === 'verified');
  if (verifiedClaims.length >= 1) {
    authScore += 1.5;
    authSignals.push(`Page claims backed by verified evidence records (${verifiedClaims.length} verified claims)`);
  } else {
    authMissing.push('Ground material claims in evidence registry with primary citations');
  }

  // Publisher / Organization entity graph
  let hasOrgSchema = false;
  for (const j of (page.jsonLd || [])) {
    for (const b of (j.blocks || [])) {
      const type = [].concat(b['@type'] || []).join(',');
      const pubType = [].concat(b.publisher?.["@type"] || []).join(",");
      if (/Organization|Corporation/i.test(type) || /Organization|Corporation/i.test(pubType)) hasOrgSchema = true;
    }
  }
  if (hasOrgSchema) {
    authScore += 1.0;
    authSignals.push('Publisher Organization schema graph present');
  } else {
    authMissing.push('Add Organization schema with publisher credentials and sameAs properties');
  }

  authScore = Math.min(5.0, Math.max(0.0, Math.round(authScore * 10) / 10));

  // -------------------------------------------------------------
  // 4. TRUSTWORTHINESS (0.0 - 5.0) — The foundational pillar
  // -------------------------------------------------------------
  const trustSignals = [];
  const trustMissing = [];
  let trustScore = 1.0;

  // Editorial freshness / visible timestamps
  const DATE_RX = /\b(?:published|updated|last modified|reviewed|date):\s*([a-zA-Z]+\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})\b/i;
  const hasVisibleDate = DATE_RX.test(text);
  let hasSchemaDate = false;
  for (const j of (page.jsonLd || [])) {
    for (const b of (j.blocks || [])) {
      if (b.datePublished || b.dateModified) hasSchemaDate = true;
    }
  }
  if (hasVisibleDate || hasSchemaDate) {
    trustScore += 1.0;
    trustSignals.push('Transparent publication and modification dates disclosed');
  } else {
    trustMissing.push('Disclose explicit publication and last-updated dates');
  }

  // Contact / About / Support transparency
  const hasContact = links.some((l) => /contact|about|support|team|company/i.test(l.href) || /contact|about|support/i.test(l.text));
  if (hasContact) {
    trustScore += 1.0;
    trustSignals.push('Direct contact, about, or support channels accessible');
  } else {
    trustMissing.push('Provide clear navigation links to About Us, Contact, and Support pages');
  }

  // Legal transparency: Privacy policy & Terms
  const hasPrivacy = links.some((l) => /privacy/i.test(l.href) || /privacy/i.test(l.text));
  const hasTerms = links.some((l) => /terms/i.test(l.href) || /terms/i.test(l.text));
  if (hasPrivacy && hasTerms) {
    trustScore += 1.0;
    trustSignals.push('Privacy policy and terms of service disclosed');
  } else {
    trustMissing.push('Provide clear links to Privacy Policy and Terms of Service');
  }

  // Security & protocol
  if (page.url && page.url.startsWith('https://')) {
    trustScore += 1.0;
    trustSignals.push('Secure HTTPS transport confirmed');
  } else if (!page.url.startsWith('http://')) {
    trustScore += 0.5; // relative / local test
  }

  // Commercial / sponsorship transparency
  const sponsoredLinks = links.filter((l) => (l.rel || '').includes('sponsored') || (l.rel || '').includes('nofollow'));
  if (sponsoredLinks.length > 0) {
    trustScore += 0.5;
    trustSignals.push('Commercial and affiliate links properly attributed with rel="sponsored"');
  }

  trustScore = Math.min(5.0, Math.max(0.0, Math.round(trustScore * 10) / 10));

  // -------------------------------------------------------------
  // COMPOSITE E-E-A-T SCORE (0.0 - 5.0)
  // In Google Quality Rater Guidelines, Trust is the foundational base:
  // untrusted content cannot achieve a high overall rating.
  // -------------------------------------------------------------
  let composite = (trustScore * 0.40) + (expertScore * 0.25) + (expScore * 0.20) + (authScore * 0.15);
  if (trustScore < 2.0) {
    composite = Math.min(composite, trustScore); // Trust cap
  }
  composite = Math.round(composite * 10) / 10;

  // Grade rating
  let rating = 'medium';
  if (composite >= 4.0) rating = 'very_high';
  else if (composite >= 3.0) rating = 'high';
  else if (composite >= 2.0) rating = 'medium';
  else rating = 'low';

  return {
    url: page.url,
    fact_status: 'modeled_rubric_evaluation',
    epistemic_status: 'MODELED',
    methodology: 'Google Search Quality Rater Guidelines (E-E-A-T Evaluative Rubric)',
    disclaimer: 'E-E-A-T is an evaluative heuristic rubric modeled on Quality Rater Guidelines, not an algorithmic ranking score. Google does not calculate a single E-E-A-T metric.',
    composite_score: composite,
    overall_rating: rating,
    dimensions: {
      experience: {
        score: expScore,
        scale: '0.0 - 5.0',
        signals: expSignals,
        gaps: expMissing,
      },
      expertise: {
        score: expertScore,
        scale: '0.0 - 5.0',
        author: authorName,
        signals: expertSignals,
        gaps: expertMissing,
      },
      authoritativeness: {
        score: authScore,
        scale: '0.0 - 5.0',
        signals: authSignals,
        gaps: authMissing,
      },
      trustworthiness: {
        score: trustScore,
        scale: '0.0 - 5.0',
        signals: trustSignals,
        gaps: trustMissing,
      },
    },
    actionable_improvements: [
      ...expMissing.map((g) => ({ dimension: 'experience', recommendation: g })),
      ...expertMissing.map((g) => ({ dimension: 'expertise', recommendation: g })),
      ...authMissing.map((g) => ({ dimension: 'authoritativeness', recommendation: g })),
      ...trustMissing.map((g) => ({ dimension: 'trustworthiness', recommendation: g })),
    ],
  };
}
