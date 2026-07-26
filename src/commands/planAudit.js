import { buildContext } from './context.js';
import { runtimeCapabilities } from '../installer/index.js';

const PROFILE_RULES = [
  {
    id: 'saas',
    signals: [
      ['pricing URL discovered', ({ paths }) => paths.some((value) => /\/pricing(?:\/|$)/.test(value))],
      ['product, feature, integration, or documentation URL discovered', ({ paths }) => paths.some((value) => /\/(?:products?|features?|integrations?|docs)(?:\/|$)/.test(value))],
      ['software or platform language observed', ({ text }) => /\b(?:software|saas|platform)\b/i.test(text)],
      ['trial or signup language observed', ({ text }) => /\b(?:free trial|sign up|get started)\b/i.test(text)],
    ],
    emphasis: ['pricing-and-capability-claim-support', 'product-entity-consistency'],
  },
  {
    id: 'ecommerce',
    signals: [
      ['product or collection URL discovered', ({ paths }) => paths.some((value) => /\/(?:products?|collections?|cart)(?:\/|$)/.test(value))],
      ['commerce action language observed', ({ text }) => /\b(?:add to cart|buy now|checkout)\b/i.test(text)],
      ['Product or Offer structured data observed', ({ schemaTypes }) => schemaTypes.has('Product') || schemaTypes.has('Offer')],
    ],
    emphasis: ['product-offer-visible-content-support', 'merchant-claim-governance'],
  },
  {
    id: 'local',
    signals: [
      ['LocalBusiness structured data observed', ({ schemaTypes }) => schemaTypes.has('LocalBusiness')],
      ['telephone link observed', ({ hrefs }) => hrefs.some((value) => value.startsWith('tel:'))],
      ['local-service language observed', ({ text }) => /\b(?:service area|serving [a-z]|visit us|directions)\b/i.test(text)],
      ['map link or embed observed', ({ rawHtml }) => /(?:google\.[^"']*\/maps|maps\.google)/i.test(rawHtml)],
    ],
    emphasis: ['local-entity-and-nap-consistency', 'review-and-rating-evidence'],
  },
  {
    id: 'publisher',
    signals: [
      ['article, blog, or topic URL discovered', ({ paths }) => paths.some((value) => /\/(?:blog|articles?|topics?)(?:\/|$)/.test(value))],
      ['Article-family structured data observed', ({ schemaTypes }) => ['Article', 'BlogPosting', 'NewsArticle'].some((value) => schemaTypes.has(value))],
      ['author or publication-date language observed', ({ text }) => /\b(?:written by|published|updated on)\b/i.test(text)],
    ],
    emphasis: ['authorship-and-source-identity', 'freshness-consensus'],
  },
  {
    id: 'multilingual',
    signals: [
      ['multiple document languages observed', ({ languages }) => languages.size > 1],
      ['hreflang markup observed', ({ rawHtml }) => /hreflang\s*=/i.test(rawHtml)],
    ],
    emphasis: ['hreflang-reciprocity-and-language-parity'],
  },
  {
    id: 'api-docs',
    signals: [
      ['API or documentation URL discovered', ({ paths }) => paths.some((value) => /\/(?:api|docs?|developers?)(?:\/|$)/.test(value))],
      ['API or SDK language observed', ({ text }) => /\b(?:api|sdk|webhook|endpoint)\b/i.test(text)],
      ['machine interface metadata observed', ({ paths }) => paths.some((value) => /\/(?:agent\.json|auth\.md|\.well-known\/)/.test(value))],
    ],
    emphasis: ['machine-interface-discoverability', 'capability-and-authentication-claim-support'],
  },
];

const COLLECTORS = [
  ['render', 'browser_render', 'citable observe render --target TARGET'],
  ['lighthouse', 'lighthouse_lab', 'citable observe performance --target TARGET --lighthouse --repeat 3'],
  ['crux', 'crux_field', 'citable observe performance --target TARGET'],
  ['gsc-index', 'gsc_index', 'citable observe index --target TARGET --site-url PROPERTY'],
  ['ga4-metrics', 'ga4_metrics', 'citable connect sync --connection-id CONNECTION --start-date DATE --end-date DATE'],
];

function siteSignals(site) {
  const paths = [];
  const hrefs = [];
  const schemaTypes = new Set();
  const languages = new Set();
  let text = '';
  let rawHtml = '';
  for (const page of site.pages) {
    paths.push(new URL(page.url).pathname);
    hrefs.push(...page.links.map((link) => link.href));
    text += ` ${page.text}`;
    rawHtml += ` ${page.rawHtml}`;
    if (page.lang) languages.add(page.lang.toLowerCase());
    for (const item of page.jsonLd) {
      for (const block of item.blocks) {
        const types = Array.isArray(block?.['@type']) ? block['@type'] : [block?.['@type']];
        for (const type of types.filter(Boolean)) schemaTypes.add(type);
      }
    }
  }
  return { paths, hrefs, schemaTypes, languages, text, rawHtml };
}

function classifyProfiles(site) {
  const signals = siteSignals(site);
  return PROFILE_RULES.map((rule) => {
    const evidence = rule.signals.filter(([, matches]) => matches(signals)).map(([label]) => label);
    return {
      id: rule.id,
      confidence: evidence.length >= 3 ? 'high' : evidence.length === 2 ? 'medium' : 'low',
      evidence,
      emphasis: rule.emphasis,
    };
  }).filter((profile) => profile.evidence.length >= 2);
}

export async function planAudit(root, { target, baseUrl, refDate, capabilities } = {}) {
  if (!target) throw new Error('plan-audit requires --target <dir|url>');
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('plan-audit could not build a site model');
  const profiles = classifyProfiles(ctx.site);
  const runtime = capabilities ?? await runtimeCapabilities();
  const capabilityById = new Map(runtime.map((item) => [item.id, item]));
  const collectors = COLLECTORS.map(([id, capabilityId, command]) => {
    const capability = capabilityById.get(capabilityId);
    const status = capability?.state === 'ready' ? 'available' : 'blocked';
    return {
      id,
      status,
      capability: capabilityId,
      command: command.replace('TARGET', JSON.stringify(target)),
      required_input: status === 'available' ? [] : capability?.requirements ?? [],
      limitations: capability?.limitations ?? ['capability status is unavailable'],
    };
  });
  return {
    target: {
      kind: ctx.site.mode,
      location: ctx.site.location,
      pages_inspected: ctx.site.pages.length,
    },
    classification: {
      statement_type: 'probabilistic_inference',
      profiles,
      unresolved: profiles.length ? [] : ['No profile met the two-signal evidence threshold.'],
    },
    audit: {
      scope: 'all',
      command: `citable audit --target ${JSON.stringify(target)}${baseUrl ? ` --base-url ${JSON.stringify(baseUrl)}` : ''}`,
      rationale: 'The full audit preserves separate SEO, AEO, GEO, governance, and observation boundaries; profile inference changes emphasis, not detector truth.',
    },
    semantic_emphasis: [...new Set(profiles.flatMap((profile) => profile.emphasis))],
    collectors,
    warnings: ctx.warnings,
    boundaries: [
      'No audit or observation package was created.',
      'Profile labels are probabilistic inferences from captured page signals, not verified business facts.',
      'Available collectors establish prerequisite presence only; execution and evidence remain unproven until a collector completes.',
      'Blocked collectors do not make the proposed audit a success or failure; they identify unavailable follow-up evidence.',
    ],
  };
}
