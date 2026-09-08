import { defineDetector, indexTargets, pageSubject, registryPageFor } from './framework.js';

const D = [];

D.push(defineDetector({
  id: 'CRO-001', name: 'Declared conversion action missing visible interactive CTA', namespace: 'CRO',
  description: 'A page registry declares a conversion_action (e.g. "request demo", "start trial"), but the rendered page DOM contains no matching interactive CTA button, link, or form.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site', 'registries'],
  impact: { conversion: 'high', representation: 'low' },
  applicable_requirement: 'Premise 3.1: conversion action must be grounded in page interaction surfaces; CRO §1 CTA visibility',
  remediation: 'Add a visible, interactive button, form, or link that executes the registered conversion_action.',
  verification: 'Ensure page contains an interactive CTA element matching the declared conversion action.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const reg = registryPageFor(ctx, p);
      if (!reg || !reg.conversion_action) continue;
      const pageType = (reg.page_type || '').toLowerCase();
      const isCommercialSurface = ['product', 'pricing', 'landing', 'commercial', 'lead_generation'].includes(pageType);
      if (!isCommercialSurface) continue;
      const action = reg.conversion_action.toLowerCase().trim();

      const hasMatchingCta = (p.ctas || []).some((c) => {
        const t = c.text.toLowerCase();
        return t.includes(action) || action.includes(t) ||
          (action.includes('demo') && t.includes('demo')) ||
          (action.includes('trial') && t.includes('trial')) ||
          (action.includes('contact') && t.includes('contact')) ||
          (action.includes('sales') && t.includes('sales')) ||
          (action.includes('sign up') && t.includes('sign up')) ||
          (action.includes('pricing') && t.includes('pricing')) ||
          (action.includes('download') && t.includes('download'));
      });

      const hasMatchingForm = (p.forms || []).some((f) => {
        return (f.action && f.action.toLowerCase().includes(action)) || f.hasSubmit;
      });

      if (!hasMatchingCta && !hasMatchingForm) {
        hits.push({
          subject: pageSubject(p),
          summary: `Page declares conversion_action "${reg.conversion_action}" but lacks matching interactive CTA or form`,
          evidence: [
            `declared conversion_action: "${reg.conversion_action}"`,
            `detected CTAs: ${(p.ctas || []).map((c) => c.text).join(', ') || 'none'}`,
          ],
          captured: (p.ctas || []).map((c) => c.text).join(', ') || 'none',
          expected: `interactive CTA matching "${reg.conversion_action}"`,
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-002', name: 'Friction-heavy or defective lead capture form', namespace: 'CRO',
  description: 'A form on the page is defective (missing submit mechanism) or contains excessive input fields (>7) on top-of-funnel conversion surfaces.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §2 lead capture form accessibility and interaction friction minimization',
  remediation: 'Ensure forms have an explicit submit button, a valid action endpoint, and keep top-of-funnel inputs to 7 or fewer fields.',
  verification: 'Verify all forms have working submit triggers and reasonable field counts.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (let i = 0; i < (p.forms || []).length; i++) {
        const f = p.forms[i];
        if (!f.hasSubmit) {
          hits.push({
            subject: pageSubject(p),
            summary: `Form ${i + 1} has no submit button or mechanism`,
            evidence: [`form action: ${f.action || 'none'}`, `inputs: ${f.fieldCount}`, 'missing button[type=submit] or input[type=submit]'],
          });
        }
        if (f.fieldCount > 7) {
          hits.push({
            subject: pageSubject(p),
            summary: `Form ${i + 1} has excessive field friction (${f.fieldCount} fields > 7 threshold)`,
            evidence: [
              `field count: ${f.fieldCount}`,
              `fields: ${f.inputs.map((inp) => inp.name || inp.type).join(', ')}`,
            ],
            captured: f.fieldCount,
            expected: '<= 7 fields',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-003', name: 'Commercial intent page lacks proximate conversion pathway', namespace: 'CRO',
  description: 'A page with commercial or transactional intent (e.g. product, pricing, or vendor evaluation) contains zero interactive CTAs.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §3 commercial intent conversion pathway alignment; SEO §1 commercial page value realization',
  remediation: 'Add a clear primary call-to-action (e.g., demo, trial, pricing contact) to guide visitors arriving with commercial intent.',
  verification: 'Commercial pages include at least one visible, interactive CTA.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const reg = registryPageFor(ctx, p);
      const pageType = (reg?.page_type || '').toLowerCase();
      const primaryIntent = (reg?.primary_intent || '').toLowerCase();
      const urlLower = p.url.toLowerCase();

      const isCommercial =
        /product|pricing|commercial|vendor|solution/i.test(pageType) ||
        /vendor evaluation|commercial|pricing|compare|trial/i.test(primaryIntent) ||
        /\/products\/|\/pricing\/|\/solutions\//i.test(urlLower);

      if (isCommercial) {
        const ctaCount = (p.ctas || []).length;
        if (ctaCount === 0) {
          hits.push({
            subject: pageSubject(p),
            summary: `Commercial page "${p.url}" has zero interactive calls-to-action`,
            evidence: [
              `page_type: ${reg?.page_type || 'unregistered'}`,
              `primary_intent: ${reg?.primary_intent || 'unregistered'}`,
              'detected CTAs: 0',
            ],
            captured: 0,
            expected: '>= 1 primary CTA',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-004', name: 'Defective or unverified outbound conversion target', namespace: 'CRO',
  description: 'A primary CTA button or link points to a placeholder (#, javascript:void(0)), an unreachable internal destination (404), or a non-production staging/localhost URL.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'high' },
  applicable_requirement: 'CRO §4 conversion link integrity and target availability',
  remediation: 'Point all conversion CTAs to live, production-ready landing pages, forms, or checkout flows.',
  verification: 'All CTA destinations resolve to valid 200 HTTP responses without dead-ends.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const c of p.ctas || []) {
        if (!c.target) continue;
        const target = c.target.trim();
        if (target === '#' || /^javascript:/i.test(target)) {
          hits.push({
            subject: pageSubject(p),
            summary: `CTA "${c.text}" uses placeholder target "${target}"`,
            evidence: [`CTA text: "${c.text}"`, `target: "${target}"`],
          });
        } else if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|staging\.|dev\.)/i.test(target)) {
          hits.push({
            subject: pageSubject(p),
            summary: `CTA "${c.text}" targets non-production environment "${target}"`,
            evidence: [`CTA text: "${c.text}"`, `target: "${target}"`],
          });
        } else if (target.startsWith('/') || (ctx.site.baseUrl && target.startsWith(ctx.site.baseUrl))) {
          const normTarget = ctx.site.normalize(target);
          const resolved = ctx.site.byUrl.get(normTarget);
          if (resolved && resolved.status >= 400) {
            hits.push({
              subject: pageSubject(p),
              summary: `CTA "${c.text}" targets internal page returning HTTP ${resolved.status}`,
              evidence: [`CTA text: "${c.text}"`, `target: "${target}"`, `status: ${resolved.status}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-005', name: 'Search-to-landing scent gap: primary H1 fails to corroborate title', namespace: 'CRO',
  description: 'A commercial landing page H1 shares zero substantive keywords with the page title, creating a message-match scent gap that elevates bounce rates for search visitors.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'high', ranking: 'low' },
  applicable_requirement: 'CRO §5 message-match alignment; SEO §4 title-to-H1 topic continuity',
  remediation: 'Align the primary above-the-fold H1 to reflect the core product or service promised in the title tag.',
  verification: 'Ensure at least one substantive keyword is shared between the page title stem and the primary H1.',
  check(ctx) {
    const hits = [];
    const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'that', 'this', 'what', 'how', 'best', 'more', 'about']);
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.title || !p.h1s || p.h1s.length === 0) continue;
      const reg = registryPageFor(ctx, p);
      const pageType = reg?.page_type || '';
      if (pageType !== 'product' && pageType !== 'pricing' && pageType !== 'landing') continue;

      const titleStem = p.title.split(/[|—–-]/)[0] || p.title;
      const titleWords = titleStem.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
      const h1Text = p.h1s[0]?.text || '';
      const h1Words = new Set(h1Text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)));

      const overlap = titleWords.filter((w) => h1Words.has(w));
      if (titleWords.length >= 1 && overlap.length === 0) {
        hits.push({
          subject: pageSubject(p),
          summary: `Search-to-landing scent gap: H1 "${h1Text}" shares no keywords with title stem "${titleStem.trim()}"`,
          evidence: [
            `title stem: "${titleStem.trim()}" (keywords: ${titleWords.join(', ')})`,
            `primary H1: "${h1Text}" (keywords: ${[...h1Words].join(', ') || 'none'})`,
            'visitors arriving from search experience disconnect when above-the-fold heading does not corroborate search snippet',
          ],
          captured: { titleStem: titleStem.trim(), h1: h1Text },
          expected: 'at least 1 shared substantive keyword between title and H1',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-006', name: 'Commercial lead capture form lacks proximate trust proof or security badges', namespace: 'CRO',
  description: 'A lead capture or transaction form collects user information without proximate trust signals (compliance certifications, encryption, guarantees, or social proof), elevating funnel abandonment.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §6 conversion surface trust and security proof presence',
  remediation: 'Place security badges, compliance certifications (SOC 2, ISO, GDPR), or guarantees adjacent to the form.',
  verification: 'Confirm pages containing multi-field forms declare at least one verifiable trust signal in the DOM.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const forms = p.forms || [];
      const multiFieldForms = forms.filter((f) => (f.fieldCount || 0) >= 2);
      if (multiFieldForms.length === 0) continue;

      const trustBadges = p.trustBadges || [];
      if (trustBadges.length === 0) {
        hits.push({
          subject: pageSubject(p),
          summary: `Lead capture form (${multiFieldForms[0].fieldCount} fields) lacks proximate trust proof or compliance badges`,
          evidence: [
            `form action: ${multiFieldForms[0].action || 'inline'}`,
            `field count: ${multiFieldForms[0].fieldCount}`,
            'trust badges detected on page: 0',
            'high friction lead capture forms without trust reassurance suffer higher abandonment rates',
          ],
          captured: { fieldCount: multiFieldForms[0].fieldCount, trustBadgesCount: 0 },
          expected: '>= 1 trust badge or proof signal on pages with lead capture forms',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-007', name: 'Identity or contact input fields lack HTML5 autocomplete attributes', namespace: 'CRO',
  description: 'Form input fields that collect standard personal identity or contact information (e.g. name, email, phone, organization) lack standard HTML5 autocomplete attributes, increasing typing friction and preventing browser autofill.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §7 form field autofill accessibility and mobile input friction minimization',
  remediation: 'Add standard autocomplete attributes (e.g. autocomplete="email", autocomplete="given-name", autocomplete="tel", autocomplete="organization") to identity inputs.',
  verification: 'Confirm all contact and identity inputs declare a valid standard autocomplete attribute.',
  check(ctx) {
    const hits = [];
    const CONTACT_FIELD_RX = /^(email|e-mail|mail|fname|first[_-]?name|given[_-]?name|lname|last[_-]?name|family[_-]?name|phone|telephone|mobile|tel|company|organization|org)$/i;
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const form of p.forms || []) {
        for (const inp of form.inputs || []) {
          if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') continue;
          const identifier = (inp.name || inp.id || '').toLowerCase();
          if (CONTACT_FIELD_RX.test(identifier) && (!inp.autocomplete || inp.autocomplete === 'off')) {
            hits.push({
              subject: pageSubject(p),
              summary: `Form field "${identifier}" lacks HTML5 autocomplete attribute`,
              evidence: [
                `field name/id: "${identifier}"`,
                `field type: "${inp.type}"`,
                'browser autofill increases form completion rates; missing autocomplete forces manual keyboard entry',
              ],
              captured: { field: identifier, autocomplete: inp.autocomplete },
              expected: `valid autocomplete attribute for "${identifier}"`,
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-008', name: 'Form inputs rely solely on placeholder without accessible label', namespace: 'CRO',
  description: 'Input fields on conversion forms rely solely on disappearing placeholder text without an associated <label for="...">, <label> wrapper, or aria-label, degrading cognitive accessibility and mobile error recovery.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §8 form label accessibility; WCAG 2.1 Success Criterion 3.3.2 Labels or Instructions',
  remediation: 'Add explicit <label for="id"> elements or aria-label attributes for every form input instead of relying solely on placeholder text.',
  verification: 'Confirm all form inputs have hasLabel=true in the parsed DOM.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const form of p.forms || []) {
        for (const inp of form.inputs || []) {
          if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') continue;
          if (!inp.hasLabel && inp.placeholder) {
            hits.push({
              subject: pageSubject(p),
              summary: `Form input "${inp.name || inp.id || inp.type}" relies solely on placeholder "${inp.placeholder}" without label`,
              evidence: [
                `input: ${inp.name || inp.id || inp.type}`,
                `placeholder: "${inp.placeholder}"`,
                'placeholder text disappears upon user focus/typing, removing context and causing form completion abandonment',
              ],
              captured: { input: inp.name || inp.id || inp.type, placeholder: inp.placeholder },
              expected: 'associated <label> or aria-label for every input',
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-009', name: 'Mobile input type mismatch for email or telephone fields', namespace: 'CRO',
  description: 'An email or telephone input uses generic type="text" instead of semantic types (type="email", type="tel") or lacks inputmode="numeric", failing to trigger the appropriate mobile virtual keyboard.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §9 mobile virtual keyboard optimization; HTML5 semantic input types',
  remediation: 'Set type="email" for email inputs, type="tel" for telephone inputs, or inputmode="numeric" for numeric codes.',
  verification: 'Confirm email inputs use type="email" and telephone inputs use type="tel" or inputmode="tel".',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const form of p.forms || []) {
        for (const inp of form.inputs || []) {
          const id = (inp.name || inp.id || '').toLowerCase();
          if (inp.type === 'text') {
            if (/email|e-mail/i.test(id)) {
              hits.push({
                subject: pageSubject(p),
                summary: `Email field "${id}" uses generic type="text" instead of type="email"`,
                evidence: [
                  `field name/id: "${id}"`,
                  'type: text',
                  'mobile devices cannot display specialized email keyboard (@ and domain shortcuts)',
                ],
                captured: { field: id, type: inp.type },
                expected: 'type="email"',
              });
            } else if (/phone|telephone|mobile|tel\b/i.test(id) && !inp.inputmode) {
              hits.push({
                subject: pageSubject(p),
                summary: `Phone field "${id}" uses generic type="text" without type="tel" or inputmode`,
                evidence: [
                  `field name/id: "${id}"`,
                  'type: text',
                  'mobile devices cannot display numeric dialpad',
                ],
                captured: { field: id, type: inp.type },
                expected: 'type="tel" or inputmode="tel|numeric"',
              });
            }
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-010', name: 'Choice overload: excessive competing primary CTAs in hero conversion zone', namespace: 'CRO',
  description: 'The hero section or primary viewport of a commercial landing page presents 3 or more competing primary calls-to-action, creating choice paralysis and reducing click-through rates.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'high' },
  applicable_requirement: 'CRO §10 visual hierarchy and decision friction minimization; Hick\'s Law',
  remediation: 'Designate a single clear primary CTA in the hero section and demote secondary actions to text links or outline buttons.',
  verification: 'Confirm hero section has fewer than 3 primary CTAs.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const reg = registryPageFor(ctx, p);
      const pageType = (reg?.page_type || '').toLowerCase();
      const isCommercial = ['product', 'pricing', 'landing', 'commercial'].includes(pageType) ||
        /\/products\/|\/pricing\/|\/solutions\//i.test(p.url);
      if (!isCommercial) continue;

      const heroPrimaryCtas = (p.ctas || []).filter((c) => c.inHero && c.isPrimary);
      if (heroPrimaryCtas.length >= 3) {
        hits.push({
          subject: pageSubject(p),
          summary: `Hero section presents ${heroPrimaryCtas.length} competing primary CTAs (choice overload)`,
          evidence: [
            `competing hero CTAs: ${heroPrimaryCtas.map((c) => `"${c.text}"`).join(', ')}`,
            'multiple high-emphasis CTAs create decision paralysis (Hick\'s Law) and lower overall conversion',
          ],
          captured: heroPrimaryCtas.map((c) => c.text),
          expected: '<= 2 CTAs in hero, exactly 1 primary',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-011', name: 'Buried primary conversion pathway on long-form commercial page', namespace: 'CRO',
  description: 'A long-form commercial landing page (>1,000 words) has zero above-the-fold or early CTAs within the initial hero section and lacks a persistent navigation CTA, forcing visitors to scroll through extensive prose before reaching an action trigger.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §11 commercial conversion pathway accessibility and scroll latency',
  remediation: 'Add an early CTA in the hero section or a persistent header CTA so search visitors can convert without scrolling through the entire document.',
  verification: 'Confirm commercial page with >1,000 words includes at least one hero or navigation CTA.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || (p.wordCount || 0) < 1000) continue;
      const reg = registryPageFor(ctx, p);
      const pageType = (reg?.page_type || '').toLowerCase();
      const isCommercial = ['product', 'pricing', 'landing', 'commercial'].includes(pageType) ||
        /\/products\/|\/pricing\/|\/solutions\//i.test(p.url);
      if (!isCommercial) continue;

      const ctas = p.ctas || [];
      if (ctas.length === 0) continue; // CRO-003 handles 0 CTAs

      const hasEarlyOrNavCta = ctas.some((c) => c.inHero || c.inNav);
      if (!hasEarlyOrNavCta) {
        hits.push({
          subject: pageSubject(p),
          summary: `Long-form commercial page (${p.wordCount} words) lacks early hero or navigation CTA`,
          evidence: [
            `total word count: ${p.wordCount}`,
            `detected CTAs: ${ctas.map((c) => `"${c.text}"`).join(', ')}`,
            'all CTAs are buried deep in body or footer; search visitors with high purchase intent face excessive scroll friction',
          ],
          captured: { wordCount: p.wordCount, ctaCount: ctas.length },
          expected: 'at least 1 CTA in hero or sticky navigation on >1000 word commercial page',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-012', name: 'Low-intent generic CTA microcopy on primary commercial action', namespace: 'CRO',
  description: 'A primary CTA on a commercial landing page uses passive, low-commitment, or non-descriptive microcopy (such as "Submit", "Click Here", "Send", "Next", or "Go") rather than an action-oriented, value-delivering verb.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §12 CTA microcopy actionability and perceived value clarity',
  remediation: 'Replace generic copy like "Submit" or "Click Here" with value-driven action verbs (e.g. "Start Free Trial", "Get Instant Access", "Request Demo").',
  verification: 'Confirm primary CTAs avoid generic passive terms.',
  check(ctx) {
    const hits = [];
    const GENERIC_CTA_RX = /^(submit|click here|read more|learn more|send|go|next|continue|button)$/i;
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const reg = registryPageFor(ctx, p);
      const pageType = (reg?.page_type || '').toLowerCase();
      const isCommercial = ['product', 'pricing', 'landing', 'commercial'].includes(pageType) ||
        /\/products\/|\/pricing\/|\/solutions\//i.test(p.url);
      if (!isCommercial) continue;

      for (const c of p.ctas || []) {
        if (c.isPrimary && GENERIC_CTA_RX.test(c.text.trim())) {
          hits.push({
            subject: pageSubject(p),
            summary: `Primary CTA uses low-intent generic microcopy "${c.text.trim()}"`,
            evidence: [
              `CTA text: "${c.text.trim()}"`,
              'generic verbs convey friction rather than benefit, diminishing click propensity',
            ],
            captured: c.text.trim(),
            expected: 'benefit-oriented action verb (e.g., "Start Free Trial", "Request Demo", "Get Started")',
          });
          break;
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-013', name: 'Enclosed checkout or lead funnel leak: distraction navigation present on conversion step', namespace: 'CRO',
  description: 'A dedicated checkout, payment, or final lead registration step retains full global navigation menus (>5 links), providing exit ramps that elevate funnel abandonment.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'high' },
  applicable_requirement: 'CRO §13 enclosed checkout and distraction removal; funnel leakage prevention',
  remediation: 'Enclose the conversion funnel by removing global navigation menus, search bars, and external outbound links on checkout and registration pages.',
  verification: 'Confirm checkout or dedicated registration steps contain <= 5 navigation links.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const isCheckoutOrPay = /\/(checkout|pay|cart|signup-step2|order-summary)\b/i.test(p.url);
      if (isCheckoutOrPay && (p.navLinksCount || 0) > 5) {
        hits.push({
          subject: pageSubject(p),
          summary: `Dedicated conversion step "${p.url}" retains ${p.navLinksCount} global navigation links (distraction leak)`,
          evidence: [
            `navigation link count: ${p.navLinksCount}`,
            'enclosed checkout best practices recommend removing full site navigation on final conversion steps to prevent exit leakage',
          ],
          captured: { navLinksCount: p.navLinksCount },
          expected: '<= 5 navigation links on dedicated checkout or payment funnel step',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-014', name: 'Unprotected post-conversion confirmation page lacks noindex directive', namespace: 'CRO',
  description: 'A post-conversion confirmation, thank-you, or receipt page (/thank-you, /order-received, /welcome) lacks a "noindex" robots directive, exposing internal receipt URLs to organic search indexing and distorting conversion tracking.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium', ranking: 'low' },
  applicable_requirement: 'CRO §14 conversion confirmation index protection; SEO §2 clean index hygiene',
  remediation: 'Add <meta name="robots" content="noindex, follow"> or X-Robots-Tag: noindex to all thank-you and conversion receipt pages.',
  verification: 'Confirm post-conversion confirmation pages have noindex=true.',
  check(ctx) {
    const hits = [];
    const CONFIRM_PAGE_RX = /\/(thank-you|order-confirmed|order-received|purchase-success|signup-success|payment-complete)\b/i;
    for (const p of ctx.site?.pages || []) {
      if (p.status !== 200) continue;
      if (CONFIRM_PAGE_RX.test(p.url) && !p.noindex) {
        hits.push({
          subject: pageSubject(p),
          summary: `Post-conversion confirmation page "${p.url}" lacks noindex directive`,
          evidence: [
            `URL: ${p.url}`,
            `noindex: ${p.noindex || false}`,
            'organic crawling of post-conversion pages causes false-positive conversion attribution and leaks transactional endpoints',
          ],
          captured: { url: p.url, noindex: false },
          expected: 'meta robots "noindex" or X-Robots-Tag "noindex"',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-015', name: 'Mobile touch target size below recommended 48px threshold', namespace: 'CRO',
  description: 'An interactive conversion CTA button or link has explicit dimensions under 44px by 44px, violating mobile accessibility and tap-target usability standards (WCAG 2.5.5) and increasing tap error rates.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §15 mobile touch target sizing; WCAG 2.1 Success Criterion 2.5.5 Target Size',
  remediation: 'Ensure all primary and secondary conversion CTAs meet a minimum physical target size of 44px by 44px (recommended 48px by 48px) or declare at least 12px of padding.',
  verification: 'Confirm CTA elements have inlineWidth >= 44 and inlineHeight >= 44 when explicit dimensions are set.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const c of p.ctas || []) {
        if ((c.inlineWidth !== null && c.inlineWidth < 44) || (c.inlineHeight !== null && c.inlineHeight < 44)) {
          hits.push({
            subject: pageSubject(p),
            summary: `CTA "${c.text}" has explicit touch target dimensions below 44px (${c.inlineWidth ?? 'auto'}x${c.inlineHeight ?? 'auto'}px)`,
            evidence: [
              `CTA text: "${c.text}"`,
              `dimensions: width=${c.inlineWidth ?? 'auto'}px, height=${c.inlineHeight ?? 'auto'}px`,
              'touch targets under 44-48px cause frequent mobile tap errors and increase conversion abandonment',
            ],
            captured: { text: c.text, width: c.inlineWidth, height: c.inlineHeight },
            expected: 'minimum 44x44px touch target (recommended 48x48px)',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-016', name: 'Diminutive font size on primary conversion CTA microcopy', namespace: 'CRO',
  description: 'A primary CTA button uses diminutive font sizing (< 12px), creating readability friction and lowering tap confidence for mobile and accessibility-sensitive visitors.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §16 CTA microcopy legibility and perceived affordance',
  remediation: 'Increase primary CTA font size to at least 14px (recommended 16px) to ensure immediate visual affordance and effortless readability.',
  verification: 'Confirm primary CTA elements declare font-size >= 12px when explicit font-size is styled.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const c of p.ctas || []) {
        if (c.isPrimary && c.inlineFontSize !== null && c.inlineFontSize < 12) {
          hits.push({
            subject: pageSubject(p),
            summary: `Primary CTA "${c.text}" uses diminutive font size (${c.inlineFontSize}px < 12px)`,
            evidence: [
              `CTA text: "${c.text}"`,
              `font size: ${c.inlineFontSize}px`,
              'primary action buttons with font sizes below 12px suffer from poor legibility and reduced click-through rates',
            ],
            captured: { text: c.text, fontSize: c.inlineFontSize },
            expected: 'primary CTA font-size >= 14px',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-017', name: 'Multi-step conversion funnel break: intermediate step unavailable or defective', namespace: 'CRO',
  description: 'A multi-step funnel declared in funnels.yaml contains a step whose target page cannot be located in the audited site or returns an HTTP error status (4xx/5xx).',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site', 'registries'],
  impact: { conversion: 'high' },
  applicable_requirement: 'CRO §17 multi-step funnel continuity and endpoint availability',
  remediation: 'Verify that every declared funnel step corresponds to a live, indexable page returning HTTP 200.',
  verification: 'All declared funnel steps resolve to status 200 pages.',
  check(ctx) {
    const hits = [];
    if (!ctx.registries?.funnels?.entries) return hits;
    for (const funnel of ctx.registries.funnels.entries) {
      if (funnel.status !== 'active') continue;
      for (const step of funnel.steps || []) {
        const pattern = step.url_pattern;
        const page = ctx.site?.pages?.find((p) => p.url.includes(pattern) || (step.page_id && p.url === step.url_pattern));
        if (!page) {
          hits.push({
            subject: { type: 'registry_entry', identifier: `funnels/${funnel.funnel_id}/${step.step_id}` },
            summary: `Funnel "${funnel.name}" step "${step.name || step.step_id}" (${pattern}) not found in site`,
            evidence: [
              `funnel: ${funnel.funnel_id} (${funnel.name})`,
              `step: ${step.step_id} (${pattern})`,
              'missing funnel steps cause dead ends where visitors are unable to complete the conversion path',
            ],
            captured: { funnel_id: funnel.funnel_id, step: step.step_id, pattern },
            expected: `page matching "${pattern}" in audited output`,
          });
        } else if (page.status >= 400) {
          hits.push({
            subject: pageSubject(page),
            summary: `Funnel "${funnel.name}" step "${step.name || step.step_id}" returns HTTP ${page.status}`,
            evidence: [
              `funnel: ${funnel.funnel_id}`,
              `step: ${step.step_id}`,
              `HTTP status: ${page.status}`,
            ],
            captured: { status: page.status },
            expected: 'status 200',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-018', name: 'Funnel progression link fails to preserve campaign attribution parameters', namespace: 'CRO',
  description: 'An intermediate CTA link leading to the next funnel step strips or omits declared campaign query parameters (such as utm_source, utm_campaign), breaking multi-touch attribution.',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['site', 'registries'],
  impact: { conversion: 'low', representation: 'medium' },
  applicable_requirement: 'CRO §18 campaign parameter preservation and cross-step attribution continuity',
  remediation: 'Ensure cross-step transition links append or forward inbound UTM and attribution query parameters.',
  verification: 'Confirm intermediate funnel CTAs declare parameter preservation.',
  check(ctx) {
    const hits = [];
    if (!ctx.registries?.funnels?.entries) return hits;
    for (const funnel of ctx.registries.funnels.entries) {
      if (funnel.status !== 'active') continue;
      const steps = funnel.steps || [];
      for (let i = 0; i < steps.length - 1; i++) {
        const curStep = steps[i];
        const nextStep = steps[i + 1];
        if (!curStep.preserve_params || curStep.preserve_params.length === 0) continue;

        const curPage = ctx.site?.pages?.find((p) => p.url.includes(curStep.url_pattern));
        if (!curPage) continue;

        const transitionCta = (curPage.ctas || []).find((c) => c.target && c.target.includes(nextStep.url_pattern));
        if (transitionCta && !transitionCta.target.includes('?') && !transitionCta.target.includes('utm_')) {
          hits.push({
            subject: pageSubject(curPage),
            summary: `Funnel transition CTA to "${nextStep.url_pattern}" does not forward declared params (${curStep.preserve_params.join(', ')})`,
            evidence: [
              `from step: ${curStep.step_id}`,
              `to step: ${nextStep.step_id}`,
              `CTA target: ${transitionCta.target}`,
              `required params: ${curStep.preserve_params.join(', ')}`,
              'hardcoded links without parameter forwarding break campaign tracking and conversion attribution',
            ],
            captured: { target: transitionCta.target, preserve: curStep.preserve_params },
            expected: `CTA target forwarding query params to "${nextStep.url_pattern}"`,
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-019', name: 'AI Answer cited landing page lacks immediate claim corroboration or conversion pathway', namespace: 'CRO',
  description: 'A landing page cited by an answer engine or generative AI response contains no proximate interactive conversion trigger or fails to corroborate the cited entity claim in its primary visible text.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { conversion: 'high', citation: 'medium' },
  applicable_requirement: 'CRO §19 AI citation-to-conversion pathway alignment; AEO §4 corroboration continuity',
  remediation: 'Place an action-oriented conversion CTA and clear statement corroborating the cited claim above the fold on AI-cited landing pages.',
  verification: 'Confirm AI-cited pages possess both visible corroborating text and an interactive CTA.',
  check(ctx) {
    const hits = [];
    const observations = ctx.observations || [];
    const citationObs = observations.filter((o) => o.kind === 'citation' && o.data?.property_cited);
    for (const obs of citationObs) {
      const citedUrl = obs.data?.target_url || obs.data?.citation_url;
      if (!citedUrl) continue;
      const page = ctx.site?.pages?.find((p) => p.url === citedUrl || p.url.endsWith(citedUrl));
      if (!page) continue;

      const ctas = page.ctas || [];
      if (ctas.length === 0) {
        hits.push({
          subject: pageSubject(page),
          summary: `AI citation landing page "${page.url}" cited by ${obs.data.provider || 'AI engine'} lacks any conversion CTA`,
          evidence: [
            `provider: ${obs.data.provider || 'unknown'}`,
            `prompt: "${obs.data.prompt_text || 'prompt'}"`,
            'visitors arriving from AI answer citations with high intent encounter zero interactive conversion pathways',
          ],
          captured: { citedUrl: page.url, ctasCount: 0 },
          expected: '>= 1 visible conversion CTA on AI citation landing page',
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRO-020', name: 'Statistical underpower risk on low-traffic A/B experiment', namespace: 'CRO',
  description: 'An A/B experiment registered in experiments.yaml specifies a minimum observation window or sample size insufficient to detect the expected hypothesis effect at standard statistical power (80%).',
  discipline: ['seo', 'aeo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { conversion: 'medium' },
  applicable_requirement: 'CRO §20 statistical power governance; Experimentation §3 sample size adequacy',
  remediation: 'Increase experiment evaluation duration or focus on higher-traffic pages where minimum detectable effect (MDE) can reach 80% statistical power.',
  verification: 'Confirm active experiments have evaluation window >= 7 days and realistic MDE targets.',
  check(ctx) {
    const hits = [];
    if (!ctx.registries?.experiments?.entries) return hits;
    for (const exp of ctx.registries.experiments.entries) {
      if (exp.status !== 'active') continue;
      const windowStr = exp.evaluation_window || exp.minimum_observation_window || '';
      const daysMatch = windowStr.match(/(\d+)\s*d/i);
      if (daysMatch && Number(daysMatch[1]) < 7) {
        hits.push({
          subject: { type: 'registry_entry', identifier: `experiments/${exp.experiment_id}` },
          summary: `Experiment "${exp.experiment_id}" has insufficient observation window (${daysMatch[1]} days < 7 days minimum)`,
          evidence: [
            `evaluation window: "${windowStr}"`,
            'experiments running under 7 days fail to account for day-of-week seasonality and suffer high false-positive rates',
          ],
          captured: { window: windowStr, days: Number(daysMatch[1]) },
          expected: 'evaluation window >= 7 days (recommended >= 14 days)',
        });
      }
    }
    return hits;
  },
}));

export default D;
