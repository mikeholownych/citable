import fs from 'node:fs';
import path from 'node:path';
import { loadRegistries } from '../registries/index.js';

/**
 * Build spec-compliant /llms.txt and /llms-full.txt from Citable registries.
 * Adheres to https://llmstxt.org/ standard:
 * - H1 title with brand/project name
 * - Blockquote summary
 * - Markdown links with descriptions
 * - Optional links section pointing to /llms-full.txt
 */
export function buildLlmsTxt(root, options = {}) {
  const { registries } = loadRegistries(root);
  const siteConfig = registries.config?.site || {};
  const siteName = siteConfig.name || registries.entities?.entries?.[0]?.canonical_name || 'Project Documentation';
  const siteUrl = options.siteUrl || siteConfig.base_url || 'https://example.test';
  const description = siteConfig.description || registries.entities?.entries?.[0]?.description || 'Evidence-backed documentation and verified specifications.';

  const pages = (registries.pages?.entries || []).filter((p) => !p.noindex);
  const claims = (registries.claims?.entries || []).filter((c) => ['verified', 'verified_narrowed', 'stated'].includes(c.status));

  // Build llms.txt
  const lines = [];
  lines.push(`# ${siteName}`);
  lines.push('');
  lines.push(`> ${description}`);
  lines.push('');

  if (pages.length > 0) {
    lines.push('## Documentation & Key Pages');
    lines.push('');
    for (const p of pages) {
      const url = p.url ? p.url : new URL(p.path || '/', siteUrl).href;
      const title = p.title || p.page_id || 'Untitled page';
      const desc = p.description ? `: ${p.description}` : '';
      lines.push(`- [${title}](${url})${desc}`);
    }
    lines.push('');
  }

  if (claims.length > 0) {
    lines.push('## Verified Capabilities & Claims');
    lines.push('');
    for (const c of claims) {
      const target = c.publication_surfaces?.[0] || siteUrl;
      const fullUrl = target.startsWith('http') ? target : new URL(target, siteUrl).href;
      lines.push(`- [${c.claim}](${fullUrl}): Verified claim (${c.claim_type})`);
    }
    lines.push('');
  }

  lines.push('## Optional');
  lines.push('');
  const fullUrl = new URL('/llms-full.txt', siteUrl).href;
  lines.push(`- [Full Content Directory](${fullUrl}): Complete uncompressed documentation representation`);
  lines.push('');

  const llmsTxt = lines.join('\n');

  // Build llms-full.txt
  const fullLines = [];
  fullLines.push(`# ${siteName} (Full Text Specification)`);
  fullLines.push('');
  fullLines.push(`> Complete textual representation of ${siteName} for generative engines and autonomous agents.`);
  fullLines.push('');
  for (const p of pages) {
    const url = p.url ? p.url : new URL(p.path || '/', siteUrl).href;
    fullLines.push(`### ${p.title || p.page_id}`);
    fullLines.push(`- URL: ${url}`);
    if (p.description) fullLines.push(`- Description: ${p.description}`);
    if (p.published_claims?.length) fullLines.push(`- Published Claims: ${p.published_claims.join(', ')}`);
    fullLines.push('');
  }
  const llmsFullTxt = fullLines.join('\n');

  return {
    siteName,
    siteUrl,
    llmsTxt,
    llmsFullTxt,
    pageCount: pages.length,
    claimCount: claims.length,
  };
}

export function generateLlmsTxt(root, options = {}) {
  const built = buildLlmsTxt(root, options);
  const outDir = options.output || root;

  let written = false;
  let llmsTxtPath = null;
  let llmsFullTxtPath = null;

  if (options.write) {
    fs.mkdirSync(outDir, { recursive: true });
    llmsTxtPath = path.join(outDir, 'llms.txt');
    llmsFullTxtPath = path.join(outDir, 'llms-full.txt');
    fs.writeFileSync(llmsTxtPath, built.llmsTxt, 'utf8');
    fs.writeFileSync(llmsFullTxtPath, built.llmsFullTxt, 'utf8');
    written = true;
  }

  return {
    ...built,
    written,
    outputDir: outDir,
    llmsTxtPath,
    llmsFullTxtPath,
  };
}
