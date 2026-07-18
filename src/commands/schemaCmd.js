import { buildContext } from './context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, sitePageFor } from '../detectors/framework.js';

/**
 * `citable schema` — derive JSON-LD proposals from registry data and validate deployed schema.
 *
 * Generation is registry-driven: schema is only proposed for entities that exist in the
 * entity registry with a canonical URL. Nothing is fabricated; missing fields are listed
 * as required_input instead of being invented.
 */
export async function schemaCommand(root, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });

  // 1. Validate deployed schema via SCHEMA + ENTITY detectors (needs a site)
  let findings = [];
  if (ctx.site) {
    const res = runDetectors(selectDetectors({ namespaces: ['SCHEMA', 'ENTITY'] }).filter((d) => !d.requires || d.requires.every((r) => ctx[r])), ctx);
    findings = res.findings;
  }

  // 2. Propose JSON-LD from registry entities
  const proposals = [];
  const blocked = [];
  const base = ctx.config?.site?.base_url;
  for (const e of (ctx.registries.entities?.entries || []).filter((e) => e.status !== 'retired')) {
    const missing = [];
    if (!e.canonical_url) missing.push('canonical_url');
    if (!e.definition && ['proprietary_concept', 'category'].includes(e.entity_type)) missing.push('definition');
    if (missing.length) {
      blocked.push({ entity_id: e.entity_id, status: 'blocked', reason: 'entity record incomplete; schema would require invented facts', required_input: missing });
      continue;
    }
    const id = `${e.canonical_url}#${e.entity_type}`;
    const typeMap = {
      organization: 'Organization', legal_entity: 'Organization', person: 'Person', author: 'Person',
      product: 'SoftwareApplication', product_family: 'SoftwareApplication', service: 'Service',
      category: 'DefinedTerm', proprietary_concept: 'DefinedTerm', methodology: 'DefinedTerm',
      research_artifact: 'Report', dataset: 'Dataset', location: 'Place', partnership: 'Organization', case_study: 'Article',
    };
    const block = {
      '@context': 'https://schema.org',
      '@type': (e.schema_types && e.schema_types[0]) || typeMap[e.entity_type] || 'Thing',
      '@id': id,
      name: e.canonical_name,
      url: e.canonical_url,
    };
    if (e.definition) block.description = e.definition;
    if (e.aliases?.length) block.alternateName = e.aliases;
    if ((e.authoritative_profiles || []).length) block.sameAs = e.authoritative_profiles;
    if (e.owner_entity) {
      const owner = (ctx.registries.entities?.entries || []).find((o) => o.entity_id === e.owner_entity);
      if (owner?.canonical_url) block.publisher = { '@id': `${owner.canonical_url}#${owner.entity_type}` };
    }
    // consistency: schema must not exceed the registry — no ratings, prices, or claims added here
    proposals.push({ entity_id: e.entity_id, target_url: e.canonical_url, jsonld: block });
  }

  // 3. Detect registry entities whose canonical page carries no schema at all
  const missingDeployment = [];
  if (ctx.site) {
    for (const p of proposals) {
      const page = sitePageFor(ctx, { url: p.target_url });
      if (page && page.jsonLd.length === 0) {
        missingDeployment.push({ entity_id: p.entity_id, url: p.target_url, note: 'canonical page has no JSON-LD; proposal available' });
      }
    }
  }

  return { findings, proposals, blocked, missingDeployment };
}
