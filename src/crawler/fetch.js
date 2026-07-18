/**
 * Fetch a URL capturing status, headers, body, and redirect chain.
 * Used only when the operator supplies a deployed target and fetching is permitted.
 */
export async function fetchUrl(url, { userAgent = 'CitableAudit/0.1', maxRedirects = 10, timeoutMs = 20000, maxRetries = 3, retryDelayMs = 1000 } = {}) {
  const chain = [];
  let current = url;
  
  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    let lastError;
    
    // Retry loop for transient failures
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        res = await fetch(current, {
          redirect: 'manual',
          headers: { 'user-agent': userAgent },
          signal: controller.signal,
        });
        lastError = null;
        break; // Success, break retry loop
      } catch (err) {
        lastError = err;
        // Only retry on network errors or 5xx, not on 4xx
        if (err.name === 'AbortError') {
          throw err; // Timeout, don't retry
        }
        // Exponential backoff with jitter
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * retryDelayMs;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    
    if (lastError) {
      throw lastError;
    }
    
    const headers = Object.fromEntries(res.headers.entries());
    if (res.status >= 300 && res.status < 400 && headers.location) {
      chain.push({ url: current, status: res.status, location: headers.location });
      current = new URL(headers.location, current).href;
      continue;
    }
    
    // Retry on 5xx with one less attempt (already used retry loop above)
    if (res.status >= 500 && i < maxRedirects) {
      // Treat 5xx as transient, add to chain and retry same URL
      chain.push({ url: current, status: res.status, location: null, error: 'server error' });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      continue;
    }
    
    const body = await res.text();
    return { url: current, requestedUrl: url, status: res.status, headers, body, redirectChain: chain };
  }
  throw new Error(`redirect chain exceeded ${maxRedirects} hops for ${url}`);
}
