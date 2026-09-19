import test from 'node:test';
import assert from 'node:assert/strict';
import { createUrlIdentity, normalizeUrlIdentity } from '../../src/crawler/urlIdentity.js';

test('normalizeUrlIdentity removes only fragments and default ports', () => {
  assert.equal(
    normalizeUrlIdentity('HTTPS://Example.COM:443/Path/?Q=One#Section'),
    'HTTPS://Example.COM/Path/?Q=One',
  );
  assert.equal(
    normalizeUrlIdentity('http://Example.COM:80/Path?Q=One#Section'),
    'http://Example.COM/Path?Q=One',
  );
  assert.equal(normalizeUrlIdentity('https://Example.COM:444/Path/'), 'https://Example.COM:444/Path/');
});

test('normalizeUrlIdentity preserves query, scheme and host spelling, path case, and trailing slash', () => {
  assert.notEqual(normalizeUrlIdentity('https://x.test/A'), normalizeUrlIdentity('https://x.test/a'));
  assert.notEqual(normalizeUrlIdentity('https://x.test/a'), normalizeUrlIdentity('https://x.test/a/'));
  assert.notEqual(normalizeUrlIdentity('https://x.test/a?q=1'), normalizeUrlIdentity('https://x.test/a?q=2'));
  assert.equal(normalizeUrlIdentity('HtTpS://MiXeD.Example/A/?Q=X'), 'HtTpS://MiXeD.Example/A/?Q=X');
});

test('createUrlIdentity retains requested, effective, redirect, and canonical identities separately', () => {
  const identity = createUrlIdentity({
    requestedUrl: 'https://Example.test:443/Old#frag',
    effectiveUrl: 'https://Example.test/New/',
    redirectChain: [{ url: 'https://Example.test:443/Old#frag', status: 301, location: '/New/' }],
    declaredCanonicalUrl: 'HTTPS://Canonical.Example/article#section',
  });
  assert.equal(identity.normalization_version, 'url-identity-v1');
  assert.deepEqual(identity.requested, {
    url: 'https://Example.test:443/Old#frag',
    normalized_url: 'https://Example.test/Old',
  });
  assert.equal(identity.effective.normalized_url, 'https://Example.test/New/');
  assert.equal(identity.redirect.length, 1);
  assert.equal(identity.redirect[0].status, 301);
  assert.equal(identity.canonical.normalized_url, 'HTTPS://Canonical.Example/article');
  assert.match(identity.resource_id, /^RESOURCE-[A-F0-9]{24}$/);

  const withoutCanonical = createUrlIdentity({ requestedUrl: 'https://x.test/', effectiveUrl: 'https://x.test/' });
  assert.equal(withoutCanonical.canonical, null);
  assert.equal(withoutCanonical.resource_id, createUrlIdentity({
    requestedUrl: 'https://x.test/source', effectiveUrl: 'https://x.test/#part',
  }).resource_id);
});

test('createUrlIdentity refuses an effective origin change instead of silently changing crawl policy', () => {
  assert.throws(() => createUrlIdentity({
    requestedUrl: 'https://audit.example/a',
    effectiveUrl: 'https://other.example/a',
  }), /effective URL origin differs/i);
});

test('createUrlIdentity preserves invalid canonical declarations without changing resource identity', () => {
  const identity = createUrlIdentity({
    requestedUrl: 'https://audit.example/page',
    effectiveUrl: 'https://audit.example/page',
    declaredCanonicalUrl: 'http://[',
  });
  assert.deepEqual(identity.canonical, { url: 'http://[', normalized_url: null });
  assert.match(identity.resource_id, /^RESOURCE-/);
});
