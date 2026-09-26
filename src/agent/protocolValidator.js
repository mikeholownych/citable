/**
 * Agent Protocol Validator for A2A, WebMCP, and ARD.
 *
 * Implements requirement B-061:
 * - Extends protocol validation to A2A (Google Agent-to-Agent), WebMCP (browser tools), and ARD (Agentic Resource Discovery).
 * - Ensures each declared capability is testable.
 * - Explicitly distinguishes declared-but-absent capability from not-declared.
 */

import { DECLARED_CAPABILITY_INVALID, isValidInputSchema, isEndpointResolvable } from './mcpValidator.js';

export { DECLARED_CAPABILITY_INVALID };

/**
 * Validate an A2A (Google Agent-to-Agent) Agent Card (e.g. /.well-known/agent.json).
 */
export function validateA2aCard(cardOrRaw, siteContext = {}) {
  if (!cardOrRaw) {
    return { declared: false, valid: true, code: 'NOT_DECLARED', errors: [] };
  }

  let card = cardOrRaw;
  if (typeof cardOrRaw === 'string') {
    try {
      card = JSON.parse(cardOrRaw);
    } catch (err) {
      return {
        declared: true,
        valid: false,
        code: DECLARED_CAPABILITY_INVALID,
        errors: [`A2A agent card JSON parse error: ${err.message}`],
      };
    }
  }

  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return {
      declared: true,
      valid: false,
      code: DECLARED_CAPABILITY_INVALID,
      errors: ['A2A agent card must be a JSON object'],
    };
  }

  const errors = [];

  // Required A2A descriptor fields
  const name = card.name || card.agent_id || card.identity?.name;
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('A2A card is missing agent identity name');
  }

  const description = card.description || card.identity?.description;
  if (!description || typeof description !== 'string' || !description.trim()) {
    errors.push('A2A card is missing agent description');
  }

  // Endpoints validation
  const endpoint = card.endpoint || card.url || card.endpoints?.default;
  if (!endpoint) {
    errors.push('A2A card declares no primary endpoint URL');
  } else if (!isEndpointResolvable(endpoint, siteContext)) {
    errors.push(`A2A declared endpoint "${endpoint}" is absent or returns 404`);
  }

  // Capabilities / Skills validation
  const skills = card.capabilities || card.skills || card.supported_tasks;
  if (skills) {
    if (!Array.isArray(skills) && typeof skills !== 'object') {
      errors.push('A2A declared capabilities/skills must be an array or object');
    } else {
      const skillList = Array.isArray(skills) ? skills : Object.values(skills);
      for (const skill of skillList) {
        if (typeof skill === 'string') {
          if (!skill.trim()) errors.push('A2A declared an empty skill identifier');
        } else if (typeof skill === 'object' && skill !== null) {
          if (!skill.name && !skill.id && !skill.task) {
            errors.push('A2A declared skill is missing a name or task identifier');
          }
          if (skill.inputSchema && !isValidInputSchema(skill.inputSchema)) {
            errors.push(`A2A skill "${skill.name || skill.id}" has an invalid inputSchema`);
          }
          if (skill.endpoint && !isEndpointResolvable(skill.endpoint, siteContext)) {
            errors.push(`A2A skill "${skill.name || skill.id}" declared endpoint "${skill.endpoint}" is unreachable`);
          }
        }
      }
    }
  }

  const isValid = errors.length === 0;
  return {
    declared: true,
    valid: isValid,
    code: isValid ? 'VALID' : DECLARED_CAPABILITY_INVALID,
    card,
    errors,
  };
}

/**
 * Inspect HTML pages for WebMCP browser-side tool declarations.
 * WebMCP declarations typically exist in:
 * - <meta name="webmcp" content="...">
 * - <script type="application/webmcp+json">
 * - <link rel="webmcp" href="...">
 */
export function extractWebMcpDeclarations(pages = []) {
  const declarations = [];

  for (const page of pages) {
    const html = page.rawHtml || page.html || '';
    if (!html) continue;

    // 1. Script tags with type="application/webmcp+json"
    const scriptMatches = [...html.matchAll(/<script[^>]*type=["']application\/webmcp\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of scriptMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        declarations.push({
          source: 'script',
          pageUrl: page.url,
          data: parsed,
        });
      } catch (err) {
        declarations.push({
          source: 'script',
          pageUrl: page.url,
          parseError: err.message,
          data: null,
        });
      }
    }

    // 2. Meta tags with name="webmcp"
    const metaMatches = [...html.matchAll(/<meta[^>]*name=["']webmcp["'][^>]*content=["']([^"']+)["'][^>]*>/gi)];
    for (const match of metaMatches) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const parsed = JSON.parse(decoded);
        declarations.push({
          source: 'meta',
          pageUrl: page.url,
          data: parsed,
        });
      } catch {
        declarations.push({
          source: 'meta',
          pageUrl: page.url,
          data: { raw: match[1] },
        });
      }
    }
  }

  return declarations;
}

/**
 * Validate WebMCP browser tools across pages.
 */
export function validateWebMcp(pages = [], siteContext = {}) {
  const declarations = extractWebMcpDeclarations(pages);
  if (declarations.length === 0) {
    return { declared: false, valid: true, code: 'NOT_DECLARED', tools: [], errors: [] };
  }

  const errors = [];
  const tools = [];

  for (const decl of declarations) {
    if (decl.parseError) {
      errors.push(`WebMCP JSON parse error on ${decl.pageUrl}: ${decl.parseError}`);
      continue;
    }

    const data = decl.data;
    if (!data || typeof data !== 'object') {
      errors.push(`WebMCP declaration on ${decl.pageUrl} is not a valid object`);
      continue;
    }

    const toolList = Array.isArray(data.tools) ? data.tools : (Array.isArray(data) ? data : [data]);
    for (const tool of toolList) {
      if (!tool || typeof tool !== 'object') {
        errors.push(`WebMCP on ${decl.pageUrl} has invalid tool entry`);
        continue;
      }

      if (!tool.name || typeof tool.name !== 'string' || !tool.name.trim()) {
        errors.push(`WebMCP tool on ${decl.pageUrl} missing tool name`);
      } else {
        tools.push(tool);
      }

      if (!tool.description || typeof tool.description !== 'string' || !tool.description.trim()) {
        errors.push(`WebMCP tool "${tool.name || 'unnamed'}" on ${decl.pageUrl} is missing a description`);
      }

      const schema = tool.inputSchema || tool.parameters;
      if (schema && !isValidInputSchema(schema)) {
        errors.push(`WebMCP tool "${tool.name}" on ${decl.pageUrl} has invalid inputSchema`);
      }

      // Check if browser tool specifies an action handler or target that is missing
      if (tool.action && typeof tool.action === 'string' && tool.action.startsWith('/')) {
        if (!isEndpointResolvable(tool.action, siteContext)) {
          errors.push(`WebMCP tool "${tool.name}" action endpoint "${tool.action}" is not found on site`);
        }
      }
    }
  }

  const isValid = errors.length === 0;
  return {
    declared: true,
    valid: isValid,
    code: isValid ? 'VALID' : DECLARED_CAPABILITY_INVALID,
    tools,
    errors,
  };
}

/**
 * Validate Agentic Resource Discovery (ARD) metadata.
 * Checked via:
 * - /.well-known/ard.json
 * - <link rel="agent-resources" href="...">
 * - <link rel="ard" href="...">
 */
export function validateArd(siteContext = {}) {
  const pages = siteContext.site?.pages || [];
  let ardRaw = siteContext.site?.meta?.ard || siteContext.site?.wellKnown?.ard || null;
  let ardSource = '/.well-known/ard.json';

  if (!ardRaw) {
    const pageWithArd = pages.find((p) => p.path === '/.well-known/ard.json' || p.url?.endsWith('/.well-known/ard.json'));
    if (pageWithArd) {
      ardRaw = pageWithArd.rawHtml || pageWithArd.text;
      ardSource = pageWithArd.url;
    }
  }

  // Look for <link rel="agent-resources" href="..."> or rel="ard"
  if (!ardRaw) {
    for (const page of pages) {
      const html = page.rawHtml || page.html || '';
      const linkMatch = html.match(/<link[^>]*rel=["'](agent-resources|ard)["'][^>]*href=["']([^"']+)["'][^>]*>/i);
      if (linkMatch) {
        const href = linkMatch[2];
        ardSource = href;
        const linkedPage = pages.find((p) => p.path === href || p.url?.endsWith(href));
        if (linkedPage) {
          ardRaw = linkedPage.rawHtml || linkedPage.text;
        } else {
          // Declared link to ARD file, but the file was not discovered/404!
          return {
            declared: true,
            valid: false,
            code: DECLARED_CAPABILITY_INVALID,
            source: href,
            errors: [`Declared ARD manifest link "${href}" on ${page.url} was not found on the site (404)`],
          };
        }
        break;
      }
    }
  }

  if (!ardRaw) {
    return { declared: false, valid: true, code: 'NOT_DECLARED', resources: [], errors: [] };
  }

  let ardObj = ardRaw;
  if (typeof ardRaw === 'string') {
    try {
      ardObj = JSON.parse(ardRaw);
    } catch (err) {
      return {
        declared: true,
        valid: false,
        code: DECLARED_CAPABILITY_INVALID,
        source: ardSource,
        errors: [`ARD manifest at ${ardSource} has invalid JSON: ${err.message}`],
      };
    }
  }

  if (!ardObj || typeof ardObj !== 'object' || Array.isArray(ardObj)) {
    return {
      declared: true,
      valid: false,
      code: DECLARED_CAPABILITY_INVALID,
      source: ardSource,
      errors: [`ARD manifest at ${ardSource} must be an object`],
    };
  }

  const errors = [];
  const resources = ardObj.resources || ardObj.endpoints || [];

  if (!Array.isArray(resources)) {
    errors.push(`ARD manifest at ${ardSource} "resources" must be an array`);
  } else {
    for (const res of resources) {
      if (!res || typeof res !== 'object') {
        errors.push(`ARD manifest contains invalid resource item`);
        continue;
      }
      const url = res.url || res.href || res.uri;
      if (!url) {
        errors.push(`ARD resource "${res.name || 'unnamed'}" is missing a url/href`);
      } else if (url.startsWith('/') && !isEndpointResolvable(url, siteContext)) {
        errors.push(`ARD declared resource "${res.name || url}" URL "${url}" does not exist on site (404)`);
      }
    }
  }

  const isValid = errors.length === 0;
  return {
    declared: true,
    valid: isValid,
    code: isValid ? 'VALID' : DECLARED_CAPABILITY_INVALID,
    source: ardSource,
    resources,
    errors,
  };
}
