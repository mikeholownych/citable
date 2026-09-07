import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportShareOfVoice } from '../../src/commands/reportShareOfVoice.js';
import { init } from '../../src/commands/init.js';
import { loadRegistries, saveRegistry } from '../../src/registries/index.js';
import { writeJson } from '../../src/shared/io.js';

function setupShareOfVoiceProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sov-int-'));
  init(dir);

  const { registries } = loadRegistries(dir);
  registries.competitors.entries = [
    {
      competitor_id: 'COMPETITOR-ALPHA',
      name: 'Alpha Software',
      domains: ['alpha.test', 'docs.alpha.test'],
      status: 'active',
    },
    {
      competitor_id: 'COMPETITOR-BETA',
      name: 'Beta Cloud',
      domains: ['beta.test'],
      status: 'active',
    },
  ];
  saveRegistry(dir, 'competitors', registries.competitors);

  // Synthesize citation observation runs
  const runsDir = path.join(dir, '.citable', 'runs');

  // Run 1
  const r1Dir = path.join(runsDir, '2026-07-01T00:00:00Z-obs-citations-1');
  fs.mkdirSync(path.join(r1Dir, 'observations'), { recursive: true });
  writeJson(path.join(r1Dir, 'manifest.json'), { timestamp: '2026-07-01T00:00:00Z', command: 'observe citations' });
  writeJson(path.join(r1Dir, 'observations', '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      prompt_id: 'PROMPT-AI-SEARCH',
      prompt_text: 'what is generative engine optimization?',
      property_cited: true,
      citations: [
        { canonical_url: 'https://example.test/geo-guide', first_party: true },
        { canonical_url: 'https://docs.alpha.test/geo-overview' },
        { canonical_url: 'https://wikipedia.org/wiki/Search_engine' },
      ],
    },
  });

  // Run 2
  const r2Dir = path.join(runsDir, '2026-07-02T00:00:00Z-obs-citations-2');
  fs.mkdirSync(path.join(r2Dir, 'observations'), { recursive: true });
  writeJson(path.join(r2Dir, 'manifest.json'), { timestamp: '2026-07-02T00:00:00Z', command: 'observe citations' });
  writeJson(path.join(r2Dir, 'observations', '0001-citation.json'), {
    kind: 'citation',
    state: 'observed',
    data: {
      prompt_id: 'PROMPT-AI-SEARCH',
      prompt_text: 'what is generative engine optimization?',
      property_cited: false,
      citations: [
        { canonical_url: 'https://beta.test/features' },
        { canonical_url: 'https://alpha.test/blog/geo' },
      ],
    },
  });

  return dir;
}

test('reportShareOfVoice produces Markdown and HTML reports on disk', () => {
  const dir = setupShareOfVoiceProject();

  const res = reportShareOfVoice(dir);
  assert.equal(res.included, 2);
  assert.equal(res.competitors_evaluated, 2);
  assert.equal(res.prompts_evaluated, 1);
  assert.equal(res.total_citations, 5);
  assert.ok(fs.existsSync(res.path_md));
  assert.ok(fs.existsSync(res.path_html));

  const md = fs.readFileSync(res.path_md, 'utf8');
  assert.match(md, /# Citable share-of-voice report/);
  assert.match(md, /Alpha Software/);
  assert.match(md, /Beta Cloud/);
  assert.match(md, /PROMPT-AI-SEARCH/);
  assert.match(md, /First-party/);

  const html = fs.readFileSync(res.path_html, 'utf8');
  assert.match(html, /<title>Citable share-of-voice report<\/title>/);
  assert.match(html, /class="bar-fp"/);
  assert.match(html, /class="bar-comp"/);
});

test('reportShareOfVoice respects --last and --since filters', () => {
  const dir = setupShareOfVoiceProject();

  const lastRes = reportShareOfVoice(dir, { last: 1 });
  assert.equal(lastRes.included, 1);
  assert.equal(lastRes.total_citations, 2); // only run 2 citations

  const sinceRes = reportShareOfVoice(dir, { since: '2026-07-02T00:00:00Z-obs-citations-2' });
  assert.equal(sinceRes.included, 1);
  assert.equal(sinceRes.total_citations, 2);
});

test('reportShareOfVoice rejects invalid --last parameter', () => {
  const dir = setupShareOfVoiceProject();

  assert.throws(() => reportShareOfVoice(dir, { last: 0 }), /--last must be a positive integer/);
  assert.throws(() => reportShareOfVoice(dir, { last: -3 }), /--last must be a positive integer/);
  assert.throws(() => reportShareOfVoice(dir, { last: 'abc' }), /--last must be a positive integer/);
});

test('reportShareOfVoice handles project with zero observation runs cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-sov-empty-'));
  init(dir);

  const res = reportShareOfVoice(dir);
  assert.equal(res.included, 0);
  assert.ok(fs.existsSync(res.path_md));
  assert.ok(fs.existsSync(res.path_html));

  const md = fs.readFileSync(res.path_md, 'utf8');
  assert.match(md, /## Insufficient history/);
});
