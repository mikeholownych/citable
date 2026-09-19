import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionResult } from '../../src/connectors/collectionResult.js';
import { wordpressConnector } from '../../src/connectors/wordpress.js';
import { webflowConnector } from '../../src/connectors/webflow.js';

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('collection result reconciles retrieved totals and preserves continuation', () => {
  const result = collectionResult({
    items: Array.from({ length: 101 }, (_, index) => ({ id: index + 1 })),
    paginationState: { pages_requested: 2, pages_retrieved: 2, boundary: { max_pages: 2 } },
    providerReportedTotal: 205,
    continuationState: { page: 3 },
  });
  assert.equal(result.retrieved_total, 101);
  assert.equal(result.provider_reported_total, 205);
  assert.equal(result.coverage_status, 'truncated');
  assert.deepEqual(result.continuation_state, { page: 3 });
});

test('provider-bounded collection remains visibly incomplete without a continuation', () => {
  const result = collectionResult({
    items: [{ id: 'a' }],
    paginationState: { pages_requested: 1, pages_retrieved: 1 },
    providerCompleteness: 'unknown',
    limitations: ['Provider returns top rows only.'],
  });
  assert.equal(result.coverage_status, 'provider_bounded');
  assert.equal(result.continuation_state, null);
  assert.deepEqual(result.limitations, ['Provider returns top rows only.']);
});

test('partial connector errors are indeterminate rather than complete', () => {
  const result = collectionResult({
    items: [{ id: 'a' }],
    paginationState: { pages_requested: 2, pages_retrieved: 1 },
    continuationState: { page: 2 },
    errors: ['page 2: provider unavailable'],
  });
  assert.equal(result.coverage_status, 'indeterminate');
  assert.equal(result.errors.length, 1);
});

test('WordPress follows provider page totals beyond the legacy first page', async () => {
  const fetchImpl = async (url) => {
    const page = Number(new URL(url).searchParams.get('page') || 1);
    return json([{ id: page }], 200, { 'x-wp-total': '205', 'x-wp-totalpages': '205' });
  };
  const result = await wordpressConnector.sync(
    { property_id: 'https://wp.example.test' },
    [{ external_name: 'published_posts' }],
    { token: 'test', fetchImpl },
  );
  assert.equal(result.collection.coverage_status, 'complete');
  assert.equal(result.collection.provider_reported_total, 205);
  assert.equal(result.collection.retrieved_total, 205);
  assert.equal(result.rows[0].value, 205);
});

test('Webflow exposes a continuation when a configured collection boundary is reached', async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get('offset') || 0);
    return json({ pages: [{ id: offset + 1 }], pagination: { total: 205, offset, limit: 1, nextOffset: offset + 1 } });
  };
  const result = await webflowConnector.sync(
    { property_id: 'wf-site' },
    [{ external_name: 'pages' }],
    { token: 'test', fetchImpl, collectionMaxPages: 100 },
  );
  assert.equal(result.collection.coverage_status, 'truncated');
  assert.equal(result.collection.provider_reported_total, 205);
  assert.equal(result.collection.retrieved_total, 100);
  assert.ok(result.collection.continuation_state);
});
