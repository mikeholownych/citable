/**
 * Fetch a URL capturing status, headers, body, and redirect chain.
 * Used only when the operator supplies a deployed target and fetching is permitted.
 */
export async function fetchUrl(url, { userAgent = 'CitableAudit/0.1', maxRedirects = 10, timeoutMs = 20000 } = {}) {
  const chain = [];
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': userAgent },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const headers = Object.fromEntries(res.headers.entries());
    if (res.status >= 300 && res.status < 400 && headers.location) {
      chain.push({ url: current, status: res.status, location: headers.location });
      current = new URL(headers.location, current).href;
      continue;
    }
    const body = await res.text();
    return { url: current, requestedUrl: url, status: res.status, headers, body, redirectChain: chain };
  }
  throw new Error(`redirect chain exceeded ${maxRedirects} hops for ${url}`);
}
