import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createArtifactProvenance,
  verifyArtifactProvenance,
  classifyAcquisitionAuthority,
  ACQUISITION_AUTHORITIES,
  TRANSPORT_MECHANISMS,
} from '../../src/evidence/artifactProvenance.js';
import { sha256 } from '../../src/shared/io.js';

test('AC 1: synthetic fixture remains identifiable as synthetic', () => {
  const content = '<html><body>Test Synthetic Fixture</body></html>';
  const provenance = createArtifactProvenance({
    content,
    isSynthetic: true,
    transport: { mechanism: TRANSPORT_MECHANISMS.SYNTHETIC_FIXTURE, source_location: 'tests/fixtures/sample.html' },
    declaredRetrieval: { declarer: 'fixture-generator', retrieval_actor: 'test-harness' },
  });

  assert.equal(provenance.acquisition_authority, ACQUISITION_AUTHORITIES.SYNTHETIC);
  assert.equal(provenance.transport.mechanism, TRANSPORT_MECHANISMS.SYNTHETIC_FIXTURE);
  assert.equal(provenance.artifact_digest, sha256(content));
  const verification = verifyArtifactProvenance(provenance, { content });
  assert.equal(verification.valid, true);
});

test('AC 2: real external capture via file transport is NOT classified as synthetic', () => {
  const realHtml = '<html><head><title>Real News Article</title></head><body>Real production content</body></html>';
  // External capture delivered as a file on disk
  const provenance = createArtifactProvenance({
    content: realHtml,
    transport: {
      mechanism: TRANSPORT_MECHANISMS.FILE_INPUT,
      source_location: '/var/data/external_captures/2026-09-23/page.html',
    },
    declaredRetrieval: {
      declarer: 'partner_crawler_node_4',
      retrieval_actor: 'external_fetcher_v2',
      source_url: 'https://news.example.com/article/123',
      retrieved_at: '2026-09-23T20:00:00Z',
      http_status: 200,
    },
  });

  // Transport is file_input, but acquisition authority MUST NOT be SYNTHETIC
  assert.equal(provenance.transport.mechanism, TRANSPORT_MECHANISMS.FILE_INPUT);
  assert.notEqual(provenance.acquisition_authority, ACQUISITION_AUTHORITIES.SYNTHETIC);
  assert.equal(provenance.acquisition_authority, ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL);
  assert.equal(provenance.artifact_digest, sha256(realHtml));
  assert.equal(provenance.declared_retrieval.source_url, 'https://news.example.com/article/123');
  assert.equal(verifyArtifactProvenance(provenance, { content: realHtml }).valid, true);
});

test('AC 3: externally retrieved artifacts represent external acquisition; Citable does not claim retrieval', () => {
  const raw = '{"page":"data"}';
  const provenance = createArtifactProvenance({
    content: raw,
    declaredRetrieval: {
      declarer: 'nebula_collector_agent',
      retrieval_actor: 'nebula_external_crawler',
      source_url: 'https://partner.test/feed.json',
      retrieved_at: '2026-09-23T18:30:00Z',
      http_status: 200,
    },
  });

  assert.equal(provenance.acquisition_authority, ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL);
  assert.equal(provenance.declared_retrieval.retrieval_actor, 'nebula_external_crawler');
  // Citable does not inject itself as the retriever
  assert.ok(!String(provenance.declared_retrieval.retrieval_actor).toLowerCase().includes('citable'));

  // Attempting to claim DIRECT_RETRIEVAL when retrieval_actor is not Citable fails closed to UNKNOWN_PROVENANCE
  const illegitimateClaim = createArtifactProvenance({
    content: raw,
    acquisitionAuthority: ACQUISITION_AUTHORITIES.DIRECT_RETRIEVAL,
    declaredRetrieval: {
      declarer: 'untrusted_actor',
      retrieval_actor: 'third_party_crawler',
    },
  });
  assert.equal(illegitimateClaim.acquisition_authority, ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE);
});

test('AC 4: missing or insufficient acquisition provenance fails closed to UNKNOWN_PROVENANCE', () => {
  const content = 'some mysterious content without provenance';
  
  // Case A: Completely omitted declaredRetrieval
  const provA = createArtifactProvenance({
    content,
    transport: { mechanism: TRANSPORT_MECHANISMS.FILE_INPUT, source_location: 'unlabeled.bin' },
  });
  assert.equal(provA.acquisition_authority, ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE);
  assert.ok(provA.limitations[0].includes('lacks sufficient acquisition metadata'));

  // Case B: Empty declaredRetrieval object
  const provB = createArtifactProvenance({
    content,
    declaredRetrieval: {},
  });
  assert.equal(provB.acquisition_authority, ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE);

  // Case C: Forcing EXTERNAL_RETRIEVAL with empty declaredRetrieval fails closed to UNKNOWN_PROVENANCE
  const provC = createArtifactProvenance({
    content,
    acquisitionAuthority: ACQUISITION_AUTHORITIES.EXTERNAL_RETRIEVAL,
    declaredRetrieval: {},
  });
  assert.equal(provC.acquisition_authority, ACQUISITION_AUTHORITIES.UNKNOWN_PROVENANCE);
});

test('AC 5: declared retrieval facts and artifact-derived facts have distinguishable attribution', () => {
  const rawHtml = '<html><body><h1>Authentic Content</h1></body></html>';
  const computedHash = sha256(rawHtml);
  const falseDeclaredHash = '0000000000000000000000000000000000000000000000000000000000000000';

  const provenance = createArtifactProvenance({
    content: rawHtml,
    declaredRetrieval: {
      declarer: 'external_partner',
      retrieval_actor: 'partner_agent',
      source_url: 'https://example.com/target',
      retrieved_at: '2026-09-23T12:00:00Z',
      http_status: 200,
      declared_digest: falseDeclaredHash, // Tampered / contradictory declared fact
    },
  });

  // Derived facts remain objectively derived from the actual content
  assert.equal(provenance.derived_facts.digest, computedHash);
  assert.equal(provenance.artifact_digest, computedHash);
  assert.equal(provenance.derived_facts.byte_length, Buffer.byteLength(rawHtml, 'utf8'));

  // Declared facts preserve the declarer attribution exactly as provided
  assert.equal(provenance.declared_retrieval.declarer, 'external_partner');
  assert.equal(provenance.declared_retrieval.declared_digest, falseDeclaredHash);
  assert.notEqual(provenance.derived_facts.digest, provenance.declared_retrieval.declared_digest);
});

test('deterministic artifact identity: identical content yields identical artifact_id and digest', () => {
  const sampleA = 'hello world artifact';
  const sampleB = 'hello world artifact';
  const sampleC = 'different artifact';

  const provA = createArtifactProvenance({ content: sampleA, isSynthetic: true });
  const provB = createArtifactProvenance({ content: sampleB, isSynthetic: true });
  const provC = createArtifactProvenance({ content: sampleC, isSynthetic: true });

  assert.equal(provA.artifact_id, provB.artifact_id);
  assert.equal(provA.artifact_digest, provB.artifact_digest);
  assert.notEqual(provA.artifact_id, provC.artifact_id);
  assert.notEqual(provA.artifact_digest, provC.artifact_digest);
});

test('verifyArtifactProvenance detects digest mismatch and content tampering', () => {
  const content = 'genuine content';
  const provenance = createArtifactProvenance({ content, isSynthetic: true });

  // Verification passes with genuine content
  assert.equal(verifyArtifactProvenance(provenance, { content }).valid, true);

  // Verification fails with tampered content
  const tamperedResult = verifyArtifactProvenance(provenance, { content: 'tampered content' });
  assert.equal(tamperedResult.valid, false);
  assert.ok(tamperedResult.failures.some((f) => f.includes('content digest mismatch')));

  // Verification fails when object digest was mutated
  const mutatedRecord = { ...provenance, artifact_digest: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' };
  const mutatedResult = verifyArtifactProvenance(mutatedRecord, { content });
  assert.equal(mutatedResult.valid, false);
});
