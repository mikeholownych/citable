import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { readJson } from '../../src/shared/io.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';
import { ALL_DETECTORS } from '../../src/detectors/index.js';

const ORIGIN = 'https://coverage-fixture.test';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-audit-coverage-'));
  init(root);
  return root;
}

function response(url, body, contentType = 'text/html') {
  return { url, status: 200, headers: { 'content-type': contentType }, body, redirectChain: [] };
}

function fetcherFor({ fail = false } = {}) {
  return async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/robots.txt') return response(url, '', 'text/plain');
    if (pathname === '/sitemap.xml') return response(url, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 'application/xml');
    if (fail && pathname === '/failed') {
      const error = new Error('fixture unavailable');
      error.code = 'ECONNRESET';
      throw error;
    }
    if (pathname === '/') return response(url, '<h1>Fixture home</h1><p>This page has enough substantive text for evaluation.</p><a href="/next">Next</a>');
    if (pathname === '/next') return response(url, '<h1>Fixture next</h1><p>This page has enough substantive text for evaluation.</p>');
    if (pathname === '/failed') return response(url, '<h1>unreachable</h1>');
    return response(url, '<h1>Fixture page</h1><p>This page has enough substantive text for evaluation.</p>');
  };
}

test('coverage is persisted before summaries and separates execution from truncated coverage', async () => {
  const root = project();
  const result = await audit(root, {
    target: ORIGIN,
    maxPages: 1,
    fetcher: fetcherFor(),
  });
  const coveragePath = path.join(result.dir, 'coverage.json');
  assert.equal(fs.existsSync(coveragePath), true);
  const coverage = readJson(coveragePath);
  assert.equal(validateAgainst('audit-coverage.schema.json', coverage).valid, true);
  assert.equal(result.manifest.execution_status, 'completed');
  assert.equal(result.manifest.coverage_status, 'truncated');
  assert.equal(result.manifest.determination_status, 'qualified');
  assert.equal(result.summary.coverage.status, 'truncated');
  assert.equal(result.summary.posture.retrieval_eligibility.result, 'qualified');
  assert.match(result.report, /Coverage status: \*\*truncated\*\*/i);
  assert.ok(fs.statSync(coveragePath).mtimeMs <= fs.statSync(path.join(result.dir, 'summary.json')).mtimeMs);
});

test('detectors observe schema-valid provisional coverage before evaluation begins', async () => {
  const root = project();
  const detector = ALL_DETECTORS.find(({ id }) => id === 'TECH-001');
  const originalCheck = detector.check;
  let observed = false;
  detector.check = (ctx) => {
    const coveragePath = path.join(root, '.citable', 'runs', ctx.runId, 'coverage.json');
    assert.equal(fs.existsSync(coveragePath), true, 'coverage must be durable before detector execution');
    const provisional = readJson(coveragePath);
    assert.equal(validateAgainst('audit-coverage.schema.json', provisional).valid, true);
    assert.ok(provisional.populations.valid_but_unevaluated >= 1);
    observed = true;
    return originalCheck(ctx);
  };
  try {
    await audit(root, {
      target: ORIGIN,
      scope: 'technical',
      maxPages: 1,
      fetcher: fetcherFor(),
    });
  } finally {
    detector.check = originalCheck;
  }
  assert.equal(observed, true);
});

test('fetch failures are represented in coverage and cannot produce complete coverage', async () => {
  const root = project();
  const result = await audit(root, {
    target: ORIGIN,
    maxPages: 3,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/') return response(url, '<h1>Fixture home</h1><p>This page has enough substantive text for evaluation.</p><a href="/failed">Failed</a>');
      if (pathname === '/robots.txt') return response(url, '', 'text/plain');
      if (pathname === '/sitemap.xml') return response(url, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 'application/xml');
      return fetcherFor({ fail: true })(url);
    },
  });
  const coverage = readJson(path.join(result.dir, 'coverage.json'));
  assert.equal(coverage.coverage_status, 'indeterminate');
  assert.equal(coverage.populations.failed, 1);
  assert.equal(coverage.reconciliation.valid, true);
  assert.equal(result.manifest.coverage_status, 'indeterminate');
  assert.match(result.manifest.errors.join('\n'), /ECONNRESET/);
});

test('complete coverage records evaluated resources and independent supported determination status', async () => {
  const root = project();
  const result = await audit(root, {
    target: ORIGIN,
    maxPages: 5,
    fetcher: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/robots.txt') return response(url, '', 'text/plain');
      if (pathname === '/sitemap.xml') return response(url, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 'application/xml');
      return response(url, '<h1>Fixture page</h1><p>This page has enough substantive text for evaluation.</p>');
    },
  });
  const coverage = readJson(path.join(result.dir, 'coverage.json'));
  assert.equal(coverage.coverage_status, 'complete');
  assert.equal(coverage.populations.evaluated, 1);
  assert.equal(result.manifest.execution_status, 'completed');
  assert.equal(result.manifest.coverage_status, 'complete');
  assert.equal(result.manifest.determination_status, 'supported');
});
