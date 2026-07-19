import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceAuthority } from '../../src/observations/authority.js';
import { crawlerIdentity } from '../../src/observations/crawlerIdentity.js';
import { sha256 } from '../../src/shared/io.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

test('evidence authority preserves four independent axes', () => {
  const owner = evidenceAuthority('owner_import');
  assert.deepEqual(owner, {
    source_authority: 'owner_controlled', collection_authority: 'owner_export',
    authenticity_status: 'checksum_protected_only', representativeness: 'unknown',
  });
  assert.equal(validateAgainst('evidence-authority.schema.json', owner).valid, true);
  assert.equal(validateAgainst('evidence-authority.schema.json', { ...owner, representativeness: 'authoritative' }).valid, false);
});

test('CIDR match alone is range_matched, never fully_verified', () => {
  const ranges = { TestBot: ['203.0.113.0/24'] };
  const result = crawlerIdentity({ provider: 'Test', user_agent: 'TestBot', source_ip: '203.0.113.4', status: 200 }, { ranges });
  assert.equal(result.cidr_membership, 'matched');
  assert.equal(result.verification_status, 'range_matched');
  assert.ok(result.stages.includes('insufficient_evidence'));
  assert.ok(!result.stages.includes('fully_verified'));
});

test('full crawler identity requires source provenance, DNS, edge, and origin evidence', () => {
  const cidrs = ['203.0.113.0/24'];
  const result = crawlerIdentity({
    provider: 'Test', user_agent: 'TestBot', source_ip: '203.0.113.4', status: 200,
    dns_status: 'verified', dns_method: 'forward-confirmed reverse DNS',
    edge_observed: true, edge_decision: 'allow', origin_observed: true, origin_status: 200,
  }, { ranges: { TestBot: cidrs }, rangeSources: { TestBot: { provider: 'Test', authority: 'provider_published', url: 'https://provider.test/ranges.json', retrieved_at: '2026-07-18T00:00:00Z', source_snapshot: cidrs, checksum: sha256(JSON.stringify(cidrs)) } }, collector: 'edge-correlator' });
  assert.equal(result.verification_status, 'fully_verified');
  assert.ok(result.stages.includes('fully_verified'));
});

test('mismatched identity claims are contradictory', () => {
  const result = crawlerIdentity({ provider: 'Test', user_agent: 'TestBot', source_ip: '198.51.100.2', status: 200, claimed_verified: true }, { ranges: { TestBot: ['203.0.113.0/24'] } });
  assert.equal(result.verification_status, 'contradictory');
});

test('synthetic events and owner-controlled ranges cannot become fully verified', () => {
  const cidrs = ['203.0.113.0/24'];
  const source = { provider: 'Test', authority: 'owner_controlled', url: 'https://owner.test/ranges.json', retrieved_at: '2026-07-18T00:00:00Z', source_snapshot: cidrs, checksum: sha256(JSON.stringify(cidrs)) };
  const result = crawlerIdentity({ provider: 'Test', synthetic: true, user_agent: 'TestBot', source_ip: '203.0.113.4', dns_status: 'verified', dns_method: 'test', edge_observed: true, origin_observed: true, origin_status: 200 }, { ranges: { TestBot: cidrs }, rangeSources: { TestBot: source } });
  assert.notEqual(result.verification_status, 'fully_verified');
  assert.ok(result.stages.includes('insufficient_evidence'));
});
