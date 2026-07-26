import { validateAgainst } from '../shared/schemaValidator.js';

export function buildSourceIdentityChain(registries) {
  const entities = new Map((registries.entities?.entries || []).map((item) => [item.entity_id, item]));
  const evidence = new Map((registries.evidence?.entries || []).map((item) => [item.evidence_id, item]));
  const pages = (registries.pages?.entries || []).map((page) => {
    const publisherEntity = entities.get(page.publisher_entity);
    const publisher = publisherEntity ? {
      entity_id: publisherEntity.entity_id,
      name: publisherEntity.canonical_name,
      canonical_url: publisherEntity.canonical_url || null,
      status: publisherEntity.status,
    } : null;
    const authors = (page.author_entities || []).map((id) => {
      const entity = entities.get(id);
      return entity ? {
        entity_id: entity.entity_id,
        name: entity.canonical_name,
        canonical_url: entity.canonical_url || null,
        affiliations: (entity.affiliations || []).map((affiliation) => ({
          ...affiliation,
          entity_name: entities.get(affiliation.entity_id)?.canonical_name || null,
        })),
        status: entity.status,
      } : { entity_id: id, name: null, canonical_url: null, affiliations: [], status: 'missing' };
    });
    const evidenceOwners = (page.evidence_references || []).map((id) => {
      const item = evidence.get(id);
      return { evidence_id: id, owner: item?.source_owner || null, verification_status: item?.verification_status || 'missing' };
    });
    const missing = [];
    if (!publisher) missing.push('publisher_entity');
    if (!authors.length) missing.push('author_entities');
    else if (authors.some((author) => !author.affiliations.length)) missing.push('author_affiliations');
    if (!page.content_owner) missing.push('content_owner');
    if (!page.factual_reviewer) missing.push('factual_reviewer');
    if (!page.correction_path) missing.push('correction_path');
    if (evidenceOwners.some((item) => !item.owner)) missing.push('evidence_owner');
    return {
      page_id: page.page_id,
      url: page.url,
      publisher,
      authors,
      content_owner: page.content_owner || null,
      factual_reviewer: page.factual_reviewer || null,
      evidence_owners: evidenceOwners,
      correction_path: page.correction_path || null,
      status: missing.length ? 'incomplete' : 'complete',
      missing_fields: [...new Set(missing)].sort(),
    };
  });
  const chain = {
    version: 1,
    pages,
    limitations: [
      'Registry linkage records declared identity and governance relationships; it does not establish that disclosures are visible, current, independent, or recognized by external systems.',
    ],
  };
  const check = validateAgainst('source-identity-chain.schema.json', chain);
  if (!check.valid) throw new Error(`source identity chain violates contract: ${check.errors.join('; ')}`);
  return chain;
}
