import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlerIdentity } from '../../src/observations/crawlerIdentity.js';
import {
  OFFICIAL_PROVIDER_RANGES,
  identifyCrawlerProvider,
  matchIpInCidrs,
  verifyCrawlerIp,
  verifyCrawlerLog,
  fetchProviderIpRanges,
} from '../../src/crawler/ipRanges.js';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

test('OFFICIAL_PROVIDER_RANGES: provides published CIDRs for major search and AI crawlers', () => {
  assert.ok(OFFICIAL_PROVIDER_RANGES.google);
  assert.ok(OFFICIAL_PROVIDER_RANGES.bing);
  assert.ok(OFFICIAL_PROVIDER_RANGES.openai);
  assert.ok(OFFICIAL_PROVIDER_RANGES.perplexity);
  assert.ok(OFFICIAL_PROVIDER_RANGES.anthropic);

  assert.equal(identifyCrawlerProvider('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'google');
  assert.equal(identifyCrawlerProvider('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), 'bing');
  assert.equal(identifyCrawlerProvider('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)'), 'openai');
  assert.equal(identifyCrawlerProvider('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'), 'anthropic');
  assert.equal(identifyCrawlerProvider('Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'), 'perplexity');
  assert.equal(identifyCrawlerProvider('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), null);
});

test('matchIpInCidrs: matches IPv4 and IPv6 addresses accurately against CIDRs', () => {
  const cidrs = ['66.249.64.0/19', '2001:4860:4801::/48'];
  assert.equal(matchIpInCidrs('66.249.66.1', cidrs).matched, true);
  assert.equal(matchIpInCidrs('66.249.66.1', cidrs).matchedCidr, '66.249.64.0/19');
  assert.equal(matchIpInCidrs('2001:4860:4801::1234', cidrs).matched, true);
  assert.equal(matchIpInCidrs('198.51.100.1', cidrs).matched, false);
  assert.equal(matchIpInCidrs('invalid-ip', cidrs).matched, false);
});

test('crawlerIdentity: seamlessly uses built-in official provider ranges when not provided', () => {
  const result = crawlerIdentity({
    user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    source_ip: '66.249.66.1',
    status: 200,
  });

  assert.equal(result.provider, 'Google');
  assert.equal(result.cidr_membership, 'matched');
  assert.equal(result.range_source.authority, 'provider_published');
  assert.equal(result.range_source.checksum_valid, true);
  assert.ok(result.stages.includes('range_matched'));

  const validation = validateAgainst('crawler-identity.schema.json', result);
  assert.equal(validation.valid, true, validation.errors?.join('; '));
});

test('verifyCrawlerLog: flags impostor bots claiming official user agent from unverified IPs', () => {
  const logs = [
    { source_ip: '66.249.66.1', user_agent: 'Googlebot/2.1' }, // genuine Googlebot
    { source_ip: '198.51.100.99', user_agent: 'Googlebot/2.1' }, // impostor Googlebot
    { source_ip: '20.15.240.65', user_agent: 'GPTBot/1.0' }, // genuine GPTBot
    { source_ip: '1.2.3.4', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }, // regular user
  ];

  const analysis = verifyCrawlerLog(logs);
  assert.equal(analysis.total_evaluated, 4);
  assert.equal(analysis.known_provider_requests, 3);
  assert.equal(analysis.verified_requests, 2);
  assert.equal(analysis.impostor_requests, 1);
  assert.equal(analysis.unrecognized_requests, 1);
  assert.equal(analysis.impostors.length, 1);
  assert.equal(analysis.impostors[0].ip, '198.51.100.99');
  assert.equal(analysis.impostors[0].claimed_provider, 'Google');
});

test('fetchProviderIpRanges: retrieves provider ranges with mock fetch and computes sha256 checksum', async () => {
  const mockPayload = {
    prefixes: [
      { ipv4Prefix: '20.15.240.64/28' },
      { ipv4Prefix: '20.15.240.80/28' },
    ],
  };

  const mockFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify(mockPayload),
  });

  const res = await fetchProviderIpRanges('openai', { fetchImpl: mockFetch });
  assert.equal(res.provider, 'OpenAI');
  assert.equal(res.cidrs.length, 2);
  assert.ok(res.checksum);
  assert.ok(res.retrieved_at);
});
