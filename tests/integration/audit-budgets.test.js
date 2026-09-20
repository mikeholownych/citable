import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import * as contextModule from '../../src/commands/context.js';
import { buildSiteFromUrl } from '../../src/extractor/site.js';
import { readJson, readYaml, writeYaml } from '../../src/shared/io.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const { buildContext } = contextModule;

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-audit-budget-'));
  init(root);
  return root;
}

function response(url, body = '<title>Fixture</title><h1>Fixture</h1>', contentType = 'text/html') {
  return {
    url,
    status: 200,
    headers: { 'content-type': contentType },
    body,
    redirectChain: [],
  };
}

test('config schema accepts bounded audit page and time budgets', () => {
  for (const auditConfig of [
    { max_pages: 1, time_budget_seconds: 1 },
    { max_pages: 10_000, time_budget_seconds: 86_400 },
  ]) {
    const result = validateAgainst('config.schema.json', { version: 1, audit: auditConfig });
    assert.equal(result.valid, true, result.errors.join('; '));
  }

  for (const auditConfig of [
    { max_pages: 0 },
    { max_pages: 10_001 },
    { time_budget_seconds: 0 },
    { time_budget_seconds: 86_401 },
  ]) {
    assert.equal(validateAgainst('config.schema.json', { version: 1, audit: auditConfig }).valid, false);
  }
});

test('resolveAuditBudgets uses CLI options over config over defaults', () => {
  assert.equal(typeof contextModule.resolveAuditBudgets, 'function');
  assert.deepEqual(contextModule.resolveAuditBudgets({}, {}), {
    maxPages: 500,
    timeBudgetSeconds: 1800,
  });
  assert.deepEqual(contextModule.resolveAuditBudgets({ audit: { max_pages: 40, time_budget_seconds: 90 } }, {}), {
    maxPages: 40,
    timeBudgetSeconds: 90,
  });
  assert.deepEqual(
    contextModule.resolveAuditBudgets(
      { audit: { max_pages: 40, time_budget_seconds: 90 } },
      { maxPages: 7, timeBudgetSeconds: 12 },
    ),
    { maxPages: 7, timeBudgetSeconds: 12 },
  );
  assert.deepEqual(contextModule.resolveAuditBudgets({}, {
    maxPages: 10_000,
    timeBudgetSeconds: 86_400,
  }), {
    maxPages: 10_000,
    timeBudgetSeconds: 86_400,
  });
});

test('resolveAuditBudgets rejects every non-integer and out-of-range category with its source name', () => {
  const invalidCases = [
    ['maxPages', '20', /--max-pages/],
    ['maxPages', Number.NaN, /--max-pages/],
    ['maxPages', 1.5, /--max-pages/],
    ['maxPages', 0, /--max-pages/],
    ['maxPages', -1, /--max-pages/],
    ['maxPages', 10_001, /--max-pages/],
    ['timeBudgetSeconds', '20', /--time-budget-seconds/],
    ['timeBudgetSeconds', Number.NaN, /--time-budget-seconds/],
    ['timeBudgetSeconds', 1.5, /--time-budget-seconds/],
    ['timeBudgetSeconds', 0, /--time-budget-seconds/],
    ['timeBudgetSeconds', -1, /--time-budget-seconds/],
    ['timeBudgetSeconds', 86_401, /--time-budget-seconds/],
  ];
  for (const [name, value, message] of invalidCases) {
    assert.throws(() => contextModule.resolveAuditBudgets({}, { [name]: value }), message);
  }

  for (const value of ['20', null, Number.NaN, 1.5, 0, -1, 10_001]) {
    assert.throws(
      () => contextModule.resolveAuditBudgets({ audit: { max_pages: value } }, {}),
      /audit\.max_pages/,
    );
  }
  for (const value of ['20', null, Number.NaN, 1.5, 0, -1, 86_401]) {
    assert.throws(
      () => contextModule.resolveAuditBudgets({ audit: { time_budget_seconds: value } }, {}),
      /audit\.time_budget_seconds/,
    );
  }
});

test('URL budget validation happens before the first fetch', async () => {
  const root = project();
  const configFile = path.join(root, '.citable', 'config.yaml');
  const config = readYaml(configFile);
  config.audit.max_pages = 10_001;
  writeYaml(configFile, config);
  let fetches = 0;

  await assert.rejects(
    buildContext(root, {
      target: 'https://fixture.test/',
      fetcher: async () => {
        fetches += 1;
        throw new Error('must not fetch');
      },
    }),
    /audit\.max_pages/,
  );
  assert.equal(fetches, 0);
});

test('buildContext resolves URL budgets but leaves directory targets unaffected', async () => {
  const root = project();
  const configFile = path.join(root, '.citable', 'config.yaml');
  const config = readYaml(configFile);
  config.audit.max_pages = 20;
  config.audit.time_budget_seconds = 30;
  writeYaml(configFile, config);

  const fetched = [];
  const urlContext = await buildContext(root, {
    target: 'https://fixture.test/',
    maxPages: 2,
    fetcher: async (url) => {
      fetched.push(url);
      if (new URL(url).pathname === '/robots.txt') return response(url, '', 'text/plain');
      if (new URL(url).pathname === '/sitemap.xml') return response(url, '', 'application/xml');
      return response(url);
    },
  });
  assert.deepEqual(urlContext.auditBudgets, { maxPages: 2, timeBudgetSeconds: 30 });
  assert.ok(fetched.length > 0);

  config.audit.max_pages = 'not-an-integer';
  config.audit.time_budget_seconds = -1;
  writeYaml(configFile, config);
  fs.mkdirSync(path.join(root, 'empty-site'));
  let directoryFetches = 0;
  const directoryContext = await buildContext(root, {
    target: path.join(root, 'empty-site'),
    maxPages: 'also-invalid',
    fetcher: async () => { directoryFetches += 1; },
  });
  assert.equal(directoryContext.auditBudgets, null);
  assert.equal(directoryFetches, 0);
});

test('audit passes options through to the URL collector and records its legacy crawl metadata', async () => {
  const root = project();
  const fetchedPages = [];
  const result = await audit(root, {
    target: 'https://fixture.test/',
    maxPages: 1,
    timeBudgetSeconds: 45,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      if (!['/robots.txt', '/sitemap.xml'].includes(pathname)) fetchedPages.push(pathname);
      if (pathname === '/') return response(url, '<a href="/second">Second</a><h1>Fixture</h1>');
      if (pathname === '/robots.txt') return response(url, '', 'text/plain');
      return response(url, '', 'application/xml');
    },
  });
  const inputs = readJson(path.join(result.dir, 'inputs.json'));
  assert.deepEqual(fetchedPages, ['/']);
  assert.equal(inputs.crawl_coverage.maxPages, 1);
  assert.equal(inputs.crawl_coverage.timeBudgetSeconds, 45);
  assert.equal(inputs.crawl_coverage.stopReason, 'page_budget_exhausted');
});

test('URL collector defaults to 500 pages and 1800 seconds', async () => {
  const site = await buildSiteFromUrl('https://fixture.test/', {
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/robots.txt') return response(url, '', 'text/plain');
      return response(url, '', pathname === '/sitemap.xml' ? 'application/xml' : 'text/html');
    },
  });
  assert.equal(site.crawl.maxPages, 500);
  assert.equal(site.crawl.timeBudgetSeconds, 1800);
  assert.equal(site.crawl.stopReason, 'frontier_exhausted');
});

test('page budget counts attempted unique URLs including failed fetches', async () => {
  const pageAttempts = [];
  const site = await buildSiteFromUrl('https://fixture.test/', {
    maxPages: 2,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/') {
        pageAttempts.push(pathname);
        return response(url, '<a href="/fail-a">A</a><a href="/fail-b">B</a>');
      }
      if (pathname.startsWith('/fail-')) {
        pageAttempts.push(pathname);
        throw new Error('fixture failure');
      }
      if (pathname === '/robots.txt') return response(url, '', 'text/plain');
      return response(url, '', 'application/xml');
    },
  });
  assert.deepEqual(pageAttempts, ['/', '/fail-a']);
  assert.equal(site.pages.length, 1);
  assert.equal(site.crawl.stopReason, 'page_budget_exhausted');
  assert.equal(site.crawl.truncated, true);
  assert.equal(site.crawl.pendingUrlCount, 1);
});

test('whole-run time budget deterministically prevents scheduling or fetching more URLs', async () => {
  let elapsedMs = 0;
  const fetched = [];
  const site = await buildSiteFromUrl('https://fixture.test/', {
    timeBudgetSeconds: 1,
    now: () => elapsedMs,
    fetcher: async (url) => {
      fetched.push(new URL(url).pathname);
      elapsedMs = 1000;
      return response(url, '<a href="/second">Second</a>');
    },
  });
  assert.deepEqual(fetched, ['/robots.txt']);
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.equal(site.crawl.timeBudgetSeconds, 1);
  assert.equal(site.crawl.truncated, true);
});

test('URL collector leaves the start URL pending when topology work exhausts the time budget', async () => {
  const clockValues = [0, 0, 0, 1000];
  let clockIndex = 0;
  const site = await buildSiteFromUrl('https://fixture.test/', {
    timeBudgetSeconds: 1,
    now: () => clockValues[Math.min(clockIndex++, clockValues.length - 1)],
    fetcher: async (url) => response(url, '<a href="/second">Second</a><a href="/third">Third</a>'),
  });
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.deepEqual(site.crawl.pendingUrls, ['https://fixture.test/']);
});

test('robots fetch consuming the final time budget records terminal exhaustion without sitemap declarations', async () => {
  let elapsedMs = 0;
  const fetched = [];
  const site = await buildSiteFromUrl('https://fixture.test/', {
    timeBudgetSeconds: 1,
    now: () => elapsedMs,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      fetched.push(pathname);
      if (pathname === '/robots.txt') {
        elapsedMs = 1000;
        return response(url, 'User-agent: *\nAllow: /', 'text/plain');
      }
      return response(url);
    },
  });
  assert.deepEqual(fetched, ['/robots.txt']);
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.equal(site.crawl.truncated, true);
});

test('final sitemap fetch consuming the time budget records terminal exhaustion and incomplete crawl metadata', async () => {
  let elapsedMs = 0;
  const fetched = [];
  const site = await buildSiteFromUrl('https://fixture.test/', {
    timeBudgetSeconds: 1,
    now: () => elapsedMs,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      fetched.push(pathname);
      if (pathname === '/robots.txt') return { ...response(url, '', 'text/plain'), status: 404 };
      if (pathname === '/sitemap.xml') {
        elapsedMs = 1000;
        return response(url, '<?xml version="1.0"?><urlset></urlset>', 'application/xml');
      }
      return response(url);
    },
  });
  assert.deepEqual(fetched, ['/robots.txt', '/sitemap.xml']);
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.equal(site.crawl.truncated, true);
});

test('robots time expiry prevents page collection before the page budget can be reached', async () => {
  let elapsedMs = 0;
  const fetched = [];
  const site = await buildSiteFromUrl('https://fixture.test/', {
    maxPages: 1,
    timeBudgetSeconds: 1,
    now: () => elapsedMs,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      fetched.push(pathname);
      if (pathname === '/') return response(url, '<a href="/second">Second</a>');
      if (pathname === '/robots.txt') {
        elapsedMs = 1000;
        return response(
          url,
          'User-agent: *\nAllow: /\nSitemap: https://fixture.test/sitemap.xml',
          'text/plain',
        );
      }
      return response(url, '', 'application/xml');
    },
  });
  assert.deepEqual(fetched, ['/robots.txt']);
  assert.equal(site.crawl.stopReason, 'time_budget_exhausted');
  assert.equal(site.crawl.truncated, true);
});

test('init writes explicit safe audit budget defaults', () => {
  const root = project();
  const config = readYaml(path.join(root, '.citable', 'config.yaml'));
  assert.equal(config.audit.max_pages, 500);
  assert.equal(config.audit.time_budget_seconds, 1800);
});
