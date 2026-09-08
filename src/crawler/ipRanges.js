import net from 'node:net';
import { sha256 } from '../shared/io.js';

/**
 * Official published IP ranges for search and AI crawlers.
 * Built-in CIDRs provide deterministic offline verification,
 * while fetchProviderIpRanges supports dynamic feed refreshing.
 */
export const OFFICIAL_PROVIDER_RANGES = {
  google: {
    name: 'Google',
    url: 'https://developers.google.com/search/apis/ipranges/googlebot.json',
    patterns: [/Googlebot/i, /Google-InspectionTool/i, /Storebot-Google/i],
    cidrs: [
      '66.249.64.0/19',
      '64.233.160.0/19',
      '72.14.192.0/18',
      '209.85.128.0/17',
      '216.239.32.0/19',
      '2001:4860:4801::/48',
      '2607:f8b0:4000::/36',
    ],
  },
  bing: {
    name: 'Bing',
    url: 'https://www.bing.com/toolbox/bingbot.json',
    patterns: [/bingbot/i, /BingPreview/i, /adidxbot/i],
    cidrs: [
      '157.55.39.0/24',
      '207.46.13.0/24',
      '40.77.167.0/24',
      '13.66.139.0/24',
      '13.66.144.0/24',
      '20.105.244.0/24',
      '2603:1030::/32',
    ],
  },
  openai: {
    name: 'OpenAI',
    url: 'https://openai.com/gptbot.json',
    patterns: [/GPTBot/i, /OAI-SearchBot/i, /ChatGPT-User/i],
    cidrs: [
      '20.15.240.64/28',
      '20.15.240.80/28',
      '20.15.240.96/28',
      '20.15.240.112/28',
      '52.230.152.0/24',
      '52.230.153.0/24',
    ],
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/perplexitybot.json',
    patterns: [/PerplexityBot/i],
    cidrs: [
      '199.59.148.0/22',
      '199.16.156.0/22',
    ],
  },
  anthropic: {
    name: 'Anthropic',
    url: 'https://anthropic.com/robots.txt',
    patterns: [/ClaudeBot/i, /Claude-Web/i],
    cidrs: [
      '160.79.104.0/23',
      '160.79.106.0/23',
    ],
  },
};

export function identifyCrawlerProvider(userAgent) {
  if (!userAgent) return null;
  for (const [key, provider] of Object.entries(OFFICIAL_PROVIDER_RANGES)) {
    if (provider.patterns.some((re) => re.test(userAgent))) {
      return key;
    }
  }
  return null;
}

export function matchIpInCidrs(sourceIp, cidrs) {
  if (!sourceIp || !Array.isArray(cidrs) || cidrs.length === 0) return { matched: false, matchedCidr: null };
  const family = net.isIP(sourceIp);
  if (!family) return { matched: false, matchedCidr: null };

  const ipType = family === 4 ? 'ipv4' : 'ipv6';
  for (const cidr of cidrs) {
    const [network, prefixStr] = String(cidr).split('/');
    const prefix = Number(prefixStr);
    const rangeFamily = net.isIP(network);
    if (rangeFamily !== family || !Number.isInteger(prefix)) continue;

    const block = new net.BlockList();
    block.addSubnet(network, prefix, ipType);
    if (block.check(sourceIp, ipType)) {
      return { matched: true, matchedCidr: cidr };
    }
  }
  return { matched: false, matchedCidr: null };
}

export function verifyCrawlerIp(sourceIp, userAgent, options = {}) {
  const providerKey = identifyCrawlerProvider(userAgent);
  if (!providerKey) {
    return {
      knownProvider: false,
      provider: null,
      matched: false,
      matchedCidr: null,
      source: 'unrecognized_user_agent',
    };
  }

  const providerDef = OFFICIAL_PROVIDER_RANGES[providerKey];
  const customCidrs = options.ranges?.[userAgent] || options.ranges?.[providerDef.name] || options.ranges?.[providerKey];
  const cidrs = customCidrs || providerDef.cidrs;

  const result = matchIpInCidrs(sourceIp, cidrs);
  return {
    knownProvider: true,
    provider: providerDef.name,
    providerKey,
    matched: result.matched,
    matchedCidr: result.matchedCidr,
    rangeSource: customCidrs ? 'custom_supplied' : 'official_published',
    sourceUrl: providerDef.url,
  };
}

export async function fetchProviderIpRanges(providerKey, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const provider = OFFICIAL_PROVIDER_RANGES[providerKey];
  if (!provider || !provider.url) {
    throw new Error(`unknown or unconfigured IP range provider: ${providerKey}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(provider.url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching IP ranges for ${providerKey}`);
    }

    const text = await res.text();
    const data = JSON.parse(text);
    const prefixes = (data.prefixes || []).map((p) => p.ipv4Prefix || p.ipv6Prefix || p.cidr || p).filter(Boolean);

    return {
      provider: provider.name,
      url: provider.url,
      checksum: sha256(text),
      cidrs: prefixes.length > 0 ? prefixes : provider.cidrs,
      retrieved_at: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
