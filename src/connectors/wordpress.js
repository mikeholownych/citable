import { providerRequest } from './http.js';
import { sha256, nowIso } from '../shared/io.js';

const METRICS = {
  published_posts: { unit: 'count', value_type: 'integer' },
  published_pages: { unit: 'count', value_type: 'integer' },
};

function normalizeBaseUrl(propertyId) {
  if (!propertyId) throw new Error('WordPress property_id must be the base site or API URL');
  return String(propertyId).replace(/\/+$/, '');
}

function computeCmsPayloadHash(payload) {
  const canonical = {
    target_id: String(payload.target_id || payload.id),
    title: String(payload.title || ''),
    content: String(payload.content || ''),
    excerpt: String(payload.excerpt || ''),
    slug: String(payload.slug || ''),
    status: String(payload.status || 'publish'),
    meta: payload.meta || {},
    schema_data: payload.schema_data || null,
  };
  return sha256(JSON.stringify(canonical));
}

export const wordpressConnector = {
  provider: 'wordpress',
  defaultCredentialEnv: 'WORDPRESS_AUTH_TOKEN',
  readOnlyScopes: [
    'https://api.wordpress.org/auth/posts.readonly',
    'https://api.wordpress.org/auth/pages.readonly',
  ],
  writeScopes: [
    'https://api.wordpress.org/auth/posts.edit',
    'https://api.wordpress.org/auth/pages.edit',
  ],

  describeMetrics() {
    return METRICS;
  },

  async discoverProperties(context) {
    const targetUrl = context.property_id || context.siteUrl || context.url;
    if (!targetUrl) {
      return [{
        property_id: 'https://example.test',
        display_name: 'WordPress Site (configure with site URL)',
        permission: 'administrator',
      }];
    }
    const base = normalizeBaseUrl(targetUrl);
    const siteInfo = await providerRequest(`${base}/wp-json`, context);
    return [{
      property_id: siteInfo.url || base,
      display_name: siteInfo.name || base,
      description: siteInfo.description || null,
      home: siteInfo.home || null,
      permission: 'administrator',
    }];
  },

  async validateConnection(connection, context) {
    const base = normalizeBaseUrl(connection.property_id);
    const user = await providerRequest(`${base}/wp-json/wp/v2/users/me?context=edit`, context);
    const valid = Boolean(user && (user.id || user.name));
    return {
      valid,
      user: user?.name || null,
      roles: user?.roles || [],
      capabilities: user?.capabilities || {},
    };
  },

  async sync(connection, metrics, { startDate, endDate, ...context }) {
    const base = normalizeBaseUrl(connection.property_id);
    const rows = [];
    const metricNames = new Set(metrics.map((m) => m.external_name));

    if (metricNames.has('published_posts')) {
      const posts = await providerRequest(`${base}/wp-json/wp/v2/posts?per_page=100&status=publish`, context);
      const postMetric = metrics.find((m) => m.external_name === 'published_posts');
      rows.push({
        metric: postMetric,
        value: Array.isArray(posts) ? posts.length : 0,
        dimensions: { date: endDate },
        observed_at: `${endDate}T00:00:00.000Z`,
      });
    }

    if (metricNames.has('published_pages')) {
      const pages = await providerRequest(`${base}/wp-json/wp/v2/pages?per_page=100&status=publish`, context);
      const pageMetric = metrics.find((m) => m.external_name === 'published_pages');
      rows.push({
        metric: pageMetric,
        value: Array.isArray(pages) ? pages.length : 0,
        dimensions: { date: endDate },
        observed_at: `${endDate}T00:00:00.000Z`,
      });
    }

    return {
      rows,
      cursor: endDate,
      limitations: [
        'WordPress REST API collection is bounded to accessible posts and pages.',
        'Custom post types outside standard posts and pages require dedicated endpoint parameters.',
      ],
    };
  },

  /**
   * Read CMS page/post content, metadata, and structured data with hash integrity.
   */
  async readContent(connection, targetId, context) {
    if (!targetId) throw new Error('WordPress readContent requires targetId');
    const base = normalizeBaseUrl(connection.property_id);
    let item;
    try {
      item = await providerRequest(`${base}/wp-json/wp/v2/pages/${encodeURIComponent(targetId)}?context=edit`, context);
    } catch {
      // Fall back to posts if not a page
      item = await providerRequest(`${base}/wp-json/wp/v2/posts/${encodeURIComponent(targetId)}?context=edit`, context);
    }

    const payload = {
      target_id: String(item.id),
      type: item.type || 'page',
      url: item.link || '',
      slug: item.slug || '',
      status: item.status || 'publish',
      title: item.title?.raw ?? item.title?.rendered ?? '',
      content: item.content?.raw ?? item.content?.rendered ?? '',
      excerpt: item.excerpt?.raw ?? item.excerpt?.rendered ?? '',
      meta: item.meta || {},
      schema_data: item.meta?.schema_data || null,
      yoast_title: item.meta?._yoast_wpseo_title || null,
      yoast_metadesc: item.meta?._yoast_wpseo_metadesc || null,
      modified_gmt: item.modified_gmt || null,
    };

    const contentHash = computeCmsPayloadHash(payload);
    return { ...payload, content_hash: contentHash };
  },

  /**
   * Apply reviewed, hash-locked remediation to WordPress page or post.
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
      throw new Error(`stale remediation refused for WordPress ${remediation.target_id}: content hash changed (${current.content_hash} !== ${remediation.expected_hash})`);
    }

    const updates = remediation.updates || {};
    const candidatePayload = {
      ...current,
      title: updates.title !== undefined ? updates.title : current.title,
      content: updates.content !== undefined ? updates.content : current.content,
      excerpt: updates.excerpt !== undefined ? updates.excerpt : current.excerpt,
      slug: updates.slug !== undefined ? updates.slug : current.slug,
      status: updates.status !== undefined ? updates.status : current.status,
      meta: updates.meta !== undefined ? updates.meta : current.meta,
      schema_data: updates.schema_data !== undefined ? updates.schema_data : current.schema_data,
    };
    const simulatedHash = computeCmsPayloadHash(candidatePayload);

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

    // Live update
    const base = normalizeBaseUrl(connection.property_id);
    const endpoint = current.type === 'post' ? 'posts' : 'pages';
    const body = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.content !== undefined) body.content = updates.content;
    if (updates.excerpt !== undefined) body.excerpt = updates.excerpt;
    if (updates.slug !== undefined) body.slug = updates.slug;
    if (updates.status !== undefined) body.status = updates.status;
    if (updates.meta !== undefined || updates.schema_data !== undefined) {
      body.meta = {
        ...(current.meta || {}),
        ...(updates.meta || {}),
        ...(updates.schema_data !== undefined ? { schema_data: updates.schema_data } : {}),
      };
    }

    await providerRequest(`${base}/wp-json/wp/v2/${endpoint}/${encodeURIComponent(remediation.target_id)}`, {
      ...context,
      method: 'POST',
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
