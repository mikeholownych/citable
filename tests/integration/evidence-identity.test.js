import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildSiteFromDir } from '../../src/extractor/site.js';
import { extractPage } from '../../src/extractor/page.js';
import {
  createEvidenceHashes,
  EVIDENCE_HASH_SCHEMA_VERSION,
  LEGACY_CONTENT_HASH_SEMANTICS,
  hashPageArtifact,
  pageArtifactRecord,
  evidenceIdentity,
} from '../../src/evidence/hashes.js';

const URL = 'https://identity-fixture.test/page';

function page(jsonLd = 'v1') {
  return extractPage({
    url: URL,
    html: `<html><head><script type="application/ld+json">{"@type":"Thing","name":"${jsonLd}"}</script></head><body><p>Stable extracted text for hash boundary testing.</p></body></html>`,
  });
}

test('page extraction persists named hashes with no ambiguous content hash', () => {
  const value = page();
  assert.equal(value.hash_schema_version, EVIDENCE_HASH_SCHEMA_VERSION);
  assert.match(value.response_body_hash, /^[a-f0-9]{64}$/);
  assert.match(value.extracted_text_hash, /^[a-f0-9]{64}$/);
  assert.match(value.structured_data_hash, /^[a-f0-9]{64}$/);
  assert.match(value.evidence_hash, /^[a-f0-9]{64}$/);
  assert.match(value.artifact_hash, /^[a-f0-9]{64}$/);
  assert.equal(value.rendered_dom_hash, null);
  assert.equal(Object.hasOwn(value, 'contentHash'), false);
});

test('same extracted text with changed JSON-LD changes only relevant body and structured hashes', () => {
  const a = page('v1');
  const b = page('v2');
  assert.equal(a.extracted_text_hash, b.extracted_text_hash);
  assert.notEqual(a.response_body_hash, b.response_body_hash);
  assert.notEqual(a.structured_data_hash, b.structured_data_hash);
  assert.notEqual(a.evidence_hash, b.evidence_hash);
});

test('response body hash is over exact bytes while text hash is normalized', () => {
  const a = createEvidenceHashes({ responseBody: Buffer.from('a\n b'), extractedText: 'a b' });
  const b = createEvidenceHashes({ responseBody: Buffer.from('a b'), extractedText: 'a  b' });
  assert.notEqual(a.response_body_hash, b.response_body_hash);
  assert.equal(a.extracted_text_hash, b.extracted_text_hash);
});

test('canonical evidence hash is stable across object key order and changes on tampering', () => {
  const a = createEvidenceHashes({ evidence: { z: 2, a: 1 }, artifact: { value: 'original' } });
  const b = createEvidenceHashes({ evidence: { a: 1, z: 2 }, artifact: { value: 'tampered' } });
  assert.equal(a.evidence_hash, b.evidence_hash);
  assert.notEqual(a.artifact_hash, b.artifact_hash);
});

test('missing layers remain explicit and legacy content hash semantics are named', () => {
  const value = createEvidenceHashes({ extractedText: 'text' });
  assert.equal(value.response_body_hash, null);
  assert.equal(value.rendered_dom_hash, null);
  assert.equal(value.structured_data_hash, null);
  assert.equal(value.evidence_hash, null);
  assert.equal(value.artifact_hash, null);
  assert.equal(LEGACY_CONTENT_HASH_SEMANTICS, 'extracted_text_v1');
});

test('evidence identity names the representation and refuses unavailable layers', () => {
  const value = createEvidenceHashes({ extractedText: 'text' });
  assert.equal(evidenceIdentity(value, 'extracted_text').hash, value.extracted_text_hash);
  assert.throws(() => evidenceIdentity(value, 'rendered_dom'), /unavailable/);
  assert.throws(() => evidenceIdentity(value, 'unknown'), /unknown evidence representation/);
});

test('artifact hash is bound to the persisted page record and detects record tampering', () => {
  const value = page();
  const record = { ...pageArtifactRecord(value), artifact_hash: value.artifact_hash };
  assert.equal(value.artifact_hash, hashPageArtifact(value));
  const tampered = { ...record, title: 'tampered' };
  assert.notEqual(record.artifact_hash, hashPageArtifact({ ...value, title: tampered.title }));
});

test('directory targets hash original response bytes, including non-UTF-8 bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-byte-hash-'));
  const raw = Buffer.from('<html><body><p>caf\xe9 contains enough substantive text for validity.</p></body></html>', 'binary');
  fs.writeFileSync(path.join(dir, 'index.html'), raw);
  const site = buildSiteFromDir(dir);
  const [value] = site.pages;
  assert.equal(value.response_body_hash, crypto.createHash('sha256').update(raw).digest('hex'));
  assert.notEqual(value.response_body_hash, crypto.createHash('sha256').update(raw.toString('utf8')).digest('hex'));
});
