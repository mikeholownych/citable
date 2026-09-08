import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimateTitlePixelWidth,
  truncateTitleByPixels,
  truncateSnippet,
  buildSerpBreadcrumb,
  evaluateRichSnippetEligibility,
  inspectSerp,
} from '../../src/commands/inspectSerp.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('SERP title pixel width estimation and truncation', () => {
  const shortTitle = 'Citable Documentation';
  const width = estimateTitlePixelWidth(shortTitle);
  assert.ok(width > 100 && width < 300, `unexpected width: ${width}`);

  const shortRes = truncateTitleByPixels(shortTitle, 600);
  assert.equal(shortRes.truncated, false);
  assert.equal(shortRes.text, shortTitle);

  const longTitle = 'Super Long Title That Goes On And On To Exceed Six Hundred Pixels In Length Across Typical Desktop Search Engine Result Displays Without Stopping Anywhere Soon';
  const longRes = truncateTitleByPixels(longTitle, 600);
  assert.equal(longRes.truncated, true);
  assert.ok(longRes.text.endsWith('...'));
  assert.ok(longRes.text.length < longTitle.length);
});

test('SERP snippet truncation', () => {
  const shortSnippet = 'A concise meta description for search results.';
  assert.deepEqual(truncateSnippet(shortSnippet, 160), { text: shortSnippet, truncated: false });

  const longSnippet = 'A'.repeat(220);
  const trunc = truncateSnippet(longSnippet, 160);
  assert.equal(trunc.truncated, true);
  assert.ok(trunc.text.endsWith('...'));
  assert.ok(trunc.text.length <= 160);
});

test('SERP breadcrumb construction from schema and URL fallback', () => {
  const pageWithSchema = {
    url: 'https://example.test/products/security/gatekeeper',
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { position: 1, name: 'Home', item: 'https://example.test/' },
              { position: 2, name: 'Products', item: 'https://example.test/products/' },
              { position: 3, name: 'Gatekeeper', item: 'https://example.test/products/security/gatekeeper' },
            ],
          },
        ],
      },
    ],
  };
  const bcSchema = buildSerpBreadcrumb(pageWithSchema);
  assert.equal(bcSchema.source, 'schema');
  assert.equal(bcSchema.display, 'Home > Products > Gatekeeper');

  const pageFallback = {
    url: 'https://example.test/features/governance/auditing',
    jsonLd: [],
  };
  const bcFallback = buildSerpBreadcrumb(pageFallback);
  assert.equal(bcFallback.source, 'url_fallback');
  assert.equal(bcFallback.display, 'example.test > features > governance > auditing');
});

test('Rich snippet eligibility evaluation', () => {
  const completePage = {
    url: 'https://example.test/items/widget',
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'Product',
            name: 'Enterprise Gatekeeper',
            offers: { price: '499', priceCurrency: 'USD' },
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {
                name: 'What does Gatekeeper do?',
                acceptedAnswer: { text: 'It enforces real-time governance.' },
              },
            ],
          },
        ],
      },
    ],
  };
  const res = evaluateRichSnippetEligibility(completePage);
  assert.equal(res.product.status, 'eligible');
  assert.equal(res.faq.status, 'eligible');
  assert.equal(res.article.status, 'not_applicable');
  assert.equal(res.breadcrumb.status, 'missing');
});

test('inspectSerp end-to-end execution', async () => {
  const root = path.join(FIX, 'site-clean');
  const res = await inspectSerp(root, '/products/gatekeeper/', {
    target: path.join(FIX, 'site-clean'),
    baseUrl: 'https://example.test',
  });
  assert.ok(res.url);
  assert.ok(res.desktop);
  assert.ok(res.mobile);
  assert.ok(res.richSnippets);
});
