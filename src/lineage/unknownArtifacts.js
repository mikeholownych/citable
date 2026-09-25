/**
 * B-033: Parser drift and unknown-artifact retention.
 * Retains unknown DOM structures, schema types, and protocol artifacts
 * rather than discarding them, and reports drift in unknown-rate per condition.
 */

export const KNOWN_HTML_TAGS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
  "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
  "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
  "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
  "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
  "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
  "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol",
  "optgroup", "option", "output", "p", "picture", "portal", "pre", "progress",
  "q", "rp", "rt", "ruby", "s", "samp", "script", "search", "section",
  "select", "slot", "small", "source", "span", "strong", "style", "sub",
  "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea",
  "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var",
  "video", "wbr"
]);

export const KNOWN_SCHEMA_TYPES = new Set([
  "thing", "action", "creativework", "article", "newsarticle", "blogposting",
  "scholarlyarticle", "techarticle", "book", "movie", "musicrecording", "recipe",
  "softwareapplication", "webpage", "aboutpage", "contactpage", "faqpage",
  "qapage", "itempage", "profilepage", "searchresultspage", "collectionpage",
  "website", "event", "businessevent", "educationevent", "saleevent",
  "organization", "corporation", "educationalorganization", "localbusiness",
  "restaurant", "store", "medicalorganization", "ngo", "performinggroup",
  "sportsteam", "person", "place", "administrativearea", "city", "country",
  "postaladdress", "product", "individualproduct", "productmodel", "someproducts",
  "vehicle", "service", "financialproduct", "intangible", "aggregaterating",
  "audience", "brand", "breadcrumblist", "alignmentobject", "datafeed",
  "definedterm", "demand", "enumeration", "geospatialgeometry", "itemlist",
  "language", "listitem", "mediaobject", "audioobject", "datadownload",
  "imageobject", "musicvideoobject", "videoobject", "offer", "aggregateoffer",
  "order", "organizationrole", "ownershipinfo", "parceldelivery", "permit",
  "programmembership", "propertyvalue", "quantitativevalue", "rating",
  "reservation", "role", "searchaction", "speakablespecification",
  "structuredvalue", "howto", "howtostep", "howtosection", "review",
  "question", "answer"
]);

export const KNOWN_PROTOCOL_METHODS = new Set([
  "initialize", "ping", "tools/list", "tools/call",
  "resources/list", "resources/read", "prompts/list", "prompts/get",
  "logging/setlevel", "completion/complete", "notifications/initialized"
]);

export const KNOWN_PROTOCOL_HEADERS = new Set([
  "content-type", "content-length", "etag", "cache-control", "link",
  "x-robots-tag", "vary", "location", "last-modified", "date", "server",
  "set-cookie", "strict-transport-security", "content-security-policy",
  "access-control-allow-origin"
]);

/**
 * Retains unknown DOM structures from parsed HTML / DOM tree.
 */
export function extractUnknownDomStructures(root) {
  if (!root || typeof root.querySelectorAll !== "function") return { unknown: [], total: 0 };
  const allElements = root.querySelectorAll("*");
  const total = allElements.length;
  const unknown = [];

  for (const el of allElements) {
    const rawTag = (el.tagName || "").toLowerCase();
    if (!rawTag) continue;
    // Check if tag is standard
    if (!KNOWN_HTML_TAGS.has(rawTag)) {
      unknown.push({
        tag: rawTag,
        attributes: el.attributes || {},
        snippet: (el.outerHTML || "").slice(0, 200),
        text_snippet: (el.text || "").replace(/\s+/g, " ").trim().slice(0, 100),
      });
    }
  }

  return { unknown, total };
}

/**
 * Retains unknown Schema.org types from JSON-LD blocks.
 */
export function extractUnknownSchemaTypes(jsonLdItems) {
  if (!Array.isArray(jsonLdItems)) return { unknown: [], total: 0 };
  let total = 0;
  const unknown = [];

  function checkType(typeVal, block, path) {
    if (!typeVal) return;
    if (Array.isArray(typeVal)) {
      for (const t of typeVal) checkType(t, block, path);
      return;
    }
    total++;
    const cleanType = String(typeVal).replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
    if (!KNOWN_SCHEMA_TYPES.has(cleanType)) {
      unknown.push({
        type: String(typeVal),
        normalized: cleanType,
        path,
        context: block["@context"] || null,
        raw_block: block,
      });
    }
  }

  function walk(node, currentPath) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (node["@type"]) {
      checkType(node["@type"], node, currentPath);
    }
    for (const [key, val] of Object.entries(node)) {
      if (key !== "@type" && val && typeof val === "object") {
        walk(val, currentPath ? `${currentPath}.${key}` : key);
      }
    }
  }

  for (const item of jsonLdItems) {
    const blocks = item.blocks || (item.parsed ? [item.parsed] : []);
    for (const b of blocks) {
      walk(b, "root");
    }
  }

  return { unknown, total };
}

/**
 * Retains unknown protocol artifacts (MCP methods, custom protocol headers).
 */
export function extractUnknownProtocolArtifacts(protocolPayloads = []) {
  if (!Array.isArray(protocolPayloads)) return { unknown: [], total: 0 };
  let total = 0;
  const unknown = [];

  for (const payload of protocolPayloads) {
    if (!payload || typeof payload !== "object") continue;
    // MCP method check
    if (payload.protocol === "mcp" || payload.method) {
      total++;
      const method = (payload.method || "").toLowerCase();
      if (method && !KNOWN_PROTOCOL_METHODS.has(method)) {
        unknown.push({
          protocol: "mcp",
          artifact_type: "method",
          name: payload.method,
          data: payload,
        });
      }
    }
    // Headers check
    if (payload.headers && typeof payload.headers === "object") {
      for (const [headerKey, headerVal] of Object.entries(payload.headers)) {
        total++;
        const lowerKey = headerKey.toLowerCase();
        if (!KNOWN_PROTOCOL_HEADERS.has(lowerKey) && lowerKey.startsWith("x-")) {
          unknown.push({
            protocol: payload.protocol || "http",
            artifact_type: "header",
            name: headerKey,
            value: headerVal,
          });
        }
      }
    }
  }

  return { unknown, total };
}

/**
 * Retains all unknown artifacts across DOM, Schema, and Protocol.
 * Guarantees unknown structures are preserved rather than discarded (B-033).
 */
export function retainUnknownArtifacts({ domRoot = null, jsonLd = [], protocolPayloads = [] } = {}) {
  const domRes = extractUnknownDomStructures(domRoot);
  const schemaRes = extractUnknownSchemaTypes(jsonLd);
  const protoRes = extractUnknownProtocolArtifacts(protocolPayloads);

  const totalElements = domRes.total + schemaRes.total + protoRes.total;
  const unknownElements = domRes.unknown.length + schemaRes.unknown.length + protoRes.unknown.length;
  const unknownRate = totalElements > 0 ? unknownElements / totalElements : 0;

  return {
    dom: domRes.unknown,
    schema: schemaRes.unknown,
    protocol: protoRes.unknown,
    total_elements: totalElements,
    unknown_elements: unknownElements,
    unknown_rate: Math.round(unknownRate * 10000) / 10000,
  };
}

/**
 * Calculates unknown-rate drift between current and baseline runs (B-033).
 */
export function calculateUnknownRateDrift(currentUnknownArtifacts, baselineUnknownArtifacts) {
  const currentRate = currentUnknownArtifacts?.unknown_rate ?? 0;
  const baselineRate = baselineUnknownArtifacts?.unknown_rate ?? 0;
  const drift = Math.round((currentRate - baselineRate) * 10000) / 10000;

  return {
    baseline_unknown_rate: baselineRate,
    current_unknown_rate: currentRate,
    unknown_rate_drift: drift,
    drift_detected: drift !== 0,
    has_increased_drift: drift > 0,
  };
}

/**
 * Reports unknown-rate drift per condition between two determination runs.
 */
export function reportConditionUnknownDrift(currentDeterminations, baselineDeterminations) {
  const baselineMap = new Map();
  for (const b of (baselineDeterminations || [])) {
    const key = `${b.condition_id}|${b.subject?.identifier || ""}`;
    baselineMap.set(key, b);
  }

  const reports = [];
  for (const c of (currentDeterminations || [])) {
    const key = `${c.condition_id}|${c.subject?.identifier || ""}`;
    const baseline = baselineMap.get(key);
    const baselineArtifacts = baseline?.unknown_artifacts || null;
    const currentArtifacts = c.unknown_artifacts || null;

    const driftInfo = calculateUnknownRateDrift(currentArtifacts, baselineArtifacts);
    reports.push({
      condition_id: c.condition_id,
      condition_version: c.condition_version,
      subject: c.subject,
      current_unknown_artifacts: currentArtifacts,
      baseline_unknown_artifacts: baselineArtifacts,
      ...driftInfo,
    });
  }

  return reports;
}
