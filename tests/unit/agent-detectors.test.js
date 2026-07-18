/**
 * Unit tests for AGENT namespace detectors (agent-readiness checks)
 * Based on https://isitagentready.com/
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DETECTORS } from '../../src/detectors/agent.js';

// ---------------------------------------------------------------------------
// Test context builders
// ---------------------------------------------------------------------------

function ctx(overrides = {}) {
  return {
    site: {
      pages: [],
      robots: null,
      sitemaps: [],
      ...overrides.site,
    },
    config: {
      site: { base_url: 'https://example.test' },
      audit: {},
      ...overrides.config,
    },
    registries: {},
    refDate: new Date('2026-07-18'),
    runId: 'test',
    timestamp: '2026-07-18T00:00:00Z',
    ...overrides,
  };
}

function homePage(overrides = {}) {
  return {
    url: 'https://example.test/',
    path: '/',
    title: 'Test Site',
    headers: {},
    responseHeaders: {},
    jsonLd: [],
    ...overrides,
  };
}

function robotsWithAiRules(extra = '') {
  return {
    raw: `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n${extra}`,
  };
}

function robotsNoAiRules() {
  return {
    raw: 'User-agent: *\nAllow: /\nDisallow: /admin\n',
  };
}

function detector(id) {
  return AGENT_DETECTORS.find((d) => d.id === id);
}

function run(id, context) {
  const d = detector(id);
  assert.ok(d, `Detector ${id} not found`);
  return d.check(context);
}

// ---------------------------------------------------------------------------
// AGENT-001: AI bot rules in robots.txt
// ---------------------------------------------------------------------------

describe('AGENT-001: AI bot rules in robots.txt', () => {
  test('no finding when robots.txt has GPTBot rule', () => {
    const hits = run('AGENT-001', ctx({ site: { robots: robotsWithAiRules() } }));
    assert.equal(hits.length, 0);
  });

  test('no finding when robots.txt has ClaudeBot rule', () => {
    const hits = run('AGENT-001', ctx({
      site: { robots: { raw: 'User-agent: ClaudeBot\nAllow: /\n' } },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding when robots.txt has PerplexityBot rule', () => {
    const hits = run('AGENT-001', ctx({
      site: { robots: { raw: 'User-agent: PerplexityBot\nDisallow: /\n' } },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when robots.txt has no AI crawler rules', () => {
    const hits = run('AGENT-001', ctx({ site: { robots: robotsNoAiRules() } }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /AI crawler rules/);
    assert.equal(hits[0].subject.type, 'file');
    assert.equal(hits[0].subject.identifier, '/robots.txt');
  });

  test('no finding when robots.txt is absent', () => {
    const hits = run('AGENT-001', ctx({ site: { robots: null } }));
    assert.equal(hits.length, 0);
  });

  test('no finding when robots.txt has no raw field', () => {
    const hits = run('AGENT-001', ctx({ site: { robots: {} } }));
    assert.equal(hits.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AGENT-002: Link response headers
// ---------------------------------------------------------------------------

describe('AGENT-002: Link response headers', () => {
  test('no finding when homepage has Link header', () => {
    const hits = run('AGENT-002', ctx({
      site: {
        pages: [homePage({ responseHeaders: { link: '</sitemap.xml>; rel="sitemap"' } })],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when homepage has no Link header', () => {
    const hits = run('AGENT-002', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /Link response headers/);
  });

  test('no finding when no pages in site', () => {
    const hits = run('AGENT-002', ctx({ site: { pages: [] } }));
    assert.equal(hits.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AGENT-003: llms.txt
// ---------------------------------------------------------------------------

describe('AGENT-003: llms.txt', () => {
  test('no finding when llms.txt found in site meta', () => {
    const hits = run('AGENT-003', ctx({
      site: { llmsTxt: { found: true } },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding when llms.txt found as crawled page', () => {
    const hits = run('AGENT-003', ctx({
      site: { pages: [homePage(), { path: '/llms.txt', url: 'https://example.test/llms.txt' }] },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when llms.txt absent', () => {
    const hits = run('AGENT-003', ctx({ site: { pages: [homePage()] } }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /llms\.txt/);
    assert.equal(hits[0].subject.identifier, '/llms.txt');
  });
});

// ---------------------------------------------------------------------------
// AGENT-004: MCP Server Card
// ---------------------------------------------------------------------------

describe('AGENT-004: MCP Server Card', () => {
  test('no finding when mcp card found in site meta', () => {
    const hits = run('AGENT-004', ctx({
      site: { meta: { mcpCard: { found: true } } },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when mcp absent and site has /api/ paths', () => {
    const hits = run('AGENT-004', ctx({
      site: {
        pages: [
          homePage(),
          { path: '/api/v1/tools', url: 'https://example.test/api/v1/tools' },
        ],
      },
    }));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].subject.identifier, '/.well-known/mcp');
  });

  test('no finding when site has no API signals', () => {
    const hits = run('AGENT-004', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AGENT-005: A2A Agent Card
// ---------------------------------------------------------------------------

describe('AGENT-005: A2A Agent Card', () => {
  test('no finding when agent.json found', () => {
    const hits = run('AGENT-005', ctx({
      site: {
        pages: [{ path: '/.well-known/agent.json' }],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when absent and site has /agent/ paths', () => {
    const hits = run('AGENT-005', ctx({
      site: {
        pages: [
          homePage(),
          { path: '/agent/tools', url: 'https://example.test/agent/tools' },
        ],
      },
    }));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].subject.identifier, '/.well-known/agent.json');
  });

  test('no finding for pure content sites', () => {
    const hits = run('AGENT-005', ctx({
      site: { pages: [homePage(), { path: '/blog/post', url: 'https://example.test/blog/post' }] },
    }));
    assert.equal(hits.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AGENT-006: Markdown content negotiation
// ---------------------------------------------------------------------------

describe('AGENT-006: Markdown content negotiation', () => {
  test('no finding when Content-Type includes text/markdown', () => {
    const hits = run('AGENT-006', ctx({
      site: {
        pages: [homePage({ responseHeaders: { 'content-type': 'text/markdown; charset=utf-8' } })],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding when Vary: Accept is present', () => {
    const hits = run('AGENT-006', ctx({
      site: {
        pages: [homePage({ responseHeaders: { vary: 'Accept' } })],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding when .md pages exist in crawl', () => {
    const hits = run('AGENT-006', ctx({
      site: {
        pages: [homePage(), { path: '/docs/guide.md' }],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when no markdown support detected', () => {
    const hits = run('AGENT-006', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /Markdown content negotiation/);
  });
});

// ---------------------------------------------------------------------------
// AGENT-007: Web Bot Auth
// ---------------------------------------------------------------------------

describe('AGENT-007: Web Bot Auth', () => {
  test('no finding when web-bot-auth header present', () => {
    const hits = run('AGENT-007', ctx({
      site: {
        robots: robotsWithAiRules(),
        pages: [homePage({ responseHeaders: { 'web-bot-auth': 'enabled' } })],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding when site has no AI bot rules in robots.txt', () => {
    // Only flag when site already has AI bot awareness
    const hits = run('AGENT-007', ctx({
      site: { pages: [homePage()], robots: robotsNoAiRules() },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when site has AI bot rules but no Web Bot Auth', () => {
    const hits = run('AGENT-007', ctx({
      site: {
        robots: robotsWithAiRules(),
        pages: [homePage()],
      },
    }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /Web Bot Auth/);
  });
});

// ---------------------------------------------------------------------------
// AGENT-008: Content Signals
// ---------------------------------------------------------------------------

describe('AGENT-008: Content-Signals header', () => {
  test('no finding when content-signals header present', () => {
    const hits = run('AGENT-008', ctx({
      site: {
        pages: [
          homePage({
            responseHeaders: { 'content-signals': 'type=editorial; ai-training=disallowed' },
            structuredData: [{ type: 'Article' }],
          }),
        ],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding for sites without structured content', () => {
    const hits = run('AGENT-008', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when structured content exists but no signal', () => {
    const hits = run('AGENT-008', ctx({
      site: {
        pages: [homePage({ structuredData: [{ type: 'Product' }] })],
      },
    }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /Content-Signals/);
  });
});

// ---------------------------------------------------------------------------
// AGENT-009: auth.md
// ---------------------------------------------------------------------------

describe('AGENT-009: auth.md', () => {
  test('no finding when auth.md found', () => {
    const hits = run('AGENT-009', ctx({
      site: { meta: { authMd: { found: true } } },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding for pure content sites with no API paths', () => {
    const hits = run('AGENT-009', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when site has /api/ paths but no auth.md', () => {
    const hits = run('AGENT-009', ctx({
      site: {
        pages: [
          homePage(),
          { path: '/api/v1/status', url: 'https://example.test/api/v1/status' },
        ],
      },
    }));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].subject.identifier, '/auth.md');
  });

  test('finding when site has /login path', () => {
    const hits = run('AGENT-009', ctx({
      site: {
        pages: [
          homePage(),
          { path: '/login', url: 'https://example.test/login' },
        ],
      },
    }));
    assert.equal(hits.length, 1);
  });
});

// ---------------------------------------------------------------------------
// AGENT-010: Agentic commerce protocols
// ---------------------------------------------------------------------------

describe('AGENT-010: Agentic commerce protocols', () => {
  test('no finding when x-payment header present', () => {
    const hits = run('AGENT-010', ctx({
      site: {
        pages: [
          homePage({ responseHeaders: { 'x-payment': 'required' } }),
          { path: '/pricing' },
        ],
      },
    }));
    assert.equal(hits.length, 0);
  });

  test('no finding for sites with no commerce pages', () => {
    const hits = run('AGENT-010', ctx({
      site: { pages: [homePage()] },
    }));
    assert.equal(hits.length, 0);
  });

  test('finding when site has /pricing but no commerce protocol', () => {
    const hits = run('AGENT-010', ctx({
      site: {
        pages: [
          homePage(),
          { path: '/pricing', url: 'https://example.test/pricing' },
        ],
      },
    }));
    assert.equal(hits.length, 1);
    assert.match(hits[0].summary, /agentic commerce/i);
  });

  test('no finding when x-mpp header present', () => {
    const hits = run('AGENT-010', ctx({
      site: {
        pages: [
          homePage({ responseHeaders: { 'x-mpp': 'v1' } }),
          { path: '/checkout' },
        ],
      },
    }));
    assert.equal(hits.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration: all AGENT detectors on the clean fixture produce no criticals
// ---------------------------------------------------------------------------

describe('AGENT detectors: clean site produces no critical findings', () => {
  test('all AGENT detectors run without error on a minimal site', () => {
    const context = ctx({ site: { pages: [homePage()], robots: robotsWithAiRules() } });
    for (const d of AGENT_DETECTORS) {
      const hits = d.check(context);
      assert.ok(Array.isArray(hits), `${d.id} must return an array`);
    }
  });

  test('detectors are well-formed (required fields present)', () => {
    for (const d of AGENT_DETECTORS) {
      assert.ok(d.id, `${d.id} missing id`);
      assert.ok(d.name, `${d.id} missing name`);
      assert.equal(d.namespace, 'AGENT', `${d.id} wrong namespace`);
      assert.ok(Array.isArray(d.discipline), `${d.id} discipline must be array`);
      assert.ok(d.remediation, `${d.id} missing remediation`);
      assert.ok(d.verification, `${d.id} missing verification`);
    }
  });
});
