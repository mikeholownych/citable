import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswerEngineReadiness } from '../../src/analysis/readiness.js';
import { formatReadinessOutput } from '../../src/commands/answerEngineReadiness.js';

test('evaluateAnswerEngineReadiness scores highly on page optimized for Perplexity, Copilot, ChatGPT', () => {
  const page = {
    url: 'https://example.com/docs/api-guide',
    canonicals: ['https://example.com/docs/api-guide'],
    rawVisibleWordCount: 750,
    text: `Citable is an operational governance layer for search and AI engine citation readiness.
           Executive Summary: This guide outlines the automated verification and change control workflow.
           What is the purpose of Citable? It establishes what is eligible, supportable, observed, and changed.
           How do I install the skill? Run npx citable install across your coding agent harnesses.
           In our benchmark of 500 prompts, citation attribution improved by 34% within 14 days.`,
    paragraphs: [
      'Citable is an operational governance layer for search and AI engine citation readiness.',
      'In our benchmark of 500 prompts, citation attribution improved by 34% within 14 days.',
    ],
    headings: [
      { level: 1, text: 'API Guide' },
      { level: 2, text: 'Executive Summary' },
      { level: 2, text: 'What is the purpose of Citable?' },
      { level: 2, text: 'How do I install the skill?' },
    ],
    tables: 1,
    orderedLists: 2,
    robotsDirectives: new Set(['index', 'follow']),
    jsonLd: [
      {
        blocks: [
          { '@type': 'TechArticle', headline: 'API Guide' },
          { '@type': 'FAQPage', name: 'FAQ' },
        ],
      },
    ],
  };

  const ctx = {
    registries: {
      connections: { entries: [{ provider: 'indexnow' }] },
    },
  };

  const result = evaluateAnswerEngineReadiness(page, ctx);
  assert.equal(result.fact_status, 'modeled_extraction_readiness');
  assert.equal(result.epistemic_status, 'MODELED');
  assert.equal(result.score, result.composite_readiness_score);
  assert.equal(result.readiness_score, result.composite_readiness_score);
  assert.ok(result.composite_readiness_score >= 80, `Expected >= 80, got ${result.composite_readiness_score}`);
  assert.equal(result.engines.perplexity.status, 'optimal');
  assert.equal(result.engines.bing_copilot.status, 'optimal');
  assert.equal(result.engines.chatgpt.status, 'optimal');

  assert.equal(result.comparison_matrix.length, 5);
  assert.ok(result.comparison_matrix.some((r) => r.capability === 'Direct Definitional Lead' && r.perplexity === 'SUPPORTED'));
});

test('evaluateAnswerEngineReadiness identifies blockers on un-optimized page', () => {
  const blockedPage = {
    url: 'https://example.com/blocked',
    canonicals: [],
    rawVisibleWordCount: 80,
    text: 'Under construction.',
    paragraphs: ['Under construction.'],
    headings: [],
    tables: 0,
    orderedLists: 0,
    robotsDirectives: new Set(['noindex']),
    jsonLd: [],
  };

  const result = evaluateAnswerEngineReadiness(blockedPage);
  assert.ok(result.composite_readiness_score < 40);
  assert.equal(result.engines.perplexity.status, 'obstructed');
  assert.equal(result.engines.bing_copilot.status, 'obstructed');
  assert.equal(result.engines.chatgpt.status, 'obstructed');
  assert.ok(result.recommendations.length >= 3);
});

test('formatReadinessOutput outputs formatted table and recommendations', () => {
  const dummy = {
    url: 'https://example.com/page',
    composite_readiness_score: 92,
    engines: {
      perplexity: { score: 95, status: 'optimal', primary_bot: 'PerplexityBot' },
      bing_copilot: { score: 90, status: 'optimal', primary_bot: 'Bingbot' },
      chatgpt: { score: 91, status: 'optimal', primary_bot: 'OAI-SearchBot' },
    },
    comparison_matrix: [
      { capability: 'Definitional Lead', perplexity: 'SUPPORTED', bing_copilot: 'SUPPORTED', chatgpt: 'SUPPORTED' },
    ],
    recommendations: [
      { priority: 'high', engine: 'perplexity', action: 'Keep copula clear' },
    ],
  };

  const output = formatReadinessOutput(dummy);
  assert.match(output, /Answer-Engine Readiness/);
  assert.match(output, /Composite Readiness Score: 92 \/ 100/);
  assert.match(output, /Perplexity: {3}95\/100/);
});
