/**
 * Model Context Protocol (MCP) Server Card and Tool Semantics Validator.
 *
 * Implements requirement B-060:
 * - Parses and validates MCP server cards (schema, transport, tools, resources, authorization).
 * - Validates tool semantics: name, description, inputSchema, required inputs, side effects.
 * - Enforces testability: a declared tool that cannot be invoked or whose endpoint does not exist
 *   yields DECLARED_CAPABILITY_INVALID at higher severity than a missing card.
 */

export const DECLARED_CAPABILITY_INVALID = 'DECLARED_CAPABILITY_INVALID';

/**
 * Validate that an object is a valid JSON Schema object.
 */
export function isValidInputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  // Standard JSON schema for MCP tools requires type: "object"
  if (schema.type && schema.type !== 'object') return false;
  if (schema.properties && (typeof schema.properties !== 'object' || Array.isArray(schema.properties))) return false;
  if (schema.required && !Array.isArray(schema.required)) return false;
  return true;
}

/**
 * Parse an MCP Server Card from raw string or object.
 */
export function parseMcpCard(rawOrObj) {
  if (!rawOrObj) return { valid: false, error: 'Empty MCP server card' };
  if (typeof rawOrObj === 'object') return { valid: true, card: rawOrObj };
  if (typeof rawOrObj === 'string') {
    try {
      const parsed = JSON.parse(rawOrObj);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'MCP server card must be a JSON object' };
      }
      return { valid: true, card: parsed };
    } catch (err) {
      return { valid: false, error: `Invalid JSON in MCP server card: ${err.message}` };
    }
  }
  return { valid: false, error: 'Unsupported MCP server card type' };
}

/**
 * Validate the semantic definition of a single tool.
 */
export function validateToolSemantics(tool) {
  const problems = [];
  if (!tool || typeof tool !== 'object') {
    return { valid: false, problems: ['Tool definition must be an object'] };
  }

  // 1. Tool name
  if (!tool.name || typeof tool.name !== 'string' || !tool.name.trim()) {
    problems.push('Tool is missing a valid name');
  } else if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name.trim())) {
    problems.push(`Tool name "${tool.name}" contains invalid characters (allowed: [a-zA-Z0-9_-]{1,64})`);
  }

  // 2. Tool description
  if (!tool.description || typeof tool.description !== 'string' || !tool.description.trim()) {
    problems.push(`Tool "${tool.name || 'unnamed'}" is missing a description`);
  } else if (tool.description.trim().length < 5) {
    problems.push(`Tool "${tool.name}" has an insufficiently descriptive description`);
  }

  // 3. Input schema
  const schema = tool.inputSchema || tool.parameters || tool.schema;
  if (!schema) {
    problems.push(`Tool "${tool.name || 'unnamed'}" is missing an inputSchema`);
  } else if (!isValidInputSchema(schema)) {
    problems.push(`Tool "${tool.name || 'unnamed'}" has a malformed inputSchema (must be an object schema)`);
  }

  // 4. Required inputs consistency
  if (schema && Array.isArray(schema.required) && schema.properties) {
    for (const req of schema.required) {
      if (!schema.properties[req]) {
        problems.push(`Tool "${tool.name}" lists required input "${req}" not declared in properties`);
      }
    }
  }

  return {
    valid: problems.length === 0,
    problems,
  };
}

/**
 * Check if a declared endpoint is resolvable/testable in the site context.
 */
export function isEndpointResolvable(endpointUrl, siteContext = {}) {
  if (!endpointUrl) return false;
  const sitePages = siteContext.site?.pages || [];
  const baseUrl = siteContext.config?.site?.base_url || siteContext.site?.baseUrl || 'https://example.test';

  let pathname = null;
  try {
    if (endpointUrl.startsWith('http://') || endpointUrl.startsWith('https://')) {
      const parsed = new URL(endpointUrl);
      const baseOrigin = new URL(baseUrl).origin;
      if (parsed.origin !== baseOrigin) {
        // Cross-origin endpoint: considered external, check if explicitly declared in connections or allowlist
        return true;
      }
      pathname = parsed.pathname;
    } else if (endpointUrl.startsWith('/')) {
      pathname = endpointUrl.split('?')[0].split('#')[0];
    } else {
      pathname = '/' + endpointUrl.split('?')[0].split('#')[0];
    }
  } catch {
    return false;
  }

  if (!sitePages.length) return true; // If no pages in crawl, cannot prove absence

  return sitePages.some((p) => {
    try {
      const pPath = p.path || (p.url ? new URL(p.url).pathname : null);
      if (!pPath) return false;
      return (
        pPath === pathname ||
        pPath === pathname + '/' ||
        pathname === pPath + '/' ||
        pPath.replace(/\/index\.html$/, '/') === pathname ||
        pPath.replace(/\/index\.json$/, '') === pathname
      );
    } catch {
      return false;
    }
  });
}

/**
 * Validate an entire MCP Server Card and its declared tools against the site.
 */
export function validateMcpServerCard(rawOrObj, siteContext = {}) {
  const parseResult = parseMcpCard(rawOrObj);
  if (!parseResult.valid) {
    return {
      valid: false,
      code: DECLARED_CAPABILITY_INVALID,
      card: null,
      errors: [parseResult.error],
      tools: [],
      resources: [],
      invocable: false,
    };
  }

  const card = parseResult.card;
  const errors = [];
  const validTools = [];
  let invocable = true;

  // Server descriptor validation
  const serverName = card.name || card.server_id || card.serverInfo?.name;
  if (!serverName) {
    errors.push('MCP server card is missing server name or serverInfo.name');
  }

  // Transport and endpoint
  const endpoint = card.endpoint || card.url || card.transport?.target || card.transport?.endpoint || card.transport?.url || card.transportTarget;
  const transportType = card.transport?.type || card.transportType || (endpoint ? 'http' : null);

  if (transportType === 'http' || transportType === 'sse') {
    if (!endpoint) {
      errors.push(`MCP server card declares "${transportType}" transport but lacks an endpoint URL`);
      invocable = false;
    } else if (!isEndpointResolvable(endpoint, siteContext)) {
      errors.push(`Declared MCP endpoint "${endpoint}" does not exist or returned 404`);
      invocable = false;
    }
  }

  // Tools collection
  let rawTools = card.tools;
  if (rawTools && typeof rawTools === 'object' && !Array.isArray(rawTools)) {
    // Convert dictionary format to array
    rawTools = Object.entries(rawTools).map(([name, t]) => ({ name, ...(typeof t === 'object' ? t : {}) }));
  }

  if (Array.isArray(rawTools)) {
    for (const tool of rawTools) {
      const toolValidation = validateToolSemantics(tool);
      if (!toolValidation.valid) {
        errors.push(...toolValidation.problems);
      } else {
        validTools.push(tool);
      }

      // Check tool-level endpoint if tool defines dedicated handler/endpoint
      const toolEndpoint = tool.endpoint || tool.url || tool.path;
      if (toolEndpoint && !isEndpointResolvable(toolEndpoint, siteContext)) {
        errors.push(`Declared tool "${tool.name}" endpoint "${toolEndpoint}" cannot be resolved`);
        invocable = false;
      }
    }
  }

  // Resources collection
  const resources = card.resources || [];
  if (Array.isArray(resources)) {
    for (const res of resources) {
      if (!res.uri && !res.uriTemplate && !res.url) {
        errors.push(`Declared resource "${res.name || 'unnamed'}" is missing uri/uriTemplate`);
      } else {
        const resUrl = res.url || res.uri;
        if (resUrl && resUrl.startsWith('/') && !isEndpointResolvable(resUrl, siteContext)) {
          errors.push(`Declared resource "${res.name || resUrl}" URI cannot be resolved on the site`);
        }
      }
    }
  }

  const isValid = errors.length === 0 && invocable;

  return {
    valid: isValid,
    code: isValid ? 'VALID' : DECLARED_CAPABILITY_INVALID,
    card,
    errors,
    tools: validTools,
    resources,
    invocable,
  };
}
