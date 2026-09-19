const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_MAX_TOKENS = 500_000;
const MAX_XML_DEPTH = 64;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const PREDEFINED_ENTITIES = [
  ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&apos;', "'"],
];

/** Bounded structural XML sitemap parser (urlset + sitemapindex). */
export function parseSitemap(xml, {
  maxUrls = DEFAULT_MAX_ENTRIES,
  maxChildren = DEFAULT_MAX_ENTRIES,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  assertBound(maxUrls, 'maxUrls', 0);
  assertBound(maxChildren, 'maxChildren', 0);
  assertBound(maxEntries, 'maxEntries', 0);
  assertBound(maxTokens, 'maxTokens', 1);

  const text = String(xml ?? '');
  const errors = [];
  const structuralErrors = [];
  const urls = [];
  const children = [];
  const stack = [];
  let rootName = null;
  let rootCount = 0;
  let rootClosed = false;
  let tokenCount = 0;
  let urlCount = 0;
  let childCount = 0;
  let rawEntryCount = 0;
  let truncated = false;
  let truncationReason = null;
  let declarationAllowed = true;
  let xmlDeclarationSeen = false;

  const structuralError = (message) => {
    structuralErrors.push(message);
    errors.push(message);
  };

  const closeFrame = (frame, matched = true) => {
    if (frame.role === 'loc' || frame.role === 'lastmod') {
      const value = frame.text.trim();
      if (frame.entry && value) {
        if (frame.role === 'loc') frame.entry.locs.push(value);
        else frame.entry.lastmods.push(value);
      }
    } else if (frame.role === 'entry') {
      if (!matched || !frame.direct || !frame.retain) return;
      if (frame.entry.locs.length === 0) {
        errors.push('entry missing <loc>');
        return;
      }
      if (frame.entry.locs.length > 1) errors.push('entry contains multiple <loc> elements');
      if (frame.entry.lastmods.length > 1) errors.push('entry contains multiple <lastmod> elements');
      const parsed = { loc: frame.entry.locs[0], lastmod: frame.entry.lastmods[0] ?? null };
      if (rootName === 'sitemapindex') {
        childCount += 1;
        if (children.length < maxChildren) children.push(parsed);
        else {
          truncated = true;
          truncationReason ??= 'max_children_exceeded';
        }
      } else if (rootName === 'urlset') {
        urlCount += 1;
        if (urls.length < maxUrls) urls.push(parsed);
        else {
          truncated = true;
          truncationReason ??= 'max_urls_exceeded';
        }
      }
    } else if (frame.role === 'root' && matched) {
      rootClosed = true;
    }
  };

  for (const token of scanXml(text)) {
    tokenCount += 1;
    if (tokenCount > maxTokens) {
      structuralError(`XML token limit of ${maxTokens} exceeded`);
      truncated = true;
      truncationReason ??= 'max_tokens_exceeded';
      break;
    }
    if (token.type === 'error') {
      structuralError(token.message);
      break;
    }
    if (token.type === 'processing') {
      if (token.target.toLowerCase() === 'xml') {
        if (token.target !== 'xml' || !declarationAllowed || xmlDeclarationSeen || !validXmlDeclaration(token.data)) {
          structuralError('XML declaration must appear at the document start before the root');
        } else {
          xmlDeclarationSeen = true;
        }
      }
      declarationAllowed = false;
      continue;
    }
    if (token.type === 'comment') {
      declarationAllowed = false;
      continue;
    }
    if (token.type === 'declaration') {
      declarationAllowed = false;
      structuralError('unsupported XML declaration');
      continue;
    }
    if (token.type === 'text' || token.type === 'cdata') {
      const declarationPrefix = tokenCount === 1 ? token.value.replace(/^\uFEFF/u, '') : token.value;
      if (declarationPrefix.length > 0) declarationAllowed = false;
      if (token.type === 'text' && hasInvalidEntityReference(token.value)) {
        structuralError('invalid or unescaped XML entity reference');
      }
      if (stack.length === 0) {
        if (token.value.trim()) structuralError('non-whitespace content outside the sitemap root');
      } else {
        const frame = stack.at(-1);
        if (frame.role === 'loc' || frame.role === 'lastmod') {
          frame.text += token.type === 'cdata' ? token.value : decodeXmlEntities(token.value);
        }
        else if (frame.role === 'entry' && token.value.trim()) errors.push('unexpected text directly inside sitemap entry');
      }
      continue;
    }
    if (token.type === 'open') {
      const parent = stack.at(-1) ?? null;
      declarationAllowed = false;
      const namespaces = new Map(parent?.namespaces ?? [['xml', XML_NAMESPACE]]);
      for (const attribute of token.attributes) {
        if (attribute.name === 'xmlns') {
          if (attribute.value === XMLNS_NAMESPACE || attribute.value === XML_NAMESPACE) {
            structuralError('reserved XML namespaces cannot be default namespaces');
          }
          namespaces.set('', attribute.value);
        } else if (attribute.prefix === 'xmlns') {
          if (attribute.localName === 'xmlns' || attribute.value === XMLNS_NAMESPACE
            || (attribute.localName === 'xml' && attribute.value !== XML_NAMESPACE)
            || (attribute.localName !== 'xml' && attribute.value === XML_NAMESPACE)
            || attribute.value === '') {
            structuralError(`invalid namespace binding for prefix ${attribute.localName}`);
          } else {
            namespaces.set(attribute.localName, attribute.value);
          }
        }
      }
      if (token.prefix === 'xmlns' || (token.prefix && !namespaces.has(token.prefix))) {
        structuralError(`unbound namespace prefix ${token.prefix ?? 'xmlns'} on <${token.name}>`);
      }
      for (const attribute of token.attributes) {
        if (attribute.prefix && attribute.prefix !== 'xmlns' && !namespaces.has(attribute.prefix)) {
          structuralError(`unbound namespace prefix ${attribute.prefix} on attribute ${attribute.name}`);
        }
      }
      let role = 'ignored';
      let direct = false;
      let entry = parent?.entry ?? null;
      if (!parent) {
        rootCount += 1;
        if (rootCount > 1) structuralError('multiple or extra root elements');
        if (rootCount === 1 && (token.localName === 'urlset' || token.localName === 'sitemapindex')) {
          rootName = token.localName;
          role = 'root';
        } else {
          if (rootCount === 1) structuralError(`unexpected sitemap root <${token.name}>`);
          role = 'extra-root';
        }
      } else if (parent.role === 'root') {
        const expected = rootName === 'sitemapindex' ? 'sitemap' : 'url';
        if (token.localName === expected) {
          role = 'entry';
          direct = true;
          entry = { locs: [], lastmods: [] };
          rawEntryCount += 1;
          if (rawEntryCount > maxEntries) {
            truncated = true;
            truncationReason ??= 'max_entries_exceeded';
          }
        } else {
          structuralError(`unexpected <${token.name}>; <${expected}> entries must be direct children of <${rootName}>`);
        }
      } else if (parent.role === 'entry') {
        if (token.localName === 'loc' || token.localName === 'lastmod') role = token.localName;
        else if (token.localName === 'url' || token.localName === 'sitemap') {
          structuralError(`nested <${token.name}> is not a direct child of the sitemap root`);
        }
      } else if (parent.role === 'loc' || parent.role === 'lastmod') {
        structuralError(`<${token.name}> is not allowed inside <${parent.name}>`);
      }

      if (stack.length >= MAX_XML_DEPTH) {
        structuralError(`XML nesting depth exceeds ${MAX_XML_DEPTH}`);
        break;
      }
      const frame = {
        name: token.name,
        localName: token.localName,
        role,
        direct,
        entry,
        retain: role !== 'entry' || rawEntryCount <= maxEntries,
        namespaces,
        text: '',
      };
      stack.push(frame);
      if (token.selfClosing) {
        stack.pop();
        closeFrame(frame);
      }
      continue;
    }
    if (token.type === 'close') {
      const top = stack.at(-1);
      if (!top || top.name !== token.name) {
        structuralError(`mismatched closing tag </${token.name}>`);
        const matchingIndex = stack.findLastIndex((frame) => frame.name === token.name);
        if (matchingIndex === -1) continue;
        while (stack.length - 1 > matchingIndex) closeFrame(stack.pop(), false);
      }
      const frame = stack.pop();
      if (frame) closeFrame(frame);
    }
  }

  if (stack.length) structuralError(`unclosed <${stack.at(-1).name}> element`);
  if (rootCount === 0) structuralError('document contains no <urlset> or <sitemapindex> root');
  const rootValid = rootCount === 1 && rootClosed && structuralErrors.length === 0
    && (rootName === 'urlset' || rootName === 'sitemapindex');
  return {
    isIndex: rootName === 'sitemapindex',
    rootValid,
    urls,
    children,
    errors,
    urlCount,
    childCount,
    rawEntryCount,
    truncated,
    truncationReason,
  };
}

function* scanXml(text) {
  let index = 0;
  while (index < text.length) {
    const opening = text.indexOf('<', index);
    if (opening === -1) {
      yield { type: 'text', value: text.slice(index) };
      return;
    }
    if (opening > index) yield { type: 'text', value: text.slice(index, opening) };
    if (text.startsWith('<!--', opening)) {
      const end = text.indexOf('-->', opening + 4);
      if (end === -1) {
        yield { type: 'error', message: 'unclosed XML comment' };
        return;
      }
      yield { type: 'comment' };
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', opening)) {
      const end = text.indexOf(']]>', opening + 9);
      if (end === -1) {
        yield { type: 'error', message: 'unclosed CDATA section' };
        return;
      }
      yield { type: 'cdata', value: text.slice(opening + 9, end) };
      index = end + 3;
      continue;
    }
    if (text.startsWith('<?', opening)) {
      const end = text.indexOf('?>', opening + 2);
      if (end === -1) {
        yield { type: 'error', message: 'unclosed XML processing instruction' };
        return;
      }
      const rawInstruction = text.slice(opening + 2, end);
      const instruction = rawInstruction.match(/^([A-Za-z_][\w:.-]*)([\s\S]*)$/u);
      if (!instruction || (instruction[2] && !/^\s/u.test(instruction[2]))) {
        yield { type: 'error', message: 'malformed XML processing instruction' };
        return;
      }
      yield { type: 'processing', target: instruction[1], data: instruction[2] };
      index = end + 2;
      continue;
    }
    if (text.startsWith('<!', opening)) {
      const end = findTagEnd(text, opening + 2);
      if (end === -1) {
        yield { type: 'error', message: 'unclosed XML declaration' };
        return;
      }
      yield { type: 'declaration' };
      index = end + 1;
      continue;
    }
    const end = findTagEnd(text, opening + 1);
    if (end === -1) {
      yield { type: 'error', message: 'unclosed XML tag' };
      return;
    }
    const raw = text.slice(opening + 1, end).trim();
    const closing = raw.startsWith('/');
    const selfClosing = !closing && raw.endsWith('/');
    const tag = (closing ? raw.slice(1) : selfClosing ? raw.slice(0, -1) : raw).trim();
    const match = tag.match(/^([A-Za-z_][\w:.-]*)([\s\S]*)$/u);
    const qualifiedName = match ? splitQualifiedName(match[1]) : null;
    const attributes = !closing && match ? parseAttributes(match[2]) : [];
    if (!match || !qualifiedName || (closing && match[2].trim()) || (!closing && !attributes)) {
      yield { type: 'error', message: `malformed XML tag <${raw}>` };
      return;
    }
    const name = match[1];
    yield {
      type: closing ? 'close' : 'open',
      name,
      localName: qualifiedName.localName,
      prefix: qualifiedName.prefix,
      selfClosing,
      attributes,
    };
    index = end + 1;
  }
}

function findTagEnd(text, start) {
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  return -1;
}

function parseAttributes(rawAttributes) {
  let remaining = rawAttributes;
  const names = new Set();
  const attributes = [];
  while (remaining.trim()) {
    const match = remaining.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/u);
    const qualifiedName = match ? splitQualifiedName(match[1]) : null;
    if (!match || !qualifiedName) return null;
    if (names.has(match[1]) || match[3].includes('<') || hasInvalidEntityReference(match[3])) return null;
    names.add(match[1]);
    attributes.push({
      name: match[1],
      localName: qualifiedName.localName,
      prefix: qualifiedName.prefix,
      value: decodeXmlEntities(match[3]),
    });
    remaining = remaining.slice(match[0].length);
  }
  return attributes;
}

function decodeXmlEntities(value) {
  let decoded = '';
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand === -1) return decoded + value.slice(cursor);
    decoded += value.slice(cursor, ampersand);
    const reference = parseEntityReference(value, ampersand);
    if (!reference) return decoded + value.slice(ampersand);
    decoded += reference.value;
    cursor = ampersand + reference.length;
  }
  return decoded;
}

function hasInvalidEntityReference(value) {
  const text = String(value);
  let cursor = 0;
  while (cursor < text.length) {
    const ampersand = text.indexOf('&', cursor);
    if (ampersand === -1) return false;
    const reference = parseEntityReference(text, ampersand);
    if (!reference) return true;
    cursor = ampersand + reference.length;
  }
  return false;
}

function parseEntityReference(value, offset) {
  for (const [source, decoded] of PREDEFINED_ENTITIES) {
    if (value.startsWith(source, offset)) return { length: source.length, value: decoded };
  }
  if (!value.startsWith('&#', offset)) return null;
  const end = value.indexOf(';', offset + 2);
  if (end === -1) return null;
  const hexadecimal = value[offset + 2] === 'x';
  const start = offset + (hexadecimal ? 3 : 2);
  const digits = value.slice(start, end);
  if (!digits || !(hexadecimal ? /^[0-9A-Fa-f]+$/u : /^\d+$/u).test(digits)) return null;
  const significant = digits.replace(/^0+/u, '') || '0';
  if (significant.length > (hexadecimal ? 6 : 7)) return null;
  const codePoint = Number.parseInt(significant, hexadecimal ? 16 : 10);
  if (!isValidXmlCodePoint(codePoint)) return null;
  return { length: end - offset + 1, value: String.fromCodePoint(codePoint) };
}

function isValidXmlCodePoint(codePoint) {
  return codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
    || (codePoint >= 0x20 && codePoint <= 0xD7FF)
    || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
    || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
}

function splitQualifiedName(name) {
  const parts = name.split(':');
  if (parts.length > 2 || parts.some((part) => !part)) return null;
  return { prefix: parts.length === 2 ? parts[0] : null, localName: parts.at(-1) };
}

function validXmlDeclaration(data) {
  if (data.includes('&')) return false;
  const attributes = parseAttributes(data);
  if (!attributes || attributes.length < 1 || attributes.length > 3) return false;
  if (attributes[0].name !== 'version' || !['1.0', '1.1'].includes(attributes[0].value)) return false;
  let index = 1;
  if (attributes[index]?.name === 'encoding') {
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/u.test(attributes[index].value)) return false;
    index += 1;
  }
  if (attributes[index]?.name === 'standalone') {
    if (!['yes', 'no'].includes(attributes[index].value)) return false;
    index += 1;
  }
  return index === attributes.length;
}

function assertBound(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
}
