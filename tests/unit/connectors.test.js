import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRequest } from '../../src/connectors/http.js';
import { gscConnector } from '../../src/connectors/gsc.js';
import { ga4Connector } from '../../src/connectors/ga4.js';
import { wordpressConnector } from '../../src/connectors/wordpress.js';
import { webflowConnector } from '../../src/connectors/webflow.js';
import { getConnector, listConnectors } from '../../src/connectors/index.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

test('connector HTTP transport fails closed and never includes tokens in errors', async () => {
  await assert.rejects(providerRequest('https://provider.test', {}), /authorization is not configured/);
  const token = 'secret-token-value';
  await assert.rejects(
    providerRequest('https://provider.test', { token, attempts: 1, fetchImpl: async (_url, options) => {
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      return new Response('permission denied', { status: 403 });
    } }),
    (error) => error.connectorState === 'permission_denied' && !error.message.includes(token),
  );
});

test('GSC adapter discovers properties and maps daily search analytics rows', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/sites')) return json({ siteEntry: [{ siteUrl: 'sc-domain:example.test', permissionLevel: 'siteOwner' }] });
    return json({ rows: [{ keys: ['2026-07-18', 'https://example.test/a'], clicks: 3, impressions: 20 }] });
  };
  const properties = await gscConnector.discoverProperties({ token: 'x', fetchImpl });
  assert.equal(properties[0].property_id, 'sc-domain:example.test');
  const metrics = [
    { metric_id: 'METRIC-CLICKS', external_name: 'clicks', dimensions: ['date', 'page'] },
    { metric_id: 'METRIC-IMPRESSIONS', external_name: 'impressions', dimensions: ['date', 'page'] },
  ];
  const result = await gscConnector.sync({ property_id: 'sc-domain:example.test' }, metrics, { token: 'x', fetchImpl, startDate: '2026-07-01', endDate: '2026-07-18' });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].dimensions.url, 'https://example.test/a');
  assert.equal(JSON.parse(calls.at(-1).options.body).dataState, 'final');
});

test('GA4 adapter paginates properties and restricts metric sync to Organic Search', async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('accountSummaries')) {
      if (!url.includes('pageToken')) return json({ accountSummaries: [], nextPageToken: 'next' });
      return json({ accountSummaries: [{ account: 'accounts/1', propertySummaries: [{ property: 'properties/123', displayName: 'Web' }] }] });
    }
    bodies.push(JSON.parse(options.body));
    return json({ dimensionHeaders: [{ name: 'date' }, { name: 'landingPagePlusQueryString' }], metricHeaders: [{ name: 'sessions' }], rows: [{ dimensionValues: [{ value: '20260718' }, { value: '/a' }], metricValues: [{ value: '9' }] }] });
  };
  const properties = await ga4Connector.discoverProperties({ token: 'x', fetchImpl });
  assert.equal(properties[0].property_id, '123');
  const result = await ga4Connector.sync({ property_id: '123' }, [{ metric_id: 'METRIC-SESSIONS', external_name: 'sessions', dimensions: ['date'] }], { token: 'x', fetchImpl, startDate: '2026-07-01', endDate: '2026-07-18' });
  assert.equal(result.rows[0].observed_at, '2026-07-18T00:00:00.000Z');
  assert.equal(result.rows[0].value, 9);
  assert.equal(bodies[0].dimensionFilter.filter.stringFilter.value, 'Organic Search');
});

test('listConnectors includes gsc, ga4, wordpress, and webflow providers', () => {
  const list = listConnectors();
  const providers = new Set(list.map((c) => c.provider));
  assert.ok(providers.has('gsc'));
  assert.ok(providers.has('ga4'));
  assert.ok(providers.has('wordpress'));
  assert.ok(providers.has('webflow'));
  assert.equal(getConnector('wordpress').provider, 'wordpress');
  assert.equal(getConnector('webflow').provider, 'webflow');
});

test('WordPress connector discovers properties, validates credentials, reads content, and applies hash-locked remediation', async () => {
  let storedPage = {
    id: 101,
    type: 'page',
    link: 'https://wp.example.test/governance',
    slug: 'governance',
    status: 'publish',
    title: { raw: 'Governance Overview', rendered: 'Governance Overview' },
    content: { raw: 'Initial governance text.', rendered: '<p>Initial governance text.</p>' },
    excerpt: { raw: 'Overview summary.', rendered: '<p>Overview summary.</p>' },
    meta: { schema_data: '{"@type":"AboutPage"}' },
  };

  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/wp-json')) {
      return json({ url: 'https://wp.example.test', name: 'Example WP Site', description: 'Just another site' });
    }
    if (url.includes('/users/me')) {
      return json({ id: 1, name: 'admin_user', capabilities: { edit_pages: true, edit_posts: true } });
    }
    if (url.includes('/pages/101')) {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.title) storedPage.title.raw = body.title;
        if (body.content) storedPage.content.raw = body.content;
        if (body.meta) storedPage.meta = { ...storedPage.meta, ...body.meta };
      }
      return json(storedPage);
    }
    if (url.includes('/posts?per_page=100')) return json([{ id: 1 }, { id: 2 }]);
    if (url.includes('/pages?per_page=100')) return json([storedPage]);
    return json({ error: 'not found' }, 404);
  };

  const connection = { property_id: 'https://wp.example.test' };
  const context = { token: 'wp-test-token', fetchImpl };

  // Discovery
  const props = await wordpressConnector.discoverProperties({ ...context, property_id: 'https://wp.example.test' });
  assert.equal(props[0].property_id, 'https://wp.example.test');
  assert.equal(props[0].display_name, 'Example WP Site');

  // Validation
  const val = await wordpressConnector.validateConnection(connection, context);
  assert.equal(val.valid, true);
  assert.equal(val.user, 'admin_user');

  // Read content
  const page = await wordpressConnector.readContent(connection, '101', context);
  assert.equal(page.target_id, '101');
  assert.equal(page.title, 'Governance Overview');
  assert.ok(page.content_hash.length === 64);

  // Remediation fail-closed: missing reviewer
  await assert.rejects(
    wordpressConnector.applyRemediation(connection, { target_id: '101', expected_hash: page.content_hash, updates: { title: 'New Title' } }, context),
    /reviewer/i
  );

  // Remediation fail-closed: stale hash
  await assert.rejects(
    wordpressConnector.applyRemediation(connection, { target_id: '101', expected_hash: 'bad-hash-12345', updates: { title: 'New Title' }, reviewer: 'Alice QA' }, context),
    /content hash changed/i
  );

  // Remediation dry run
  const dry = await wordpressConnector.applyRemediation(connection, {
    target_id: '101',
    expected_hash: page.content_hash,
    updates: { title: 'Updated Governance Title' },
    reviewer: 'Alice QA',
  }, { ...context, write: false });
  assert.equal(dry.status, 'proposed');
  assert.equal(dry.dry_run, true);
  assert.notEqual(dry.after_hash, page.content_hash);

  // Remediation live write
  const live = await wordpressConnector.applyRemediation(connection, {
    target_id: '101',
    expected_hash: page.content_hash,
    updates: { title: 'Updated Governance Title' },
    reviewer: 'Alice QA',
  }, { ...context, write: true });
  assert.equal(live.status, 'applied');
  assert.equal(live.dry_run, false);

  // Verify updated content
  const updatedPage = await wordpressConnector.readContent(connection, '101', context);
  assert.equal(updatedPage.title, 'Updated Governance Title');
  assert.equal(updatedPage.content_hash, live.after_hash);
});

test('Webflow connector discovers properties, validates credentials, reads page, and applies hash-locked remediation', async () => {
  let storedPage = {
    id: 'wf-page-42',
    siteId: 'wf-site-1',
    title: 'Home Page',
    slug: 'home',
    seo: { title: 'Original SEO Title', description: 'Original description' },
    openGraph: { title: 'OG Title', description: 'OG desc' },
    body: '<body>Hello Webflow</body>',
    draft: false,
    archived: false,
    published: true,
  };

  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/sites')) {
      return json({ sites: [{ id: 'wf-site-1', displayName: 'Webflow Marketing Site', customDomains: ['example.test'] }] });
    }
    if (url.endsWith('/sites/wf-site-1')) {
      return json({ id: 'wf-site-1', displayName: 'Webflow Marketing Site', lastPublished: '2026-07-01T00:00:00Z' });
    }
    if (url.includes('/pages/wf-page-42')) {
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        if (body.title) storedPage.title = body.title;
        if (body.seo?.title) storedPage.seo.title = body.seo.title;
        if (body.seo?.description) storedPage.seo.description = body.seo.description;
      }
      return json(storedPage);
    }
    if (url.endsWith('/sites/wf-site-1/pages')) return json({ pages: [storedPage] });
    if (url.endsWith('/sites/wf-site-1/collections')) return json({ collections: [{ id: 'col-1' }] });
    if (url.includes('/collections/col-1/items')) return json({ items: [{ id: 'item-1' }] });
    return json({ error: 'not found' }, 404);
  };

  const connection = { property_id: 'wf-site-1' };
  const context = { token: 'wf-token', fetchImpl };

  // Discovery
  const sites = await webflowConnector.discoverProperties(context);
  assert.equal(sites[0].property_id, 'wf-site-1');
  assert.equal(sites[0].display_name, 'Webflow Marketing Site');

  // Validation
  const val = await webflowConnector.validateConnection(connection, context);
  assert.equal(val.valid, true);

  // Sync metrics
  const syncRes = await webflowConnector.sync(connection, [
    { metric_id: 'METRIC-WF-PAGES', external_name: 'pages' },
    { metric_id: 'METRIC-WF-COLLECTIONS', external_name: 'collections' },
    { metric_id: 'METRIC-WF-ITEMS', external_name: 'items' },
  ], { ...context, startDate: '2026-07-01', endDate: '2026-07-18' });
  assert.equal(syncRes.rows.length, 3);

  // Read content
  const page = await webflowConnector.readContent(connection, 'wf-page-42', context);
  assert.equal(page.target_id, 'wf-page-42');
  assert.equal(page.meta_title, 'Original SEO Title');
  assert.ok(page.content_hash.length === 64);

  // Remediation fail-closed: stale hash
  await assert.rejects(
    webflowConnector.applyRemediation(connection, { target_id: 'wf-page-42', expected_hash: 'bad-hash', updates: { meta_title: 'New' }, reviewer: 'Alice' }, context),
    /content hash changed/i
  );

  // Remediation live write
  const live = await webflowConnector.applyRemediation(connection, {
    target_id: 'wf-page-42',
    expected_hash: page.content_hash,
    updates: { meta_title: 'Updated SEO Title' },
    reviewer: 'Bob Auditor',
  }, { ...context, write: true });
  assert.equal(live.status, 'applied');
  assert.notEqual(live.after_hash, page.content_hash);

  const updatedPage = await webflowConnector.readContent(connection, 'wf-page-42', context);
  assert.equal(updatedPage.meta_title, 'Updated SEO Title');
  assert.equal(updatedPage.content_hash, live.after_hash);
});

