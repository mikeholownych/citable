/**
 * Canonical Domain & Public Suffix Extraction Utility
 *
 * Implements bounded registrable domain extraction and authority domain validation
 * without naive substring matching.
 */

// Common multi-part public suffixes across gTLDs and ccTLDs
const MULTI_PART_SUFFIXES = new Set([
  // UK
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'sch.uk',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // New Zealand
  'co.nz', 'org.nz', 'net.nz', 'govt.nz', 'ac.nz', 'school.nz', 'geek.nz',
  // Japan
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp',
  // Brazil
  'com.br', 'org.br', 'gov.br', 'edu.br', 'net.br',
  // Mexico
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx', 'net.mx',
  // India
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'edu.in', 'res.in', 'gov.in',
  // Singapore
  'com.sg', 'org.sg', 'edu.sg', 'gov.sg', 'net.sg',
  // Hong Kong
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk', 'net.hk',
  // South Africa
  'co.za', 'org.za', 'gov.za', 'ac.za', 'net.za',
  // Turkey
  'com.tr', 'org.tr', 'gov.tr', 'edu.tr', 'net.tr',
  // South Korea
  'co.kr', 'ne.kr', 're.kr', 'or.kr', 'go.kr', 'ac.kr',
  // Canada
  'gc.ca', 'qc.ca', 'on.ca', 'bc.ca', 'ab.ca',
  // France / Germany / Israel / etc.
  'tm.fr', 'asso.fr', 'co.il', 'org.il', 'gov.il', 'muni.il', 'ac.il',
  // Commercial second-level
  'us.com', 'eu.com', 'uk.com', 'de.com',
  // Developer platforms (treated as public suffixes for site identification)
  'github.io', 'gitlab.io', 'pages.dev', 'vercel.app', 'webflow.io',
]);

const AUTHORITATIVE_EXACT_DOMAINS = new Set([
  'w3.org',
  'rfc-editor.org',
  'iana.org',
  'ietf.org',
  'iso.org',
  'nist.gov',
  'arxiv.org',
  'developer.mozilla.org',
  'web.dev',
  'github.com',
]);

export function extractHostname(urlString) {
  if (!urlString || typeof urlString !== 'string') return null;
  const trimmed = urlString.trim();
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function extractRegistrableDomain(hostnameOrUrl) {
  const host = extractHostname(hostnameOrUrl);
  if (!host) return null;

  // Split into dot-separated parts
  const parts = host.split('.');
  if (parts.length <= 1) return host;

  // Check 2-part suffix (e.g. co.uk, com.au)
  if (parts.length >= 3) {
    const twoPartSuffix = parts.slice(-2).join('.');
    if (MULTI_PART_SUFFIXES.has(twoPartSuffix)) {
      return parts.slice(-3).join('.');
    }
  }

  // Check 3-part suffix if any exist
  if (parts.length >= 4) {
    const threePartSuffix = parts.slice(-3).join('.');
    if (MULTI_PART_SUFFIXES.has(threePartSuffix)) {
      return parts.slice(-4).join('.');
    }
  }

  // Default: last 2 parts (e.g. example.com)
  return parts.slice(-2).join('.');
}

export function extractPublicSuffix(hostnameOrUrl) {
  const host = extractHostname(hostnameOrUrl);
  if (!host) return null;

  const parts = host.split('.');
  if (parts.length <= 1) return null;

  if (parts.length >= 3) {
    const twoPart = parts.slice(-2).join('.');
    if (MULTI_PART_SUFFIXES.has(twoPart)) return twoPart;
  }

  return parts.at(-1) || null;
}

export function isAuthoritativeDomain(urlOrHost) {
  const host = extractHostname(urlOrHost);
  if (!host) return false;

  const regDomain = extractRegistrableDomain(host);

  // Exact match to known authority domain or its subdomains
  if (AUTHORITATIVE_EXACT_DOMAINS.has(host) || (regDomain && AUTHORITATIVE_EXACT_DOMAINS.has(regDomain))) {
    return true;
  }

  // Check government TLD / suffix: .gov, .gov.uk, .gov.au, etc.
  if (host.endsWith('.gov') || host.endsWith('.mil') || (regDomain && (regDomain.endsWith('.gov') || regDomain.endsWith('.mil')))) {
    return true;
  }
  const suffix = extractPublicSuffix(host);
  if (suffix && (suffix.startsWith('gov.') || suffix.endsWith('.gov') || suffix.startsWith('gob.'))) {
    return true;
  }

  // Check academic / educational TLD: .edu, .edu.au, .ac.uk, etc.
  if (host.endsWith('.edu') || (regDomain && regDomain.endsWith('.edu'))) {
    return true;
  }
  if (suffix && (suffix.startsWith('edu.') || suffix.startsWith('ac.') || suffix.endsWith('.edu'))) {
    return true;
  }

  return false;
}
