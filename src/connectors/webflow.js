import { providerRequest } from './http.js';
import { sha256, nowIso } from '../shared/io.js';

const BASE = 'https://api.webflow.com/v2';

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

    if (metricNames.has('pages')) {
      const pageResult = await providerRequest(`${BASE}/sites/${encodeURIComponent(siteId)}/pages`, context);
      const pages = pageResult.pages || [];
      const pageMetric = metrics.find((m) => m.external_name === 'pages');
      rows.push({
        metric: pageMetric,
        value: pages.length,
        dimensions: { date: endDate },
        observed_at: `${endDate}T00:00:00.000Z`,
      });
    }

    if (metricNames.has('collections') || metricNames.has('items')) {
      const collectionsResult = await providerRequest(`${BASE}/sites/${encodeURIComponent(siteId)}/collections`, context);
      const collections = collectionsResult.collections || [];

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
          const itemsResult = await providerRequest(`${BASE}/collections/${encodeURIComponent(col.id)}/items?limit=100`, context);
          totalItems += (itemsResult.items || []).length;
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

    return {
      rows,
      cursor: endDate,
      limitations: [
        'Webflow API enforces rate limits of 60 requests per minute.',
        'Staged CMS changes require site publish to appear on live domains.',
      ],
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
