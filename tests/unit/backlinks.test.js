import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBacklinkFromHtml,
  normalizeProviderBacklink,
  compareBacklinkObservations,
  urlValue,
  domainOf,
  relTokens,
} from '../../src/observations/backlinks.js';
import {
  createArtifactProvenance,
  ACQUISITION_AUTHORITIES,
  TRANSPORT_MECHANISMS,
} from '../../src/evidence/artifactProvenance.js';
import { sha256 } from '../../src/shared/io.js';

test('URL parsing and domain normalization helpers', () => {
  assert.equal(urlValue('https://example.com/blog/post'), 'https://example.com/blog/post');
  assert.equal(urlValue('/about', 'https://example.com'), 'https://example.com/about');
  assert.throws(() => urlValue('https://user:pass@example.com'), /URLs may not contain credentials/);
  assert.throws(() => urlValue('ftp://example.com'), /unsupported URL protocol/);

  const domain = domainOf('https://sub.blog.example.co.uk/page');
  assert.equal(domain.host, 'sub.blog.example.co.uk');
  assert.equal(domain.registrable, 'example.co.uk');

  assert.deepEqual(relTokens('nofollow NOOPENER noreferrer NOFOLLOW'), ['nofollow', 'noopener', 'noreferrer']);
});

test('AC 6: qualifying link found returns OBSERVED with full link and provenance metadata', () => {
  const html = `
    <html>
      <body>
        <p>Check out <a href="https://target.test/product" rel="nofollow sponsored">Target Product</a> for details.</p>
      </body>
    </html>
  `;
  const obs = extractBacklinkFromHtml({
    html,
    sourceUrl: 'https://referring.test/article/1',
    targetUrl: 'https://target.test/product',
    retrieval: { status: 'SUCCEEDED', http_status: 200 },
  });

  assert.equal(obs.observation_status, 'OBSERVED');
  assert.equal(obs.source.normalized_url, 'https://referring.test/article/1');
  assert.equal(obs.source.referring_domain, 'referring.test');
  assert.equal(obs.target.normalized_url, 'https://target.test/product');
  assert.equal(obs.link.anchor_text, 'Target Product');
  assert.equal(obs.link.nofollow, true);
  assert.equal(obs.link.sponsored, true);
  assert.equal(obs.link.ugc, false);
  assert.deepEqual(obs.link.rel_tokens, ['nofollow', 'sponsored']);
  assert.ok(obs.acquisition_provenance);
  assert.equal(obs.acquisition_provenance.artifact_digest, sha256(html));
  assert.equal(obs.determination.state, 'CURRENT');
});

test('AC 7: successful bounded observation where link is absent returns NOT_OBSERVED', () => {
  const html = `
    <html>
      <body>
        <p>No external links here, only <a href="/internal">Internal Page</a>.</p>
      </body>
    </html>
  `;
  const obs = extractBacklinkFromHtml({
    html,
    sourceUrl: 'https://referring.test/article/2',
    targetUrl: 'https://target.test/product',
    retrieval: { status: 'SUCCEEDED', http_status: 200 },
    coverage: { status: 'COMPLETE', bounded_scope: true },
  });

  assert.equal(obs.observation_status, 'NOT_OBSERVED');
  assert.equal(obs.link, null);
  assert.ok(obs.determination.reason.includes('target link absent'));
});

test('AC 8: retrieval failure returns UNKNOWN and never NOT_OBSERVED (strict fail-closed invariant)', () => {
  const failureStatuses = ['FAILED', 'TIMEOUT', 'BLOCKED', 'UNAVAILABLE', 'NOT_ATTEMPTED'];

  for (const status of failureStatuses) {
    const obs = extractBacklinkFromHtml({
      html: null,
      sourceUrl: 'https://referring.test/article/fail',
      targetUrl: 'https://target.test/product',
      retrieval: { status, http_status: 500 },
    });

    assert.equal(obs.observation_status, 'UNKNOWN', `retrieval status ${status} must map to UNKNOWN`);
    assert.notEqual(obs.observation_status, 'NOT_OBSERVED', 'retrieval failure must NEVER become NOT_OBSERVED');
    assert.ok(obs.limitations.some((l) => l.includes('Retrieval failed')));
  }
});

test('AC 8: HTML parser failure returns UNKNOWN and never NOT_OBSERVED', () => {
  // Empty or non-string html with SUCCEEDED retrieval
  const obs = extractBacklinkFromHtml({
    html: null,
    sourceUrl: 'https://referring.test/article/null-body',
    targetUrl: 'https://target.test/product',
    retrieval: { status: 'SUCCEEDED', http_status: 200 },
  });

  assert.equal(obs.observation_status, 'UNKNOWN');
  assert.notEqual(obs.observation_status, 'NOT_OBSERVED');
});

test('AC 8: incomplete or partial coverage returns UNKNOWN when link is not found', () => {
  const truncatedHtml = '<html><body>Partial crawl content only...';
  const obs = extractBacklinkFromHtml({
    html: truncatedHtml,
    sourceUrl: 'https://referring.test/article/partial',
    targetUrl: 'https://target.test/product',
    retrieval: { status: 'SUCCEEDED', http_status: 200 },
    coverage: { status: 'PARTIAL', bounded_scope: false, unscanned_reason: 'crawl_timeout' },
  });

  // Since coverage is incomplete and link is absent, system cannot prove absence!
  assert.equal(obs.observation_status, 'UNKNOWN');
  assert.notEqual(obs.observation_status, 'NOT_OBSERVED');
  assert.ok(obs.limitations.some((l) => l.includes('Incomplete coverage prevents establishing link absence')));
});

test('AC 9: provider omission does NOT imply absence without exhaustive census contract', () => {
  // Case A: Standard provider omission without exhaustive contract -> UNKNOWN
  const partialProviderRecord = {
    provider: 'sample_backlink_api',
    record_id: 'REC-1234',
    source_url: 'https://referring.test/page',
    target_url: 'https://target.test/dest',
    present: false, // Provider omitted or did not find link
    is_exhaustive_census: false, // Standard non-exhaustive provider
  };
  const obsA = normalizeProviderBacklink({
    providerRecord: partialProviderRecord,
  });
  assert.equal(obsA.observation_status, 'UNKNOWN');
  assert.notEqual(obsA.observation_status, 'NOT_OBSERVED');
  assert.ok(obsA.limitations.some((l) => l.includes('Provider omission does not imply absence')));

  // Case B: Explicit exhaustive census contract -> NOT_OBSERVED
  const exhaustiveProviderRecord = {
    provider: 'authoritative_registry_census',
    record_id: 'REC-5678',
    source_url: 'https://referring.test/page',
    target_url: 'https://target.test/dest',
    present: false,
    is_exhaustive_census: true, // Explicitly declared exhaustive census
  };
  const obsB = normalizeProviderBacklink({
    providerRecord: exhaustiveProviderRecord,
  });
  assert.equal(obsB.observation_status, 'NOT_OBSERVED');

  // Case C: Provider affirmatively reports link -> OBSERVED
  const positiveProviderRecord = {
    provider: 'sample_backlink_api',
    record_id: 'REC-9999',
    source_url: 'https://referring.test/page',
    target_url: 'https://target.test/dest',
    present: true,
    link: { href: 'https://target.test/dest', anchor_text: 'Documentation' },
  };
  const obsC = normalizeProviderBacklink({
    providerRecord: positiveProviderRecord,
  });
  assert.equal(obsC.observation_status, 'OBSERVED');
});

test('AC 10: non-causal temporal comparison across compatible predecessor observations', () => {
  const sourceUrl = 'https://referring.test/page';
  const targetUrl = 'https://target.test/home';

  // 1. Initial observation: Link present with anchor "Home"
  const obs1 = extractBacklinkFromHtml({
    html: '<a href="https://target.test/home" rel="dofollow">Home</a>',
    sourceUrl,
    targetUrl,
  });

  // 2. Successor observation: Link present with modified anchor "Homepage"
  const obs2 = extractBacklinkFromHtml({
    html: '<a href="https://target.test/home" rel="dofollow">Homepage</a>',
    sourceUrl,
    targetUrl,
  });

  // 3. Successor observation: Link removed
  const obs3 = extractBacklinkFromHtml({
    html: '<p>No link here</p>',
    sourceUrl,
    targetUrl,
  });

  // Compare 1 vs 1: UNCHANGED
  const cmpUnchanged = compareBacklinkObservations(obs1, obs1);
  assert.equal(cmpUnchanged.status, 'COMPARABLE');
  assert.equal(cmpUnchanged.transition, 'UNCHANGED');
  assert.equal(cmpUnchanged.link_match.anchor_match, true);

  // Compare 1 vs 2: CHANGED
  const cmpChanged = compareBacklinkObservations(obs1, obs2);
  assert.equal(cmpChanged.status, 'COMPARABLE');
  assert.equal(cmpChanged.transition, 'CHANGED');
  assert.equal(cmpChanged.link_match.anchor_match, false);

  // Compare 1 vs 3: NO_LONGER_OBSERVED
  const cmpRemoved = compareBacklinkObservations(obs1, obs3);
  assert.equal(cmpRemoved.status, 'COMPARABLE');
  assert.equal(cmpRemoved.transition, 'NO_LONGER_OBSERVED');

  // Compare 3 vs 1: NEWLY_OBSERVED
  const cmpAdded = compareBacklinkObservations(obs3, obs1);
  assert.equal(cmpAdded.status, 'COMPARABLE');
  assert.equal(cmpAdded.transition, 'NEWLY_OBSERVED');

  // Compare with incompatible target URL: NOT_COMPARABLE
  const incompatibleTargetObs = extractBacklinkFromHtml({
    html: '<a href="https://other.test/page">Other</a>',
    sourceUrl,
    targetUrl: 'https://other.test/page',
  });
  const cmpIncompatible = compareBacklinkObservations(obs1, incompatibleTargetObs);
  assert.equal(cmpIncompatible.status, 'NOT_COMPARABLE');
  assert.equal(cmpIncompatible.transition, 'INDETERMINATE');

  // Compare when one is UNKNOWN: PARTIALLY_COMPARABLE / INDETERMINATE
  const unknownObs = extractBacklinkFromHtml({
    html: null,
    sourceUrl,
    targetUrl,
    retrieval: { status: 'FAILED' },
  });
  const cmpUnknown = compareBacklinkObservations(obs1, unknownObs);
  assert.equal(cmpUnknown.transition, 'INDETERMINATE');
});

test('AC 11: historical records remain immutable after comparison', () => {
  const sourceUrl = 'https://referring.test/article';
  const targetUrl = 'https://target.test/lib';

  const obsA = extractBacklinkFromHtml({
    html: '<a href="https://target.test/lib">Library</a>',
    sourceUrl,
    targetUrl,
  });
  const snapshotA = JSON.stringify(obsA);

  const obsB = extractBacklinkFromHtml({
    html: '<p>Removed</p>',
    sourceUrl,
    targetUrl,
  });
  const snapshotB = JSON.stringify(obsB);

  // Perform multiple comparisons
  compareBacklinkObservations(obsA, obsB);
  compareBacklinkObservations(obsB, obsA);

  // Ensure historical records are 100% byte-for-byte identical
  assert.equal(JSON.stringify(obsA), snapshotA, 'obsA must remain completely immutable');
  assert.equal(JSON.stringify(obsB), snapshotB, 'obsB must remain completely immutable');
});
