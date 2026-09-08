import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLlmsTxt, generateLlmsTxt } from '../../src/commands/generateLlmsTxt.js';
import { init } from '../../src/commands/init.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, '../..');

test('buildLlmsTxt constructs valid llmstxt.org markdown from registries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-llmstxt-fix-'));
  const fixDir = path.join(ROOT, 'tests/fixtures/registries-good');
  fs.mkdirSync(path.join(dir, '.citable'), { recursive: true });
  for (const f of fs.readdirSync(fixDir)) {
    fs.copyFileSync(path.join(fixDir, f), path.join(dir, '.citable', f));
  }

  try {
    const built = buildLlmsTxt(dir, { siteUrl: 'https://citable.test' });

    assert.ok(built.llmsTxt);
    assert.ok(built.llmsFullTxt);
    assert.match(built.llmsTxt, /^#\s+.+/m);
    assert.match(built.llmsTxt, /^>\s+.+/m);
    assert.match(built.llmsTxt, /## Documentation & Key Pages/);
    assert.match(built.llmsTxt, /\[Full Content Directory\]\(https:\/\/citable\.test\/llms-full\.txt\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generateLlmsTxt writes files to disk when write: true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-llmstxt-'));
  init(dir);

  try {
    const res = generateLlmsTxt(dir, { write: true, siteUrl: 'https://example.test' });
    assert.equal(res.written, true);
    assert.ok(fs.existsSync(res.llmsTxtPath));
    assert.ok(fs.existsSync(res.llmsFullTxtPath));

    const content = fs.readFileSync(res.llmsTxtPath, 'utf8');
    assert.match(content, /^#\s+/m);
    assert.match(content, /^>\s+/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
