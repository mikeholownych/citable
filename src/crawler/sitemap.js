const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_MAX_TOKENS = 500_000;
const MAX_XML_DEPTH = 64;

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
    if (token.type === 'comment' || token.type === 'processing') continue;
    if (token.type === 'declaration') {
      structuralError('unsupported XML declaration');
      continue;
    }
    if (token.type === 'text' || token.type === 'cdata') {
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
      yield { type: 'processing' };
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
    if (!match || (closing && match[2].trim()) || (!closing && !validAttributes(match[2]))) {
      yield { type: 'error', message: `malformed XML tag <${raw}>` };
      return;
    }
    const name = match[1];
    const localName = name.split(':').at(-1);
    yield { type: closing ? 'close' : 'open', name, localName, selfClosing };
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

function validAttributes(rawAttributes) {
  let remaining = rawAttributes;
  const names = new Set();
  while (remaining.trim()) {
    const match = remaining.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/u);
    if (!match) return false;
    if (names.has(match[1]) || match[3].includes('<') || hasInvalidEntityReference(match[3])) return false;
    names.add(match[1]);
    remaining = remaining.slice(match[0].length);
  }
  return true;
}

function decodeXmlEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    return "'";
  });
}

function hasInvalidEntityReference(value) {
  return String(value).replace(/&(amp|lt|gt|quot|apos);/g, '').includes('&');
}

function assertBound(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
}
