/** Minimal XML sitemap parser (urlset + sitemapindex). */
export function parseSitemap(xml) {
  const text = String(xml ?? '');
  const errors = [];
  const urls = [];
  const children = [];
  const hasIndexRoot = /<sitemapindex(?:\s[^>]*)?\s*\/?>/i.test(text);
  const hasUrlsetRoot = /<urlset(?:\s[^>]*)?\s*\/?>/i.test(text);
  const isIndex = hasIndexRoot;
  const rootValid = isIndex
    ? (/<\/sitemapindex\s*>/i.test(text) || /<sitemapindex(?:\s[^>]*)?\s*\/>/i.test(text)) && !hasUrlsetRoot
    : hasUrlsetRoot && (/<\/urlset\s*>/i.test(text) || /<urlset(?:\s[^>]*)?\s*\/>/i.test(text));
  const blockRe = isIndex ? /<sitemap[\s>]([\s\S]*?)<\/sitemap>/gi : /<url[\s>]([\s\S]*?)<\/url>/gi;
  const entryName = isIndex ? 'sitemap' : 'url';
  const openingEntries = text.match(new RegExp(`<${entryName}[\\s>]`, 'gi'))?.length ?? 0;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1];
    const rawLoc = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1]?.trim();
    const rawLastmod = block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1]?.trim();
    const loc = rawLoc ? decodeXmlEntities(rawLoc) : null;
    const lastmod = rawLastmod ? decodeXmlEntities(rawLastmod) : null;
    if (!loc) {
      errors.push('entry missing <loc>');
      continue;
    }
    if (isIndex) children.push({ loc, lastmod });
    else urls.push({ loc, lastmod });
  }
  const parsedEntries = urls.length + children.length + errors.filter((error) => error === 'entry missing <loc>').length;
  if (openingEntries > parsedEntries) errors.push(`${openingEntries - parsedEntries} unclosed or malformed <${entryName}> entry`);
  if (!hasIndexRoot && !hasUrlsetRoot) errors.push('document contains no <urlset> or <sitemapindex> root');
  else if (!rootValid) errors.push(`document has an incomplete or ambiguous <${isIndex ? 'sitemapindex' : 'urlset'}> root`);
  return { isIndex, rootValid, urls, children, errors };
}

function decodeXmlEntities(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const radix = normalized.startsWith('#x') ? 16 : 10;
    const codePoint = Number.parseInt(normalized.slice(radix === 16 ? 2 : 1), radix);
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}
