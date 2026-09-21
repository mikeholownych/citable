import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPromptSet } from '../../src/representation/prompts.js';
import { collectRepresentationObservations, normalizeRepresentationResponse } from '../../src/representation/representation.js';
import { createEvidenceClaim, verifyClaim, compareExternalObservations } from '../../src/evidence/external.js';
import {
  assessPropositionSupport,
  citationsForExecution,
  citationsForProposition,
  createCitationObservation,
  createCitationObservations,
  createResponseSpan,
  createSourceRetrievalObservation,
  deriveRepresentationPrevalence,
  evidenceForProposition,
  sourceForCitation,
  verifyCitationObservation,
} from '../../src/representation/provenance.js';
import {
  compareCompetitorRepresentations,
  createCompetitorRepresentationObservation,
  representationsForEntity,
  resolveObservedEntity,
  verifyCompetitorRepresentationObservation,
} from '../../src/representation/competitors.js';

function promptSet(version = 1, text = 'What is the fixture product?') {
  return createPromptSet({
    prompt_set_id: 'ER5-ER6-FIXTURE', prompt_set_version: version,
    purpose: 'Citation provenance and competitor representation fixtures',
    generation_method: 'human_authored', generation_method_version: '1.0.0',
    generation_input: { fixture: 'citation-provenance' }, generated_at: '2026-09-20T12:00:00Z',
    sampling_method: 'declared_fixture', included_prompts: [{ prompt_text: text, locale: 'en-US' }],
    excluded_prompts: [], intended_population: 'deterministic fixture', limitations: [],
  });
}

function execution({ answer = 'The Repair Sprint costs $97 and is delivered within 48 hours.', citations = [], status = 'succeeded', provider = 'fixture-ai', version = 1 } = {}) {
  const set = promptSet(version);
  if (status !== 'succeeded') return normalizeRepresentationResponse({ provider, product: 'fixture', surface: 'api', prompt: set.included_prompts[0], promptSet: set, response: { answer_text: answer || '' }, rawResponse: `${status}-raw`, evidenceOrigin: 'SYNTHETIC_TEST' });
  return normalizeRepresentationResponse({ provider, product: 'fixture', surface: 'api', prompt: set.included_prompts[0], promptSet: set, response: { answer_text: answer, citations }, rawResponse: { answer, citations }, evidenceOrigin: 'SYNTHETIC_TEST', retainRawResponse: true });
}

function citationFor(executionItem, { marker = '[1]', displayedUrl = 'https://displayed.test/a', resolvedUrl = 'https://source.test/final', propositionText = null, ordinal = 1, support = null } = {}) {
  const text = executionItem.data.response.provider_metadata.raw_response?.answer || executionItem.data.response.provider_metadata.raw_response?.answer_text || 'The Repair Sprint costs $97 and is delivered within 48 hours.';
  const span = createResponseSpan({ execution: executionItem, start: 0, end: text.length, text });
  return createCitationObservation({
    execution: executionItem, span,
    citation: { ordinal, raw_marker: marker, placement: 'inline', displayed_url: displayedUrl, displayed_domain: 'displayed.test' },
    source: { resolved_url: resolvedUrl },
    proposition: { text: propositionText || text },
    support,
    evidenceOrigin: 'SYNTHETIC_TEST', observedAt: '2026-09-20T12:01:00Z',
  });
}

test('ER-5 preserves exact response spans and the citation/source state ladder', () => {
  const item = execution();
  const citation = citationFor(item, { displayedUrl: 'https://displayed.test/card', resolvedUrl: 'https://source.test/final' });
  assert.equal(citation.data.span.text, 'The Repair Sprint costs $97 and is delivered within 48 hours.');
  assert.equal(citation.data.citation.displayed_url, 'https://displayed.test/card');
  assert.equal(citation.data.source.resolved_url, 'https://source.test/final');
  assert.notEqual(citation.data.citation.displayed_url, citation.data.source.resolved_url);
  assert.equal(citation.data.retrieval.status, 'NOT_ATTEMPTED');
  assert.equal(citationsForExecution([citation], item.observation_id).length, 1);
  assert.equal(citationsForProposition([citation], citation.data.proposition.proposition_id).length, 1);
  assert.equal(verifyCitationObservation(citation).valid, true);
  assert.throws(() => createResponseSpan({ execution: item, start: 0, end: 2, text: 'wrong' }), /bound/);
});

test('ER-5 keeps source retrieval, relevance, and support independently observable', () => {
  const item = execution();
  const citation = citationFor(item);
  const supporting = createSourceRetrievalObservation({ citation, url: 'https://source.test/final', body: 'The Repair Sprint costs $97.', relevanceStatus: 'RELEVANT', supportStatus: 'SUPPORTED', evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(supporting.data.content.observed, true);
  assert.equal(assessPropositionSupport({ retrieval: supporting, relevanceStatus: 'RELEVANT', supportStatus: 'SUPPORTED' }).status, 'SUPPORTED');
  assert.equal(sourceForCitation([supporting], citation.observation_id).observation_id, supporting.observation_id);
  assert.equal(evidenceForProposition([supporting], citation.data.proposition.proposition_id, [citation]).length, 1);

  const irrelevant = createSourceRetrievalObservation({ citation, url: 'https://source.test/irrelevant', body: 'Other information.', relevanceStatus: 'IRRELEVANT', supportStatus: 'SUPPORTED', evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(assessPropositionSupport({ retrieval: irrelevant, relevanceStatus: 'IRRELEVANT', supportStatus: 'SUPPORTED' }).status, 'UNSUPPORTED');
  const failed = createSourceRetrievalObservation({ citation, url: 'https://source.test/unavailable', status: 'FAILED', evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(assessPropositionSupport({ retrieval: failed, relevanceStatus: 'RELEVANT', supportStatus: 'SUPPORTED' }).status, 'INDETERMINATE');
  const contradicted = createSourceRetrievalObservation({ citation, url: 'https://source.test/contradiction', body: 'The Repair Sprint costs $12.', relevanceStatus: 'RELEVANT', supportStatus: 'CONTRADICTED', evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(assessPropositionSupport({ retrieval: contradicted, relevanceStatus: 'RELEVANT', supportStatus: 'CONTRADICTED' }).status, 'CONTRADICTED');
});

test('ER-5 claim.verify consumes citation support without upgrading scope or provider repetition', () => {
  const item = execution();
  const citation = citationFor(item, { support: { relevance_status: 'RELEVANT', support_status: 'SUPPORTED' } });
  const bounded = createEvidenceClaim({
    claim_id: 'CLAIM-CITATION-BOUNDED', claim_version: 1,
    proposition: 'The provider response proposition has bounded source support.',
    declared_scope: { type: 'observation', observation_reference: citation.observation_id, generalization: 'bounded' },
    evidence_references: [citation.observation_id], observation_references: [citation.observation_id], dataset_references: [], derivation_references: [],
    assertion: { type: 'predicate', path: 'data.support.support_status', operator: 'equals', value: 'SUPPORTED' }, limitations: [],
  });
  assert.equal(verifyClaim(bounded, { observations: [citation] }).overall, 'SUPPORTED');
  const universal = createEvidenceClaim({ ...bounded, claim_id: 'CLAIM-CITATION-UNIVERSAL', declared_scope: { ...bounded.declared_scope, generalization: 'universal' } });
  const result = verifyClaim(universal, { observations: [citation] });
  assert.notEqual(result.overall, 'SUPPORTED');
  assert.equal(result.scope_support, 'UNSUPPORTED');
});

test('ER-5 separates two propositions in one response and does not attach one citation to both', () => {
  const answer = 'Nebula costs $97 and delivers the fix within 48 hours.';
  const item = execution({ answer });
  const firstText = 'Nebula costs $97.';
  const secondText = 'delivers the fix within 48 hours.';
  const first = createCitationObservation({ execution: item, span: createResponseSpan({ execution: item, start: 0, end: firstText.length, text: firstText }), citation: { ordinal: 1, raw_marker: '[1]', placement: 'inline', displayed_url: 'https://source.test/price' }, proposition: { proposition_id: 'PRICE', text: firstText }, source: { resolved_url: 'https://source.test/price' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  const secondStart = answer.indexOf(secondText);
  const second = createCitationObservation({ execution: item, span: createResponseSpan({ execution: item, start: secondStart, end: answer.length, text: secondText }), citation: { ordinal: 2, raw_marker: '[2]', placement: 'inline', displayed_url: 'https://source.test/delivery' }, proposition: { proposition_id: 'DELIVERY', text: 'Nebula delivers the fix within 48 hours.' }, source: { resolved_url: 'https://source.test/delivery' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.notEqual(first.data.proposition.proposition_id, second.data.proposition.proposition_id);
  assert.equal(citationsForProposition([first, second], 'PRICE').length, 1);
  assert.equal(citationsForProposition([first, second], 'DELIVERY').length, 1);
});

test('ER-5 preserves unknown markers, tracking URLs, domain-vs-URL distinctions, and duplicate protection', () => {
  const item = execution({ answer: 'Example is mentioned.', citations: [] });
  const unknown = citationFor(item, { marker: '<citation src="4"></citation>', displayedUrl: null, resolvedUrl: null });
  assert.equal(unknown.data.citation.raw_marker, '<citation src="4"></citation>');
  assert.equal(unknown.data.source.identity_status, 'NOT_IDENTIFIED');
  const tracked = citationFor(item, { displayedUrl: 'https://example.test/page?utm_source=chatgpt.com', resolvedUrl: 'https://example.test/page' });
  assert.equal(tracked.data.citation.displayed_url.includes('utm_source=chatgpt.com'), true);
  assert.equal(tracked.data.source.resolved_url, 'https://example.test/page');
  assert.throws(() => createCitationObservations({ execution: item, span: tracked.data.span, citations: [{ ordinal: 1, raw_marker: '[1]', placement: 'inline', displayed_domain: 'example.test' }, { ordinal: 1, raw_marker: '[1]', placement: 'inline', displayed_domain: 'example.test' }], proposition: { text: 'Example is mentioned.' }, source: {}, evidenceOrigin: 'SYNTHETIC_TEST' }), /duplicate citation/);
});

test('ER-5 prevalence excludes refusals/interstitials and never asserts truth by repetition', async () => {
  const set = promptSet(4);
  const result = await collectRepresentationObservations({ promptSet: set, provider: 'fixture-ai', evidenceOrigin: 'SYNTHETIC_TEST', brand: 'Example', adapter: async () => ({ body: { answer_text: 'Example is represented.', citations: [] } }) });
  const failed = (await collectRepresentationObservations({ promptSet: set, provider: 'fixture-ai', evidenceOrigin: 'SYNTHETIC_TEST', adapter: async () => ({ status: 'refused', raw: 'safety interstitial' }) })).observations[0];
  const derivation = deriveRepresentationPrevalence([...result.observations, failed]);
  assert.equal(derivation.result.denominator, 1);
  assert.deepEqual(derivation.result.excluded_observation_references, [failed.observation_id]);
  assert.equal(derivation.result.population_scope, 'successful_representation_executions_in_supplied_observations');
  const claim = createEvidenceClaim({ claim_id: 'CLAIM-REPEATED', claim_version: 1, proposition: 'All providers state the proposition.', declared_scope: { type: 'observation', observation_reference: result.observations[0].observation_id, generalization: 'universal' }, evidence_references: [result.observations[0].observation_id], observation_references: [result.observations[0].observation_id], dataset_references: [], derivation_references: [], assertion: { type: 'predicate', path: 'data.representation.brand_mentioned', operator: 'equals', value: true }, limitations: [] });
  assert.notEqual(verifyClaim(claim, { observations: result.observations }).overall, 'SUPPORTED');
});

test('ER-5 tampered citation/source evidence fails closed', () => {
  const item = execution();
  const citation = citationFor(item);
  const tampered = { ...citation, data: { ...citation.data, source: { ...citation.data.source, resolved_url: 'https://evil.test' } } };
  assert.equal(verifyCitationObservation(tampered).valid, false);
  const source = createSourceRetrievalObservation({ citation, url: 'https://source.test/final', body: 'supported', relevanceStatus: 'RELEVANT', supportStatus: 'SUPPORTED', evidenceOrigin: 'SYNTHETIC_TEST' });
  const tamperedSource = { ...source, data: { ...source.data, content: { ...source.data.content, content_hash: '0'.repeat(64) } } };
  assert.equal(assessPropositionSupport({ retrieval: tamperedSource, relevanceStatus: 'RELEVANT', supportStatus: 'SUPPORTED' }).status, 'INDETERMINATE');
});

test('ER-6 preserves entity ambiguity and representation type without business conclusions', () => {
  const item = execution({ answer: 'Acme is an alternative to Example.' });
  const span = createResponseSpan({ execution: item, start: 0, end: item.data.response.provider_metadata.raw_response.answer.length, text: item.data.response.provider_metadata.raw_response.answer });
  const ambiguous = createCompetitorRepresentationObservation({ execution: item, span, entity: resolveObservedEntity({ observedName: 'Acme' }), representation: { type: 'ALTERNATIVE', observed_text: 'Acme is an alternative to Example.' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(ambiguous.data.entity.resolution_status, 'AMBIGUOUS');
  assert.equal(ambiguous.data.representation.type, 'ALTERNATIVE');
  assert.equal(verifyCompetitorRepresentationObservation(ambiguous).valid, true);
  assert.equal(representationsForEntity([ambiguous], 'Acme').length, 0);
  const resolved = createCompetitorRepresentationObservation({ execution: item, span, entity: resolveObservedEntity({ observedName: 'Acme', domain: 'https://acme.test', entityId: 'ENTITY-ACME', resolutionMethod: 'supplied_domain' }), representation: { type: 'CITED_SOURCE', observed_text: 'Acme is cited.' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(representationsForEntity([resolved], 'ENTITY-ACME').length, 1);
  assert.ok(compareCompetitorRepresentations(resolved, resolved).status);
});

test('ER-6 preserves separate executions and changed prompt populations as non-equivalent', () => {
  const first = execution({ provider: 'fixture-ai', version: 1 });
  const second = execution({ provider: 'fixture-ai', version: 2 });
  const firstSpan = createResponseSpan({ execution: first, start: 0, end: first.data.response.provider_metadata.raw_response.answer.length, text: first.data.response.provider_metadata.raw_response.answer });
  const secondSpan = createResponseSpan({ execution: second, start: 0, end: second.data.response.provider_metadata.raw_response.answer.length, text: second.data.response.provider_metadata.raw_response.answer });
  const a = createCompetitorRepresentationObservation({ execution: first, span: firstSpan, entity: { entity_id: 'ENTITY-A', observed_name: 'Acme', resolution_status: 'RESOLVED', resolution_method: 'fixture' }, representation: { type: 'MENTION', observed_text: firstSpan.text }, evidenceOrigin: 'SYNTHETIC_TEST' });
  const b = createCompetitorRepresentationObservation({ execution: second, span: secondSpan, entity: { entity_id: 'ENTITY-A', observed_name: 'Acme', resolution_status: 'RESOLVED', resolution_method: 'fixture' }, representation: { type: 'MENTION', observed_text: secondSpan.text }, evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(compareCompetitorRepresentations(a, b).status, 'NOT_COMPARABLE');
});

test('ER-5/ER-6 preserve partial support, source version limits, and unequal populations', () => {
  const item = execution({ provider: 'provider-a' });
  const citation = citationFor(item, { propositionText: 'The source contains two parts of the proposition.' });
  const partial = createSourceRetrievalObservation({ citation, url: 'https://source.test/v1', finalUrl: 'https://source.test/v1', body: 'Only the price is documented.', relevanceStatus: 'RELEVANT', supportStatus: 'PARTIALLY_SUPPORTED', evidenceOrigin: 'SYNTHETIC_TEST', limitations: ['Source version observed at T1; later source versions are not substituted.'] });
  const result = assessPropositionSupport({ retrieval: partial, relevanceStatus: 'RELEVANT', supportStatus: 'PARTIALLY_SUPPORTED' });
  assert.equal(result.status, 'PARTIALLY_SUPPORTED');
  assert.match(partial.limitations.join(' '), /T1/);
  const changedProvider = execution({ provider: 'provider-b' });
  const left = citationFor(item);
  const right = citationFor(changedProvider);
  assert.equal(compareExternalObservations(left, right).status, 'NOT_COMPARABLE');
});

test('ER-5 preserves failed/interstitial/timeout/parser-failure states as non-negative observations', async () => {
  const set = promptSet(8);
  const statuses = ['refused', 'timeout', 'malformed', 'parser_failed'];
  for (const status of statuses) {
    const result = await collectRepresentationObservations({ promptSet: set, provider: 'fixture-ai', evidenceOrigin: 'SYNTHETIC_TEST', adapter: async () => ({ status, raw: 'provider state' }) });
    assert.equal(result.observations[0].data.response.status, status);
    assert.equal(result.observations[0].data.representation.brand_mentioned, null);
    assert.equal(result.observations[0].data.representation.domain_cited, null);
  }
});

test('ER-6 does not infer competitor comparisons from co-occurrence or colliding names', () => {
  const item = execution({ answer: 'Acme and Acme are both mentioned.' });
  const text = item.data.response.provider_metadata.raw_response.answer;
  const span = createResponseSpan({ execution: item, start: 0, end: text.length, text });
  const one = createCompetitorRepresentationObservation({ execution: item, span, entity: { entity_id: null, observed_name: 'Acme', domain: null, resolution_status: 'AMBIGUOUS', resolution_method: 'name_only_not_allowed' }, representation: { type: 'MENTION', observed_text: 'Acme' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  const two = createCompetitorRepresentationObservation({ execution: item, span, entity: { entity_id: null, observed_name: 'Acme', domain: 'https://acme.example', resolution_status: 'AMBIGUOUS', resolution_method: 'domain_conflict' }, representation: { type: 'MENTION', observed_text: 'Acme' }, evidenceOrigin: 'SYNTHETIC_TEST' });
  assert.equal(one.data.entity.entity_id, null);
  assert.equal(two.data.entity.entity_id, null);
  assert.equal(representationsForEntity([one, two], 'Acme').length, 0);
  assert.equal(one.data.representation.type, 'MENTION');
  assert.notEqual(one.data.representation.type, 'COMPARISON');
});

test('ER-5/ER-6 recorded Nebula challenge corpus preserves prompt identity and interstitial execution', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../fixtures/observations/nebula-provider-executions-2026-09-20.json', import.meta.url)));
  assert.equal(corpus.prompt, 'What is Nebula Components (https://nebulacomponents.com/)? Free evidence-backed landing page audit tool');
  assert.equal(corpus.executions.length, 7);
  assert.equal(corpus.executions.filter((item) => item.status === 'succeeded').length, 6);
  assert.equal(corpus.executions.filter((item) => item.status === 'safety_interstitial').length, 1);
  assert.notEqual(corpus.executions.find((item) => item.execution_id === 'LIVE-CLAUDE-A').execution_id, corpus.executions.find((item) => item.execution_id === 'LIVE-CLAUDE-B').execution_id);
  assert.ok(corpus.executions.find((item) => item.observations.includes('mobile viewport')));
  assert.ok(corpus.executions.find((item) => item.observations.includes('mobile CTA')));
  assert.ok(corpus.executions.find((item) => item.observations.includes('181 detectors')));
});
