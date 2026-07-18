import { defineDetector, entrySubject } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

D.push(defineDetector({
  id: 'EVD-001', name: 'Evidence past validity date', namespace: 'EVD',
  description: 'An evidence entry has passed valid_until but its verification_status is not stale/revoked.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', citation: 'medium' },
  applicable_requirement: 'Registry §6.5 valid_until; AEO §8 source revalidation',
  remediation: 'Re-validate the evidence or mark it stale and re-assess dependent claims.',
  verification: 'No verified evidence past its valid_until date.',
  check(ctx) {
    return (ctx.registries.evidence?.entries || [])
      .filter((e) => isPastDate(e.valid_until, ctx.refDate) && !['stale', 'revoked', 'inaccessible'].includes(e.verification_status))
      .map((e) => ({
        subject: entrySubject('evidence', e.evidence_id),
        summary: `Evidence "${e.title}" passed valid_until ${e.valid_until} but is still ${e.verification_status}`,
        evidence: [`valid_until: ${e.valid_until}; verification_status: ${e.verification_status}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'EVD-002', name: 'Benchmark/test evidence missing methodology', namespace: 'EVD',
  description: 'Benchmark, test-result, or dataset evidence records no methodology or measurement period.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { citation: 'medium', legal: 'medium' },
  applicable_requirement: 'AEO §8 version evidence: methodology, test date; detector spec: missing methodology / measurement period',
  remediation: 'Record methodology, test conditions, and measurement period, or downgrade dependent claims.',
  verification: 'Benchmark/test evidence entries carry methodology and measurement_period.',
  check(ctx) {
    return (ctx.registries.evidence?.entries || [])
      .filter((e) => ['benchmark', 'test_result', 'dataset'].includes(e.evidence_type))
      .filter((e) => !e.methodology || !e.measurement_period)
      .map((e) => ({
        subject: entrySubject('evidence', e.evidence_id),
        summary: `${e.evidence_type} evidence "${e.title}" lacks ${!e.methodology ? 'methodology' : ''}${!e.methodology && !e.measurement_period ? ' and ' : ''}${!e.measurement_period ? 'measurement period' : ''}`,
        evidence: [`methodology: ${e.methodology ?? 'missing'}; measurement_period: ${e.measurement_period ?? 'missing'}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'EVD-003', name: 'Claim references dangling or unverified evidence', namespace: 'EVD',
  description: 'A claim references an evidence id that does not exist or has verification_status unverified.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', maintainability: 'medium' },
  applicable_requirement: 'Referential integrity between claim and evidence registries; premise 3.5',
  remediation: 'Register and verify the evidence, or remove the reference and re-assess the claim.',
  verification: 'All claim evidence references resolve to reviewed/verified entries.',
  check(ctx) {
    const ev = new Map((ctx.registries.evidence?.entries || []).map((e) => [e.evidence_id, e]));
    const hits = [];
    for (const c of ctx.registries.claims?.entries || []) {
      for (const id of c.evidence || []) {
        const e = ev.get(id);
        if (!e) {
          hits.push({
            subject: entrySubject('claims', c.claim_id),
            summary: `Claim references unknown evidence id "${id}"`,
            evidence: [`claims/${c.claim_id} → evidence "${id}" not found`],
          });
        } else if (e.verification_status === 'unverified' && ['verified', 'verified_narrowed'].includes(c.status)) {
          hits.push({
            subject: entrySubject('claims', c.claim_id),
            summary: `Verified claim relies on unverified evidence "${id}"`,
            evidence: [`evidence/${id}: verification_status=unverified`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'EVD-004', name: 'Secondary evidence where primary is required', namespace: 'EVD',
  description: 'A performance or security claim is supported only by secondary evidence (e.g., third-party articles).',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', citation: 'medium' },
  applicable_requirement: 'Detector spec: secondary evidence used where primary evidence is required; AEO §4 primary sources where available',
  remediation: 'Produce primary evidence (test result, architecture spec, certification) or narrow the claim.',
  verification: 'Performance/security claims have at least one primary evidence entry.',
  check(ctx) {
    const ev = new Map((ctx.registries.evidence?.entries || []).map((e) => [e.evidence_id, e]));
    const hits = [];
    for (const c of (ctx.registries.claims?.entries || []).filter((c) => ['performance', 'security'].includes(c.claim_type) && (c.evidence || []).length > 0)) {
      const kinds = (c.evidence || []).map((id) => ev.get(id)).filter(Boolean);
      if (kinds.length > 0 && kinds.every((e) => e.primary_or_secondary === 'secondary')) {
        hits.push({
          subject: entrySubject('claims', c.claim_id),
          summary: `${c.claim_type} claim supported only by secondary evidence`,
          evidence: kinds.map((e) => `${e.evidence_id}: ${e.evidence_type} (secondary)`),
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'EVD-005', name: 'Customer evidence lacks attribution', namespace: 'EVD',
  description: 'Customer-reference or case-study evidence has no attribution recorded.',
  discipline: ['aeo', 'geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { reputational: 'medium', legal: 'medium' },
  applicable_requirement: 'Detector spec: customer evidence lacks attribution; premise 3.6 no fabricated customers',
  remediation: 'Record attribution (who, role, permission status) or mark the evidence anonymous-by-consent with reviewer sign-off.',
  verification: 'Customer evidence entries carry attribution or a documented consent basis.',
  check(ctx) {
    return (ctx.registries.evidence?.entries || [])
      .filter((e) => ['customer_reference', 'case_study'].includes(e.evidence_type) && !e.attribution && !e.reviewer)
      .map((e) => ({
        subject: entrySubject('evidence', e.evidence_id),
        summary: `Customer evidence "${e.title}" has no attribution and no reviewer`,
        evidence: ['attribution: missing; reviewer: missing'],
      }));
  },
}));

D.push(defineDetector({
  id: 'EVD-006', name: 'Evidence integrity hash absent', namespace: 'EVD',
  description: 'Primary evidence (test results, benchmarks, datasets, certifications) has no integrity hash, so later tampering or drift cannot be detected.',
  discipline: ['aeo', 'geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { maintainability: 'medium', legal: 'low' },
  applicable_requirement: 'Registry §6.5 integrity_hash; detector spec: evidence integrity hash absent where expected',
  remediation: 'Store a sha256 of the evidence artifact at verification time.',
  verification: 'Primary evidence entries carry integrity_hash.',
  check(ctx) {
    return (ctx.registries.evidence?.entries || [])
      .filter((e) => ['test_result', 'benchmark', 'dataset', 'certification'].includes(e.evidence_type) && e.primary_or_secondary === 'primary' && !e.integrity_hash)
      .map((e) => ({
        subject: entrySubject('evidence', e.evidence_id),
        summary: `Primary ${e.evidence_type} evidence "${e.title}" has no integrity hash`,
        evidence: ['integrity_hash: missing'],
      }));
  },
}));

D.push(defineDetector({
  id: 'EVD-007', name: 'Evidence marked inaccessible still supporting claims', namespace: 'EVD',
  description: 'Evidence with access_status inaccessible (or verification_status inaccessible) is still listed as supporting active claims.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', citation: 'medium' },
  applicable_requirement: 'Detector spec: evidence source inaccessible; revoked evidence still supporting published claim',
  remediation: 'Restore access to the source, replace the evidence, or downgrade dependent claims.',
  verification: 'No active claim relies solely on inaccessible evidence.',
  check(ctx) {
    const claims = new Map((ctx.registries.claims?.entries || []).map((c) => [c.claim_id, c]));
    return (ctx.registries.evidence?.entries || [])
      .filter((e) => (e.access_status === 'inaccessible' || e.verification_status === 'inaccessible') && (e.supports_claims || []).some((id) => {
        const c = claims.get(id);
        return c && !['retired', 'expired', 'prohibited'].includes(c.status);
      }))
      .map((e) => ({
        subject: entrySubject('evidence', e.evidence_id),
        summary: `Inaccessible evidence "${e.title}" still supports active claims: ${(e.supports_claims || []).join(', ')}`,
        evidence: [`access_status: ${e.access_status}; verification_status: ${e.verification_status}`],
      }));
  },
}));

export default D;
