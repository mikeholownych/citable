import net from 'node:net';
import { sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function cidrMembership(sourceIp, cidrs) {
  if (!sourceIp) return 'not_tested';
  const family = net.isIP(sourceIp);
  if (!family) return 'invalid';
  const block = new net.BlockList();
  for (const cidr of cidrs || []) {
    const [network, prefixText] = String(cidr).split('/');
    const prefix = Number(prefixText), rangeFamily = net.isIP(network);
    if (rangeFamily === family && Number.isInteger(prefix)) block.addSubnet(network, prefix, family === 4 ? 'ipv4' : 'ipv6');
  }
  return block.check(sourceIp, family === 4 ? 'ipv4' : 'ipv6') ? 'matched' : 'not_matched';
}

export function crawlerIdentity(row, { ranges = {}, rangeSources = {}, collector = 'owner_import' } = {}) {
  const ua = row.user_agent, cidrs = ranges[ua] || [], source = rangeSources[ua] || {};
  const sourceSnapshot = source.source_snapshot;
  const expectedChecksum = sourceSnapshot == null ? null : sha256(typeof sourceSnapshot === 'string' ? sourceSnapshot : JSON.stringify(sourceSnapshot));
  const rangeSource = {
    url: source.url || null,
    retrieved_at: source.retrieved_at || null,
    authority: source.authority || 'unknown',
    checksum: source.checksum || null,
    checksum_scope: sourceSnapshot == null ? 'not_captured' : 'source_snapshot',
    checksum_valid: Boolean(source.checksum && expectedChecksum && source.checksum === expectedChecksum),
  };
  const membership = cidrMembership(row.source_ip, cidrs);
  const dns = { status: row.dns_status || 'not_tested', method: row.dns_method || null };
  const edge = { observed: row.edge_observed === true, decision: row.edge_decision || null };
  const origin = { observed: row.origin_observed === true, status: row.origin_status ?? null };
  const stages = ['declared'];
  if (row.synthetic === true) stages.push('synthetically_observed');
  if (membership === 'matched') stages.push('range_matched');
  if (dns.status === 'verified') stages.push('dns_verified');
  if (edge.observed) stages.push('edge_observed');
  if (origin.observed) stages.push('origin_observed');
  const contradictory = membership === 'not_matched' || dns.status === 'failed' || (row.claimed_verified === true && (!rangeSource.checksum_valid || membership !== 'matched'));
  const complete = identityProvider(row, source) !== 'unknown' && row.synthetic !== true && rangeSource.url && rangeSource.retrieved_at && rangeSource.authority === 'provider_published' && rangeSource.checksum_scope === 'source_snapshot' && rangeSource.checksum_valid && membership === 'matched' && dns.status === 'verified' && edge.observed && origin.observed;
  if (contradictory) stages.push('contradictory');
  else if (complete) stages.push('fully_verified');
  else stages.push('insufficient_evidence');
  const precedence = ['contradictory', 'fully_verified', 'origin_observed', 'edge_observed', 'dns_verified', 'range_matched', 'synthetically_observed', 'declared'];
  const verificationStatus = precedence.find((state) => stages.includes(state));
  const identity = {
    provider: identityProvider(row, source), declared_user_agent: ua,
    observed_source_ip: row.source_ip || null, range_source: rangeSource,
    cidr_membership: membership, dns, edge, origin, region: row.region || null,
    collector, stages, verification_status: verificationStatus,
  };
  const check = validateAgainst('crawler-identity.schema.json', identity);
  if (!check.valid) throw new Error(`crawler identity violates contract: ${check.errors.join('; ')}`);
  return identity;
}

function identityProvider(row, source) {
  return row.provider || source.provider || 'unknown';
}
