import { sha256 } from '../shared/io.js';

export const URL_IDENTITY_NORMALIZATION_VERSION = 'url-identity-v1';

/**
 * URL identity v1 deliberately performs only two transformations: remove the
 * fragment and remove an explicit default HTTP(S) port. Query ordering,
 * trailing slashes, casing, percent encoding, and host spelling are evidence
 * and are therefore preserved.
 */
export function normalizeUrlIdentity(url) {
  if (typeof url !== 'string' || !url) throw new TypeError('URL identity requires a non-empty URL string');
  const fragmentAt = url.indexOf('#');
  const withoutFragment = fragmentAt === -1 ? url : url.slice(0, fragmentAt);
  const match = withoutFragment.match(/^([A-Za-z][A-Za-z\d+.-]*):\/\/([^/?#]*)([\s\S]*)$/);
  if (!match) throw new TypeError(`URL identity requires an absolute URL: ${url}`);
  const [, rawScheme, rawAuthority, suffix] = match;
  const scheme = rawScheme.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') throw new TypeError(`unsupported URL identity protocol: ${rawScheme}:`);
  if (rawAuthority.includes('@')) throw new TypeError('URL credentials are not permitted');

  // Parse for validity and policy comparisons, but never serialize with URL:
  // WHATWG serialization would lowercase evidence-bearing scheme/host text.
  const parsed = new URL(withoutFragment);
  if (parsed.username || parsed.password) throw new TypeError('URL credentials are not permitted');
  let authority = rawAuthority;
  const defaultPort = scheme === 'https' ? '443' : '80';
  const portPattern = new RegExp(`:${defaultPort}$`);
  if (portPattern.test(authority)) authority = authority.replace(portPattern, '');
  return `${rawScheme}://${authority}${suffix}`;
}

function assertSameOrigin(candidate, allowedOrigin, label) {
  if (new URL(candidate).origin !== allowedOrigin) {
    throw new Error(`${label} origin differs from requested URL origin`);
  }
}

function identityPart(url, baseUrl) {
  if (url == null || url === '') return null;
  const raw = String(url);
  const absolute = baseUrl == null || /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(raw)
    ? raw
    : new URL(raw, baseUrl).href;
  return { url: absolute, normalized_url: normalizeUrlIdentity(absolute) };
}

function optionalIdentityPart(url, baseUrl) {
  if (url == null || url === '') return null;
  try {
    return identityPart(url, baseUrl);
  } catch {
    // Preserve an invalid declaration for downstream detectors instead of
    // turning URL metadata enrichment into a page extraction failure.
    return { url: String(url), normalized_url: null };
  }
}

/** Build a provenance-preserving identity without treating canonical as fetch identity. */
export function createUrlIdentity({
  requestedUrl,
  effectiveUrl,
  redirectChain = [],
  declaredCanonicalUrl = null,
} = {}) {
  const requested = identityPart(requestedUrl);
  const effective = identityPart(effectiveUrl);
  if (!requested || !effective) throw new TypeError('requestedUrl and effectiveUrl are required');
  const allowedOrigin = new URL(requested.url).origin;
  assertSameOrigin(effective.url, allowedOrigin, 'effective URL');

  const redirect = (redirectChain || []).map((step) => {
    const source = identityPart(step.url);
    if (!source) throw new TypeError('redirect URL is required');
    assertSameOrigin(source.url, allowedOrigin, 'redirect URL');
    const destination = step.location == null ? null : identityPart(step.location, source.url);
    if (destination) assertSameOrigin(destination.url, allowedOrigin, 'redirect destination');
    return {
      url: source.url,
      normalized_url: source.normalized_url,
      status: step.status,
      location: step.location ?? null,
      destination_url: destination?.url ?? null,
      normalized_destination_url: destination?.normalized_url ?? null,
    };
  });
  const canonical = optionalIdentityPart(declaredCanonicalUrl, effective.url);

  return {
    normalization_version: URL_IDENTITY_NORMALIZATION_VERSION,
    requested,
    effective,
    redirect,
    canonical,
    resource_id: `RESOURCE-${sha256(effective.normalized_url).slice(0, 24).toUpperCase()}`,
  };
}
