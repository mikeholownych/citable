import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { observe } from '../../src/commands/observe.js';
import { main } from '../../src/cli/index.js';
import { reportConsensus } from '../../src/commands/reportConsensus.js';
import { readJson } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('cli report consensus executes against real observe consensus runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-integ-consensus-'));
  init(root);

  const sitePath = path.join(FIX, 'site-clean');

  // Step 1: Run observe consensus to generate real observations
  const obsResult = await observe(root, 'consensus', {
    target: sitePath,
    baseUrl: 'https://example.test',
  });
  assert.ok(obsResult.runId);

  const originalCwd = process.cwd();
  const originalLog = console.log;
  let stdout = '';

  try {
    process.chdir(root);
    console.log = (msg) => { stdout += `${msg}\n`; };

    // Step 2: Run citable report consensus via CLI
    await main(['report', 'consensus']);

    assert.match(stdout, /report consensus: \d+ URL\(s\) evaluated/);
    assert.match(stdout, /consensus/i);
    assert.match(stdout, /Markdown: .*consensus\.md/);
    assert.match(stdout, /HTML: .*consensus\.html/);

    const reportMdPath = path.join(root, '.citable', 'reports', 'consensus.md');
    const reportHtmlPath = path.join(root, '.citable', 'reports', 'consensus.html');
    assert.ok(fs.existsSync(reportMdPath));
    assert.ok(fs.existsSync(reportHtmlPath));

    const mdContent = fs.readFileSync(reportMdPath, 'utf8');
    assert.match(mdContent, /# Canonical Discovery & Freshness Consensus Matrix/);
    assert.match(mdContent, /https:\/\/example\.test/);

    // Step 3: Run with --json
    stdout = '';
    await main(['report', 'consensus', '--json']);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.urls_evaluated > 0);
    assert.ok(parsed.canonical_consensus_count > 0);
    assert.ok(parsed.path_md);
    assert.ok(parsed.matrix);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }
});

test('reportConsensus rejects when no consensus observation runs exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-integ-empty-'));
  init(root);

  assert.throws(
    () => reportConsensus(root),
    /No consensus observation runs found in \.citable\/runs/,
  );
});
