/**
 * Hreflang detectors for international SEO
 *
 * Checks hreflang annotations for correctness, completeness, and reciprocity.
 */

import { defineDetector } from './framework.js';

/**
 * HREFLANG-001: hreflang link present and valid
 */
export const HREFLANG_001 = defineDetector({
  id: 'HREFLANG-001',
  name: 'hreflang link valid',
  namespace: 'HREFLANG',
  discipline: ['seo'],
  severity: 'high',
  deterministic: true,
  description: 'Page has valid hreflang link elements',
  remediation: 'Use valid ISO 639-1 language codes and absolute URLs for hreflang targets',
  verification: 'Check each hreflang link element for valid language code and absolute URL',
  check: (ctx) => {
    const hits = [];
    const page = ctx.page;
    if (!page || !page.head) return hits;

    const hreflangLinks = page.head.querySelectorAll('link[rel="alternate"][hreflang]');
    
    if (hreflangLinks.length === 0) {
      // Not a hit - many pages don't need hreflang
      return hits;
    }

    for (const link of hreflangLinks) {
      const hreflang = link.getAttribute('hreflang');
      const href = link.getAttribute('href');

      // Check for invalid hreflang codes
      if (!hreflang || hreflang === '') {
        hits.push({
          subject: ctx.url,
          evidence: ['Empty hreflang attribute found'],
          remediation: 'Provide a valid hreflang code (e.g., "en", "en-US", "x-default")',
        });
        continue;
      }

      // Check for x-default
      if (hreflang === 'x-default') {
        // x-default is valid and recommended
        continue;
      }

      // Validate hreflang format (ISO 639-1 or 639-1-3166-1)
      const validPattern = /^[a-z]{2}(-[A-Z]{2})?$/;
      if (!validPattern.test(hreflang)) {
        hits.push({
          subject: ctx.url,
          evidence: ['Invalid hreflang code: "' + hreflang + '"'],
          remediation: 'Use valid ISO 639-1 language code (e.g., "en") or language-region format (e.g., "en-US")',
        });
      }

      // Check href is absolute URL
      if (href && !href.startsWith('http')) {
        hits.push({
          subject: ctx.url,
          evidence: ['hreflang "' + hreflang + '" uses relative URL: "' + href + '"'],
          remediation: 'Use absolute URLs for hreflang targets',
        });
      }
    }

    return hits;
  },
});

/**
 * HREFLANG-002: Self-referencing hreflang exists
 */
export const HREFLANG_002 = defineDetector({
  id: 'HREFLANG-002',
  name: 'hreflang self-reference',
  namespace: 'HREFLANG',
  discipline: ['seo'],
  severity: 'medium',
  deterministic: true,
  description: 'Page references itself in hreflang',
  remediation: 'Add a self-referencing hreflang link pointing to the current URL',
  verification: 'Check if any hreflang link href matches the current page URL',
  check: (ctx) => {
    const page = ctx.page;
    if (!page || !page.head) return [];

    const hreflangLinks = page.head.querySelectorAll('link[rel="alternate"][hreflang]');
    if (hreflangLinks.length === 0) return [];

    // Find self-reference
    let hasSelfRef = false;
    for (const link of hreflangLinks) {
      const href = link.getAttribute('href');
      if (href === ctx.url) {
        hasSelfRef = true;
        break;
      }
    }

    if (!hasSelfRef && hreflangLinks.length > 0) {
      return [{
        subject: ctx.url,
        evidence: ['Page has hreflang links but does not reference itself'],
        remediation: 'Add a self-referencing hreflang link (e.g., if page is English, include <link rel="alternate" hreflang="en" href="CURRENT_URL" />)',
      }];
    }

    return [];
  },
});

/**
 * HREFLANG-003: x-default present for international pages
 */
export const HREFLANG_003 = defineDetector({
  id: 'HREFLANG-003',
  name: 'hreflang x-default',
  namespace: 'HREFLANG',
  discipline: ['seo'],
  severity: 'medium',
  deterministic: true,
  determinismNote: 'False positive possible if x-default is intentionally omitted',
  description: 'Pages with multiple hreflang include x-default',
  remediation: 'Add x-default hreflang for users outside targeted locales',
  verification: 'Check for presence of hreflang="x-default" when multiple hreflang exist',
  check: (ctx) => {
    const page = ctx.page;
    if (!page || !page.head) return [];

    const hreflangLinks = page.head.querySelectorAll('link[rel="alternate"][hreflang]');
    if (hreflangLinks.length < 2) {
      // Only check x-default for pages that have multiple hreflang
      return [];
    }

    const hasDefault = Array.from(hreflangLinks).some(
      link => link.getAttribute('hreflang') === 'x-default'
    );

    if (!hasDefault) {
      return [{
        subject: ctx.url,
        evidence: ['Page has ' + hreflangLinks.length + ' hreflang links but no x-default'],
        remediation: 'Add <link rel="alternate" hreflang="x-default" href="FALLBACK_URL" /> for users outside targeted locales',
      }];
    }

    return [];
  },
});

export const hreflangDetectors = [
  HREFLANG_001,
  HREFLANG_002,
  HREFLANG_003,
];
