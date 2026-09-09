import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEeat } from '../../src/analysis/eeat.js';
import { formatEeatOutput } from '../../src/commands/inspectEeat.js';

test('evaluateEeat scores a well-sourced, authoritative page with high E-E-A-T', () => {
  const page = {
    url: 'https://example.com/research/performance-guide',
    rawVisibleWordCount: 850,
    text: `Written by Dr. Alice Smith, Chief Technology Architect.
           In our testing, we evaluated 40 enterprise applications across multiple clusters.
           Our findings revealed that database indexing improved response times by 42%.
           We deployed the patch in our production environment and measured the results.
           Published: October 14, 2025. Contact us at support@example.com for questions.
           Review our Privacy Policy and Terms of Service.`,
    html: `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": "Performance Guide",
    "datePublished": "2025-10-14",
    "author": {
      "@type": "Person",
      "name": "Dr. Alice Smith",
      "sameAs": "https://linkedin.com/in/alicesmith"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Example Corp"
    }
  }
  </script>
</head>
<body>
  <h1>Performance Guide</h1>
  <p>Written by Dr. Alice Smith, Chief Technology Architect.</p>
  <p>In our testing, we evaluated 40 enterprise applications across multiple clusters. Our findings revealed that database indexing improved response times by 42%.</p>
  <table><tr><th>Metric</th><th>Before</th><th>After</th></tr><tr><td>Latency</td><td>240ms</td><td>110ms</td></tr></table>
  <pre><code>const benchmark = runTest();</code></pre>
  <a href="https://w3.org/standards">W3C Standard</a>
  <a href="https://developer.mozilla.org/en-US/docs/Web">MDN Reference</a>
  <a href="/about">About Us</a>
  <a href="/contact">Contact</a>
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms</a>
</body>
</html>`,
    links: [
      { href: 'https://w3.org/standards', text: 'W3C Standard', rel: '' },
      { href: 'https://developer.mozilla.org/en-US/docs/Web', text: 'MDN Reference', rel: '' },
      { href: '/about', text: 'About Us', rel: '' },
      { href: '/contact', text: 'Contact', rel: '' },
      { href: '/privacy', text: 'Privacy Policy', rel: '' },
      { href: '/terms', text: 'Terms', rel: '' },
    ],
    headings: [
      { level: 1, text: 'Performance Guide' },
      { level: 2, text: 'Methodology' },
      { level: 2, text: 'Experimental Results' },
    ],
    jsonLd: [
      {
        blocks: [
          {
            '@type': 'TechArticle',
            datePublished: '2025-10-14',
            author: { name: 'Dr. Alice Smith', sameAs: 'https://linkedin.com/in/alicesmith' },
            publisher: { '@type': 'Organization', name: 'Example Corp' },
          },
        ],
      },
    ],
  };

  const result = evaluateEeat(page);
  assert.equal(result.fact_status, 'modeled_rubric_evaluation');
  assert.ok(result.composite_score >= 4.0, `Expected score >= 4.0, got ${result.composite_score}`);
  assert.equal(result.overall_rating, 'very_high');
  assert.equal(result.dimensions.expertise.author, 'Dr. Alice Smith');
  assert.ok(result.dimensions.experience.score >= 4.0);
  assert.ok(result.dimensions.trustworthiness.score >= 4.0);
  assert.ok(result.dimensions.authoritativeness.score >= 3.0);
});

test('evaluateEeat penalizes anonymous thin content with low trust', () => {
  const thinPage = {
    url: 'http://example.com/thin-post',
    rawVisibleWordCount: 120,
    text: 'Click here for the best cheap deals. Buy now while supplies last. No questions asked.',
    html: `<!DOCTYPE html><html><body><p>Click here for the best cheap deals.</p></body></html>`,
    links: [],
    headings: [],
    jsonLd: [],
  };

  const result = evaluateEeat(thinPage);
  assert.equal(result.fact_status, 'modeled_rubric_evaluation');
  assert.ok(result.composite_score <= 2.0, `Expected score <= 2.0, got ${result.composite_score}`);
  assert.equal(result.dimensions.expertise.author, null);
  assert.ok(result.actionable_improvements.length >= 4);
});

test('formatEeatOutput produces informative markdown report', () => {
  const dummy = {
    url: 'https://example.com/page',
    fact_status: 'modeled_rubric_evaluation',
    composite_score: 4.5,
    overall_rating: 'very_high',
    dimensions: {
      experience: { score: 4.5, signals: ['First-person observations'] },
      expertise: { score: 4.8, author: 'Dr. Smith', signals: ['Author credentials'] },
      authoritativeness: { score: 4.2, signals: ['Primary citations'] },
      trustworthiness: { score: 5.0, signals: ['HTTPS', 'Privacy policy'] },
    },
    actionable_improvements: [{ dimension: 'authoritativeness', recommendation: 'Add more external studies' }],
    disclaimer: 'E-E-A-T is an evaluative heuristic rubric',
  };

  const text = formatEeatOutput(dummy);
  assert.match(text, /Inspect E-E-A-T/);
  assert.match(text, /Composite Score: 4.5 \/ 5.0/);
  assert.match(text, /VERY_HIGH/);
});
