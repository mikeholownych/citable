import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSearchConsoleObservations, compareSearchDiscoveryObservations, pagesForQuery, queriesForPage } from '../../src/discovery/searchConsole.js';
import { gscConnector } from '../../src/connectors/gsc.js';
import { comparePromptSets, createPromptSet, verifyPromptSet } from '../../src/representation/prompts.js';
import { collectRepresentationObservations, compareRepresentationObservations, createHttpRepresentationAdapter, normalizeRepresentationResponse, verifyRepresentationObservation } from '../../src/representation/representation.js';
import { compareExternalObservations, createEvidenceClaim, verifyClaim } from '../../src/evidence/external.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

const gscRequest = { property_id: 'sc-domain:example.test', start_date: '2026-09-01', end_date: '2026-09-07', dimensions: ['query', 'page'], filters: {}, row_limit: 25000 };

test('ER-1 complete Search Console request produces bounded external observations', async () => {
  const result = await collectSearchConsoleObservations({
    connection: { property_id: gscRequest.property_id }, request: gscRequest, token: 'fixture-token', evidenceOrigin: 'RECORDED_FIXTURE',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.dataState, 'final');
      return json({ rowCount: 1, rows: [{ keys: ['answer engine', 'https://example.test/docs'], impressions: 428, clicks: 31, ctr: 31 / 428, position: 11.3 }] });
    },
  });
  assert.equal(result.collection.coverage_status, 'complete');
  assert.equal(result.observations.length, 1);
  const item = result.observations[0];
  assert.equal(item.data.query, 'answer engine');
  assert.equal(item.data.page, 'https://example.test/docs');
  assert.equal(item.data.metrics.average_position, 11.3);
  assert.equal(item.data.evidence_origin, 'RECORDED_FIXTURE');
  assert.equal(item.source.authority, 'external_provider');
  assert.equal(JSON.stringify(item).includes('fixture-token'), false);
});

test('ER-1 is exposed through the existing GSC connector seam', async () => {
  const result = await gscConnector.collectObservations({ property_id: gscRequest.property_id }, gscRequest, { token: 'x', evidenceOrigin: 'SYNTHETIC_TEST', fetchImpl: async () => json({ rowCount: 0, rows: [] }) });
  assert.equal(result.collection.coverage_status, 'complete');
});

test('ER-1 distinguishes zero rows, provider failure, malformed response, and interrupted pagination', async () => {
  const zero = await collectSearchConsoleObservations({ request: gscRequest, token: 'x', fetchImpl: async () => json({ rowCount: 0, rows: [] }) });
  assert.equal(zero.collection.coverage_status, 'complete');
  assert.equal(zero.observations.length, 0);

  const failed = await collectSearchConsoleObservations({ request: gscRequest, token: 'x', fetchImpl: async () => new Response('denied', { status: 403 }) });
  assert.equal(failed.collection.coverage_status, 'indeterminate');
  assert.equal(failed.observations.length, 0);
  assert.notEqual(failed.collection.errors.length, 0);

  const malformed = await collectSearchConsoleObservations({ request: gscRequest, token: 'x', fetchImpl: async () => json({ rows: 'not-an-array' }) });
  assert.equal(malformed.collection.coverage_status, 'indeterminate');
  assert.equal(malformed.observations.length, 0);

  const truncated = await collectSearchConsoleObservations({ request: { ...gscRequest, row_limit: 1 }, token: 'x', maxPages: 1, fetchImpl: async () => json({ rowCount: 2, rows: [{ keys: ['q', 'https://example.test/1'], impressions: 1, clicks: 0, ctr: 0, position: 50 }] }) });
  assert.equal(truncated.collection.coverage_status, 'truncated');
  assert.deepEqual(truncated.collection.continuation_state, { start_row: 1 });
  assert.equal(truncated.observations[0].data.coverage_status, 'truncated');
});

test('ER-1 follows declared provider pagination to completion', async () => {
  const starts = [];
  const result = await collectSearchConsoleObservations({ request: { ...gscRequest, row_limit: 1 }, token: 'x', fetchImpl: async (_url, options) => {
    const startRow = JSON.parse(options.body).startRow;
    starts.push(startRow);
    return startRow === 0
      ? json({ rowCount: 2, rows: [{ keys: ['q', 'https://example.test/1'], impressions: 1, clicks: 0, ctr: 0, position: 1 }] })
      : json({ rowCount: 2, rows: [{ keys: ['q', 'https://example.test/2'], impressions: 2, clicks: 0, ctr: 0, position: 2 }] });
  } });
  assert.deepEqual(starts, [0, 1]);
  assert.equal(result.observations.length, 2);
  assert.equal(result.collection.coverage_status, 'complete');
});

test('ER-1 rejects invalid configuration before network activity', async () => {
  let called = false;
  await assert.rejects(() => collectSearchConsoleObservations({ request: { ...gscRequest, start_date: 'bad' }, token: 'x', fetchImpl: async () => { called = true; return json({ rows: [] }); } }), /start_date/);
  assert.equal(called, false);
});

test('ER-2 retains query/page lineage and bounded longitudinal comparison', async () => {
  const make = (request) => collectSearchConsoleObservations({ request, token: 'x', fetchImpl: async () => json({ rowCount: 1, rows: [{ keys: ['q', 'https://example.test/a'], impressions: 10, clicks: 1, ctr: 0.1, position: 12 }] }) });
  const first = (await make(gscRequest)).observations[0];
  const later = (await make({ ...gscRequest, start_date: '2026-09-08', end_date: '2026-09-14' })).observations[0];
  const compared = compareSearchDiscoveryObservations(first, later);
  assert.equal(compared.status, 'PARTIALLY_COMPARABLE');
  assert.equal(compared.dimensions.query, 'match');
  assert.equal(compared.dimensions.page, 'match');
  assert.equal(pagesForQuery([first], 'q')[0].data.page, 'https://example.test/a');
  assert.equal(queriesForPage([first], 'https://example.test/a')[0].data.query, 'q');
  const changedFilter = (await make({ ...gscRequest, filters: { device: 'MOBILE' } })).observations[0];
  assert.equal(compareSearchDiscoveryObservations(first, changedFilter).status, 'NOT_COMPARABLE');
});

function promptSet(version = 1, prompts = ['Which platform is best?']) {
  return createPromptSet({
    prompt_set_id: 'PS-REPRESENTATION', prompt_set_version: version,
    purpose: 'Fixture representation observation', generation_method: 'human_authored', generation_method_version: '1.0.0',
    generation_input: { source: 'fixture' }, generated_at: '2026-09-20T12:00:00Z', sampling_method: 'declared_fixture',
    included_prompts: prompts.map((prompt_text) => ({ prompt_text, locale: 'en-US' })), excluded_prompts: [], intended_population: 'fixture buyer questions', limitations: [],
  });
}

test('ER-3 prompt populations are order-independent, immutable, and versioned', () => {
  const first = promptSet(1, ['A question', 'Another question']);
  const reordered = promptSet(1, ['Another question', 'A question']);
  assert.equal(first.prompt_set_hash, reordered.prompt_set_hash);
  assert.deepEqual(verifyPromptSet(first), { valid: true, failures: [] });
  assert.throws(() => createPromptSet({ ...first, purpose: 'changed' }, { previous: first }), /immutable/);
  const changed = promptSet(2, ['A materially changed question']);
  assert.notEqual(first.prompt_set_hash, changed.prompt_set_hash);
  assert.notEqual(first.included_prompts[0].prompt_id, changed.included_prompts[0].prompt_id);
  assert.equal(comparePromptSets(first, reordered).status, 'COMPARABLE');
  assert.equal(comparePromptSets(first, changed).status, 'NOT_COMPARABLE');
});

test('ER-3 complete execution is bounded to the declared prompt set', async () => {
  const set = promptSet(3, ['One', 'Two']);
  const result = await collectRepresentationObservations({ promptSet: set, provider: 'fixture-ai', product: 'chat', surface: 'api', evidenceOrigin: 'RECORDED_FIXTURE', adapter: async (prompt) => ({ body: { answer_text: `Answer for ${prompt.prompt_text}`, citations: [] }, raw: JSON.stringify({ prompt_id: prompt.prompt_id }) }) });
  assert.deepEqual(result.coverage, { declared: 2, executed: 2, failed: 0, coverage_status: 'complete_for_declared_prompt_set' });
  assert.equal(result.observations[0].data.prompt_set.prompt_set_version, 3);
  assert.equal(result.observations[0].data.evidence_origin, 'RECORDED_FIXTURE');
});

test('ER-4 keeps mention, domain mention, domain citation, and URL citation distinct', () => {
  const set = promptSet();
  const item = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: set.included_prompts[0], promptSet: set, model: { status: 'UNKNOWN' }, evidenceOrigin: 'RECORDED_FIXTURE', brand: 'Example', firstPartyDomains: ['example.test'], response: { answer_text: 'Example is mentioned, but competitor.test is cited.', mentions: ['Example'], citations: [{ url: 'https://competitor.test/page' }], provider_metadata: { request_id: 'r1', api_key: 'secret-token' } }, rawResponse: '{"fixture":true}' });
  assert.equal(item.data.representation.brand_mentioned, true);
  assert.equal(item.data.representation.domain_mentioned, false);
  assert.equal(item.data.representation.domain_cited, false);
  assert.deepEqual(item.data.representation.cited_urls, ['https://competitor.test/page']);
  assert.deepEqual(item.data.representation.cited_domains, ['competitor.test']);
  assert.equal(item.data.model.status, 'UNKNOWN');
  assert.equal(JSON.stringify(item).includes('secret-token'), false);
});

test('ER-4 preserves exact first-party URL citations and response identity', () => {
  const set = promptSet();
  const item = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: set.included_prompts[0], promptSet: set, evidenceOrigin: 'RECORDED_FIXTURE', brand: 'Example', firstPartyDomains: ['example.test'], response: { answer_text: 'Example is useful.', citations: ['https://example.test/docs', 'https://example.test/docs'] }, rawResponse: '{"answer_text":"Example is useful."}' });
  assert.equal(item.data.representation.domain_cited, true);
  assert.deepEqual(item.data.representation.cited_urls, ['https://example.test/docs']);
  assert.match(item.data.response.response_hash, /^[a-f0-9]{64}$/);
});

test('ER-4 failures and parser errors never become no-mention or no-citation observations', async () => {
  const set = promptSet(1, ['One', 'Two', 'Three']);
  const result = await collectRepresentationObservations({ promptSet: set, provider: 'fixture-ai', evidenceOrigin: 'RECORDED_FIXTURE', adapter: async (prompt) => {
    if (prompt.prompt_text === 'One') return { status: 'refused', raw: '{"error":"refused"}' };
    if (prompt.prompt_text === 'Two') return { status: 'malformed', raw: 'not-json' };
    throw new Error('timeout');
  } });
  assert.deepEqual(result.coverage, { declared: 3, executed: 0, failed: 3, coverage_status: 'incomplete' });
  assert.ok(result.observations.every((item) => item.data.representation.brand_mentioned === null && item.data.representation.domain_cited === null));
  assert.ok(result.observations.some((item) => ['malformed', 'parser_failed'].includes(item.data.response.status)));
  assert.ok(result.observations.some((item) => item.data.response.status === 'refused'));
  const malformedCitation = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: set.included_prompts[0], promptSet: set, response: { answer_text: 'Example', citations: [{ url: 'not-a-url' }] }, rawResponse: 'bad-citation', evidenceOrigin: 'RECORDED_FIXTURE' });
  assert.equal(malformedCitation.data.response.status, 'parser_failed');
  assert.equal(malformedCitation.data.representation.domain_cited, null);
});

test('ER-4 HTTP adapter is executable, HTTPS-only, and redacts credentials from evidence', async () => {
  assert.throws(() => createHttpRepresentationAdapter({ endpoint: 'http://insecure.test' }), /HTTPS/);
  const adapter = createHttpRepresentationAdapter({ endpoint: 'https://provider.test/respond', accessToken: 'secret-token', fetchImpl: async (_url, options) => { assert.equal(options.headers.authorization, 'Bearer secret-token'); return json({ answer_text: 'Example', citations: [] }); } });
  const set = promptSet();
  const result = await collectRepresentationObservations({ promptSet: set, provider: 'fixture-provider', evidenceOrigin: 'SYNTHETIC_TEST', adapter, brand: 'Example' });
  assert.equal(result.observations[0].data.response.status, 'succeeded');
  assert.equal(JSON.stringify(result.observations[0]).includes('secret-token'), false);
});

test('ER-4 representation comparison preserves prompt/provider/model changes', () => {
  const firstSet = promptSet(1);
  const secondSet = promptSet(2);
  const first = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: firstSet.included_prompts[0], promptSet: firstSet, model: 'model-a', executionConfiguration: { id: 'cfg', version: '1' }, response: { answer_text: 'Example', citations: [] }, rawResponse: 'a', evidenceOrigin: 'RECORDED_FIXTURE' });
  const same = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: firstSet.included_prompts[0], promptSet: firstSet, model: 'model-a', executionConfiguration: { id: 'cfg', version: '1' }, response: { answer_text: 'Example later', citations: [] }, rawResponse: 'b', evidenceOrigin: 'RECORDED_FIXTURE' });
  assert.equal(compareRepresentationObservations(first, same).status, 'COMPARABLE');
  const changed = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: secondSet.included_prompts[0], promptSet: secondSet, model: 'model-b', executionConfiguration: { id: 'cfg', version: '1' }, response: { answer_text: 'Example', citations: [] }, rawResponse: 'c', evidenceOrigin: 'RECORDED_FIXTURE' });
  assert.equal(compareRepresentationObservations(first, changed).status, 'NOT_COMPARABLE');
  const unknownModel = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: firstSet.included_prompts[0], promptSet: firstSet, model: { status: 'UNKNOWN' }, executionConfiguration: { id: 'cfg', version: '1' }, response: { answer_text: 'Example', citations: [] }, rawResponse: 'd', evidenceOrigin: 'RECORDED_FIXTURE' });
  assert.equal(compareRepresentationObservations(first, unknownModel).status, 'PARTIALLY_COMPARABLE');
});

test('ER-4 provider-scoped observation can support a bounded claim but not a universal claim', () => {
  const set = promptSet();
  const observation = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: set.included_prompts[0], promptSet: set, brand: 'Example', response: { answer_text: 'Example is mentioned.', citations: [] }, rawResponse: 'fixture', evidenceOrigin: 'RECORDED_FIXTURE' });
  const bounded = createEvidenceClaim({ claim_id: 'CLAIM-REP-BOUNDED', claim_version: 1, proposition: 'The fixture provider mentioned Example for this prompt.', declared_scope: { type: 'observation', observation_reference: observation.observation_id, generalization: 'bounded' }, evidence_references: [observation.observation_id], observation_references: [observation.observation_id], dataset_references: [], derivation_references: [], assertion: { type: 'predicate', path: 'data.representation.brand_mentioned', operator: 'equals', value: true }, limitations: [] });
  assert.equal(verifyClaim(bounded, { observations: [observation] }).overall, 'SUPPORTED');
  const universal = createEvidenceClaim({ ...bounded, claim_id: 'CLAIM-REP-UNIVERSAL', declared_scope: { ...bounded.declared_scope, generalization: 'universal' } });
  assert.notEqual(verifyClaim(universal, { observations: [observation] }).overall, 'SUPPORTED');
});

test('ER-4 tampering fails external observation verification', () => {
  const set = promptSet();
  const observation = normalizeRepresentationResponse({ provider: 'fixture-ai', product: 'chat', surface: 'api', prompt: set.included_prompts[0], promptSet: set, response: { answer_text: 'Example', citations: [] }, rawResponse: 'fixture', evidenceOrigin: 'RECORDED_FIXTURE' });
  const tampered = { ...observation, data: { ...observation.data, representation: { ...observation.data.representation, brand_mentioned: true } } };
  assert.equal(verifyRepresentationObservation(tampered).valid, false);
});
