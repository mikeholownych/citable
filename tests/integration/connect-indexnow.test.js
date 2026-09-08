import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../../src/commands/init.js';
import { main } from '../../src/cli/index.js';
import { connectionStatus, configureConnection, disconnectConnection, submitIndexNow } from '../../src/commands/connect.js';
import { readJson } from '../../src/shared/io.js';

test('connect status lists indexnow provider and allows configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-indexnow-integ-'));
  init(root);

  const status = connectionStatus(root);
  const indexnow = status.available.find((c) => c.provider === 'indexnow');
  assert.ok(indexnow);
  assert.equal(indexnow.credential_env, 'INDEXNOW_KEY');

  const configured = configureConnection(root, {
    provider: 'indexnow',
    connectionId: 'CONNECTION-INDEXNOW',
    propertyId: 'example.com',
    write: true,
  });
  assert.equal(configured.written, true);

  const afterStatus = connectionStatus(root);
  assert.equal(afterStatus.connections.length, 1);
  assert.equal(afterStatus.connections[0].provider, 'indexnow');
  assert.equal(afterStatus.connections[0].property_id, 'example.com');

  disconnectConnection(root, { connectionId: 'CONNECTION-INDEXNOW', write: true });
  assert.equal(connectionStatus(root).connections.length, 0);
});

test('cli connect indexnow dry-run and json modes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-cli-indexnow-'));
  init(root);

  const originalCwd = process.cwd();
  const originalLog = console.log;
  let stdout = '';

  try {
    process.chdir(root);
    console.log = (msg) => { stdout += `${msg}\n`; };

    // Dry run human output
    await main([
      'connect', 'indexnow',
      '--urls', 'https://example.com/page1, https://example.com/page2',
      '--key', '1234567890abcdef',
      '--skip-key-verify',
    ]);

    assert.match(stdout, /connect indexnow: 2 URL\(s\) for example\.com \(dry run; use --write to submit\)/);
    assert.match(stdout, /Receipt: .*INDEXNOW-.*\.json/);

    // Verify delivery receipt written
    const deliveriesDir = path.join(root, '.citable', 'monitoring', 'deliveries');
    const files = fs.readdirSync(deliveriesDir);
    assert.equal(files.length, 1);
    const receipt = readJson(path.join(deliveriesDir, files[0]));
    assert.equal(receipt.connector, 'indexnow');
    assert.equal(receipt.dry_run, true);
    assert.equal(receipt.url_count, 2);

    // JSON mode
    stdout = '';
    await main([
      'connect', 'indexnow',
      '--urls', 'https://example.com/page1',
      '--key', '1234567890abcdef',
      '--skip-key-verify',
      '--json',
    ]);

    const parsedJson = JSON.parse(stdout);
    assert.equal(parsedJson.citable_output_schema, '1.0', 'CLI --json output must use the stable envelope');
    assert.equal(parsedJson.result.connector, 'indexnow');
    assert.equal(parsedJson.result.dry_run, true);
    assert.equal(parsedJson.result.url_count, 1);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }
});

test('cli connect indexnow discovers urls from sitemap file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sitemap-cli-'));
  init(root);

  const sitemapPath = path.join(root, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/sitemap-p1</loc></url>
  <url><loc>https://example.com/sitemap-p2</loc></url>
</urlset>`);

  const originalCwd = process.cwd();
  const originalLog = console.log;
  let stdout = '';

  try {
    process.chdir(root);
    console.log = (msg) => { stdout += `${msg}\n`; };

    await main([
      'connect', 'indexnow',
      '--sitemap', sitemapPath,
      '--key', '1234567890abcdef',
      '--skip-key-verify',
      '--json',
    ]);

    const parsed = JSON.parse(stdout).result;
    assert.equal(parsed.connector, 'indexnow');
    assert.equal(parsed.url_count, 2);
    assert.equal(parsed.host, 'example.com');
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }
});

test('cli connect indexnow fails closed on missing key or mismatched host', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-fail-closed-'));
  init(root);

  const originalCwd = process.cwd();
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  const savedKey = process.env.INDEXNOW_KEY;
  const savedApiKey = process.env.INDEXNOW_API_KEY;
  delete process.env.INDEXNOW_KEY;
  delete process.env.INDEXNOW_API_KEY;

  let stderr = '';

  try {
    process.chdir(root);
    console.error = (msg) => { stderr += `${msg}\n`; };

    // Programmatic check: submitIndexNow rejects
    await assert.rejects(
      () => submitIndexNow(root, { urls: ['https://example.com/p1'] }),
      /IndexNow key is required/,
    );

    // CLI execution sets exit code and logs error
    process.exitCode = 0;
    await main(['connect', 'indexnow', '--urls', 'https://example.com/p1']);
    assert.equal(process.exitCode, 1);
    assert.match(stderr, /IndexNow key is required/);

    // Host mismatch
    stderr = '';
    process.exitCode = 0;
    await main([
      'connect', 'indexnow',
      '--urls', 'https://wrong.com/p1',
      '--host', 'example.com',
      '--key', '1234567890abcdef',
      '--skip-key-verify',
    ]);
    assert.equal(process.exitCode, 1);
    assert.match(stderr, /does not match.*host/);
  } finally {
    process.chdir(originalCwd);
    console.error = originalError;
    process.exitCode = originalExitCode;
    if (savedKey) process.env.INDEXNOW_KEY = savedKey;
    if (savedApiKey) process.env.INDEXNOW_API_KEY = savedApiKey;
  }
});
