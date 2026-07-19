import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRequest } from '../../src/connectors/http.js';
import { gscConnector } from '../../src/connectors/gsc.js';
import { ga4Connector } from '../../src/connectors/ga4.js';

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
