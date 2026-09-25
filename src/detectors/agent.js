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

import fs from 'node:fs';
import path from 'node:path';
import { defineDetector } from './framework.js';
import {
  validateMcpServerCard,
  validateA2aCard,
  validateWebMcp,
  validateArd,
  classifyOperation,
  checkOperationSafetyGuards,
  classifyForm,
  evaluateConfirmationBoundary,
  scanPromptInjectionSurfaces,
} from '../agent/index.js';

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
  coverage_requirement: 'exhaustive_requested_scope',
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
  coverage_requirement: 'evaluated_subset',
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
  coverage_requirement: 'exhaustive_requested_scope',
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
  coverage_requirement: 'exhaustive_requested_scope',
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
  coverage_requirement: 'exhaustive_requested_scope',
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
  coverage_requirement: 'evaluated_subset',
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
  coverage_requirement: 'evaluated_subset',
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
  coverage_requirement: 'evaluated_subset',
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
  coverage_requirement: 'evaluated_subset',
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
  coverage_requirement: 'evaluated_subset',
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

// ---------------------------------------------------------------------------
// AGENT-011: llms.txt structure and link integrity
// ---------------------------------------------------------------------------

export const AGENT_011 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-011',
  name: 'llms.txt structure or link integrity broken',
  namespace: 'AGENT',
  discipline: ['agent-readiness', 'geo'],
  severity: 'medium',
  deterministic: true,
  description:
    'An /llms.txt or /llms-full.txt file exists on the site but violates the llmstxt.org specification ' +
    '(missing H1 title, missing blockquote description, malformed Markdown links) or contains broken links.',
  applicable_requirement: 'llmstxt.org specification; GEO §3 discoverability; agent-readiness §content-accessibility',
  remediation:
    'Format /llms.txt with an opening H1 title, a blockquote summary, and valid Markdown links pointing to active HTTP 200 URLs. Run `citable generate llms-txt --write` to generate a conforming specification.',
  verification: 'Fetch /llms.txt and verify H1 title, blockquote description, and resolvable link URLs.',
  check(ctx) {
    let raw = null;
    let identifier = '/llms.txt';

    if (ctx.site?.llmsTxt?.raw) {
      raw = ctx.site.llmsTxt.raw;
    } else {
      const page = ctx.site?.pages?.find((p) => p.path === '/llms.txt' || p.url?.endsWith('/llms.txt'));
      if (page) {
        raw = page.rawHtml || page.text || null;
        identifier = page.url || '/llms.txt';
      } else if (ctx.site?.location) {
        const localPath = path.join(ctx.site.location, 'llms.txt');
        if (fs.existsSync(localPath)) {
          raw = fs.readFileSync(localPath, 'utf8');
        }
      }
    }

    if (!raw || raw.trim().length === 0) return [];

    const findings = [];
    const problems = [];

    if (!/^#\s+.+/m.test(raw)) {
      problems.push('Missing H1 project/site title heading (# Title)');
    }

    if (!/^>\s+.+/m.test(raw)) {
      problems.push('Missing blockquote description/summary (> Summary)');
    }

    const linkMatches = [...raw.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    const sitePages = ctx.site?.pages || [];
    const brokenLinks = [];

    for (const match of linkMatches) {
      const linkText = match[1];
      const linkUrl = match[2].trim();

      let normalizedPath = null;
      try {
        if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
          const parsed = new URL(linkUrl);
          const baseOrigin = ctx.config?.site?.base_url
            ? new URL(ctx.config.site.base_url).origin
            : (sitePages[0] ? new URL(sitePages[0].url).origin : null);
          if (baseOrigin && parsed.origin === baseOrigin) {
            normalizedPath = parsed.pathname;
          }
        } else if (linkUrl.startsWith('/')) {
          normalizedPath = linkUrl.split('?')[0].split('#')[0];
        }
      } catch {
        problems.push(`Malformed URL in markdown link: [${linkText}](${linkUrl})`);
        continue;
      }

      if (normalizedPath && sitePages.length > 0) {
        const existsInPages = sitePages.some((p) => {
          try {
            const pagePath = new URL(p.url).pathname;
            return (
              pagePath === normalizedPath ||
              pagePath === normalizedPath + '/' ||
              normalizedPath === pagePath + '/' ||
              pagePath.replace(/\/index\.html$/, '/') === normalizedPath
            );
          } catch {
            return false;
          }
        });

        if (!existsInPages && (normalizedPath === '/llms-full.txt' || normalizedPath.endsWith('/llms-full.txt'))) {
          const fullExists = Boolean(
            ctx.site?.llmsFullTxt?.raw ||
            ctx.site?.pages?.some((p) => p.path === '/llms-full.txt' || p.url?.endsWith('/llms-full.txt')) ||
            (ctx.site?.location && fs.existsSync(path.join(ctx.site.location, 'llms-full.txt')))
          );
          if (!fullExists) {
            brokenLinks.push(`[${linkText}](${linkUrl}) -> referenced /llms-full.txt not found`);
          }
        } else if (!existsInPages) {
          brokenLinks.push(`[${linkText}](${linkUrl}) -> URL not found in crawled site pages`);
        }
      }
    }

    if (brokenLinks.length > 0) {
      problems.push(`${brokenLinks.length} broken/unresolved internal link(s): ${brokenLinks.slice(0, 3).join(', ')}`);
    }

    if (problems.length > 0) {
      findings.push({
        subject: { type: 'file', identifier },
        summary: `/llms.txt has ${problems.length} specification / link integrity problem(s)`,
        evidence: problems,
        captured: problems.join('; '),
        expected: 'Valid llmstxt.org format with H1 title, blockquote summary, and resolvable link URLs',
      });
    }

    return findings;
  },
});

// ---------------------------------------------------------------------------
// AGENT-012: MCP Server Card and Tool Semantics Validation (B-060)
// ---------------------------------------------------------------------------

export const AGENT_012 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-012',
  name: 'MCP server card semantics or capability invalid',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'high',
  deterministic: true,
  description:
    'An MCP Server Card exists but has invalid schema, malformed tool definitions (missing name, description, ' +
    'or valid inputSchema), or advertises tools/endpoints that cannot be resolved on the site (DECLARED_CAPABILITY_INVALID).',
  applicable_requirement:
    'AI Readiness §49 MCP Discovery, §50 MCP Capability Validation, §51 Tool Semantics, §86 Protocol Claims Versus Reality',
  remediation:
    'Ensure /.well-known/mcp contains valid JSON with a server descriptor, valid tool names and descriptions, ' +
    'conforming inputSchema objects, and reachable transport endpoints.',
  verification: 'Fetch /.well-known/mcp and test that all declared tools have conforming input schemas and resolvable endpoints.',
  check(ctx) {
    let raw = null;
    let identifier = '/.well-known/mcp';

    if (ctx.site?.meta?.mcpCard) {
      raw = ctx.site.meta.mcpCard;
    } else if (ctx.site?.wellKnown?.mcp) {
      raw = ctx.site.wellKnown.mcp;
    } else {
      const page = ctx.site?.pages?.find(
        (p) => p.path === '/.well-known/mcp' || p.url?.endsWith('/.well-known/mcp')
      );
      if (page) {
        raw = page.rawHtml || page.text;
        identifier = page.url || '/.well-known/mcp';
      } else if (ctx.site?.location) {
        const localPath = path.join(ctx.site.location, '.well-known', 'mcp');
        if (fs.existsSync(localPath)) {
          raw = fs.readFileSync(localPath, 'utf8');
        }
      }
    }

    if (!raw) return []; // Missing card is handled by AGENT-004 at low severity

    const result = validateMcpServerCard(raw, ctx);
    if (!result.valid) {
      return [{
        subject: { type: 'file', identifier },
        summary: `MCP Server Card declared capability invalid (DECLARED_CAPABILITY_INVALID): ${result.errors.slice(0, 2).join('; ')}`,
        evidence: result.errors,
        captured: `DECLARED_CAPABILITY_INVALID: ${result.errors.length} defect(s)`,
        expected: 'Valid MCP card with conforming tool inputSchemas, descriptions, and invocable endpoints',
      }];
    }

    return [];
  },
});

// ---------------------------------------------------------------------------
// AGENT-013: Protocol Validation for A2A, WebMCP, and ARD (B-061)
// ---------------------------------------------------------------------------

export const AGENT_013 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-013',
  name: 'Agent protocol capability declared but invalid or absent',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'high',
  deterministic: true,
  description:
    'An agent protocol capability (Google A2A agent card, WebMCP browser tools, or ARD resource discovery) ' +
    'is declared by the site, but its schema is malformed or its declared endpoints/tools are absent (DECLARED_CAPABILITY_INVALID).',
  applicable_requirement:
    'AI Readiness §55 A2A Validation, §56 WebMCP, §57 ARD, §86 Protocol Claims Versus Reality',
  remediation:
    'Ensure all declared A2A endpoints, WebMCP browser tool handlers, and ARD resource URLs correspond to active, resolvable resources.',
  verification: 'Validate declared agent protocol schemas and test that declared endpoints resolve to active resources.',
  check(ctx) {
    const findings = [];

    // 1. A2A Check
    let a2aRaw = ctx.site?.meta?.a2aCard || ctx.site?.wellKnown?.agent || null;
    let a2aIdentifier = '/.well-known/agent.json';
    if (!a2aRaw) {
      const page = ctx.site?.pages?.find(
        (p) => p.path === '/.well-known/agent.json' || p.url?.endsWith('/.well-known/agent.json')
      );
      if (page) {
        a2aRaw = page.rawHtml || page.text;
        a2aIdentifier = page.url || '/.well-known/agent.json';
      } else if (ctx.site?.location) {
        const localPath = path.join(ctx.site.location, '.well-known', 'agent.json');
        if (fs.existsSync(localPath)) {
          a2aRaw = fs.readFileSync(localPath, 'utf8');
        }
      }
    }

    if (a2aRaw) {
      const a2aResult = validateA2aCard(a2aRaw, ctx);
      if (a2aResult.declared && !a2aResult.valid) {
        findings.push({
          subject: { type: 'file', identifier: a2aIdentifier },
          summary: `A2A capability declared but invalid or absent (DECLARED_CAPABILITY_INVALID): ${a2aResult.errors.slice(0, 2).join('; ')}`,
          evidence: a2aResult.errors,
          captured: `DECLARED_CAPABILITY_INVALID: ${a2aResult.errors.length} defect(s)`,
          expected: 'Valid A2A descriptor with active and resolvable endpoint URLs',
        });
      }
    }

    // 2. WebMCP Check
    const webMcpResult = validateWebMcp(ctx.site?.pages || [], ctx);
    if (webMcpResult.declared && !webMcpResult.valid) {
      findings.push({
        subject: { type: 'page', identifier: siteUrl(ctx) },
        summary: `WebMCP browser tools declared but invalid or absent (DECLARED_CAPABILITY_INVALID): ${webMcpResult.errors.slice(0, 2).join('; ')}`,
        evidence: webMcpResult.errors,
        captured: `DECLARED_CAPABILITY_INVALID: ${webMcpResult.errors.length} WebMCP defect(s)`,
        expected: 'Valid WebMCP tool declarations with valid descriptions and schemas',
      });
    }

    // 3. ARD Check
    const ardResult = validateArd(ctx);
    if (ardResult.declared && !ardResult.valid) {
      findings.push({
        subject: { type: 'file', identifier: ardResult.source || '/.well-known/ard.json' },
        summary: `Agentic Resource Discovery declared but invalid or absent (DECLARED_CAPABILITY_INVALID): ${ardResult.errors.slice(0, 2).join('; ')}`,
        evidence: ardResult.errors,
        captured: `DECLARED_CAPABILITY_INVALID: ${ardResult.errors.length} ARD defect(s)`,
        expected: 'All declared ARD resources resolve to valid URLs on the site',
      });
    }

    return findings;
  },
});

// ---------------------------------------------------------------------------
// AGENT-014: Side Effects and Destructive Actions Classification (B-062)
// ---------------------------------------------------------------------------

export const AGENT_014 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-014',
  name: 'Machine-exposed destructive operation lacks confirmation or safety controls',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'high',
  deterministic: true,
  description:
    'A machine-exposed operation (MCP tool, WebMCP tool, or A2A skill) performs an elevated-risk or destructive action ' +
    '(DELETE_ACCOUNT, CANCEL_SUBSCRIPTION, CANCEL_ORDER, DELETE_DATA, REVOKE_ACCESS, or financial mutation) ' +
    'without declared confirmation boundaries, idempotency keys, or authorization guards.',
  applicable_requirement:
    'AI Readiness §52 Side-Effect Classification, §53 Idempotency, §70 Destructive Actions',
  remediation:
    'Annotate destructive tools with requires_confirmation: true, define idempotency key parameters, ' +
    'and require explicit authorization scopes.',
  verification: 'Inspect tool descriptors to verify confirmation requirements and idempotency guards on destructive actions.',
  check(ctx) {
    const findings = [];
    const operations = [];

    // Collect tools from MCP
    const mcpTools = ctx.site?.meta?.mcpCard?.tools || ctx.site?.wellKnown?.mcp?.tools || [];
    const mcpToolList = Array.isArray(mcpTools) ? mcpTools : (typeof mcpTools === 'object' && mcpTools !== null ? Object.values(mcpTools) : []);
    for (const t of mcpToolList) operations.push({ ...t, source: 'MCP' });

    // Collect tools from WebMCP
    const webMcp = validateWebMcp(ctx.site?.pages || [], ctx);
    for (const t of webMcp.tools || []) operations.push({ ...t, source: 'WebMCP' });

    // Check each operation
    for (const op of operations) {
      const classification = classifyOperation(op);
      const safety = checkOperationSafetyGuards(op, classification);

      if (!safety.safe) {
        findings.push({
          subject: { type: 'registry_entry', identifier: `${op.source}:${op.name || 'unnamed'}` },
          summary: `${op.source} operation "${op.name}" classified as ${classification.category} (${classification.destructiveType || 'ELEVATED_RISK'}) lacks safety controls`,
          evidence: safety.missingGuards,
          captured: `category: ${classification.category}, risk: ${classification.riskLevel}, missing: ${safety.missingGuards.join('; ')}`,
          expected: 'Explicit confirmation requirements, idempotency keys, and authorization guards on destructive actions',
        });
      }
    }

    return findings;
  },
});

// ---------------------------------------------------------------------------
// AGENT-015: Form Safety and Confirmation Boundary Detection (B-063)
// ---------------------------------------------------------------------------

export const AGENT_015 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-015',
  name: 'High-impact form control consequence machine-ambiguous',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'high',
  deterministic: true,
  description:
    'A high-impact HTML form control (financial payment, checkout, account deletion, subscription cancellation, or data wipe) ' +
    'lacks a machine-detectable confirmation boundary (preview/review step, confirmation dialog, or unambiguous consequence disclosure), ' +
    'making automated execution unsafe for AI agents.',
  applicable_requirement:
    'AI Readiness §40 Form Safety, §41 Confirmation Semantics, §70 Destructive Actions',
  remediation:
    'Add an explicit confirmation step (review before execution), unambiguous button labels (e.g. "Review Order" instead of "Submit"), ' +
    'or data-confirm attributes on high-impact forms.',
  verification: 'Verify that all financial and destructive forms require multi-step confirmation or clear consequences disclosures before mutation.',
  check(ctx) {
    const findings = [];
    const pages = ctx.site?.pages || [];

    for (const page of pages) {
      const forms = page.forms || [];
      for (const form of forms) {
        const formClass = classifyForm(form, page);
        const evaluation = evaluateConfirmationBoundary(form, formClass, page.rawHtml || page.html || '');

        if (evaluation.isMachineAmbiguous) {
          findings.push({
            subject: { type: 'page', identifier: page.url || siteUrl(ctx) },
            summary: `Form on ${page.path || page.url} has machine-ambiguous ${formClass} control: ${evaluation.reasons[0]}`,
            evidence: evaluation.reasons,
            captured: `class: ${formClass}, submit: "${form.submitText || ''}", action: "${form.action || ''}"`,
            expected: 'Two-step confirmation boundary, preview step, or clear consequence disclosure on high-impact forms',
          });
        }
      }
    }

    return findings;
  },
});

// ---------------------------------------------------------------------------
// AGENT-016: Prompt-Injection Surface Scan (B-064)
// ---------------------------------------------------------------------------

export const AGENT_016 = defineDetector({
  coverage_requirement: 'evaluated_subset',
  id: 'AGENT-016',
  name: 'Agent-directed instructions detected on machine-readable surfaces',
  namespace: 'AGENT',
  discipline: ['agent-readiness'],
  severity: 'medium',
  deterministic: true,
  description:
    'Agent-directed instructions (prompt injection patterns) were detected on HTML, metadata, comments, ' +
    'structured data, UGC, or tool descriptions. Presence is surfaced as an observation without asserting malicious or benign intent.',
  applicable_requirement:
    'AI Readiness §71 Prompt Injection Exposure, §72 Content/Instruction Separation',
  remediation:
    'Separate data from instructions; ensure user-generated content and third-party inputs are properly sanitized ' +
    'and not rendered into agent instruction prompts.',
  verification: 'Inspect surfaced matches and verify untrusted text is isolated from autonomous agent instruction pipelines.',
  check(ctx) {
    const findings = [];
    const pages = ctx.site?.pages || [];

    for (const page of pages) {
      const observations = scanPromptInjectionSurfaces(page, ctx);
      for (const obs of observations) {
        findings.push({
          subject: { type: 'page', identifier: page.url || siteUrl(ctx) },
          summary: `Agent-directed instruction phrasing detected in ${obs.surface} at ${obs.location}; presence reported without asserting intent`,
          evidence: [
            `surface: ${obs.surface}`,
            `location: ${obs.location}`,
            `pattern: ${obs.pattern_name}`,
            `matched: "${obs.matched_text}"`,
            `snippet: "${obs.snippet}"`,
            `intent: ${obs.intent} (${obs.note})`,
          ],
          captured: `pattern: ${obs.pattern_name}, intent: unasserted`,
          expected: 'No agent-directed instruction overrides embedded in machine-readable content surfaces',
        });
      }
    }

    return findings;
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
  AGENT_011,
  AGENT_012,
  AGENT_013,
  AGENT_014,
  AGENT_015,
  AGENT_016,
];
