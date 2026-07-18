/** Minimal XML sitemap parser (urlset + sitemapindex). */
export function parseSitemap(xml) {
  const text = String(xml ?? '');
  const errors = [];
  const urls = [];
  const children = [];
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const blockRe = isIndex ? /<sitemap[\s>]([\s\S]*?)<\/sitemap>/gi : /<url[\s>]([\s\S]*?)<\/url>/gi;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1];
    const loc = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1]?.trim();
    const lastmod = block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1]?.trim() ?? null;
    if (!loc) {
      errors.push('entry missing <loc>');
      continue;
    }
    if (isIndex) children.push({ loc, lastmod });
    else urls.push({ loc, lastmod });
  }
  if (!isIndex && !/<urlset[\s>]/i.test(text) && urls.length === 0) {
    errors.push('document contains no <urlset> or entries');
  }
  return { isIndex, urls, children, errors };
}
