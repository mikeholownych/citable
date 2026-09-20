import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPage } from '../../src/extractor/page.js';
import { parseRobots, isAllowed } from '../../src/crawler/robots.js';
import { parseSitemap } from '../../src/crawler/sitemap.js';
import {
  declareGuardedLookupTransport,
  fetchUrl,
  handlePublicBrowserRoute,
} from '../../src/crawler/fetch.js';
import { buildSiteFromUrl } from '../../src/extractor/site.js';

test('extractPage captures title, canonical, robots, headings, links, jsonld', () => {
  const html = `<!doctype html><html lang="en"><head><title>T</title>
    <meta name="description" content="D"><meta name="robots" content="noindex, nosnippet">
    <link rel="canonical" href="https://x.test/a/">
    <script type="application/ld+json">{"@type":"Organization","name":"X"}</script>
    </head><body><header>Shared masthead words</header><nav>Shared navigation words</nav>
    <h1>H</h1><h2>Sub</h2><p>Hello world text.</p><a href="/b/">to b</a>
    <div style="display:none">hidden secret</div></body></html>`;
  const p = extractPage({ url: 'https://x.test/a/', html });
  assert.equal(p.title, 'T');
  assert.equal(p.metaDescription, 'D');
  assert.equal(p.noindex, true);
  assert.equal(p.nosnippet, true);
  assert.deepEqual(p.canonicals, ['https://x.test/a/']);
  assert.equal(p.h1s.length, 1);
  assert.equal(p.links.length, 1);
  assert.equal(p.jsonLd.length, 1);
  assert.equal(p.jsonLd[0].blocks[0].name, 'X');
  assert.ok(p.hiddenTexts.includes('hidden secret'));
  assert.ok(p.wordCount > 0);
  assert.equal(p.structuralRegions.length, 2);
  assert.ok(p.rawVisibleWordCount > p.wordCount);
});

test('extractPage reports JSON-LD parse errors without throwing', () => {
  const p = extractPage({ url: 'https://x.test/', html: `<html><head><script type="application/ld+json">{oops</script></head><body></body></html>` });
  assert.equal(p.jsonLd.length, 1);
  assert.ok(p.jsonLd[0].parseError);
});

test('x-robots-tag header contributes to noindex', () => {
  const p = extractPage({ url: 'https://x.test/', html: '<html><head><title>t</title></head><body></body></html>', headers: { 'x-robots-tag': 'noindex' } });
  assert.equal(p.noindex, true);
});

test('robots parser: group matching and longest-rule precedence', () => {
  const r = parseRobots(`User-agent: Googlebot\nDisallow: /private/\nAllow: /private/ok/\n\nUser-agent: *\nDisallow: /tmp/\nSitemap: https://x.test/sitemap.xml`);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.sitemaps, ['https://x.test/sitemap.xml']);
  assert.equal(isAllowed(r, 'Googlebot', '/private/x').allowed, false);
  assert.equal(isAllowed(r, 'Googlebot', '/private/ok/y').allowed, true);
  assert.equal(isAllowed(r, 'Googlebot', '/tmp/z').allowed, true); // specific group wins, no /tmp rule there
  assert.equal(isAllowed(r, 'SomeOtherBot', '/tmp/z').allowed, false);
  assert.equal(isAllowed(r, 'SomeOtherBot', '/fine').allowed, true);
});

test('robots parser records unknown directives as errors', () => {
  const r = parseRobots('User-agent: *\nWeird-directive: nonsense');
  assert.equal(r.errors.length, 1);
});

test('sitemap parser: urlset and index', () => {
  const s = parseSitemap(`<?xml version="1.0"?><urlset><url><loc>https://x.test/</loc><lastmod>2026-01-01</lastmod></url></urlset>`);
  assert.equal(s.isIndex, false);
  assert.equal(s.urls.length, 1);
  assert.equal(s.urls[0].lastmod, '2026-01-01');
  const i = parseSitemap(`<sitemapindex><sitemap><loc>https://x.test/a.xml</loc></sitemap></sitemapindex>`);
  assert.equal(i.isIndex, true);
  assert.equal(i.children.length, 1);
});

test('sitemap parser accepts a self-closing empty urlset root', () => {
  const sitemap = parseSitemap('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  assert.equal(sitemap.rootValid, true);
  assert.deepEqual(sitemap.urls, []);
  assert.deepEqual(sitemap.errors, []);
});

test('sitemap parser ignores root-like markup inside XML comments', () => {
  const sitemap = parseSitemap(`
    <!-- <urlset><url><loc>https://x.test/commented</loc></url></urlset> -->
    <urlset><url><loc>https://x.test/real</loc></url></urlset>`);
  assert.equal(sitemap.rootValid, true);
  assert.deepEqual(sitemap.urls.map((entry) => entry.loc), ['https://x.test/real']);
  assert.deepEqual(sitemap.errors, []);
});

test('sitemap parser rejects multiple document roots', () => {
  const sitemap = parseSitemap('<urlset></urlset><urlset></urlset>');
  assert.equal(sitemap.rootValid, false);
  assert.match(sitemap.errors.join('\n'), /multiple|extra root/i);
});

test('sitemap parser rejects malformed closure ordering', () => {
  const sitemap = parseSitemap('<urlset><url><loc>https://x.test/a</loc></urlset></url>');
  assert.equal(sitemap.rootValid, false);
  assert.match(sitemap.errors.join('\n'), /mismatched|unclosed/i);
});

test('sitemap parser treats sitemap element names as case-sensitive', () => {
  const sitemap = parseSitemap('<URLSET><URL><LOC>https://x.test/a</LOC></URL></URLSET>');
  assert.equal(sitemap.rootValid, false);
  assert.match(sitemap.errors.join('\n'), /unexpected sitemap root/i);
});

test('sitemap parser requires whitespace between XML attributes', () => {
  const sitemap = parseSitemap('<urlset xmlns="urn:test"id="joined"/>');
  assert.equal(sitemap.rootValid, false);
  assert.match(sitemap.errors.join('\n'), /malformed XML tag/i);
});

test('sitemap parser rejects duplicate XML attributes', () => {
  const sitemap = parseSitemap('<urlset xmlns="urn:one" xmlns="urn:two"/>');
  assert.equal(sitemap.rootValid, false);
  assert.match(sitemap.errors.join('\n'), /malformed XML tag/i);
});

test('sitemap parser rejects raw and unknown entity references in text', () => {
  for (const value of [
    'https://x.test/search?a=1&b=2',
    'https://x.test/search?value=&unknown;',
  ]) {
    const sitemap = parseSitemap(`<urlset><url><loc>${value}</loc></url></urlset>`);
    assert.equal(sitemap.rootValid, false, value);
    assert.match(sitemap.errors.join('\n'), /entity reference/i, value);
  }
});

test('sitemap parser decodes valid decimal and hexadecimal numeric character references', () => {
  const sitemap = parseSitemap(`
    <urlset><url><loc>https://x.test/?a=1&#38;b=2&#x26;c=3</loc></url></urlset>`);
  assert.equal(sitemap.rootValid, true);
  assert.equal(sitemap.urls[0].loc, 'https://x.test/?a=1&b=2&c=3');
});

test('sitemap parser rejects malformed and out-of-range numeric character references', () => {
  for (const reference of ['&#;', '&#x;', '&#-1;', '&#x110000;', '&#55296;', '&#0;']) {
    const sitemap = parseSitemap(`<urlset><url><loc>https://x.test/${reference}</loc></url></urlset>`);
    assert.equal(sitemap.rootValid, false, reference);
    assert.match(sitemap.errors.join('\n'), /entity reference/i, reference);
  }
});

test('sitemap parser decodes the five predefined XML entities', () => {
  const sitemap = parseSitemap(`
    <urlset><url><loc>https://x.test/?a=1&amp;b=&quot;x&quot;&apos;y&apos;&lt;z&gt;</loc></url></urlset>`);
  assert.equal(sitemap.rootValid, true);
  assert.equal(sitemap.urls[0].loc, `https://x.test/?a=1&b="x"'y'<z>`);
});

test('sitemap parser accepts prefixed elements only when their namespace prefix is bound', () => {
  const sitemap = parseSitemap(`
    <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><sm:loc>https://x.test/bound</sm:loc></sm:url>
    </sm:urlset>`);
  assert.equal(sitemap.rootValid, true);
  assert.deepEqual(sitemap.urls.map((entry) => entry.loc), ['https://x.test/bound']);

  const unbound = parseSitemap('<sm:urlset><sm:url><sm:loc>https://x.test/no</sm:loc></sm:url></sm:urlset>');
  assert.equal(unbound.rootValid, false);
  assert.match(unbound.errors.join('\n'), /unbound namespace prefix.*sm/i);
});

test('sitemap parser preserves default namespace behavior', () => {
  const sitemap = parseSitemap(`
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://x.test/default</loc></url>
    </urlset>`);
  assert.equal(sitemap.rootValid, true);
  assert.deepEqual(sitemap.urls.map((entry) => entry.loc), ['https://x.test/default']);
});

test('sitemap parser permits an XML declaration only at the start before the root', () => {
  const inside = parseSitemap('<urlset><?xml version="1.0"?></urlset>');
  assert.equal(inside.rootValid, false);
  assert.match(inside.errors.join('\n'), /XML declaration.*before.*root/i);

  const afterWhitespace = parseSitemap(' \n<?xml version="1.0"?><urlset/>');
  assert.equal(afterWhitespace.rootValid, false);
  assert.match(afterWhitespace.errors.join('\n'), /XML declaration.*start/i);

  const ordinary = parseSitemap('<urlset><?audit bounded?><url><loc>https://x.test/pi</loc></url></urlset>');
  assert.equal(ordinary.rootValid, true);
  assert.deepEqual(ordinary.urls.map((entry) => entry.loc), ['https://x.test/pi']);
});

test('sitemap parser reports a self-closing url entry with no loc', () => {
  const sitemap = parseSitemap('<urlset><url/></urlset>');
  assert.equal(sitemap.rootValid, true);
  assert.match(sitemap.errors.join('\n'), /missing <loc>/i);
});

test('sitemap parser only accepts entry blocks that are direct children of the root', () => {
  const sitemap = parseSitemap(`
    <urlset><wrapper><url><loc>https://x.test/nested</loc></url></wrapper></urlset>`);
  assert.equal(sitemap.rootValid, false);
  assert.deepEqual(sitemap.urls, []);
  assert.match(sitemap.errors.join('\n'), /direct child|unexpected/i);
});

test('sitemap parser bounds retained entries while reporting the full entry count', () => {
  const sitemap = parseSitemap(`
    <urlset>
      <url><loc>https://x.test/1</loc></url>
      <url><loc>https://x.test/2</loc></url>
      <url><loc>https://x.test/3</loc></url>
    </urlset>`, { maxUrls: 2 });
  assert.equal(sitemap.urls.length, 2);
  assert.equal(sitemap.urlCount, 3);
  assert.equal(sitemap.truncated, true);
  assert.equal(sitemap.truncationReason, 'max_urls_exceeded');
});

test('sitemap parser has an independent raw-entry safety bound', () => {
  const sitemap = parseSitemap(`
    <urlset>
      <url><loc>https://x.test/1</loc></url>
      <url><loc>https://x.test/2</loc></url>
      <url><loc>https://x.test/3</loc></url>
    </urlset>`, { maxEntries: 2 });
  assert.equal(sitemap.urls.length, 2);
  assert.equal(sitemap.rawEntryCount, 3);
  assert.equal(sitemap.truncated, true);
  assert.equal(sitemap.truncationReason, 'max_entries_exceeded');
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('fetchUrl refuses redirects outside the audited origin', async () => {
  const fetchImpl = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://other.example/next' },
  });
  await assert.rejects(
    fetchUrl('https://audit.example/', {
      fetchImpl, lookup: publicLookup, allowUnsafeCustomTransportForTest: true,
    }),
    /redirect.*origin/i,
  );
});

test('fetchUrl refuses private and loopback destinations', async () => {
  await assert.rejects(
    fetchUrl('http://127.0.0.1/private', { fetchImpl: globalThis.fetch }),
    /private|loopback/i,
  );
  await assert.rejects(
    fetchUrl('http://[::1]/private', { fetchImpl: globalThis.fetch }),
    /private|loopback/i,
  );
});

test('fetchUrl refuses documentation and benchmark address ranges', async () => {
  for (const url of [
    'http://192.0.2.1/',
    'http://198.18.0.1/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://[2001:db8::1]/',
  ]) {
    await assert.rejects(
      fetchUrl(url, { fetchImpl: globalThis.fetch }),
      /private|loopback|non-public/i,
      url,
    );
  }
});

test('fetchUrl refuses DNS rebinding from a public validation result to a private connection address', async () => {
  let resolutions = 0;
  const lookup = async () => {
    resolutions += 1;
    return resolutions === 1
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  };

  await assert.rejects(
    fetchUrl('http://audit.example/', { lookup, maxRetries: 1 }),
    /private|loopback|non-public/i,
  );
  assert.equal(resolutions, 2);
});

test('browser route guard allows safe local schemes and aborts private or unsupported requests', async () => {
  const outcome = async (url) => {
    let state = null;
    await handlePublicBrowserRoute({
      request: () => ({ url: () => url }),
      continue: async () => { state = 'continued'; },
      abort: async () => { state = 'aborted'; },
    }, { lookup: publicLookup });
    return state;
  };
  assert.equal(await outcome('data:text/plain,hello'), 'continued');
  assert.equal(await outcome('blob:https://audit.example/id'), 'continued');
  assert.equal(await outcome('about:blank'), 'continued');
  assert.equal(await outcome('https://audit.example/image.png'), 'continued');
  assert.equal(await outcome('http://127.0.0.1/internal'), 'aborted');
  assert.equal(await outcome('file:///etc/passwd'), 'aborted');
});

test('fetchUrl rejects response bodies above the configured byte limit', async () => {
  const fetchImpl = async () => new Response('x'.repeat(32));
  await assert.rejects(
    fetchUrl('https://audit.example/', {
      fetchImpl, lookup: publicLookup, maxBodyBytes: 16, allowUnsafeCustomTransportForTest: true,
    }),
    /body.*16 bytes/i,
  );
});

test('fetchUrl applies a fresh timeout to every retry attempt', async () => {
  let attempts = 0;
  const fetchImpl = async (_url, { signal }) => {
    attempts += 1;
    if (attempts === 1) throw new TypeError('transient network failure');
    return await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  await assert.rejects(
    fetchUrl('https://audit.example/', {
      fetchImpl,
      lookup: publicLookup,
      maxRetries: 2,
      retryDelayMs: 0,
      timeoutMs: 10,
      allowUnsafeCustomTransportForTest: true,
    }),
    /abort|timeout/i,
  );
  assert.equal(attempts, 2);
});

test('fetchUrl rejects unguarded custom transports before they can execute', async () => {
  let executed = false;
  const fetchImpl = async () => {
    executed = true;
    return new Response('unsafe');
  };

  await assert.rejects(
    fetchUrl('https://audit.example/', { fetchImpl, lookup: publicLookup }),
    /custom transport.*guarded lookup/i,
  );
  assert.equal(executed, false);
});

test('fetchUrl accepts a declared custom transport that uses the guarded lookup hook', async () => {
  let connectionLookups = 0;
  const fetchImpl = declareGuardedLookupTransport(async (_url, { lookup }) => {
    await new Promise((resolve, reject) => {
      lookup('audit.example', { family: 0 }, (error) => {
        if (error) reject(error);
        else {
          connectionLookups += 1;
          resolve();
        }
      });
    });
    return new Response('safe');
  });

  const response = await fetchUrl('https://audit.example/', {
    fetchImpl, lookup: publicLookup, maxRetries: 1,
  });
  assert.equal(response.body, 'safe');
  assert.equal(connectionLookups, 1);
});

test('a declared custom transport refuses a private connection-time DNS rebound', async () => {
  let resolutions = 0;
  const lookup = async () => {
    resolutions += 1;
    return resolutions === 1
      ? [{ address: '93.184.216.34', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  };
  const fetchImpl = declareGuardedLookupTransport(async (_url, options) => {
    await new Promise((resolve, reject) => {
      options.lookup('audit.example', { family: 0 }, (error) => error ? reject(error) : resolve());
    });
    return new Response('must not be returned');
  });

  await assert.rejects(
    fetchUrl('https://audit.example/', { fetchImpl, lookup, maxRetries: 1 }),
    /private|loopback|non-public/i,
  );
  assert.equal(resolutions, 2);
});

test('fetchUrl preserves attempt history through failures and eventual success', async () => {
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) throw Object.assign(new Error('temporary socket failure with secret detail'), { code: 'ECONNRESET' });
    if (call === 2) return new Response('retry later', { status: 503 });
    return new Response('<html><body>Recovered response body with enough useful content.</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };
  const response = await fetchUrl('https://audit.example/', {
    fetchImpl, lookup: publicLookup, maxRetries: 3, retryDelayMs: 0,
    allowUnsafeCustomTransportForTest: true,
  });
  assert.equal(response.bodyComplete, true);
  assert.deepEqual(response.attempts.map(({ attempt, outcome, status, errorCode, retryDecision }) => ({ attempt, outcome, status, errorCode, retryDecision })), [
    { attempt: 1, outcome: 'error', status: null, errorCode: 'ECONNRESET', retryDecision: 'retry' },
    { attempt: 2, outcome: 'response', status: 503, errorCode: null, retryDecision: 'retry' },
    { attempt: 3, outcome: 'response', status: 200, errorCode: null, retryDecision: 'complete' },
  ]);
  assert.ok(response.attempts.every((attempt) => attempt.elapsedMs >= 0));
  assert.doesNotMatch(JSON.stringify(response.attempts), /secret detail/);
});

test('fetchUrl retries timeout errors and records the timeout outcome', async () => {
  let call = 0;
  const fetchImpl = async (_url, { signal }) => {
    call += 1;
    if (call > 1) return new Response('ok', { headers: { 'content-type': 'text/html' } });
    return await new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const response = await fetchUrl('https://audit.example/', {
    fetchImpl, lookup: publicLookup, maxRetries: 2, retryDelayMs: 0, timeoutMs: 5,
    allowUnsafeCustomTransportForTest: true,
  });
  assert.equal(response.attempts[0].outcome, 'error');
  assert.equal(response.attempts[0].errorCode, 'FETCH_TIMEOUT');
  assert.equal(response.attempts[0].retryDecision, 'retry');
  assert.equal(response.attempts[1].status, 200);
});

test('fetchUrl does not retry a non-retryable 501 response', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('not implemented', { status: 501 });
  };
  const response = await fetchUrl('https://audit.example/', {
    fetchImpl, lookup: publicLookup, maxRetries: 3, retryDelayMs: 0,
    allowUnsafeCustomTransportForTest: true,
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 501);
  assert.equal(response.attempts.length, 1);
  assert.equal(response.attempts[0].retryDecision, 'stop');
});

test('fetchUrl records permanent DNS preflight failure as an attempt', async () => {
  let transportCalls = 0;
  const lookup = async () => {
    throw Object.assign(new Error('host not found'), { code: 'ENOTFOUND' });
  };
  await assert.rejects(
    fetchUrl('https://missing.example/', {
      lookup,
      fetchImpl: async () => { transportCalls += 1; return new Response('unexpected'); },
      maxRetries: 3,
      allowUnsafeCustomTransportForTest: true,
    }),
    (error) => {
      assert.equal(transportCalls, 0);
      assert.deepEqual(error.attempts.map(({ attempt, outcome, status, errorCode, retryDecision }) => ({ attempt, outcome, status, errorCode, retryDecision })), [
        { attempt: 1, outcome: 'error', status: null, errorCode: 'ENOTFOUND', retryDecision: 'stop' },
      ]);
      return true;
    },
  );
});

test('fetchUrl attaches sanitized attempt provenance to permanent failures', async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error('token=do-not-record'), { code: 'ENETUNREACH' });
  };
  await assert.rejects(
    fetchUrl('https://audit.example/', {
      fetchImpl, lookup: publicLookup, maxRetries: 2, retryDelayMs: 0,
      allowUnsafeCustomTransportForTest: true,
    }),
    (error) => {
      assert.deepEqual(error.attempts.map(({ outcome, errorCode, retryDecision }) => ({ outcome, errorCode, retryDecision })), [
        { outcome: 'error', errorCode: 'ENETUNREACH', retryDecision: 'retry' },
        { outcome: 'error', errorCode: 'ENETUNREACH', retryDecision: 'stop' },
      ]);
      assert.doesNotMatch(JSON.stringify(error.attempts), /do-not-record/);
      return true;
    },
  );
});

test('fetchUrl does not copy query secrets or untrusted error codes into attempt provenance', async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error('credential detail'), { code: 'SECRET-token-value' });
  };
  await assert.rejects(
    fetchUrl('https://audit.example/page?access_token=do-not-record', {
      fetchImpl, lookup: publicLookup, maxRetries: 1,
      allowUnsafeCustomTransportForTest: true,
    }),
    (error) => {
      assert.equal(error.attempts[0].errorCode, 'FETCH_ERROR');
      assert.doesNotMatch(JSON.stringify(error.attempts), /do-not-record|token-value/);
      return true;
    },
  );
});

test('fetchUrl records redirect responses and final retrieval in one attempt history', async () => {
  const fetchImpl = async (url) => url.endsWith('/old')
    ? new Response(null, { status: 301, headers: { location: '/new' } })
    : new Response('<html><body>Destination page with substantive information for visitors.</body></html>', {
      headers: { 'content-type': 'text/html' },
    });
  const response = await fetchUrl('https://audit.example/old', {
    fetchImpl, lookup: publicLookup, maxRetries: 1,
    allowUnsafeCustomTransportForTest: true,
  });
  assert.equal(response.url, 'https://audit.example/new');
  assert.deepEqual(response.attempts.map(({ attempt, url, status, retryDecision }) => ({ attempt, url, status, retryDecision })), [
    { attempt: 1, url: 'https://audit.example/old', status: 301, retryDecision: 'redirect' },
    { attempt: 2, url: 'https://audit.example/new', status: 200, retryDecision: 'complete' },
  ]);
});

test('fetchUrl redacts redirect query secrets from errors and redirect-chain provenance', async () => {
  const sameOriginFetch = async (url) => url.includes('/old')
    ? new Response(null, { status: 302, headers: { location: '/new?token=redirect-secret' } })
    : new Response('ok');
  const response = await fetchUrl('https://audit.example/old?token=request-secret', {
    fetchImpl: sameOriginFetch, lookup: publicLookup, maxRetries: 1,
    allowUnsafeCustomTransportForTest: true,
  });
  assert.doesNotMatch(JSON.stringify(response.redirectChain), /redirect-secret|request-secret/);
  assert.match(response.redirectChain[0].url, /\[REDACTED\]/);
  assert.match(response.redirectChain[0].location, /\[REDACTED\]/);

  await assert.rejects(
    fetchUrl('https://audit.example/old?token=request-secret', {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: 'https://other.example/next?token=redirect-secret' },
      }),
      lookup: publicLookup,
      maxRetries: 1,
      allowUnsafeCustomTransportForTest: true,
    }),
    (error) => {
      assert.doesNotMatch(error.message, /redirect-secret|request-secret/);
      assert.equal(error.code, 'FETCH_REDIRECT_ORIGIN');
      return true;
    },
  );
});

test('buildSiteFromUrl attaches resource validity, URL identity, and retrieval metadata to pages only', async () => {
  const fetcher = async (url) => {
    if (url.endsWith('/robots.txt')) return { url, requestedUrl: url, status: 200, headers: { 'content-type': 'text/plain' }, body: '', bodyComplete: true, redirectChain: [], attempts: [] };
    if (url.endsWith('/sitemap.xml')) return { url, requestedUrl: url, status: 404, headers: { 'content-type': 'application/xml' }, body: '', bodyComplete: true, redirectChain: [], attempts: [] };
    return {
      url: 'https://fixture.test/Home/', requestedUrl: url, status: 200,
      headers: { 'content-type': 'text/html' }, bodyComplete: true,
      body: '<html><head><link rel="canonical" href="/canonical"></head><body><h1>Home</h1><p>A substantive page describing the product, its operation, support, and limitations.</p></body></html>',
      redirectChain: [{ url, status: 301, location: '/Home/' }],
      attempts: [{ attempt: 1, outcome: 'response', status: 301, retryDecision: 'redirect' }],
    };
  };
  const site = await buildSiteFromUrl('https://fixture.test/', { fetcher, maxPages: 1 });
  assert.equal(site.pages.length, 1);
  const [page] = site.pages;
  assert.equal(page.url, 'https://fixture.test/Home/');
  assert.equal(page.requestedUrl, 'https://fixture.test/');
  assert.equal(page.resourceValidity.state, 'valid_resource');
  assert.equal(page.urlIdentity.requested.url, 'https://fixture.test/');
  assert.equal(page.urlIdentity.effective.url, 'https://fixture.test/Home/');
  assert.equal(page.urlIdentity.canonical.normalized_url, 'https://fixture.test/canonical');
  assert.equal(page.bodyComplete, true);
  assert.equal(page.fetchAttempts.length, 1);
  assert.equal(site.sitemaps.length, 0);
  assert.equal(site.sitemapTopology.documents[0].resourceValidity, undefined);
});

test('buildSiteFromUrl preserves the original requested URL spelling for page identity', async () => {
  const fetcher = async (url) => {
    if (url.endsWith('/robots.txt')) return { url, status: 200, headers: { 'content-type': 'text/plain' }, body: '', redirectChain: [] };
    if (url.endsWith('/sitemap.xml')) return { url, status: 404, headers: { 'content-type': 'application/xml' }, body: '', redirectChain: [] };
    return {
      url: 'https://mixed.example/Path?Q=One',
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body><p>Substantive content for the mixed-case URL identity integration test.</p></body></html>',
      redirectChain: [],
    };
  };
  const site = await buildSiteFromUrl('HTTPS://MiXeD.Example:443/Path?Q=One#section', { fetcher, maxPages: 1 });
  const [page] = site.pages;
  assert.equal(page.requestedUrl, 'HTTPS://MiXeD.Example:443/Path?Q=One');
  assert.equal(page.url, 'https://mixed.example/Path?Q=One');
  assert.deepEqual(page.urlIdentity.requested, {
    url: 'HTTPS://MiXeD.Example:443/Path?Q=One',
    normalized_url: 'HTTPS://MiXeD.Example/Path?Q=One',
  });
});

test('buildSiteFromUrl sanitizes URL queries and transport details in fetchErrors', async () => {
  const fetcher = async (url) => {
    if (url.endsWith('/robots.txt')) return { url, status: 200, headers: { 'content-type': 'text/plain' }, body: '', redirectChain: [] };
    if (url.endsWith('/sitemap.xml')) return { url, status: 404, headers: { 'content-type': 'application/xml' }, body: '', redirectChain: [] };
    throw new Error('internal socket detail token=transport-secret');
  };
  const site = await buildSiteFromUrl('https://fixture.test/private?token=query-secret', { fetcher, maxPages: 1 });
  assert.ok(site.fetchErrors.length >= 1);
  assert.doesNotMatch(JSON.stringify(site.fetchErrors), /query-secret|transport-secret|internal socket detail/);
  assert.ok(site.fetchErrors.some((error) => /\[REDACTED\].*FETCH_ERROR/.test(error)));
});

test('buildSiteFromUrl sanitizes and bounds caller-supplied attempt metadata', async () => {
  const unsafeAttempts = Array.from({ length: 125 }, (_, index) => ({
    attempt: index + 1,
    url: `https://fixture.test/page?token=attempt-secret-${index}`,
    startedAtMs: index,
    endedAtMs: index + 1,
    elapsedMs: 1,
    outcome: 'error',
    status: null,
    errorCode: 'TOKEN_IS_SECRET',
    retryDecision: 'retry',
    internalMessage: `private-detail-${index}`,
  }));
  const fetcher = async (url) => {
    if (url.endsWith('/robots.txt')) return { url, status: 200, headers: { 'content-type': 'text/plain' }, body: '', redirectChain: [] };
    if (url.endsWith('/sitemap.xml')) return { url, status: 404, headers: { 'content-type': 'application/xml' }, body: '', redirectChain: [] };
    return {
      url,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body><p>Substantive content for attempt sanitization verification.</p></body></html>',
      redirectChain: [],
      attempts: unsafeAttempts,
    };
  };
  const site = await buildSiteFromUrl('https://fixture.test/page', { fetcher, maxPages: 1 });
  const [page] = site.pages;
  assert.equal(page.fetchAttempts.length, 100);
  assert.equal(page.fetchAttemptsTruncated, true);
  assert.equal(page.fetchAttempts[0].errorCode, 'FETCH_ERROR');
  assert.deepEqual(Object.keys(page.fetchAttempts[0]).sort(), [
    'attempt', 'elapsedMs', 'endedAtMs', 'errorCode', 'outcome', 'retryDecision', 'startedAtMs', 'status', 'url',
  ]);
  assert.doesNotMatch(JSON.stringify(page.fetchAttempts), /attempt-secret|private-detail|TOKEN_IS_SECRET/);
});
