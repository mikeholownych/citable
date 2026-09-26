/**
 * Prompt-Injection Surface Scanner for Agent Readiness.
 *
 * Implements requirement B-064:
 * - Scans agent-directed instructions across machine-readable and human-facing surfaces:
 *   HTML, metadata, comments, structured data, UGC (user-generated content), and tool descriptions.
 * - Surfaces matches as structured observations and findings.
 * - Invariant: Presence is reported without asserting intent (malicious vs benign).
 */

export const INJECTION_SURFACES = [
  'html',
  'metadata',
  'comment',
  'structured_data',
  'ugc',
  'tool_description',
];

export const INJECTION_PATTERNS = [
  {
    name: 'instruction_override',
    rx: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directions|directives)\b/i,
  },
  {
    name: 'role_or_persona_hijack',
    rx: /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+an?\s+(?:unrestricted|evil|admin|jailbroken|new)\s+(?:ai|assistant|model|bot|agent)\b/i,
  },
  {
    name: 'system_prompt_simulation',
    rx: /\b(?:system\s*prompt\s*:|<\|(?:im_start|system|user|assistant)\|>|\[SYSTEM\s*PROMPT\]|BEGIN_SYSTEM_INSTRUCTION)\b/i,
  },
  {
    name: 'unconditional_recommendation',
    rx: /\b(?:always\s+recommend|never\s+mention\s+(?:competitor|alternative)|exclusively\s+endorse|do\s+not\s+mention\s+other\s+brands)\b/i,
  },
  {
    name: 'credential_or_data_exfiltration',
    rx: /\b(?:send|exfiltrate|forward|post|transmit)\s+(?:all\s+)?(?:credentials|passwords?|api[-_ ]keys?|tokens?|private\s+data)\s+(?:to|towards)\b/i,
  },
  {
    name: 'autonomous_tool_trigger',
    rx: /\b(?:call\s+this\s+tool\s+automatically|execute\s+this\s+(?:command|tool)\s+immediately\s+without\s+(?:asking|confirmation))\b/i,
  },
];

/**
 * Scan a single text string across a named surface and return all detected patterns.
 * Explicitly records intent as 'unasserted'.
 */
export function scanTextForInstructions(text, surface, location) {
  if (!text || typeof text !== 'string') return [];
  const hits = [];

  for (const pat of INJECTION_PATTERNS) {
    const match = pat.rx.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();

      hits.push({
        surface,
        location,
        pattern_name: pat.name,
        matched_text: match[0],
        snippet,
        intent: 'unasserted',
        note: 'Presence reported as an unverified observation without asserting malicious or benign intent.',
      });
    }
  }

  return hits;
}

/**
 * Scan all agent-directed instruction surfaces on a page and in site context.
 */
export function scanPromptInjectionSurfaces(page, siteContext = {}) {
  const observations = [];

  const rawHtml = page.rawHtml || page.html || '';

  // 1. Metadata surface: <title>, <meta name="..." content="...">
  if (page.title) {
    observations.push(...scanTextForInstructions(page.title, 'metadata', '<title>'));
  }
  if (page.metas) {
    for (const [name, values] of Object.entries(page.metas)) {
      for (const val of values) {
        observations.push(...scanTextForInstructions(val, 'metadata', `<meta name="${name}">`));
      }
    }
  }

  // 2. HTML comments surface: <!-- ... -->
  const comments = rawHtml.match(/<!--([\s\S]*?)-->/g) || [];
  for (const c of comments) {
    observations.push(...scanTextForInstructions(c, 'comment', 'HTML comment'));
  }

  // 3. Structured data surface: JSON-LD
  const jsonLdBlocks = page.jsonLd || [];
  for (let i = 0; i < jsonLdBlocks.length; i++) {
    const raw = jsonLdBlocks[i].raw || JSON.stringify(jsonLdBlocks[i].parsed || {});
    observations.push(...scanTextForInstructions(raw, 'structured_data', `JSON-LD block #${i + 1}`));
  }

  // 4. UGC (User-Generated Content) surface: reviews, comments, testimonials, forums
  const ugcMatches = [...rawHtml.matchAll(/<(?:div|section|article|p|span|blockquote)[^>]*(?:class|id|data-type)=["'][^"']*(?:ugc|review|comment|testimonial|forum|user-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article|p|span|blockquote)>/gi)];
  for (let i = 0; i < ugcMatches.length; i++) {
    const ugcText = ugcMatches[i][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    observations.push(...scanTextForInstructions(ugcText, 'ugc', `UGC element #${i + 1}`));
  }

  // 5. HTML visible text surface (including hidden texts)
  const hidden = page.hiddenTexts || [];
  for (const h of hidden) {
    observations.push(...scanTextForInstructions(h, 'html', 'Hidden text element'));
  }
  const visibleText = page.text || '';
  if (visibleText) {
    observations.push(...scanTextForInstructions(visibleText, 'html', 'Page visible body text'));
  }

  // 6. Tool descriptions surface: MCP, WebMCP, or A2A
  const mcpTools = siteContext.site?.meta?.mcpCard?.tools || siteContext.mcpTools || [];
  const toolList = Array.isArray(mcpTools) ? mcpTools : Object.values(mcpTools);
  for (const tool of toolList) {
    if (tool.description) {
      observations.push(...scanTextForInstructions(tool.description, 'tool_description', `Tool "${tool.name || 'unnamed'}" description`));
    }
  }

  return observations;
}
