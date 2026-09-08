import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeHost,
  parseUrlsInput,
  loadSitemapUrls,
  buildIndexNowPayload,
  verifyHostKey,
  submitIndexNow,
  indexnowConnector,
  INDEXNOW_DEFAULT_ENDPOINT,
} from '../../src/connectors/indexnow.js';
import { init } from '../../src/commands/init.js';
import { readJson } from '../../src/shared/io.js';

test('normalizeHost extracts valid hostnames and preserves custom ports', () => {
  assert.equal(normalizeHost('example.com'), 'example.com');
  assert.equal(normalizeHost('https://example.com/some/path?query=1'), 'example.com');
  assert.equal(normalizeHost('http://127.0.0.1:8080/'), '127.0.0.1:8080');
  assert.equal(normalizeHost('  sub.example.com  '), 'sub.example.com');
  assert.throws(() => normalizeHost(''), /host must be a non-empty string/);
  assert.throws(() => normalizeHost(null), /host must be a non-empty string/);
});

test('parseUrlsInput parses lists, files, and json payloads with deduplication', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-urls-'));

  // Comma and newline strings
  const stringUrls = parseUrlsInput('https://example.com/a, https://example.com/b\nhttps://example.com/a');
  assert.deepEqual(stringUrls, ['https://example.com/a', 'https://example.com/b']);

  // Plain text file with comments and blanks
  const txtFile = path.join(tmpDir, 'urls.txt');
  fs.writeFileSync(txtFile, '# Comment\nhttps://example.com/page1\n\nhttps://example.com/page2\nhttps://example.com/page1\n');
  const txtUrls = parseUrlsInput(txtFile);
  assert.deepEqual(txtUrls, ['https://example.com/page1', 'https://example.com/page2']);

  // JSON file with array
  const jsonArrFile = path.join(tmpDir, 'urls.json');
  fs.writeFileSync(jsonArrFile, JSON.stringify(['https://example.com/1', 'https://example.com/2']));
  assert.deepEqual(parseUrlsInput(jsonArrFile), ['https://example.com/1', 'https://example.com/2']);

  // JSON file with urlList object
  const jsonObjFile = path.join(tmpDir, 'payload.json');
  fs.writeFileSync(jsonObjFile, JSON.stringify({ urlList: ['https://example.com/x', 'https://example.com/y'] }));
  assert.deepEqual(parseUrlsInput(jsonObjFile), ['https://example.com/x', 'https://example.com/y']);

  // Fails closed on invalid or credentialed URLs
  assert.throws(() => parseUrlsInput('not-a-url'), /Invalid URL provided/);
  assert.throws(() => parseUrlsInput('ftp://example.com/file'), /Unsupported URL protocol/);
  assert.throws(() => parseUrlsInput('https://user:pass@example.com/secret'), /credentials are not permitted/);
});

test('loadSitemapUrls loads and parses XML sitemaps', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sitemap-'));
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/home</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

  const xmlFile = path.join(tmpDir, 'sitemap.xml');
  fs.writeFileSync(xmlFile, sitemapXml);

  const urls = await loadSitemapUrls(xmlFile);
  assert.deepEqual(urls, ['https://example.com/home', 'https://example.com/about']);

  // Remote sitemap with mock fetch
  const mockFetch = async (url) => {
    assert.equal(url, 'https://example.com/remote-sitemap.xml');
    return {
      ok: true,
      status: 200,
      text: async () => sitemapXml,
    };
  };

  const remoteUrls = await loadSitemapUrls('https://example.com/remote-sitemap.xml', {
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });
  assert.deepEqual(remoteUrls, ['https://example.com/home', 'https://example.com/about']);

  // Refuses sitemapindex
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sub-sitemap.xml</loc></sitemap>
</sitemapindex>`;
  const indexFile = path.join(tmpDir, 'sitemap-index.xml');
  fs.writeFileSync(indexFile, indexXml);
  await assert.rejects(() => loadSitemapUrls(indexFile), /sitemapindex/);
});

test('buildIndexNowPayload constructs valid payload and enforces host boundaries', () => {
  const payload = buildIndexNowPayload({
    host: 'example.com',
    key: 'abcdef123456',
    keyLocation: 'https://example.com/custom-key.txt',
    urls: ['https://example.com/1', 'https://example.com/2'],
  });

  assert.equal(payload.host, 'example.com');
  assert.equal(payload.key, 'abcdef123456');
  assert.equal(payload.keyLocation, 'https://example.com/custom-key.txt');
  assert.deepEqual(payload.urlList, ['https://example.com/1', 'https://example.com/2']);

  // Key validation: 8-128 alphanumeric characters or hyphens
  assert.throws(() => buildIndexNowPayload({ host: 'example.com', key: 'short', urls: ['https://example.com/'] }), /IndexNow key must be 8-128/);
  assert.throws(() => buildIndexNowPayload({ host: 'example.com', key: 'invalid space key!', urls: ['https://example.com/'] }), /IndexNow key must be 8-128/);

  // Host mismatch failure
  assert.throws(
    () => buildIndexNowPayload({ host: 'example.com', key: 'abcdef123456', urls: ['https://other.com/page'] }),
    /does not match IndexNow payload host/,
  );
  assert.throws(
    () => buildIndexNowPayload({ host: 'example.com', key: 'abcdef123456', keyLocation: 'https://other.com/key.txt', urls: ['https://example.com/1'] }),
    /keyLocation.*does not match IndexNow payload host/,
  );
});

test('verifyHostKey checks public key file and verifies matching key content', async () => {
  const goodFetch = async (url) => {
    assert.equal(url, 'https://example.com/3f80c6575185489886a01490218a0a9a.txt');
    return {
      ok: true,
      status: 200,
      text: async () => '3f80c6575185489886a01490218a0a9a\n',
    };
  };

  const res = await verifyHostKey('example.com', '3f80c6575185489886a01490218a0a9a', {
    fetchImpl: goodFetch,
    allowPrivateForTest: true,
  });
  assert.equal(res.verified, true);

  // Mismatched key content
  const badContentFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => 'completely-different-key',
  });
  await assert.rejects(
    () => verifyHostKey('example.com', '3f80c6575185489886a01490218a0a9a', {
      fetchImpl: badContentFetch,
      allowPrivateForTest: true,
    }),
    /content does not match expected key/,
  );

  // HTTP 404
  const notFoundFetch = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: async () => 'Not Found',
  });
  await assert.rejects(
    () => verifyHostKey('example.com', '3f80c6575185489886a01490218a0a9a', {
      fetchImpl: notFoundFetch,
      allowPrivateForTest: true,
    }),
    /HTTP 404/,
  );
});

test('submitIndexNow performs dry run by default and writes immutable delivery receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-indexnow-dry-'));
  init(root);

  let fetched = false;
  const mockFetch = async () => {
    fetched = true;
    return { ok: true, status: 200, text: async () => '' };
  };

  const receipt = await submitIndexNow(root, {
    urls: ['https://example.com/page-1', 'https://example.com/page-2'],
    key: 'abcdef123456',
    skipKeyVerify: true,
    write: false,
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(fetched, false, 'Dry run must not make POST requests');
  assert.equal(receipt.dry_run, true);
  assert.equal(receipt.success, true);
  assert.equal(receipt.url_count, 2);
  assert.equal(receipt.host, 'example.com');
  assert.equal(receipt.batches[0].status_code, null);
  assert.ok(fs.existsSync(receipt.receipt_file));

  const saved = readJson(receipt.receipt_file);
  assert.equal(saved.delivery_id, receipt.delivery_id);
  assert.equal(saved.connector, 'indexnow');
  assert.equal(saved.dry_run, true);
});

test('submitIndexNow live submission posts batch and records status code', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-indexnow-live-'));
  init(root);

  let postRequest = null;
  const mockFetch = async (url, options) => {
    if (options?.method === 'POST') {
      postRequest = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () => '',
      };
    }
    // Key check probe
    return {
      ok: true,
      status: 200,
      text: async () => 'key12345678',
    };
  };

  const receipt = await submitIndexNow(root, {
    urls: ['https://example.com/alpha', 'https://example.com/beta'],
    key: 'key12345678',
    write: true,
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(receipt.dry_run, false);
  assert.equal(receipt.success, true);
  assert.equal(receipt.batches[0].status_code, 200);
  assert.equal(receipt.key_verified, true);
  assert.ok(postRequest);
  assert.equal(postRequest.url, INDEXNOW_DEFAULT_ENDPOINT);
  assert.equal(postRequest.body.host, 'example.com');
  assert.equal(postRequest.body.key, 'key12345678');
  assert.deepEqual(postRequest.body.urlList, ['https://example.com/alpha', 'https://example.com/beta']);
});

test('submitIndexNow handles batching for more than 10,000 URLs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-indexnow-batch-'));
  init(root);

  const urls = [];
  for (let i = 0; i < 10005; i++) {
    urls.push(`https://example.com/item-${i}`);
  }

  const posts = [];
  const mockFetch = async (url, options) => {
    posts.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => '' };
  };

  const receipt = await submitIndexNow(root, {
    urls,
    key: 'batchkey12345',
    skipKeyVerify: true,
    write: true,
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(receipt.batch_count, 2);
  assert.equal(receipt.batches.length, 2);
  assert.equal(receipt.batches[0].url_count, 10000);
  assert.equal(receipt.batches[1].url_count, 5);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].urlList.length, 10000);
  assert.equal(posts[1].urlList.length, 5);
});

test('submitIndexNow records endpoint rejection in delivery receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-indexnow-err-'));
  init(root);

  const mockFetch = async () => ({
    ok: false,
    status: 422,
    statusText: 'Unprocessable Entity',
    text: async () => 'Invalid URL in list',
  });

  const receipt = await submitIndexNow(root, {
    urls: ['https://example.com/invalid'],
    key: 'key12345678',
    skipKeyVerify: true,
    write: true,
    fetchImpl: mockFetch,
    allowPrivateForTest: true,
  });

  assert.equal(receipt.success, false);
  assert.equal(receipt.batches[0].status_code, 422);
  assert.match(receipt.error, /422 Unprocessable Entity/);

  const saved = readJson(receipt.receipt_file);
  assert.equal(saved.success, false);
  assert.equal(saved.batches[0].status_code, 422);
});

test('indexnowConnector implements standard connector contract', async () => {
  assert.equal(indexnowConnector.provider, 'indexnow');
  assert.equal(indexnowConnector.defaultCredentialEnv, 'INDEXNOW_KEY');
  assert.deepEqual(indexnowConnector.readOnlyScopes, []);
  assert.deepEqual(indexnowConnector.writeScopes, ['indexnow:submit']);
  assert.ok(indexnowConnector.describeMetrics().urls_submitted);

  const props = await indexnowConnector.discoverProperties({ host: 'example.com' });
  assert.equal(props[0].property_id, 'example.com');

  const invalid = await indexnowConnector.validateConnection({}, {});
  assert.equal(invalid.valid, false);

  const valid = await indexnowConnector.validateConnection(
    { property_id: 'api.indexnow.org' },
    { key: 'validkey12345' },
  );
  assert.equal(valid.valid, true);
});
