import { sha256 } from '../../shared/io.js';
import {
  sanitizeHeaders,
  sanitizeQueryParams,
  sanitizePayload,
  isSensitiveKey,
  isSensitiveValue,
  REDACTED_MARKER,
} from './sanitizer.js';

function matchHost(host, pattern) {
  if (pattern === '*' || host === pattern) return true;
  if (pattern.startsWith('*.')) {
    const root = pattern.slice(2);
    return host === root || host.endsWith('.' + root);
  }
  return false;
}

export class NetworkCollector {
  constructor(options = {}) {
    const {
      networkPolicy = {},
      targetUrl,
      correlationTracker,
      planId,
      profileId,
    } = options;

    this.policy = networkPolicy;
    this.enabled = Boolean(this.policy.enabled);
    this.planId = planId || 'plan-unspecified';
    this.profileId = profileId || 'profile-unspecified';
    this.tracker = correlationTracker;

    const parsedTarget = new URL(targetUrl);
    this.targetHost = parsedTarget.hostname;
    this.targetOrigin = parsedTarget.origin;

    this.allowedHostPatterns = this.policy.allowed_host_patterns || [this.targetHost];
    this.allowedMethods = this.policy.allowed_methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    this.allowedResourceTypes = this.policy.allowed_resource_types || [
      'document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other',
    ];
    this.captureRequestHeaders = this.policy.capture_request_headers || null;
    this.captureResponseHeaders = this.policy.capture_response_headers || null;
    this.captureQueryParams = this.policy.capture_query_params || null;
    this.capturePayload = this.policy.capture_payload || { request_body: false, response_body: false, hash_only: false };
    this.maxEvents = Math.min(this.policy.max_events || 200, 1000);
    this.maxFieldSize = Math.min(this.policy.max_field_size || 1024, 8192);

    this.events = [];
    this.transactionMap = new Map(); // playwright request -> { txId, initiatedCorrelation, ... }
    this.summary = {
      total_requests: 0,
      successful_responses: 0,
      failed_requests: 0,
      filtered_requests: 0,
      in_flight_requests: 0,
      collector_status: 'complete',
      truncated: false,
      truncation_reason: null,
      status_codes: {},
    };
    this.txCounter = 0;
  }

  isHostAllowed(hostname) {
    if (!hostname) return false;
    return this.allowedHostPatterns.some((pattern) => matchHost(hostname, pattern));
  }

  attachToPage(page) {
    if (!this.enabled) return;

    page.on('request', async (request) => {
      await this.handleRequest(request);
    });

    page.on('response', async (response) => {
      await this.handleResponse(response);
    });

    page.on('requestfailed', async (request) => {
      await this.handleRequestFailed(request);
    });
  }

  async handleRequest(request) {
    const urlStr = request.url();
    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      return;
    }

    // Filter by allowed host
    const hostAllowed = this.isHostAllowed(parsedUrl.hostname);
    const methodAllowed = this.allowedMethods.includes(request.method().toUpperCase());
    const resourceType = request.resourceType();
    const resourceTypeAllowed = this.allowedResourceTypes.includes(resourceType);

    if (!hostAllowed || !methodAllowed || !resourceTypeAllowed) {
      this.summary.filtered_requests++;
      return;
    }

    this.summary.total_requests++;
    this.txCounter++;
    const txId = `TX-${String(this.txCounter).padStart(4, '0')}`;
    const initiatedCorrelation = this.tracker.getCorrelation();
    const seq = this.tracker.nextSequence();
    const timing = this.tracker.timing();

    this.transactionMap.set(request, {
      txId,
      initiatedCorrelation,
      seq,
    });

    if (this.events.length >= this.maxEvents) {
      this.summary.truncated = true;
      this.summary.truncation_reason = 'max_events_exceeded';
      return;
    }

    // Headers sanitization (deny-by-default)
    const rawHeaders = request.headers();
    let sanitizedHeaders = null;
    let headersStatus = 'not_requested';
    let headerRedacted = 0;
    if (this.captureRequestHeaders && Array.isArray(this.captureRequestHeaders) && this.captureRequestHeaders.length > 0) {
      const res = sanitizeHeaders(rawHeaders, this.captureRequestHeaders);
      sanitizedHeaders = res.headers;
      headersStatus = res.status;
      headerRedacted = res.redactedCount;
    }

    // Query params sanitization (deny-by-default)
    let sanitizedQuery = null;
    let queryStatus = 'not_requested';
    let queryRedacted = 0;
    let queryFiltered = [];
    if (this.captureQueryParams && Array.isArray(this.captureQueryParams) && this.captureQueryParams.length > 0) {
      const res = sanitizeQueryParams(urlStr, this.captureQueryParams);
      sanitizedQuery = res.query;
      queryStatus = res.status;
      queryRedacted = res.redactedCount;
      queryFiltered = res.filteredFields;
    }

    // Request payload handling (deny-by-default)
    let payloadHash = null;
    let payloadBytes = null;
    let payloadFields = null;
    let payloadStatus = 'not_requested';
    let payloadRedacted = 0;
    let payloadFiltered = [];

    const isBodyRequested = Boolean(this.capturePayload.request_body);
    const isHashRequested = Boolean(this.capturePayload.hash_only);

    if (isBodyRequested || isHashRequested) {
      const postData = request.postData();
      if (postData != null && postData !== '') {
        const sanitized = sanitizePayload(postData, {
          allowedFields: this.capturePayload.allowed_json_fields || null,
          hashOnly: isHashRequested && !isBodyRequested,
          maxBytes: this.capturePayload.max_bytes || 4096,
        });
        payloadHash = sanitized.hash;
        payloadBytes = sanitized.bytes;
        payloadFields = typeof sanitized.sanitized === 'object' && sanitized.sanitized !== null ? sanitized.sanitized : null;
        payloadStatus = sanitized.status;
        payloadRedacted = sanitized.redactedCount;
        payloadFiltered = sanitized.filteredFields;
      } else {
        payloadStatus = 'unavailable';
      }
    }

    const totalRedacted = headerRedacted + queryRedacted + payloadRedacted;
    const allFilteredFields = [...queryFiltered, ...payloadFiltered];

    const eventRecord = {
      sequence: seq,
      transaction_id: txId,
      direction: 'request',
      phase: 'request_sent',
      timing,
      correlation: initiatedCorrelation,
      request: {
        url: parsedUrl.origin + parsedUrl.pathname,
        method: request.method().toUpperCase(),
        scheme: parsedUrl.protocol.replace(':', ''),
        host: parsedUrl.hostname,
        path: parsedUrl.pathname,
        resource_type: resourceType,
        query: sanitizedQuery,
        query_status: queryStatus,
        headers: sanitizedHeaders,
        headers_status: headersStatus,
        payload_hash: payloadHash,
        payload_bytes: payloadBytes,
        payload_fields: payloadFields,
        payload_status: payloadStatus,
      },
      response: null,
      failure: null,
      disposition: {
        capture_status: totalRedacted > 0 ? 'redacted' : 'captured',
        redacted_count: totalRedacted,
        filtered_fields: allFilteredFields,
      },
    };

    this.events.push(eventRecord);
  }

  async handleResponse(response) {
    const request = response.request();
    const tx = this.transactionMap.get(request);
    if (!tx) return; // Request was filtered or not tracked

    const status = response.status();
    const statusKey = String(status);
    this.summary.status_codes[statusKey] = (this.summary.status_codes[statusKey] || 0) + 1;

    if (status >= 200 && status < 400) {
      this.summary.successful_responses++;
    }

    if (this.events.length >= this.maxEvents) {
      this.summary.truncated = true;
      this.summary.truncation_reason = 'max_events_exceeded';
      return;
    }

    const seq = this.tracker.nextSequence();
    const timing = this.tracker.timing();
    const completedCorrelation = this.tracker.correlateCompletion(tx.initiatedCorrelation);

    // Response headers sanitization (deny-by-default)
    const rawHeaders = response.headers();
    let sanitizedHeaders = null;
    let headersStatus = 'not_requested';
    let headerRedacted = 0;
    if (this.captureResponseHeaders && Array.isArray(this.captureResponseHeaders) && this.captureResponseHeaders.length > 0) {
      const res = sanitizeHeaders(rawHeaders, this.captureResponseHeaders);
      sanitizedHeaders = res.headers;
      headersStatus = res.status;
      headerRedacted = res.redactedCount;
    }

    let mimeType = response.headers()['content-type'] || null;
    if (mimeType) {
      mimeType = mimeType.split(';')[0].trim();
    }

    // Response body handling (deny-by-default)
    let bodyHash = null;
    let bodyBytes = null;
    let bodyFields = null;
    let bodyStatus = 'not_requested';

    const isRespBodyRequested = Boolean(this.capturePayload.response_body);
    const isRespHashRequested = Boolean(this.capturePayload.hash_only);

    if (isRespBodyRequested || isRespHashRequested) {
      try {
        const buffer = await response.body();
        if (buffer && buffer.length > 0) {
          const sanitized = sanitizePayload(buffer, {
            allowedFields: this.capturePayload.allowed_json_fields || null,
            hashOnly: isRespHashRequested && !isRespBodyRequested,
            maxBytes: this.capturePayload.max_bytes || 4096,
          });
          bodyHash = sanitized.hash;
          bodyBytes = sanitized.bytes;
          bodyFields = typeof sanitized.sanitized === 'object' && sanitized.sanitized !== null ? sanitized.sanitized : null;
          bodyStatus = sanitized.status;
        } else {
          bodyStatus = 'unavailable';
        }
      } catch {
        bodyStatus = 'unavailable';
      }
    }

    const isRedirect = status >= 300 && status < 400;
    const redirectUrl = isRedirect ? response.headers()['location'] || null : null;

    const parsedUrl = new URL(request.url());

    const eventRecord = {
      sequence: seq,
      transaction_id: tx.txId,
      direction: 'response',
      phase: isRedirect ? 'redirect' : 'response_received',
      timing,
      correlation: completedCorrelation,
      request: {
        url: parsedUrl.origin + parsedUrl.pathname,
        method: request.method().toUpperCase(),
        scheme: parsedUrl.protocol.replace(':', ''),
        host: parsedUrl.hostname,
        path: parsedUrl.pathname,
        resource_type: request.resourceType(),
        query: null,
        query_status: 'not_requested',
        headers: null,
        headers_status: 'not_requested',
        payload_hash: null,
        payload_bytes: null,
        payload_fields: null,
        payload_status: 'not_requested',
      },
      response: {
        status,
        status_text: response.statusText(),
        headers: sanitizedHeaders,
        headers_status: headersStatus,
        mime_type: mimeType,
        body_hash: bodyHash,
        body_bytes: bodyBytes,
        body_fields: bodyFields,
        body_status: bodyStatus,
        redirect_url: redirectUrl,
        from_cache: response.fromServiceWorker ? true : false,
      },
      failure: null,
      disposition: {
        capture_status: headerRedacted > 0 ? 'redacted' : 'captured',
        redacted_count: headerRedacted,
        filtered_fields: [],
      },
    };

    this.events.push(eventRecord);
  }

  async handleRequestFailed(request) {
    const tx = this.transactionMap.get(request);
    this.summary.failed_requests++;

    if (!tx || this.events.length >= this.maxEvents) {
      if (this.events.length >= this.maxEvents) {
        this.summary.truncated = true;
        this.summary.truncation_reason = 'max_events_exceeded';
      }
      return;
    }

    const seq = this.tracker.nextSequence();
    const timing = this.tracker.timing();
    const completedCorrelation = this.tracker.correlateCompletion(tx.initiatedCorrelation);
    const failureText = request.failure()?.errorText || 'unknown';
    const parsedUrl = new URL(request.url());

    const eventRecord = {
      sequence: seq,
      transaction_id: tx.txId,
      direction: 'response',
      phase: 'failed',
      timing,
      correlation: completedCorrelation,
      request: {
        url: parsedUrl.origin + parsedUrl.pathname,
        method: request.method().toUpperCase(),
        scheme: parsedUrl.protocol.replace(':', ''),
        host: parsedUrl.hostname,
        path: parsedUrl.pathname,
        resource_type: request.resourceType(),
        query: null,
        query_status: 'not_requested',
        headers: null,
        headers_status: 'not_requested',
        payload_hash: null,
        payload_bytes: null,
        payload_fields: null,
        payload_status: 'not_requested',
      },
      response: null,
      failure: {
        error_text: failureText,
      },
      disposition: {
        capture_status: 'error',
        redacted_count: 0,
        filtered_fields: [],
      },
    };

    this.events.push(eventRecord);
  }

  toArtifact() {
    const inFlight = Math.max(0, this.summary.total_requests - this.summary.successful_responses - this.summary.failed_requests);
    this.summary.in_flight_requests = inFlight;
    this.summary.collector_status = this.summary.truncated ? 'truncated' : 'complete';

    return {
      schema_version: 1,
      plan_id: this.planId,
      profile_id: this.profileId,
      collected_at: this.tracker.timing().timestamp,
      capture_policy: this.policy,
      summary: this.summary,
      events: this.events,
    };
  }
}
