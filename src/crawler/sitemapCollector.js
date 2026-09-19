import { gunzipSync } from 'node:zlib';
import { fetchUrl } from './fetch.js';
import { parseSitemap } from './sitemap.js';

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_DOCUMENTS = 1000;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const DEFAULT_SITEMAP_MAX_BYTES = 5 * 1024 * 1024;

/** Collect a same-origin sitemap graph with deterministic breadth-first traversal. */
export async function collectSitemapTopology(entryUrls, {
  fetcher = fetchUrl,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDocuments = DEFAULT_MAX_DOCUMENTS,
  maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
  sitemapMaxBytes = DEFAULT_SITEMAP_MAX_BYTES,
  origin,
  userAgent,
  shouldStop = () => false,
} = {}) {
  assertInteger(maxDepth, 'maxDepth', 0);
  assertInteger(maxDocuments, 'maxDocuments', 1);
  assertInteger(maxUncompressedBytes, 'maxUncompressedBytes', 1);
  assertInteger(sitemapMaxBytes, 'sitemapMaxBytes', 1);
  const entries = Array.isArray(entryUrls) ? entryUrls : [entryUrls];
  const auditedOrigin = new URL(origin ?? entries.find(Boolean)).origin;
  const queue = [];
  const queued = new Set();
  const documents = [];
  const urls = [];
  const seenUrls = new Set();
  const exclusions = [];
  const errors = [];
  const limitations = [];
  const stopReasons = [];

  const addStop = (reason, limitation) => {
    if (!stopReasons.includes(reason)) stopReasons.push(reason);
    if (limitation && !limitations.includes(limitation)) limitations.push(limitation);
  };
  const enqueue = (rawUrl, depth, parentUrl, kind) => {
    let parsed;
    try {
      parsed = new URL(rawUrl, parentUrl ?? auditedOrigin);
      parsed.hash = '';
    } catch {
      exclusions.push({ url: String(rawUrl ?? ''), kind, source_url: parentUrl, reason: 'malformed_url' });
      errors.push({ url: String(rawUrl ?? ''), reason: 'malformed_url' });
      return 'malformed_url';
    }
    if (parsed.origin !== auditedOrigin) {
      exclusions.push({ url: parsed.href, kind, source_url: parentUrl, reason: 'out_of_origin' });
      errors.push({ url: parsed.href, reason: 'out_of_origin' });
      return 'out_of_origin';
    }
    if (queued.has(parsed.href)) return 'duplicate';
    queued.add(parsed.href);
    queue.push({ url: parsed.href, depth, parentUrl });
    return null;
  };

  for (const entry of entries) enqueue(entry, 0, null, 'entry_sitemap');

  while (queue.length) {
    if (shouldStop()) {
      addStop('time_budget_exhausted', 'Sitemap topology collection stopped when the whole-run time budget expired.');
      break;
    }
    if (documents.length >= maxDocuments) {
      addStop('max_documents_exceeded', `Sitemap topology collection reached the ${maxDocuments}-document limit.`);
      break;
    }
    const item = queue.shift();
    if (item.depth > maxDepth) {
      addStop('max_depth_exceeded', `Sitemap topology collection reached the maximum depth of ${maxDepth}.`);
      continue;
    }

    const record = {
      requested_url: item.url,
      effective_url: item.url,
      depth: item.depth,
      parent_url: item.parentUrl,
      http_status: null,
      compression: 'none',
      compression_transport_decoded: false,
      parse_errors: [],
      url_count: 0,
      child_count: 0,
      status: 'failed',
      failure_reason: null,
      parsed: null,
    };
    documents.push(record);
    try {
      const response = await fetcher(item.url, {
        userAgent,
        maxBodyBytes: sitemapMaxBytes,
        responseType: 'buffer',
      });
      record.effective_url = response.url ?? item.url;
      record.http_status = response.status ?? null;
      if (new URL(record.effective_url).origin !== auditedOrigin) {
        record.failure_reason = 'effective_url_out_of_origin';
        errors.push({ url: item.url, reason: record.failure_reason });
        continue;
      }
      if (response.status !== 200) {
        record.failure_reason = `http_status_${response.status}`;
        errors.push({ url: item.url, reason: record.failure_reason });
        continue;
      }

      record.compression = detectCompression(response.body, response.headers, record.effective_url);
      const decoded = decodeBody(
        response.body, response.headers, record.effective_url, maxUncompressedBytes, record.compression,
      );
      record.compression_transport_decoded = decoded.transportDecoded;
      const parsed = parseSitemap(decoded.text);
      record.parsed = parsed;
      record.parse_errors = [...parsed.errors];
      record.url_count = parsed.urls.length;
      record.child_count = parsed.children.length;
      record.status = parsed.errors.length ? 'malformed' : 'fetched';
      if (parsed.errors.length) {
        record.failure_reason = 'sitemap_parse_error';
        errors.push({ url: item.url, reason: record.failure_reason, details: [...parsed.errors] });
      }

      for (const child of parsed.rootValid ? parsed.children : []) {
        const exclusionReason = enqueue(child.loc, item.depth + 1, record.effective_url, 'child_sitemap');
        if (exclusionReason === 'malformed_url') markMalformedLoc(record, child.loc);
      }
      for (const entry of parsed.rootValid ? parsed.urls : []) {
        let page;
        try {
          page = new URL(entry.loc, record.effective_url);
          page.hash = '';
        } catch {
          markMalformedLoc(record, entry.loc);
          exclusions.push({ url: entry.loc, kind: 'page_url', source_url: record.effective_url, reason: 'malformed_url' });
          errors.push({ url: entry.loc, reason: 'malformed_url' });
          continue;
        }
        if (page.origin !== auditedOrigin) {
          exclusions.push({ url: page.href, kind: 'page_url', source_url: record.effective_url, reason: 'out_of_origin' });
          errors.push({ url: page.href, reason: 'out_of_origin' });
          continue;
        }
        if (seenUrls.has(page.href)) continue;
        seenUrls.add(page.href);
        urls.push({ url: page.href, sitemap_url: record.effective_url, requested_sitemap_url: item.url, sitemap_depth: item.depth });
      }
    } catch (error) {
      record.failure_reason = classifyFailure(error);
      errors.push({ url: item.url, reason: record.failure_reason, message: error.message });
    }
  }

  if (shouldStop()) {
    addStop('time_budget_exhausted', 'Sitemap topology collection stopped when the whole-run time budget expired.');
  }

  const truncated = stopReasons.length > 0;
  const indeterminate = documents.some((document) => ['failed', 'malformed'].includes(document.status))
    || errors.some((error) => ['malformed_url', 'out_of_origin'].includes(error.reason));
  return {
    documents,
    urls,
    status: truncated ? 'truncated' : indeterminate ? 'indeterminate' : 'complete',
    limitations,
    errors,
    exclusions,
    stop_reasons: stopReasons,
    bounds: {
      max_depth: maxDepth,
      max_documents: maxDocuments,
      max_uncompressed_bytes: maxUncompressedBytes,
      sitemap_max_bytes: sitemapMaxBytes,
    },
  };
}

function detectCompression(body, headers = {}, url) {
  const bytes = Buffer.isBuffer(body)
    ? body
    : body instanceof Uint8Array
      ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
      : Buffer.from(String(body ?? ''), 'utf8');
  const contentEncoding = String(headerValue(headers, 'content-encoding') ?? '').toLowerCase();
  const contentType = String(headerValue(headers, 'content-type') ?? '').toLowerCase();
  const magicGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const hintedGzip = magicGzip || /(?:^|\W)gzip(?:\W|$)/.test(contentEncoding)
    || /(?:application|text)\/(?:x-)?gzip/.test(contentType) || new URL(url).pathname.toLowerCase().endsWith('.gz');
  return hintedGzip ? 'gzip' : 'none';
}

function decodeBody(body, headers, url, maxUncompressedBytes, compression = detectCompression(body, headers, url)) {
  const bytes = Buffer.isBuffer(body)
    ? body
    : body instanceof Uint8Array
      ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
      : Buffer.from(String(body ?? ''), 'utf8');
  const magicGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  let decoded = bytes;
  let transportDecoded = false;
  if (compression === 'gzip') {
    if (magicGzip) {
      decoded = gunzipSync(bytes, { maxOutputLength: maxUncompressedBytes });
    } else if (looksLikeDecodedXml(bytes)) {
      transportDecoded = true;
    } else {
      const error = new Error('gzip-indicated sitemap body is neither gzip bytes nor transport-decoded XML');
      error.code = 'SITEMAP_DECOMPRESSION_FAILED';
      throw error;
    }
  }
  if (decoded.byteLength > maxUncompressedBytes) {
    const error = new Error(`sitemap uncompressed body exceeds ${maxUncompressedBytes} bytes`);
    error.code = 'SITEMAP_UNCOMPRESSED_LIMIT';
    throw error;
  }
  return { text: decoded.toString('utf8'), compression, transportDecoded };
}

function looksLikeDecodedXml(bytes) {
  return /^\s*</u.test(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function classifyFailure(error) {
  if (error?.code === 'SITEMAP_UNCOMPRESSED_LIMIT' || error?.code === 'ERR_BUFFER_TOO_LARGE'
    || /maxoutputlength|larger than|exceeds .* bytes/i.test(error?.message ?? '')) {
    return 'max_uncompressed_bytes_exceeded';
  }
  if (error?.code === 'SITEMAP_DECOMPRESSION_FAILED'
    || /gzip|incorrect header|invalid distance|unexpected end/i.test(error?.message ?? '')) return 'decompression_failed';
  return 'fetch_failed';
}

function markMalformedLoc(record, loc) {
  const message = `entry has malformed <loc>: ${loc}`;
  if (!record.parse_errors.includes(message)) record.parse_errors.push(message);
  record.status = 'malformed';
  record.failure_reason = 'sitemap_parse_error';
}

function assertInteger(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
}
