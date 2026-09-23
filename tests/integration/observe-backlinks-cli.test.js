import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { observe } from '../../src/commands/observe.js';

test('CLI: observe backlinks extracts link from file input and returns validated observation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-obs-'));
  const htmlFile = path.join(tmpDir, 'page.html');
  fs.writeFileSync(htmlFile, '<html><body><a href="https://example.com/target" rel="nofollow">Link</a></body></html>');

  const result = await observe(process.cwd(), 'backlinks', {
    input: htmlFile,
    target: 'https://example.com/target',
    source: 'https://mysite.test/blog',
  });

  assert.equal(result.schema_version, 1);
  assert.equal(result.observation_status, 'OBSERVED');
  assert.equal(result.source.normalized_url, 'https://mysite.test/blog');
  assert.equal(result.target.normalized_url, 'https://example.com/target');
  assert.equal(result.link.anchor_text, 'Link');
  assert.equal(result.link.nofollow, true);
  assert.ok(result.observation_id.startsWith('BL-OBS-'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CLI: observe backlinks temporal comparison via --compare-with', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cmp-'));
  const file1 = path.join(tmpDir, 'obs1.json');
  const file2 = path.join(tmpDir, 'page2.html');
  const html1File = path.join(tmpDir, 'page1.html');

  const html1 = '<html><body><a href="https://example.com/target">Anchor 1</a></body></html>';
  const html2 = '<html><body><a href="https://example.com/target">Anchor 2</a></body></html>';

  fs.writeFileSync(html1File, html1);

  const obs1 = await observe(process.cwd(), 'backlinks', {
    input: html1File,
    target: 'https://example.com/target',
    source: 'https://mysite.test/blog',
  });
  // write obs1 as json file
  fs.writeFileSync(file1, JSON.stringify(obs1, null, 2));

  // obs2 input
  fs.writeFileSync(file2, html2);

  const comparison = await observe(process.cwd(), 'backlinks', {
    input: file2,
    target: 'https://example.com/target',
    source: 'https://mysite.test/blog',
    compareWith: file1,
  });

  assert.equal(comparison.schema_version, 1);
  assert.equal(comparison.status, 'COMPARABLE');
  assert.equal(comparison.transition, 'CHANGED');
  assert.equal(comparison.link_match.anchor_match, false);
  assert.ok(comparison.comparison_id.startsWith('CMP-'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CLI: observe backlinks fails closed when input file is missing', async () => {
  await assert.rejects(
    async () => {
      await observe(process.cwd(), 'backlinks', { input: 'nonexistent-file.html', target: 'https://example.com' });
    },
    /input file not found/
  );
});
