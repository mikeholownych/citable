import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validatePublicUrl } from '../crawler/fetch.js';
import { parseSitemap } from '../crawler/sitemap.js';
import { nowIso, sha256, writeJson } from '../shared/io.js';

export const INDEXNOW_DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_MAX_BATCH_SIZE = 10000;
export const INDEXNOW_KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

/**
 * Normalize an input host string or URL into a canonical hostname (including port if non-standard).
 */
export function normalizeHost(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('host must be a non-empty string');
  }
  let trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.host) {
      throw new Error(`Invalid host: "${input}"`);
    }
    return parsed.host;
  } catch (err) {
    throw new Error(`Failed to parse host "${input}": ${err.message}`);
  }
}

/**
 * Parse and validate URLs from a file path, JSON file, or comma/newline-delimited string.
 */
export function parseUrlsInput(input) {
  if (!input) return [];
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (fs.existsSync(trimmed)) {
      const content = fs.readFileSync(trimmed, 'utf8');
      if (trimmed.endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            rawList = parsed;
          } else if (parsed && Array.isArray(parsed.urlList)) {
            rawList = parsed.urlList;
          } else if (parsed && Array.isArray(parsed.urls)) {
            rawList = parsed.urls;
          } else {
            throw new Error('JSON file must contain an array of URLs or an object with "urlList" or "urls" array');
          }
        } catch (e) {
          throw new Error(`Failed to parse URL JSON file: ${e.message}`);
        }
      } else {
        rawList = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
      }
    } else {
      rawList = trimmed.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
  } else {
    throw new Error('urls must be a string or array');
  }

  const result = [];
  const seen = new Set();
  for (const raw of rawList) {
    const u = String(raw).trim();
    if (!u) continue;
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`Invalid URL provided: "${u}"`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported URL protocol in "${u}": only http: and https: are allowed`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`URL credentials are not permitted in "${u}"`);
    }
    const href = parsed.href;
    if (!seen.has(href)) {
      seen.add(href);
      result.push(href);
    }
  }
  return result;
}

/**
 * Load URLs from a local sitemap file or remote sitemap URL.
 */
export async function loadSitemapUrls(sitemapInput, { fetchImpl = globalThis.fetch, allowPrivateForTest = false, lookup } = {}) {
  if (!sitemapInput) return [];
  let xml = '';
  const trimmed = String(sitemapInput).trim();
  if (fs.existsSync(trimmed)) {
    xml = fs.readFileSync(trimmed, 'utf8');
  } else if (/^https?:\/\//i.test(trimmed)) {
    if (!allowPrivateForTest) {
      await validatePublicUrl(trimmed, { lookup });
    }
    const res = await fetchImpl(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to fetch sitemap from ${trimmed}: HTTP ${res.status} ${res.statusText || ''}`.trim());
    }
    xml = await res.text();
  } else {
    throw new Error(`Sitemap input is neither an existing file nor an HTTP(S) URL: "${sitemapInput}"`);
  }

  const parsed = parseSitemap(xml);
  if (parsed.isIndex) {
    throw new Error(`Sitemap at "${sitemapInput}" is a sitemapindex containing ${parsed.children.length} sub-sitemaps. Please provide an individual urlset sitemap or submit child sitemaps individually.`);
  }
  if (parsed.errors.length > 0 && parsed.urls.length === 0) {
    throw new Error(`Failed to parse sitemap: ${parsed.errors.join('; ')}`);
  }
  return parsed.urls.map((u) => u.loc);
}

/**
 * Construct and validate an IndexNow submission payload.
 */
export function buildIndexNowPayload({ host, key, keyLocation, urls = [] }) {
  if (!host) throw new Error('host is required for IndexNow payload');
  const normalizedHost = normalizeHost(host);
  if (!key) throw new Error('key is required for IndexNow payload');
  if (!INDEXNOW_KEY_PATTERN.test(key)) {
    throw new Error('IndexNow key must be 8-128 alphanumeric characters or hyphens');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('urls must be a non-empty array of URL strings');
  }
  if (urls.length > INDEXNOW_MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${INDEXNOW_MAX_BATCH_SIZE} URLs`);
  }

  for (const u of urls) {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`Invalid URL in payload: "${u}"`);
    }
    if (parsed.host !== normalizedHost) {
      throw new Error(`URL "${u}" host ("${parsed.host}") does not match IndexNow payload host ("${normalizedHost}")`);
    }
  }

  if (keyLocation) {
    const parsedLoc = new URL(keyLocation);
    if (parsedLoc.host !== normalizedHost) {
      throw new Error(`keyLocation "${keyLocation}" host ("${parsedLoc.host}") does not match IndexNow payload host ("${normalizedHost}")`);
    }
  }

  return {
    host: normalizedHost,
    key,
    ...(keyLocation ? { keyLocation } : {}),
    urlList: urls,
  };
}

/**
 * Pre-flight verification probe to ensure the host key file is publicly accessible and matches the key.
 */
export async function verifyHostKey(host, key, {
  keyLocation,
  fetchImpl = globalThis.fetch,
  allowPrivateForTest = false,
  lookup,
  timeoutMs = 10000,
} = {}) {
  const normalizedHost = normalizeHost(host);
  const targetUrl = keyLocation || `https://${normalizedHost}/${key}.txt`;
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(`Invalid key verification URL: "${targetUrl}"`);
  }
  if (parsed.host !== normalizedHost) {
    throw new Error(`key verification URL host ("${parsed.host}") does not match host ("${normalizedHost}")`);
  }

  if (!allowPrivateForTest) {
    await validatePublicUrl(targetUrl, { lookup });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'user-agent': 'citable/1.15.1 (IndexNow key verifier)',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`IndexNow key verification failed to connect to ${targetUrl}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`IndexNow key verification failed at ${targetUrl}: HTTP ${res.status} ${res.statusText || ''}`.trim());
  }

  const body = (await res.text()).trim();
  if (body !== key && !body.startsWith(key)) {
    throw new Error(`IndexNow key verification failed at ${targetUrl}: content does not match expected key`);
  }

  return { verified: true, keyLocation: targetUrl };
}

/**
 * Submit URLs to the IndexNow protocol endpoint, with fail-closed key verification and immutable receipts.
 */
export async function submitIndexNow(root = process.cwd(), {
  host,
  key,
  keyLocation,
  urls,
  sitemap,
  endpoint = INDEXNOW_DEFAULT_ENDPOINT,
  write = false,
  skipKeyVerify = false,
  fetchImpl = globalThis.fetch,
  allowPrivateForTest = false,
  lookup,
  timeoutMs = 15000,
} = {}) {
  // 1. Gather URLs from input and/or sitemap
  const urlListFromInput = parseUrlsInput(urls);
  const urlListFromSitemap = sitemap
    ? await loadSitemapUrls(sitemap, { fetchImpl, allowPrivateForTest, lookup })
    : [];

  const combinedUrls = [...new Set([...urlListFromInput, ...urlListFromSitemap])];
  if (combinedUrls.length === 0) {
    throw new Error('connect indexnow requires --urls <file|list> or --sitemap <url|file> with at least one URL');
  }

  // 2. Determine and normalize host
  let effectiveHost = host;
  if (!effectiveHost) {
    const hosts = [...new Set(combinedUrls.map((u) => new URL(u).host))];
    if (hosts.length === 1) {
      effectiveHost = hosts[0];
    } else {
      throw new Error(`URLs span multiple hosts (${hosts.join(', ')}); specify --host or ensure all URLs match the same host`);
    }
  }
  const normalizedHost = normalizeHost(effectiveHost);

  // 3. Resolve and validate key
  const effectiveKey = key || process.env.INDEXNOW_KEY || process.env.INDEXNOW_API_KEY;
  if (!effectiveKey) {
    throw new Error('IndexNow key is required. Provide --key or set INDEXNOW_KEY environment variable');
  }
  if (!INDEXNOW_KEY_PATTERN.test(effectiveKey)) {
    throw new Error('IndexNow key must be 8-128 alphanumeric characters or hyphens');
  }

  // 4. Resolve keyLocation
  const effectiveKeyLocation = keyLocation || `https://${normalizedHost}/${effectiveKey}.txt`;
  const parsedKeyLoc = new URL(effectiveKeyLocation);
  if (parsedKeyLoc.host !== normalizedHost) {
    throw new Error(`keyLocation "${effectiveKeyLocation}" host does not match submission host "${normalizedHost}"`);
  }

  // 5. Verify host key unless skipped
  let keyVerified = false;
  if (!skipKeyVerify) {
    await verifyHostKey(normalizedHost, effectiveKey, {
      keyLocation: effectiveKeyLocation,
      fetchImpl,
      allowPrivateForTest,
      lookup,
      timeoutMs,
    });
    keyVerified = true;
  }

  // 6. Partition into batches of INDEXNOW_MAX_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < combinedUrls.length; i += INDEXNOW_MAX_BATCH_SIZE) {
    const chunk = combinedUrls.slice(i, i + INDEXNOW_MAX_BATCH_SIZE);
    const payload = buildIndexNowPayload({
      host: normalizedHost,
      key: effectiveKey,
      keyLocation: effectiveKeyLocation,
      urls: chunk,
    });
    const payloadString = JSON.stringify(payload);
    const payloadHash = sha256(Buffer.from(payloadString));

    let statusCode = null;
    let success = false;
    let errorMessage = null;

    if (write) {
      if (!allowPrivateForTest) {
        await validatePublicUrl(endpoint, { lookup });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'user-agent': 'citable/1.15.1 (IndexNow connector)',
          },
          body: payloadString,
          signal: controller.signal,
        });
        clearTimeout(timer);
        statusCode = res.status;
        success = [200, 202].includes(res.status);
        if (!success) {
          const text = await res.text().catch(() => '');
          errorMessage = `HTTP ${res.status} ${res.statusText || 'Error'}${text ? `: ${text}` : ''}`.trim();
        }
      } catch (err) {
        clearTimeout(timer);
        errorMessage = err.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : err.message;
      }
    } else {
      success = true;
    }

    batches.push({
      batch_index: Math.floor(i / INDEXNOW_MAX_BATCH_SIZE),
      url_count: chunk.length,
      payload_hash: payloadHash,
      status_code: statusCode,
      success,
      error: errorMessage,
    });
  }

  // 7. Generate delivery receipt
  const deliveryId = `INDEXNOW-${nowIso().replace(/[:.]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
  const deliveriesDir = path.join(root, '.citable', 'monitoring', 'deliveries');
  const receiptFile = path.join(deliveriesDir, `${deliveryId}.json`);

  const allSuccess = batches.every((b) => b.success);
  const firstError = batches.find((b) => b.error)?.error || null;

  const receipt = {
    delivery_id: deliveryId,
    connector: 'indexnow',
    host: normalizedHost,
    endpoint,
    submitted_at: nowIso(),
    url_count: combinedUrls.length,
    batch_count: batches.length,
    batches,
    success: allSuccess,
    dry_run: !write,
    error: firstError,
    key_location: effectiveKeyLocation,
    key_verified: keyVerified,
  };

  writeJson(receiptFile, receipt);
  return { ...receipt, receipt_file: receiptFile };
}

export const indexnowConnector = {
  provider: 'indexnow',
  defaultCredentialEnv: 'INDEXNOW_KEY',
  readOnlyScopes: [],
  writeScopes: ['indexnow:submit'],
  describeMetrics() {
    return {
      urls_submitted: { unit: 'count', value_type: 'integer' },
    };
  },
  async discoverProperties(context = {}) {
    const host = context.property_id || context.host || context.siteUrl;
    if (host && host !== 'api.indexnow.org') {
      return [{
        property_id: host,
        display_name: `IndexNow (${host})`,
        permission: 'publisher',
      }];
    }
    return [{
      property_id: 'api.indexnow.org',
      display_name: 'IndexNow Global Submission API',
      permission: 'publisher',
    }];
  },
  async validateConnection(connection, context = {}) {
    const key = context.token || context.key || process.env.INDEXNOW_KEY || process.env.INDEXNOW_API_KEY;
    if (!key) {
      return { valid: false, reason: 'IndexNow key not configured (set INDEXNOW_KEY)' };
    }
    if (!INDEXNOW_KEY_PATTERN.test(key)) {
      return { valid: false, reason: 'Invalid IndexNow key format (must be 8-128 alphanumeric characters or hyphens)' };
    }
    const host = connection?.property_id;
    if (host && host !== 'api.indexnow.org') {
      try {
        await verifyHostKey(host, key, context);
        return { valid: true };
      } catch (err) {
        return { valid: false, reason: err.message };
      }
    }
    return { valid: true };
  },
  submit: submitIndexNow,
};
