import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShareOfVoice,
  extractDomain,
  matchesDomain,
  renderShareOfVoiceHtml,
  renderShareOfVoiceMarkdown,
} from '../../src/reporting/shareOfVoice.js';

test('extractDomain correctly parses hostnames and handles edge cases', () => {
  assert.equal(extractDomain('https://example.com/page'), 'example.com');
  assert.equal(extractDomain('http://sub.domain.org:8080/'), 'sub.domain.org');
  assert.equal(extractDomain('domain.co.uk'), 'domain.co.uk');
  assert.equal(extractDomain(''), null);
  assert.equal(extractDomain(null), null);
  assert.equal(extractDomain('not a valid url:::'), null);
});

test('matchesDomain checks exact domain and subdomains while preventing suffix spoofing', () => {
  assert.equal(matchesDomain('example.com', 'example.com'), true);
  assert.equal(matchesDomain('blog.example.com', 'example.com'), true);
  assert.equal(matchesDomain('deep.sub.example.com', 'example.com'), true);
  assert.equal(matchesDomain('notexample.com', 'example.com'), false);
  assert.equal(matchesDomain('example.com.attacker.test', 'example.com'), false);
  assert.equal(matchesDomain('other.org', 'example.com'), false);
});

test('calculateShareOfVoice accurately aggregates first-party, competitor, and third-party citations', () => {
  const competitors = [
    {
      competitor_id: 'COMPETITOR-001',
      name: 'Rival Co',
      domains: ['rival.com'],
    },
    {
      competitor_id: 'COMPETITOR-002',
      name: 'Comp B',
      domains: ['competitor-b.org'],
    },
    {
      competitor_id: 'COMPETITOR-003',
      name: 'Silent Corp',
      domains: ['silent.test'],
    },
  ];

  const firstPartyDomains = new Set(['mybrand.com']);

  const runs = [
    {
      run_id: 'run-1',
      citations: [
        {
          data: {
            prompt_id: 'PROMPT-001',
            prompt_text: 'best seo tools',
            property_cited: true,
            citations: [
              { canonical_url: 'https://mybrand.com/product', first_party: true },
              { canonical_url: 'https://rival.com/comparison' },
              { canonical_url: 'https://tech-news.test/article' },
            ],
          },
        },
      ],
    },
    {
      run_id: 'run-2',
      citations: [
        {
          data: {
            prompt_id: 'PROMPT-001',
            prompt_text: 'best seo tools',
            property_cited: false,
            citations: [
              { canonical_url: 'https://rival.com/pricing' },
              { canonical_url: 'https://competitor-b.org/features' },
            ],
          },
        },
        {
          data: {
            prompt_id: 'PROMPT-002',
            prompt_text: 'aeo readiness guide',
            property_cited: true,
            citations: [
              { canonical_url: 'https://mybrand.com/aeo-guide', first_party: true },
              { canonical_url: 'https://mybrand.com/docs', first_party: true },
              { canonical_url: 'https://independent-blog.test/post' },
            ],
          },
        },
      ],
    },
  ];

  const result = calculateShareOfVoice(runs, competitors, firstPartyDomains);

  assert.equal(result.total_runs_evaluated, 3);
  assert.equal(result.total_citations_recorded, 8);
  assert.equal(result.prompts.length, 2);

  // Prompt 1 checks
  const p1 = result.prompts.find((p) => p.prompt_id === 'PROMPT-001');
  assert.equal(p1.total_runs, 2);
  assert.equal(p1.total_citations, 5);
  assert.equal(p1.first_party_citations, 1);
  assert.equal(p1.first_party_presence_runs, 1);
  assert.equal(p1.competitors['COMPETITOR-001'].citations, 2);
  assert.equal(p1.competitors['COMPETITOR-001'].presence_runs, 2);
  assert.equal(p1.competitors['COMPETITOR-002'].citations, 1);
  assert.equal(p1.competitors['COMPETITOR-002'].presence_runs, 1);
  assert.equal(p1.other_citations, 1);

  // Aggregate checks
  assert.equal(result.aggregate.first_party.citations, 3);
  assert.equal(result.aggregate.first_party.presence_runs, 2);
  assert.equal(result.aggregate.first_party.citation_share, 3 / 8);

  const comp1 = result.aggregate.competitors.find((c) => c.competitor_id === 'COMPETITOR-001');
  assert.equal(comp1.citations, 2);
  assert.equal(comp1.citation_share, 2 / 8);

  const comp2 = result.aggregate.competitors.find((c) => c.competitor_id === 'COMPETITOR-002');
  assert.equal(comp2.citations, 1);
  assert.equal(comp2.citation_share, 1 / 8);

  const comp3 = result.aggregate.competitors.find((c) => c.competitor_id === 'COMPETITOR-003');
  assert.equal(comp3.citations, 0);
  assert.equal(comp3.citation_share, 0);

  assert.equal(result.aggregate.other.citations, 2);
  assert.equal(result.aggregate.other.citation_share, 2 / 8);
});

test('renderShareOfVoiceMarkdown and HTML format tables and handle insufficient data', () => {
  const emptyData = calculateShareOfVoice([], [], new Set());
  const emptyMd = renderShareOfVoiceMarkdown(emptyData);
  assert.match(emptyMd, /## Insufficient history/);
  assert.match(emptyMd, /No citation observations were found/);

  const emptyHtml = renderShareOfVoiceHtml(emptyData);
  assert.match(emptyHtml, /Insufficient history/);

  const populatedData = {
    total_runs_evaluated: 2,
    total_citations_recorded: 4,
    prompts: [
      {
        prompt_id: 'P1',
        prompt_text: 'What is citable?',
        total_runs: 2,
        total_citations: 4,
        first_party_citations: 2,
        first_party_presence_runs: 1,
        competitors: { 'COMP-1': { citations: 1, presence_runs: 1 } },
        other_citations: 1,
      },
    ],
    aggregate: {
      first_party: { citations: 2, presence_runs: 1, citation_share: 0.5, presence_rate: 0.5 },
      competitors: [
        { competitor_id: 'COMP-1', name: 'Competitor One', domains: ['comp.test'], citations: 1, presence_runs: 1, citation_share: 0.25, presence_rate: 0.5 },
      ],
      other: { citations: 1, citation_share: 0.25 },
    },
  };

  const md = renderShareOfVoiceMarkdown(populatedData);
  assert.match(md, /# Citable share-of-voice report/);
  assert.match(md, /\| \*\*First-party\*\* \| Primary \| 2 \| 50\.0% \| 50\.0% \|/);
  assert.match(md, /\| Competitor One \(`COMP-1`\) \| Registered competitor \| 1 \| 25\.0% \| 50\.0% \|/);

  const html = renderShareOfVoiceHtml(populatedData);
  assert.match(html, /<title>Citable share-of-voice report<\/title>/);
  assert.match(html, /class="bar-fp"/);
  assert.match(html, /class="bar-comp"/);
  assert.match(html, /Competitor One/);
});
