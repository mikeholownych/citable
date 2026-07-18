/**
 * AGENT namespace — Agent-readiness detectors
 *
 * Checks whether a site is discoverable, accessible, and interoperable
 * with AI agents and autonomous systems. Based on the checks at
 * https://isitagentready.com/ covering:
 *   - Discoverability (robots.txt AI rules, sitemaps, Link headers)
 *   - Content Accessibility (Markdown negotiation, llms.txt)
 *   - Bot Access Control (Web Bot Auth, Content Signals)
 *   - Protocol Discovery (MCP Server Card, A2A Agent Card, Auth.md)
 *   - Agentic Commerce (x402, MPP, UCP, ACP)
 */

import { defineDetector } from './framework.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pageHeaders(page) {
  return page?.responseHeaders || page?.headers || {};
}

function headerValue(headers, name) {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function homepageMeta(ctx) {
  if (!ctx.site?.pages?.length) return null;
  const base = (ctx.config?.site?.base_url || '').replace(/\/$/, '');
  return (
    ctx.site.pages.find((p) => p.url === base || p.url === base + '/' || p.path === '/' || p.path === '') ||
    ctx.site.pages[0]
  );
}

function siteUrl(ctx) {
  return ctx.config?.site?.base_url || 'site';
}

// ---------------------------------------------------------------------------
// AGENT-001: AI bot rules in robots.txt
// ---------------------------------------------------------------------------

export const AGENT_001 = defineDetector({
  id: 'AGENT-001',
  name: 'AI bot rules absent from robots.txt',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'medium',
  deterministic: true,
  description:
    'robots.txt contains no rules for known AI crawlers (GPTBot, ClaudeBot, PerplexityBot, ' +
    'anthropic-ai, Googlebot-Extended, cohere-ai, meta-externalagent). ' +
    'AI agents cannot determine whether they have explicit crawl permission.',
  applicable_requirement: 'AEO §2 required crawler access; isitagentready.com Discoverability',
  remediation:
    'Add User-agent rules for AI crawlers. To allow all: `User-agent: GPTBot\\nAllow: /`. ' +
    'To deny: `User-agent: GPTBot\\nDisallow: /`. Explicit rules signal intentional policy.',
  verification: 'Fetch /robots.txt and confirm at least one AI crawler user-agent rule is present.',
  check(ctx) {
    const robots = ctx.site?.robots;
    if (!robots?.raw) return [];

    const AI_BOTS = [
      'gptbot', 'claudebot', 'perplexitybot', 'googlebot-extended',
      'anthropic-ai', 'cohere-ai', 'meta-externalagent', 'bytespider',
      'applebot-extended', 'diffbot', 'youbot', 'img2dataset', 'omgili',
    ];

    const raw = robots.raw.toLowerCase();
    const hasAiRule = AI_BOTS.some((bot) => raw.includes(`user-agent: ${bot}`));
    if (hasAiRule) return [];

    return [{
      subject: { type: 'file', identifier: '/robots.txt' },
      summary: 'robots.txt contains no AI crawler rules',
      evidence: ['No User-agent entry found for GPTBot, ClaudeBot, PerplexityBot, or similar AI crawlers'],
      captured: 'no AI bot rules',
      expected: 'User-agent entries for at least one AI crawler (GPTBot, ClaudeBot, etc.)',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-002: Link response headers for discovery
// ---------------------------------------------------------------------------

export const AGENT_002 = defineDetector({
  id: 'AGENT-002',
  name: 'Link response headers absent',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'HTTP Link headers on the homepage allow agents to discover structured resources ' +
    '(sitemaps, feeds, MCP endpoints, API catalogs) without parsing HTML. ' +
    'Absence means agents relying on header-based discovery cannot find these resources.',
  applicable_requirement: 'RFC 8288 Web Linking; isitagentready.com Discoverability',
  remediation:
    'Add Link headers to your CDN responses. Example: ' +
    '`Link: </sitemap.xml>; rel="sitemap", </.well-known/mcp>; rel="mcp"`. ' +
    'Cloudflare Workers or nginx `add_header` can inject these.',
  verification: 'Run `curl -I <homepage>` and inspect Link headers in the response.',
  check(ctx) {
    const page = homepageMeta(ctx);
    if (!page) return [];
    const headers = pageHeaders(page);
    const link = headerValue(headers, 'link');
    if (link && link.trim().length > 0) return [];
    return [{
      subject: { type: 'page', identifier: siteUrl(ctx) },
      summary: 'Homepage has no Link response headers',
      evidence: ['HTTP Link header absent from homepage response'],
      captured: 'no Link header',
      expected: 'Link headers pointing to sitemap, MCP endpoint, or API catalog',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-003: llms.txt presence
// ---------------------------------------------------------------------------

export const AGENT_003 = defineDetector({
  id: 'AGENT-003',
  name: 'llms.txt missing',
  namespace: 'AGENT',
  discipline: ['agent-readiness', 'geo'],
  severity: 'low',
  deterministic: false,
  description:
    'llms.txt (https://llmstxt.org/) is a convention for sites to provide a structured ' +
    'Markdown summary of their content for LLM consumption. ' +
    'Its absence means language models cannot quickly orient themselves about your site.',
  applicable_requirement: 'GEO §3 discoverability; isitagentready.com Content Accessibility',
  remediation:
    'Create /llms.txt at your site root with: site purpose, key pages list with descriptions, ' +
    'and optionally /llms-full.txt with complete content. See https://llmstxt.org/ for spec.',
  verification: 'Fetch /llms.txt and confirm it returns 200 with Markdown content.',
  check(ctx) {
    // Check for llms.txt in crawled pages or site metadata
    const llmsTxt = ctx.site?.llmsTxt || ctx.site?.meta?.llmsTxt;
    if (llmsTxt?.found || llmsTxt?.status === 200) return [];
    const hasLlmsTxt = ctx.site?.pages?.some(
      (p) => p.path === '/llms.txt' || p.url?.endsWith('/llms.txt'),
    );
    if (hasLlmsTxt) return [];
    return [{
      subject: { type: 'file', identifier: '/llms.txt' },
      summary: 'llms.txt not discovered during crawl',
      evidence: ['No /llms.txt found in crawl results or site metadata'],
      captured: 'llms.txt absent',
      expected: '/llms.txt returning 200 with structured Markdown content',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-004: MCP Server Card discovery
// ---------------------------------------------------------------------------

export const AGENT_004 = defineDetector({
  id: 'AGENT-004',
  name: 'MCP Server Card not discoverable',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'A Model Context Protocol (MCP) Server Card at /.well-known/mcp enables AI agents ' +
    'to discover and connect to your MCP server programmatically. ' +
    'Without it, agents cannot auto-discover tool/resource APIs you publish.',
  applicable_requirement: 'MCP spec §discovery; isitagentready.com Protocol Discovery',
  remediation:
    'If you operate an MCP server, publish /.well-known/mcp as a JSON document. ' +
    'See https://modelcontextprotocol.io/ for the spec. ' +
    'If not applicable, suppress via .citable/config.yaml.',
  verification: 'Fetch /.well-known/mcp and confirm 200 with valid MCP server descriptor JSON.',
  check(ctx) {
    const mcpCard = ctx.site?.meta?.mcpCard || ctx.site?.wellKnown?.mcp;
    if (mcpCard?.found || mcpCard?.status === 200) return [];
    const hasMcpPage = ctx.site?.pages?.some(
      (p) => p.path === '/.well-known/mcp' || p.url?.includes('/.well-known/mcp'),
    );
    if (hasMcpPage) return [];
    // Only flag if site has API-like patterns (avoid noise for pure content sites)
    const hasApiSignals = ctx.site?.pages?.some(
      (p) => p.path?.includes('/api/') || p.path?.includes('/v1/') || p.path?.includes('/graphql'),
    );
    if (!hasApiSignals) return [];
    return [{
      subject: { type: 'file', identifier: '/.well-known/mcp' },
      summary: 'MCP Server Card not found at /.well-known/mcp (site has API endpoints)',
      evidence: [
        '/.well-known/mcp not discovered during crawl',
        'Site has API-like paths suggesting a programmable interface',
      ],
      captured: 'mcp card absent',
      expected: '/.well-known/mcp JSON descriptor for MCP server auto-discovery',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-005: A2A Agent Card discovery
// ---------------------------------------------------------------------------

export const AGENT_005 = defineDetector({
  id: 'AGENT-005',
  name: 'A2A Agent Card not discoverable',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'An Agent-to-Agent (A2A) Agent Card at /.well-known/agent.json describes agent ' +
    'capabilities for inter-agent communication (Google A2A protocol). ' +
    'Without it, other AI agents cannot discover your agent\'s skills or endpoints.',
  applicable_requirement: 'Google A2A spec; isitagentready.com Protocol Discovery',
  remediation:
    'Publish /.well-known/agent.json describing your agent\'s capabilities and authentication. ' +
    'See https://google.github.io/A2A/ for the specification. ' +
    'If not running an agent endpoint, suppress this finding.',
  verification: 'Fetch /.well-known/agent.json and confirm 200 with valid A2A agent descriptor.',
  check(ctx) {
    const a2aCard = ctx.site?.meta?.a2aCard || ctx.site?.wellKnown?.agent;
    if (a2aCard?.found || a2aCard?.status === 200) return [];
    const hasA2aPage = ctx.site?.pages?.some(
      (p) => p.path === '/.well-known/agent.json' || p.url?.includes('/.well-known/agent.json'),
    );
    if (hasA2aPage) return [];
    // Only flag for sites that appear to be agent platforms
    const hasAgentSignals = ctx.site?.pages?.some(
      (p) => p.path?.includes('/agent') || p.path?.includes('/api/'),
    );
    if (!hasAgentSignals) return [];
    return [{
      subject: { type: 'file', identifier: '/.well-known/agent.json' },
      summary: 'A2A Agent Card not found at /.well-known/agent.json',
      evidence: ['/.well-known/agent.json not discovered during crawl'],
      captured: 'a2a agent card absent',
      expected: '/.well-known/agent.json JSON descriptor for A2A agent discovery',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-006: Markdown content negotiation
// ---------------------------------------------------------------------------

export const AGENT_006 = defineDetector({
  id: 'AGENT-006',
  name: 'Markdown content negotiation not supported',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'Markdown content negotiation (Accept: text/markdown) lets AI agents retrieve ' +
    'pages as clean Markdown rather than HTML, improving token efficiency. ' +
    'Cloudflare supports this natively. Without it, agents must parse raw HTML.',
  applicable_requirement: 'isitagentready.com Content Accessibility; Cloudflare Markdown for Agents',
  remediation:
    'Enable via Cloudflare (automatic with Cloudflare proxying) or serve .md variants of key pages. ' +
    'See https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/.',
  verification: 'Run `curl -H "Accept: text/markdown" <page-url>` and confirm Markdown response.',
  check(ctx) {
    const page = homepageMeta(ctx);
    if (!page) return [];
    const headers = pageHeaders(page);
    const contentType = headerValue(headers, 'content-type') || '';
    const vary = headerValue(headers, 'vary') || '';
    if (contentType.includes('text/markdown')) return [];
    if (vary.toLowerCase().includes('accept')) return []; // Vary: Accept signals negotiation
    const hasMdPages = ctx.site?.pages?.some((p) => p.path?.endsWith('.md'));
    if (hasMdPages) return [];
    return [{
      subject: { type: 'page', identifier: siteUrl(ctx) },
      summary: 'No Markdown content negotiation support detected',
      evidence: [
        'Content-Type does not include text/markdown',
        vary ? `Vary header: ${vary} (does not indicate Accept negotiation)` : 'No Vary header present',
        'No .md pages found in crawl',
      ],
      captured: 'markdown negotiation absent',
      expected: 'Vary: Accept header or text/markdown Content-Type support',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-007: Web Bot Auth
// ---------------------------------------------------------------------------

export const AGENT_007 = defineDetector({
  id: 'AGENT-007',
  name: 'Web Bot Auth not declared',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'Web Bot Auth is a Cloudflare proposal for authenticated bot access, allowing ' +
    'sites to distinguish legitimate AI agents from scrapers via HTTP auth headers. ' +
    'See https://blog.cloudflare.com/web-bot-auth/.',
  applicable_requirement: 'isitagentready.com Bot Access Control; Cloudflare Web Bot Auth',
  remediation:
    'Implement Web Bot Auth via Cloudflare Bot Management or return appropriate ' +
    'WWW-Authenticate headers for bot clients. This is an emerging standard.',
  verification: 'Check for Web-Bot-Auth or WWW-Authenticate headers in HTTP responses.',
  check(ctx) {
    const page = homepageMeta(ctx);
    if (!page) return [];
    const headers = pageHeaders(page);
    const webBotAuth = headerValue(headers, 'web-bot-auth') || headerValue(headers, 'x-web-bot-auth');
    if (webBotAuth) return [];
    // Only flag if site has AI/bot-relevant signals (not all sites need this)
    const hasAiRules = ctx.site?.robots?.raw?.toLowerCase()?.includes('gptbot') ||
                       ctx.site?.robots?.raw?.toLowerCase()?.includes('claudebot');
    if (!hasAiRules) return []; // Only relevant if already engaging with AI bots
    return [{
      subject: { type: 'page', identifier: siteUrl(ctx) },
      summary: 'Web Bot Auth headers not present (site has AI bot rules in robots.txt)',
      evidence: [
        'No Web-Bot-Auth header found in HTTP response',
        'Site has AI crawler rules in robots.txt, suggesting bot-access awareness',
      ],
      captured: 'web bot auth absent',
      expected: 'Web-Bot-Auth header for permissioned bot access control',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-008: Content Signals header
// ---------------------------------------------------------------------------

export const AGENT_008 = defineDetector({
  id: 'AGENT-008',
  name: 'Content-Signals header absent',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'Content Signals is a Cloudflare proposal for sites to declare content type and ' +
    'AI usage permissions via HTTP headers, eliminating the need to scrape ToS pages. ' +
    'See https://blog.cloudflare.com/content-signals/.',
  applicable_requirement: 'isitagentready.com Bot Access Control; Cloudflare Content Signals',
  remediation:
    'Add Content-Signals headers to your CDN responses. ' +
    'Example: `Content-Signals: type=editorial; ai-training=disallowed; ai-inference=allowed`. ' +
    'See https://blog.cloudflare.com/content-signals/ for the current proposal.',
  verification: 'Check for Content-Signals header in HTTP responses via `curl -I <url>`.',
  check(ctx) {
    const page = homepageMeta(ctx);
    if (!page) return [];
    const headers = pageHeaders(page);
    if (headerValue(headers, 'content-signals')) return [];
    // Only flag if site has content worth protecting (has structured content)
    const hasStructuredContent = ctx.site?.pages?.some(
      (p) => p.structuredData?.length > 0 || p.schema?.length > 0,
    );
    if (!hasStructuredContent) return [];
    return [{
      subject: { type: 'page', identifier: siteUrl(ctx) },
      summary: 'Content-Signals header not present',
      evidence: ['No Content-Signals header found in HTTP response headers'],
      captured: 'content signals absent',
      expected: 'Content-Signals header declaring AI usage permissions for your content',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-009: Auth.md discovery
// ---------------------------------------------------------------------------

export const AGENT_009 = defineDetector({
  id: 'AGENT-009',
  name: 'auth.md not present',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'auth.md is a convention for documenting authentication requirements in a ' +
    'machine-readable Markdown file. AI agents can read /auth.md to understand ' +
    'how to authenticate before making API calls.',
  applicable_requirement: 'isitagentready.com Protocol Discovery; Auth.md convention',
  remediation:
    'Create /auth.md documenting: supported auth methods (API key, OAuth, JWT), ' +
    'how to obtain credentials, rate limits, and scope requirements.',
  verification: 'Fetch /auth.md and confirm it returns 200 with authentication documentation.',
  check(ctx) {
    const authMd = ctx.site?.meta?.authMd;
    if (authMd?.found || authMd?.status === 200) return [];
    const hasAuthMd = ctx.site?.pages?.some(
      (p) => p.path === '/auth.md' || p.url?.endsWith('/auth.md'),
    );
    if (hasAuthMd) return [];
    // Only flag if site has auth or API paths
    const hasApiPaths = ctx.site?.pages?.some(
      (p) => p.path?.includes('/api/') || p.path?.includes('/login') || p.path?.includes('/oauth'),
    );
    if (!hasApiPaths) return [];
    return [{
      subject: { type: 'file', identifier: '/auth.md' },
      summary: 'auth.md absent (site has authentication or API paths)',
      evidence: [
        '/auth.md not discovered during crawl',
        'Site has login, OAuth, or /api/ paths',
      ],
      captured: 'auth.md absent',
      expected: '/auth.md documenting authentication requirements for agent consumers',
    }];
  },
});

// ---------------------------------------------------------------------------
// AGENT-010: Agentic commerce signals (x402 / MPP / UCP / ACP)
// ---------------------------------------------------------------------------

export const AGENT_010 = defineDetector({
  id: 'AGENT-010',
  name: 'Agentic commerce protocols not declared',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'low',
  deterministic: false,
  description:
    'Agentic commerce protocols (x402, MPP, UCP, ACP) enable AI agents to make ' +
    'micropayments or access paid resources programmatically. ' +
    'x402 uses HTTP 402 with payment headers; MPP/UCP/ACP provide higher-level primitives. ' +
    'See https://www.x402.org/, https://mpp.dev/, https://ucp.dev/, https://agenticcommerce.dev/.',
  applicable_requirement: 'isitagentready.com Commerce; x402/MPP/UCP/ACP protocols',
  remediation:
    'If selling API access or content: implement x402 payment flows (return HTTP 402 with ' +
    'X-Payment header on gated resources) or integrate with MPP/UCP/ACP. ' +
    'If commerce is not applicable, suppress this finding.',
  verification:
    'Fetch a gated resource and confirm 402 with payment instructions, ' +
    'or check for X-Payment/X-MPP/X-UCP headers.',
  check(ctx) {
    const page = homepageMeta(ctx);
    if (!page) return [];
    const headers = pageHeaders(page);
    if (
      headerValue(headers, 'x-payment') ||
      headerValue(headers, 'x-402') ||
      headerValue(headers, 'x-mpp') ||
      headerValue(headers, 'x-ucp') ||
      headerValue(headers, 'x-acp')
    ) return [];
    // Only flag for sites with visible commerce (pricing, checkout, API access)
    const hasCommerce = ctx.site?.pages?.some(
      (p) =>
        p.path?.includes('/pricing') ||
        p.path?.includes('/checkout') ||
        p.path?.includes('/buy') ||
        p.path?.includes('/subscribe'),
    );
    if (!hasCommerce) return [];
    return [{
      subject: { type: 'page', identifier: siteUrl(ctx) },
      summary: 'No agentic commerce protocol headers detected (site has commerce pages)',
      evidence: [
        'No x402, MPP, UCP, or ACP protocol headers found',
        'Site has pricing or checkout paths',
      ],
      captured: 'no agentic commerce protocol',
      expected: 'x402 X-Payment header or MPP/UCP/ACP declarations for agent-accessible transactions',
    }];
  },
});

export const AGENT_DETECTORS = [
  AGENT_001,
  AGENT_002,
  AGENT_003,
  AGENT_004,
  AGENT_005,
  AGENT_006,
  AGENT_007,
  AGENT_008,
  AGENT_009,
  AGENT_010,
];
