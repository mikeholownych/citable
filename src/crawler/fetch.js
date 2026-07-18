import dns from 'node:dns';
import net from 'node:net';

const blockedAddresses = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4],
]) blockedAddresses.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
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

async function validateDestination(url, lookup) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`unsupported URL protocol: ${parsed.protocol}`);
  if (parsed.username || parsed.password) throw new Error('URL credentials are not permitted');
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(`refusing private, loopback, or non-public destination: ${hostname}`);
  }
  return parsed;
}

async function readBodyLimited(res, maxBodyBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new Error(`response body exceeds ${maxBodyBytes} bytes`);
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) throw new Error(`response body exceeds ${maxBodyBytes} bytes`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

/** Fetch a public URL with bounded retries, redirects, time, and response size. */
export async function fetchUrl(url, {
  userAgent = 'CitableAudit/0.1', maxRedirects = 10, timeoutMs = 20000,
  maxRetries = 3, retryDelayMs = 1000, maxBodyBytes = 5 * 1024 * 1024,
  fetchImpl = globalThis.fetch, lookup = dns.promises.lookup,
} = {}) {
  const requested = await validateDestination(url, lookup);
  const allowedOrigin = requested.origin;
  const chain = [];
  let current = requested.href;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await validateDestination(current, lookup);
    let res;
    let lastError;
    for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`request timeout after ${timeoutMs}ms`)), timeoutMs);
      try {
        res = await fetchImpl(current, {
          redirect: 'manual',
          headers: { 'user-agent': userAgent },
          signal: controller.signal,
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
      await validateDestination(next.href, lookup);
      chain.push({ url: current, status: res.status, location: headers.location });
      current = next.href;
      await res.body?.cancel();
      continue;
    }
    const body = await readBodyLimited(res, maxBodyBytes);
    return { url: current, requestedUrl: url, status: res.status, headers, body, redirectChain: chain };
  }
  throw new Error(`redirect chain exceeded ${maxRedirects} hops for ${url}`);
}
