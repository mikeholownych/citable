/**
 * Core Web Vitals detectors
 *
 * NOTE: These are infrastructure/readiness checks only. No live CWV measurement.
 * Real CWV data requires browser instrumentation or Search Console API access.
 *
 * Vitals:
 * - LCP (Largest Contentful Paint): < 2.5s good, < 4s needs improvement
 * - FID (First Input Delay): < 100ms good, < 300ms needs improvement (replaced by INP)
 * - INP (Interaction to Next Paint): < 200ms good, < 500ms needs improvement
 * - CLS (Cumulative Layout Shift): < 0.1 good, < 0.25 needs improvement
 */

import { defineDetector } from './framework.js';

/**
 * CWV-001: LCP element identified and optimized
 *
 * Checks for common LCP blockers. Cannot measure actual LCP.
 */
export const CWV_001 = defineDetector({
  id: 'CWV-001',
  name: 'LCP potential blockers',
  namespace: 'CWV',
  discipline: ['seo'],
  severity: 'medium',
  deterministic: true,
  determinismNote: 'Checks infrastructure only; cannot measure actual LCP',
  description: 'Page has potential LCP blockers (render-blocking resources, unoptimized images)',
  remediation: 'Eliminate render-blocking resources, preload LCP image, use srcset for responsive images',
  verification: 'Manual Lighthouse run or Search Console CWV report',
  check: (ctx) => {
    const hits = [];
    const page = ctx.page;
    if (!page || !page.head) return hits;

    // Check for render-blocking scripts
    const scripts = page.head.querySelectorAll('script:not([async]):not([defer])');
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src && !src.includes('analytics') && !src.includes('tracking')) {
        hits.push({
          subject: ctx.url,
          evidence: ['Render-blocking script: ' + src],
          remediation: 'Add async or defer attribute, or move script to end of body',
        });
        break; // One hit enough
      }
    }

    // Check for render-blocking stylesheets
    const styles = page.head.querySelectorAll('link[rel="stylesheet"]');
    const headStyleCount = styles.length;
    if (headStyleCount > 5) {
      hits.push({
        subject: ctx.url,
        evidence: [headStyleCount + ' stylesheets in <head> may delay rendering'],
        remediation: 'Combine critical CSS inline, defer non-critical stylesheets',
      });
    }

    // Check for images without dimensions (causes CLS)
    const bodyImages = (page.body || page).querySelectorAll?.('img:not([width]):not([height])') || [];
    if (bodyImages.length > 0) {
      hits.push({
        subject: ctx.url,
        evidence: [bodyImages.length + ' images without explicit width/height attributes'],
        remediation: 'Add width and height attributes to all images to prevent layout shift',
      });
    }

    return hits;
  },
});

/**
 * CWV-002: Preconnect hints for critical origins
 */
export const CWV_002 = defineDetector({
  id: 'CWV-002',
  name: 'preconnect hints',
  namespace: 'CWV',
  discipline: ['seo'],
  severity: 'low',
  deterministic: true,
  description: 'Page uses preconnect for critical third-party origins',
  remediation: 'Add <link rel="preconnect"> for fonts, analytics, CDN origins',
  verification: 'Check network waterfall for connection timing',
  check: (ctx) => {
    const page = ctx.page;
    if (!page || !page.head) return [];

    const preconnects = page.head.querySelectorAll('link[rel="preconnect"]');
    
    // Check for external fonts without preconnect
    const fontLinks = page.head.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[href*="typekit.net"]');
    
    if (fontLinks.length > 0 && preconnects.length === 0) {
      return [{
        subject: ctx.url,
        evidence: ['Page loads external fonts but has no preconnect hints'],
        remediation: 'Add <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      }];
    }

    return [];
  },
});

/**
 * CWV-003: Image optimization for LCP
 */
export const CWV_003 = defineDetector({
  id: 'CWV-003',
  name: 'image optimization',
  namespace: 'CWV',
  discipline: ['seo'],
  severity: 'medium',
  deterministic: true,
  description: 'Hero/LCP candidate images use modern formats and responsive sizing',
  remediation: 'Use WebP/AVIF with fallback, implement srcset for responsive images',
  verification: 'Check Network panel for image format and size',
  check: (ctx) => {
    const page = ctx.page;
    if (!page) return [];

    // Find large images in the first viewport (approximate LCP candidates)
    const doc = page.body || page.documentElement || page;
    const heroImages = doc.querySelectorAll?.('img') || [];
    const hits = [];

    for (const img of heroImages) {
      const src = img.getAttribute('src') || '';
      const srcset = img.getAttribute('srcset');
      const loading = img.getAttribute('loading');
      
      // Check for modern format
      if (src && !src.includes('.webp') && !src.includes('.avif') && !srcset) {
        // Could be a hit - but we can't measure actual size
        // Just flag that srcset is missing for responsive sizing
        if (heroImages.length === 1) {
          hits.push({
            subject: src,
            evidence: ['Single hero image without srcset'],
            remediation: 'Add srcset for responsive image sizing across devices',
          });
        }
        break; // One hit enough
      }

      // Check for eager loading on above-fold images
      const width = parseInt(img.getAttribute('width') || '0', 10);
      if (width > 300 && loading === 'lazy') {
        hits.push({
          subject: src,
          evidence: ['Large image uses lazy loading - may delay LCP'],
          remediation: 'Remove loading="lazy" from above-fold images',
        });
        break;
      }
    }

    return hits;
  },
});

export const cwvDetectors = [
  CWV_001,
  CWV_002,
  CWV_003,
];
