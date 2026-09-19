import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const blockedAddresses = new net.BlockList();
const GUARDED_LOOKUP_TRANSPORT = Symbol('citable.guardedLookupTransport');
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedAddresses.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6 && address.toLowerCase().startsWith('::ffff:')) {
    return blockedAddresses.check(address.slice(7), 'ipv4');
  }
  return blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export async function validatePublicUrl(url, { lookup = dns.promises.lookup } = {}) {
  const parsed = parseNetworkUrl(url);
  await resolvePublicAddresses(parsed.hostname, lookup);
  return parsed;
}

function parseNetworkUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`unsupported URL protocol: ${parsed.protocol}`);
  if (parsed.username || parsed.password) throw new Error('URL credentials are not permitted');
  return parsed;
}

async function resolvePublicAddresses(rawHostname, lookup, options = {}) {
  const hostname = rawHostname.replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { ...options, all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(`refusing private, loopback, or non-public destination: ${hostname}`);
  }
  return addresses;
}

function createGuardedLookup(lookup) {
  return (hostname, options, callback) => {
    const normalizedOptions = typeof options === 'number' ? { family: options } : (options ?? {});
    resolvePublicAddresses(hostname, lookup, { family: normalizedOptions.family || 0 })
      .then((addresses) => {
        if (normalizedOptions.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      })
      .catch((error) => callback(error));
  };
}

function fetchWithGuardedLookup(url, { headers, signal, lookup }) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(parsed, {
      method: 'GET',
      headers,
      lookup,
      servername: parsed.protocol === 'https:' ? parsed.hostname : undefined,
      signal,
    }, (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
      let body = response;
      if (encoding === 'gzip' || encoding === 'x-gzip') body = response.pipe(createGunzip());
      else if (encoding === 'deflate') body = response.pipe(createInflate());
      else if (encoding === 'br') body = response.pipe(createBrotliDecompress());
      const noBody = response.statusCode === 204 || response.statusCode === 205 || response.statusCode === 304;
      resolve(new Response(noBody ? null : Readable.toWeb(body), {
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * Declare that a custom transport uses the `lookup` callback passed by fetchUrl
 * for its actual socket connection. Undeclared transports are rejected before
 * execution because URL preflight alone does not prevent DNS rebinding.
 */
export function declareGuardedLookupTransport(fetchImpl) {
  if (typeof fetchImpl !== 'function') throw new TypeError('custom transport must be a function');
  Object.defineProperty(fetchImpl, GUARDED_LOOKUP_TRANSPORT, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return fetchImpl;
}

/** Enforce the public-network policy for each Playwright request. */
export async function handlePublicBrowserRoute(route, { lookup = dns.promises.lookup } = {}) {
  const url = route.request().url();
  let protocol;
  try {
    protocol = new URL(url).protocol;
  } catch {
    await route.abort('blockedbyclient');
    return;
  }
  if (['data:', 'blob:', 'about:'].includes(protocol)) {
    await route.continue();
    return;
  }
  if (!['http:', 'https:'].includes(protocol)) {
    await route.abort('blockedbyclient');
    return;
  }
  try {
    await validatePublicUrl(url, { lookup });
    await route.continue();
  } catch {
    await route.abort('blockedbyclient');
  }
}

async function readBodyLimited(res, maxBodyBytes, responseType = 'text') {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw bodyLimitError(maxBodyBytes);
  }
  if (!res.body) return responseType === 'buffer' ? Buffer.alloc(0) : '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) throw bodyLimitError(maxBodyBytes);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return responseType === 'buffer' ? Buffer.from(bytes) : new TextDecoder().decode(bytes);
}

function bodyLimitError(maxBodyBytes) {
  const error = new Error(`response body exceeds ${maxBodyBytes} bytes`);
  error.code = 'FETCH_BODY_LIMIT';
  return error;
}

/** Fetch a public URL with bounded retries, redirects, time, and response size. */
export async function fetchUrl(url, {
  userAgent = 'CitableAudit/0.1', maxRedirects = 10, timeoutMs = 20000,
  maxRetries = 3, retryDelayMs = 1000, maxBodyBytes = 5 * 1024 * 1024,
  responseType = 'text',
  fetchImpl, lookup = dns.promises.lookup,
  allowUnsafeCustomTransportForTest = false,
} = {}) {
  if (!['text', 'buffer'].includes(responseType)) throw new TypeError('responseType must be text or buffer');
  const requested = parseNetworkUrl(url);
  const allowedOrigin = requested.origin;
  const chain = [];
  let current = requested.href;
  const customFetch = fetchImpl && fetchImpl !== globalThis.fetch;
  if (customFetch && allowUnsafeCustomTransportForTest !== true && fetchImpl[GUARDED_LOOKUP_TRANSPORT] !== true) {
    throw new TypeError('custom transport must declare and implement the guarded lookup contract');
  }
  const effectiveFetch = customFetch ? fetchImpl : fetchWithGuardedLookup;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    let res;
    let lastError;
    for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt += 1) {
      await validatePublicUrl(current, { lookup });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`request timeout after ${timeoutMs}ms`)), timeoutMs);
      try {
        res = await effectiveFetch(current, {
          redirect: 'manual',
          headers: { 'user-agent': userAgent },
          signal: controller.signal,
          lookup: createGuardedLookup(lookup),
        });
        if (res.status < 500 || attempt === Math.max(1, maxRetries) - 1) {
          lastError = null;
          break;
        }
        await res.body?.cancel();
        lastError = new Error(`server returned ${res.status}`);
      } catch (err) {
        lastError = err;
        if (controller.signal.aborted) throw controller.signal.reason ?? err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < Math.max(1, maxRetries) - 1) {
        const delay = retryDelayMs * (2 ** attempt) + Math.random() * retryDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    if (lastError) throw lastError;

    const headers = Object.fromEntries(res.headers.entries());
    if (res.status >= 300 && res.status < 400 && headers.location) {
      if (redirects === maxRedirects) break;
      const next = new URL(headers.location, current);
      if (next.origin !== allowedOrigin) throw new Error(`redirect leaves audited origin: ${next.href}`);
      chain.push({ url: current, status: res.status, location: headers.location });
      current = next.href;
      await res.body?.cancel();
      continue;
    }
    const body = await readBodyLimited(res, maxBodyBytes, responseType);
    return { url: current, requestedUrl: url, status: res.status, headers, body, redirectChain: chain };
  }
  throw new Error(`redirect chain exceeded ${maxRedirects} hops for ${url}`);
}
