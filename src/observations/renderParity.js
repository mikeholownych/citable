import { parse } from 'node-html-parser';
import { sha256 } from '../shared/io.js';

function profile(html) {
  const root = parse(String(html || ''));
  for (const node of root.querySelectorAll('script,style,noscript,nav,footer,header[role=banner]')) node.remove();
  const text = root.textContent.replace(/\s+/g, ' ').trim();
  const tokens = new Set(text.toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6').map((node) => node.text.replace(/\s+/g, ' ').trim()).filter(Boolean).sort();
  const links = root.querySelectorAll('a[href]').map((node) => node.getAttribute('href')).filter(Boolean).sort();
  const structuredData = parse(String(html || '')).querySelectorAll('script[type="application/ld+json"]').map((node) => sha256(node.text)).sort();
  return { text, tokens, headings, links, structuredData };
}

const missing = (before, after) => before.filter((value) => !after.includes(value));

export function analyzeRenderParity(initialHtml, renderedHtml, policy = null) {
  const initial = profile(initialHtml);
  const rendered = profile(renderedHtml);
  const retained = [...initial.tokens].filter((token) => rendered.tokens.has(token)).length;
  const textRetentionRatio = initial.tokens.size ? Number((retained / initial.tokens.size).toFixed(3)) : null;
  const removedHeadings = missing(initial.headings, rendered.headings);
  const removedLinks = missing(initial.links, rendered.links);
  const structuredDataMatches = JSON.stringify(initial.structuredData) === JSON.stringify(rendered.structuredData);
  const violations = [];
  if (policy) {
    if (textRetentionRatio != null && textRetentionRatio < policy.min_text_retention_ratio) {
      violations.push({ check: 'text_retention', observed: textRetentionRatio, required: policy.min_text_retention_ratio });
    }
    if (policy.require_heading_parity && removedHeadings.length) violations.push({ check: 'heading_parity', observed: removedHeadings.length, required: 0 });
    if (policy.require_link_parity && removedLinks.length) violations.push({ check: 'link_parity', observed: removedLinks.length, required: 0 });
    if (policy.require_structured_data_parity && !structuredDataMatches) violations.push({ check: 'structured_data_parity', observed: false, required: true });
  }
  return {
    policy_id: policy?.policy_id || null,
    review_owner: policy?.review_owner || null,
    initial_text_hash: sha256(initial.text),
    rendered_text_hash: sha256(rendered.text),
    text_retention_ratio: textRetentionRatio,
    removed_headings: removedHeadings,
    added_headings: missing(rendered.headings, initial.headings),
    removed_links: removedLinks,
    added_links: missing(rendered.links, initial.links),
    structured_data_matches: structuredDataMatches,
    policy_violations: violations,
    semantic_review_status: policy ? 'review_required' : 'not_evidenced',
    interpretation_boundary: 'Deterministic parity and policy checks do not establish semantic, retrieval, citation, ranking, or business impact.',
  };
}
