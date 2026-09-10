/**
 * Canonical HTML and Markdown Escaping Utility
 *
 * Prevents HTML/XSS injection vulnerabilities in generated reports, SOWs,
 * dashboards, and markdown/HTML interchange representations.
 * Treats all finding summaries, client names, URLs, titles, and detector
 * outputs as potentially hostile user input.
 */

const HTML_CHARS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_RX = /[&<>"']/g;

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(HTML_RX, (char) => HTML_CHARS[char]);
}

export function escapeHtmlAttr(str) {
  return escapeHtml(str);
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function sanitizeUrl(urlStr, fallback = '#') {
  if (!urlStr || typeof urlStr !== 'string') return fallback;
  const trimmed = urlStr.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    // Relative path or anchor is safe
    return escapeHtmlAttr(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    if (SAFE_PROTOCOLS.has(parsed.protocol)) {
      return escapeHtmlAttr(trimmed);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function escapeMarkdownTableCell(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeForMarkdown(str) {
  if (str === null || str === undefined) return '';
  // Prevent raw script or malicious HTML tag injections in markdown by encoding brackets
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
