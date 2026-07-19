const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function providerRequest(url, { token, fetchImpl = globalThis.fetch, method = 'GET', body, attempts = 3 } = {}) {
  if (!token) throw Object.assign(new Error('authorization is not configured'), { connectorState: 'not_configured' });
  let response;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    response = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.ok) return response.json();
    const detail = (await response.text()).slice(0, 300);
    if (!RETRYABLE.has(response.status) || attempt === attempts) {
      const states = { 401: 'authorization_expired', 403: 'permission_denied', 429: 'quota_limited' };
      throw Object.assign(new Error(`provider returned ${response.status}: ${detail}`), { connectorState: states[response.status] || 'temporarily_unavailable' });
    }
  }
}
