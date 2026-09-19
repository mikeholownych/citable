import { gunzipSync } from 'node:zlib';
import { fetchUrl } from './fetch.js';
import { parseSitemap } from './sitemap.js';

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_DOCUMENTS = 1000;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_DISCOVERED_URLS = 50_000;
const DEFAULT_MAX_QUEUED_DOCUMENTS = 1000;
const DEFAULT_MAX_RAW_ENTRIES = 100_000;
const DEFAULT_MAX_XML_TOKENS = 500_000;
const DEFAULT_SITEMAP_MAX_BYTES = 5 * 1024 * 1024;

/** Collect a same-origin sitemap graph with deterministic breadth-first traversal. */
export async function collectSitemapTopology(entryUrls, {
  fetcher = fetchUrl,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDocuments = DEFAULT_MAX_DOCUMENTS,
  maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
  maxTotalUncompressedBytes = DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
  maxDiscoveredUrls = DEFAULT_MAX_DISCOVERED_URLS,
  maxQueuedDocuments = DEFAULT_MAX_QUEUED_DOCUMENTS,
  maxRawEntries = DEFAULT_MAX_RAW_ENTRIES,
  maxXmlTokens = DEFAULT_MAX_XML_TOKENS,
  sitemapMaxBytes = DEFAULT_SITEMAP_MAX_BYTES,
  origin,
  userAgent,
  shouldStop = () => false,
} = {}) {
  assertInteger(maxDepth, 'maxDepth', 0);
  assertInteger(maxDocuments, 'maxDocuments', 1);
  assertInteger(maxUncompressedBytes, 'maxUncompressedBytes', 1);
  assertInteger(maxTotalUncompressedBytes, 'maxTotalUncompressedBytes', 1);
  assertInteger(maxDiscoveredUrls, 'maxDiscoveredUrls', 1);
  assertInteger(maxQueuedDocuments, 'maxQueuedDocuments', 1);
  assertInteger(maxRawEntries, 'maxRawEntries', 1);
  assertInteger(maxXmlTokens, 'maxXmlTokens', 1);
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
  let totalUncompressedBytes = 0;
  let queuedDocumentsPeak = 0;

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
    if (queue.length >= maxQueuedDocuments) {
      addStop(
        'max_queued_documents_exceeded',
        `Sitemap topology collection reached the ${maxQueuedDocuments}-document queued-frontier limit.`,
      );
      return 'max_queued_documents_exceeded';
    }
    queued.add(parsed.href);
    queue.push({ url: parsed.href, depth, parentUrl });
    queuedDocumentsPeak = Math.max(queuedDocumentsPeak, queue.length);
    return null;
  };

  for (let index = 0; index < entries.length; index += 1) {
    if (index >= maxRawEntries) {
      addStop(
        'max_raw_entries_exceeded',
        `Sitemap topology collection reached the ${maxRawEntries}-entry raw-input safety limit.`,
      );
      break;
    }
    enqueue(entries[index], 0, null, 'entry_sitemap');
  }

  collection: while (queue.length) {
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
      raw_entry_count: 0,
      status: 'failed',
      failure_reason: null,
      failure_stage: null,
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
        record.failure_stage = 'policy';
        errors.push({ url: item.url, reason: record.failure_reason });
        continue;
      }
      if (response.status !== 200) {
        record.failure_reason = `http_status_${response.status}`;
        record.failure_stage = 'transport';
        errors.push({ url: item.url, reason: record.failure_reason });
        continue;
      }

      record.compression = detectCompression(response.body, response.headers, record.effective_url);
      const decoded = decodeBody(
        response.body, response.headers, record.effective_url, maxUncompressedBytes, record.compression,
      );
      record.compression_transport_decoded = decoded.transportDecoded;
      record.uncompressed_bytes = decoded.uncompressedBytes;
      if (totalUncompressedBytes + decoded.uncompressedBytes > maxTotalUncompressedBytes) {
        markTruncated(record, 'max_total_uncompressed_bytes_exceeded');
        addStop(
          'max_total_uncompressed_bytes_exceeded',
          `Sitemap topology collection exceeded the ${maxTotalUncompressedBytes}-byte cumulative uncompressed limit.`,
        );
        break collection;
      }
      totalUncompressedBytes += decoded.uncompressedBytes;
      const parsed = parseSitemap(decoded.text, {
        maxUrls: maxRawEntries,
        maxChildren: maxRawEntries,
        maxEntries: maxRawEntries,
        maxTokens: maxXmlTokens,
      });
      record.parsed = parsed;
      record.parse_errors = [...parsed.errors];
      record.url_count = parsed.urlCount;
      record.child_count = parsed.childCount;
      record.raw_entry_count = parsed.rawEntryCount;
      record.status = parsed.errors.length ? 'malformed' : 'fetched';
      if (parsed.errors.length) {
        record.failure_reason = 'sitemap_parse_error';
        record.failure_stage = 'parse';
        errors.push({ url: item.url, reason: record.failure_reason, details: [...parsed.errors] });
      }
      if (parsed.truncated) {
        const [reason, limitation] = parsed.truncationReason === 'max_tokens_exceeded'
          ? ['max_xml_tokens_exceeded', `Sitemap parsing reached the ${maxXmlTokens}-token structural limit.`]
          : ['max_raw_entries_exceeded', `Sitemap parsing reached the ${maxRawEntries}-entry raw-input safety limit.`];
        markTruncated(record, reason);
        addStop(reason, limitation);
      }

      for (const child of parsed.rootValid ? parsed.children : []) {
        const exclusionReason = enqueue(child.loc, item.depth + 1, record.effective_url, 'child_sitemap');
        if (exclusionReason === 'malformed_url') markMalformedLoc(record, child.loc);
        if (exclusionReason === 'max_queued_documents_exceeded') {
          markTruncated(record, exclusionReason);
          break;
        }
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
        if (urls.length >= maxDiscoveredUrls) {
          markTruncated(record, 'max_discovered_urls_exceeded');
          addStop(
            'max_discovered_urls_exceeded',
            `Sitemap topology collection reached the ${maxDiscoveredUrls}-URL discovery limit.`,
          );
          break;
        }
        seenUrls.add(page.href);
        urls.push({ url: page.href, sitemap_url: record.effective_url, requested_sitemap_url: item.url, sitemap_depth: item.depth });
      }
      if (stopReasons.includes('max_discovered_urls_exceeded')) break collection;
    } catch (error) {
      record.failure_reason = classifyFailure(error);
      record.failure_stage = failureStage(record.failure_reason);
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
      max_total_uncompressed_bytes: maxTotalUncompressedBytes,
      max_discovered_urls: maxDiscoveredUrls,
      max_queued_documents: maxQueuedDocuments,
      max_raw_entries: maxRawEntries,
      max_xml_tokens: maxXmlTokens,
      sitemap_max_bytes: sitemapMaxBytes,
    },
    totals: {
      documents: documents.length,
      urls: urls.length,
      uncompressed_bytes: totalUncompressedBytes,
      queued_documents_peak: queuedDocumentsPeak,
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
  return { text: decoded.toString('utf8'), compression, transportDecoded, uncompressedBytes: decoded.byteLength };
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
  if (error?.code === 'FETCH_BODY_LIMIT' || /^response body exceeds \d+ bytes$/i.test(error?.message ?? '')) {
    return 'sitemap_transport_bytes_exceeded';
  }
  if (error?.code === 'SITEMAP_UNCOMPRESSED_LIMIT' || error?.code === 'ERR_BUFFER_TOO_LARGE'
    || /maxoutputlength|larger than/i.test(error?.message ?? '')) {
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
  record.failure_stage = 'parse';
}

function markTruncated(record, reason) {
  record.status = 'truncated';
  record.failure_reason = reason;
  record.failure_stage = 'collection';
}

function failureStage(reason) {
  if (reason === 'sitemap_transport_bytes_exceeded' || reason === 'fetch_failed' || reason.startsWith('http_status_')) {
    return 'transport';
  }
  if (reason === 'max_uncompressed_bytes_exceeded' || reason === 'decompression_failed') return 'decompression';
  if (reason === 'sitemap_parse_error') return 'parse';
  if (reason.includes('out_of_origin')) return 'policy';
  return 'collection';
}

function assertInteger(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
}
