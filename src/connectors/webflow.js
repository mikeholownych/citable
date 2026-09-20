import { providerRequest } from './http.js';
import { sha256, nowIso } from '../shared/io.js';
import { collectionResult, errorMessage, paginationBoundary } from './collectionResult.js';

const BASE = 'https://api.webflow.com/v2';
const API_ORIGIN = new URL(BASE).origin;

const METRICS = {
  pages: { unit: 'count', value_type: 'integer' },
  collections: { unit: 'count', value_type: 'integer' },
  items: { unit: 'count', value_type: 'integer' },
};

function computeWebflowPayloadHash(payload) {
  const canonical = {
    target_id: String(payload.target_id || payload.id),
    site_id: String(payload.site_id || ''),
    title: String(payload.title || ''),
    slug: String(payload.slug || ''),
    meta_title: String(payload.meta_title || ''),
    meta_description: String(payload.meta_description || ''),
    open_graph_title: String(payload.open_graph_title || ''),
    open_graph_description: String(payload.open_graph_description || ''),
    body: String(payload.body || ''),
  };
  return sha256(JSON.stringify(canonical));
}

function safeContinuation(url, { preserveOrigin = true } = {}) {
  try {
    const parsed = new URL(url);
    return { ...(preserveOrigin ? { url: `${parsed.origin}${parsed.pathname}` } : { path: parsed.pathname }), query_redacted: parsed.search.length > 0 };
  } catch {
    return { url: '[invalid continuation]', query_redacted: true };
  }
}

async function collectWebflowList(url, field, context) {
  const maxPages = paginationBoundary(context);
  const items = [];
  const errors = [];
  const limitations = [];
  let providerTotal = null;
  let pagesRequested = 0;
  let pagesRetrieved = 0;
  let offset = 0;
  let cursor = null;
  let nextUrl = null;
  let continuationState = null;
  let providerCompleteness = 'declared';
  let connectorError = null;
  while (pagesRequested < maxPages) {
    pagesRequested += 1;
    const query = cursor
      ? `?limit=100&cursor=${encodeURIComponent(cursor)}`
      : `?limit=100${offset ? `&offset=${offset}` : ''}`;
    let result;
    try {
      if (nextUrl) {
        let continuation;
        try { continuation = new URL(nextUrl); } catch {
          errors.push(`${field} page ${pagesRequested}: malformed continuation URL`);
          continuationState = { next: safeContinuation(nextUrl), reason: 'invalid_url' };
          break;
        }
        if (continuation.origin !== API_ORIGIN || continuation.protocol !== 'https:') {
          errors.push(`${field} page ${pagesRequested}: continuation origin is outside the Webflow API`);
          continuationState = { next: safeContinuation(nextUrl, { preserveOrigin: false }), reason: 'origin_mismatch' };
          break;
        }
      }
      result = await providerRequest(nextUrl || `${url}${query}`, context);
      const pageItems = Array.isArray(result?.[field]) ? result[field] : [];
      pagesRetrieved += 1;
      items.push(...pageItems);
      const pagination = result.pagination || {};
      const reported = result.total ?? pagination.total ?? pagination.totalCount ?? null;
      if (Number.isInteger(reported) && reported >= 0) providerTotal = reported;
      const next = result.nextCursor ?? pagination.nextCursor ?? result.next?.cursor ?? null;
      const providerNextUrl = typeof result.next === 'string' ? result.next : (typeof pagination.next === 'string' ? pagination.next : null);
      const nextOffset = result.nextOffset ?? pagination.nextOffset ?? null;
      nextUrl = null;
      if (next !== null && (typeof next !== 'string' || !next.trim())) {
        errors.push(`${field} page ${pagesRequested}: malformed continuation cursor`);
        continuationState = { cursor: next };
        break;
      }
      if (providerNextUrl !== null && (!/^https:\/\//i.test(providerNextUrl))) {
        errors.push(`${field} page ${pagesRequested}: malformed continuation URL`);
        continuationState = { next: safeContinuation(providerNextUrl, { preserveOrigin: false }) };
        break;
      }
      if (next) cursor = String(next);
      else if (providerNextUrl) { nextUrl = providerNextUrl; cursor = null; }
      else if (nextOffset !== null && (!Number.isInteger(nextOffset) || nextOffset <= offset)) {
        errors.push(`${field} page ${pagesRequested}: malformed continuation offset`);
        continuationState = { offset: nextOffset };
        break;
      }
      else if (providerTotal !== null && items.length >= providerTotal) break;
      else if (Number.isInteger(nextOffset) && nextOffset >= 0) { offset = nextOffset; cursor = null; }
      else if (pageItems.length >= 100 && (providerTotal === null || items.length < providerTotal)) offset += pageItems.length;
      else { providerCompleteness = 'unknown'; break; }
      if (providerTotal !== null && items.length >= providerTotal) break;
    } catch (error) {
      connectorError ||= error;
      errors.push(`${field} page ${pagesRequested}: ${errorMessage(error)}`);
      continuationState = cursor ? { cursor } : nextUrl ? { next: safeContinuation(nextUrl) } : { offset };
      break;
    }
  }
  if (!continuationState && pagesRequested >= maxPages && (providerTotal === null || items.length < providerTotal)) {
    continuationState = cursor ? { cursor } : nextUrl ? { next: safeContinuation(nextUrl) } : { offset: offset + 100 };
    limitations.push(`Webflow ${field} collection reached the ${maxPages}-page boundary.`);
  }
  return { items, providerTotal, providerCompleteness, connectorError, pagesRequested, pagesRetrieved, continuationState, limitations, errors };
}

export const webflowConnector = {
  provider: 'webflow',
  defaultCredentialEnv: 'WEBFLOW_API_TOKEN',
  readOnlyScopes: ['sites:read', 'pages:read', 'cms:read'],
  writeScopes: ['pages:write', 'cms:write'],

  describeMetrics() {
    return METRICS;
  },

  async discoverProperties(context) {
    const result = await providerRequest(`${BASE}/sites`, context);
    const sites = result.sites || [];
    return sites.map((site) => ({
      property_id: site.id,
      display_name: site.displayName || site.id,
      custom_domains: (site.customDomains || []).map((d) => d.url || d.host || d),
      time_zone: site.timeZone || null,
      created_on: site.createdOn || null,
      permission: 'administrator',
    }));
  },

  async validateConnection(connection, context) {
    const site = await providerRequest(`${BASE}/sites/${encodeURIComponent(connection.property_id)}`, context);
    const valid = Boolean(site && site.id === connection.property_id);
    return {
      valid,
      site_id: site?.id || connection.property_id,
      display_name: site?.displayName || null,
      last_published: site?.lastPublished || null,
    };
  },

  async sync(connection, metrics, { startDate, endDate, ...context }) {
    const siteId = connection.property_id;
    const rows = [];
    const metricNames = new Set(metrics.map((m) => m.external_name));
    const allItems = [];
    const errors = [];
    const limitations = [];
    let pagesRequested = 0;
    let pagesRetrieved = 0;
    let continuationState = null;
    let providerTotal = 0;
    let providerTotalKnown = true;
    let connectorError = null;

    if (metricNames.has('pages')) {
      const pageResult = await collectWebflowList(`${BASE}/sites/${encodeURIComponent(siteId)}/pages`, 'pages', context);
      const pages = pageResult.items;
      allItems.push(...pages.map((item) => ({ ...item, _collection_type: 'pages' })));
      errors.push(...pageResult.errors); limitations.push(...pageResult.limitations);
      pagesRequested += pageResult.pagesRequested; pagesRetrieved += pageResult.pagesRetrieved;
      continuationState ||= pageResult.continuationState;
      connectorError ||= pageResult.connectorError;
      if (pageResult.providerCompleteness === 'unknown') providerTotalKnown = false;
      if (pageResult.providerTotal === null) providerTotalKnown = false; else providerTotal += pageResult.providerTotal;
      const pageMetric = metrics.find((m) => m.external_name === 'pages');
      rows.push({
        metric: pageMetric,
        value: pages.length,
        dimensions: { date: endDate },
        observed_at: `${endDate}T00:00:00.000Z`,
      });
    }

    if (metricNames.has('collections') || metricNames.has('items')) {
      const collectionsResult = await collectWebflowList(`${BASE}/sites/${encodeURIComponent(siteId)}/collections`, 'collections', context);
      const collections = collectionsResult.items;
      allItems.push(...collections.map((item) => ({ ...item, _collection_type: 'collections' })));
      errors.push(...collectionsResult.errors); limitations.push(...collectionsResult.limitations);
      pagesRequested += collectionsResult.pagesRequested; pagesRetrieved += collectionsResult.pagesRetrieved;
      continuationState ||= collectionsResult.continuationState;
      connectorError ||= collectionsResult.connectorError;
      if (collectionsResult.providerCompleteness === 'unknown') providerTotalKnown = false;
      if (collectionsResult.providerTotal === null) providerTotalKnown = false; else providerTotal += collectionsResult.providerTotal;

      if (metricNames.has('collections')) {
        const colMetric = metrics.find((m) => m.external_name === 'collections');
        rows.push({
          metric: colMetric,
          value: collections.length,
          dimensions: { date: endDate },
          observed_at: `${endDate}T00:00:00.000Z`,
        });
      }

      if (metricNames.has('items')) {
        let totalItems = 0;
        for (const col of collections) {
          const itemsResult = await collectWebflowList(`${BASE}/collections/${encodeURIComponent(col.id)}/items`, 'items', context);
          totalItems += itemsResult.items.length;
          allItems.push(...itemsResult.items.map((item) => ({ ...item, _collection_type: 'items', _collection_id: col.id })));
          errors.push(...itemsResult.errors); limitations.push(...itemsResult.limitations);
          pagesRequested += itemsResult.pagesRequested; pagesRetrieved += itemsResult.pagesRetrieved;
          continuationState ||= itemsResult.continuationState;
          connectorError ||= itemsResult.connectorError;
          if (itemsResult.providerCompleteness === 'unknown') providerTotalKnown = false;
          if (itemsResult.providerTotal === null) providerTotalKnown = false; else providerTotal += itemsResult.providerTotal;
        }
        const itemMetric = metrics.find((m) => m.external_name === 'items');
        rows.push({
          metric: itemMetric,
          value: totalItems,
          dimensions: { date: endDate },
          observed_at: `${endDate}T00:00:00.000Z`,
        });
      }
    }

    const collection = collectionResult({
      items: allItems,
      paginationState: { pages_requested: pagesRequested, pages_retrieved: pagesRetrieved, boundary: { max_pages: paginationBoundary(context) } },
      providerReportedTotal: providerTotalKnown ? providerTotal : null,
      continuationState,
      providerCompleteness: providerTotalKnown ? 'declared' : 'unknown',
      limitations: [...new Set([...limitations, 'Webflow API enforces rate limits of 60 requests per minute.', 'Staged CMS changes require site publish to appear on live domains.'])],
      errors,
    });
    return {
      rows,
      cursor: endDate,
      limitations: collection.limitations,
      collection,
      ...(connectorError ? { connectorError } : {}),
    };
  },

  /**
   * Read Webflow page or collection item content and SEO metadata with hash integrity.
   */
  async readContent(connection, targetId, context) {
    if (!targetId) throw new Error('Webflow readContent requires targetId');
    const page = await providerRequest(`${BASE}/pages/${encodeURIComponent(targetId)}`, context);

    const payload = {
      target_id: String(page.id),
      site_id: page.siteId || connection.property_id,
      title: page.title || '',
      slug: page.slug || '',
      meta_title: page.seo?.title || page.title || '',
      meta_description: page.seo?.description || '',
      open_graph_title: page.openGraph?.title || null,
      open_graph_description: page.openGraph?.description || null,
      body: page.body || '',
      draft: Boolean(page.draft),
      archived: Boolean(page.archived),
      published: Boolean(page.published),
    };

    const contentHash = computeWebflowPayloadHash(payload);
    return { ...payload, content_hash: contentHash };
  },

  /**
   * Apply reviewed, hash-locked remediation to a Webflow page.
   */
  async applyRemediation(connection, remediation, context = {}) {
    if (!remediation.reviewer) {
      throw new Error('CMS remediation requires a named human reviewer per governance rules');
    }
    if (!remediation.expected_hash) {
      throw new Error('CMS remediation requires expected_hash for hash-locking');
    }
    if (!remediation.target_id) {
      throw new Error('CMS remediation requires target_id');
    }

    const current = await this.readContent(connection, remediation.target_id, context);
    if (current.content_hash !== remediation.expected_hash) {
      throw new Error(`stale remediation refused for Webflow ${remediation.target_id}: content hash changed (${current.content_hash} !== ${remediation.expected_hash})`);
    }

    const updates = remediation.updates || {};
    const candidatePayload = {
      ...current,
      title: updates.title !== undefined ? updates.title : current.title,
      slug: updates.slug !== undefined ? updates.slug : current.slug,
      meta_title: updates.meta_title !== undefined ? updates.meta_title : current.meta_title,
      meta_description: updates.meta_description !== undefined ? updates.meta_description : current.meta_description,
      open_graph_title: updates.open_graph_title !== undefined ? updates.open_graph_title : current.open_graph_title,
      open_graph_description: updates.open_graph_description !== undefined ? updates.open_graph_description : current.open_graph_description,
      body: updates.body !== undefined ? updates.body : current.body,
    };
    const simulatedHash = computeWebflowPayloadHash(candidatePayload);

    // Dry-run mode by default
    if (!context.write) {
      return {
        status: 'proposed',
        dry_run: true,
        target_id: remediation.target_id,
        before_hash: current.content_hash,
        after_hash: simulatedHash,
        updates,
        reviewer: remediation.reviewer,
      };
    }

    // Live update via PATCH
    const body = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.slug !== undefined) body.slug = updates.slug;
    if (updates.body !== undefined) body.body = updates.body;
    if (updates.meta_title !== undefined || updates.meta_description !== undefined) {
      body.seo = {
        title: updates.meta_title !== undefined ? updates.meta_title : current.meta_title,
        description: updates.meta_description !== undefined ? updates.meta_description : current.meta_description,
      };
    }
    if (updates.open_graph_title !== undefined || updates.open_graph_description !== undefined) {
      body.openGraph = {
        title: updates.open_graph_title !== undefined ? updates.open_graph_title : current.open_graph_title,
        description: updates.open_graph_description !== undefined ? updates.open_graph_description : current.open_graph_description,
      };
    }

    await providerRequest(`${BASE}/pages/${encodeURIComponent(remediation.target_id)}`, {
      ...context,
      method: 'PATCH',
      body,
    });

    const updated = await this.readContent(connection, remediation.target_id, context);
    return {
      status: 'applied',
      dry_run: false,
      target_id: remediation.target_id,
      before_hash: current.content_hash,
      after_hash: updated.content_hash,
      updated_at: nowIso(),
      reviewer: remediation.reviewer,
    };
  },
};
