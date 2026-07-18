import { defineDetector, indexTargets, pageSubject, entrySubject } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

function allJsonLdBlocks(site) {
  const out = [];
  for (const p of site.pages) {
    for (const j of p.jsonLd) for (const b of j.blocks) out.push({ page: p, block: b });
  }
  return out;
}

D.push(defineDetector({
  id: 'ENTITY-001', name: 'Entity missing canonical URL', namespace: 'ENTITY',
  description: 'A registry entity has no canonical URL, so engines have no authoritative page to resolve it to.',
  discipline: ['geo', 'aeo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'high' },
  applicable_requirement: 'AEO §3 every entity should have one canonical URL; GEO §3 canonical entities',
  remediation: 'Create or designate one canonical page for the entity and record it in the registry.',
  verification: 'Registry entry has canonical_url set and resolvable.',
  check(ctx) {
    return (ctx.registries.entities?.entries || [])
      .filter((e) => e.status !== 'retired' && !e.canonical_url)
      .map((e) => ({
        subject: entrySubject('entities', e.entity_id),
        summary: `Entity "${e.canonical_name}" has no canonical URL`,
        evidence: [`entities/${e.entity_id}: canonical_url empty`],
      }));
  },
}));

D.push(defineDetector({
  id: 'ENTITY-002', name: 'Schema entity name conflicts with registry', namespace: 'ENTITY',
  description: 'A JSON-LD Organization/Product name does not match the registry canonical name or a documented alias.',
  discipline: ['geo', 'seo'], severity: 'high', deterministic: true, requires: ['site', 'registries'],
  impact: { representation: 'high' },
  applicable_requirement: 'GEO §3 required consistency; detector spec: schema entity differs from visible entity',
  remediation: 'Emit the canonical name from the entity registry in structured data; add legitimate variants to aliases.',
  verification: 'Compare schema names with registry canonical_name and aliases.',
  check(ctx) {
    const entities = (ctx.registries.entities?.entries || []).filter((e) => ['organization', 'product', 'product_family'].includes(e.entity_type));
    if (entities.length === 0) return [];
    const hits = [];
    for (const { page, block } of allJsonLdBlocks(ctx.site)) {
      const type = [].concat(block['@type'] || []).join(',');
      if (!/Organization|Corporation|SoftwareApplication|Product/i.test(type) || !block.name) continue;
      const match = entities.find(
        (e) => e.canonical_name.toLowerCase() === String(block.name).toLowerCase() || (e.aliases || []).some((a) => a.toLowerCase() === String(block.name).toLowerCase())
      );
      if (!match) {
        const nearest = entities.find((e) => String(block.name).toLowerCase().includes(e.canonical_name.toLowerCase().split(' ')[0]) || e.canonical_name.toLowerCase().includes(String(block.name).toLowerCase().split(' ')[0]));
        if (nearest) {
          hits.push({
            subject: { type: 'schema_block', identifier: `${page.url}#${block['@id'] || block.name}`, url: page.url },
            summary: `Schema ${type} name "${block.name}" is not the canonical name "${nearest.canonical_name}" nor a documented alias`,
            evidence: [`schema name: ${block.name}`, `registry canonical: ${nearest.canonical_name}; aliases: ${(nearest.aliases || []).join(', ') || 'none'}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ENTITY-003', name: 'Unstable @id for same entity', namespace: 'ENTITY',
  description: 'The same entity name appears in JSON-LD with different @id values across pages.',
  discipline: ['geo', 'seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium' },
  applicable_requirement: 'SEO §7 stable @id identifiers; GEO §9 required graph consistency',
  remediation: 'Emit one stable @id per entity from shared data, referenced everywhere.',
  verification: 'Collect @id values per entity name; each name maps to one @id.',
  check(ctx) {
    const byName = new Map();
    for (const { block } of allJsonLdBlocks(ctx.site)) {
      if (!block.name || !block['@id']) continue;
      const key = `${[].concat(block['@type'] || []).join(',')}|${String(block.name).toLowerCase()}`;
      if (!byName.has(key)) byName.set(key, new Set());
      byName.get(key).add(block['@id']);
    }
    return [...byName.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([key, ids]) => ({
        subject: { type: 'entity', identifier: key },
        summary: `Entity "${key.split('|')[1]}" uses ${ids.size} different @id values`,
        evidence: [...ids].map((i) => `@id: ${i}`),
      }));
  },
}));

D.push(defineDetector({
  id: 'ENTITY-004', name: 'sameAs profile not in authoritative list', namespace: 'ENTITY',
  description: 'JSON-LD sameAs references a profile URL not recorded as an authoritative profile in the entity registry.',
  discipline: ['geo'], severity: 'low', deterministic: true, requires: ['site', 'registries'],
  impact: { representation: 'medium' },
  applicable_requirement: 'AEO §6 sameAs limited to authoritative profiles; detector spec: unsupported sameAs',
  remediation: 'Either add the profile to authoritative_profiles after verification, or remove it from sameAs.',
  verification: 'Every sameAs URL appears in the registry authoritative_profiles.',
  check(ctx) {
    const entities = ctx.registries.entities?.entries || [];
    if (entities.length === 0) return [];
    const hits = [];
    for (const { page, block } of allJsonLdBlocks(ctx.site)) {
      if (!block.sameAs || !block.name) continue;
      const entity = entities.find((e) => e.canonical_name.toLowerCase() === String(block.name).toLowerCase() || (e.aliases || []).some((a) => a.toLowerCase() === String(block.name).toLowerCase()));
      if (!entity) continue;
      const approved = new Set(entity.authoritative_profiles || []);
      for (const s of [].concat(block.sameAs)) {
        if (!approved.has(s)) {
          hits.push({
            subject: { type: 'schema_block', identifier: `${page.url}#sameAs`, url: page.url },
            summary: `sameAs "${s}" for "${block.name}" is not a registered authoritative profile`,
            evidence: [`schema sameAs: ${s}`, `registered profiles: ${[...approved].join(', ') || 'none'}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ENTITY-005', name: 'Product entity without owner relationship', namespace: 'ENTITY',
  description: 'A product/product-family entity records no owning organization.',
  discipline: ['geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { representation: 'high' },
  applicable_requirement: 'GEO §3 the engine must determine which products the organization owns; detector spec: product ownership ambiguous',
  remediation: 'Set owner_entity (or a relationship) linking the product to its organization.',
  verification: 'Product entity has owner_entity or an ownership relationship.',
  check(ctx) {
    return (ctx.registries.entities?.entries || [])
      .filter((e) => ['product', 'product_family', 'service'].includes(e.entity_type) && e.status !== 'retired')
      .filter((e) => !e.owner_entity && !(e.relationships || []).some((r) => ['owned_by', 'organization', 'publisher'].includes(r.type)))
      .map((e) => ({
        subject: entrySubject('entities', e.entity_id),
        summary: `Product entity "${e.canonical_name}" has no recorded owning organization`,
        evidence: [`entities/${e.entity_id}: owner_entity empty; no ownership relationship`],
      }));
  },
}));

D.push(defineDetector({
  id: 'ENTITY-006', name: 'Unregistered name variant in page text', namespace: 'ENTITY',
  description: 'Page text uses a variant of an entity name that is neither the canonical name nor a documented alias.',
  discipline: ['geo', 'seo'], severity: 'low', deterministic: false, requires: ['site', 'registries'],
  impact: { representation: 'medium' },
  applicable_requirement: 'GEO §3 category contradictions and naming drift; SEO §6 consistent names',
  false_positive_conditions: ['grammatical possessives and legitimate prose inflections'],
  remediation: 'Standardize on the canonical name, or register the variant as an alias if intentional.',
  verification: 'Page text uses only canonical names and registered aliases.',
  check(ctx) {
    const hits = [];
    for (const e of (ctx.registries.entities?.entries || []).filter((e) => ['organization', 'product'].includes(e.entity_type))) {
      const canonical = e.canonical_name;
      const parts = canonical.split(/\s+/);
      if (parts.length < 2) continue; // single-word names produce too many false variants
      const known = new Set([canonical.toLowerCase(), ...(e.aliases || []).map((a) => a.toLowerCase())]);
      // variant: same words joined/hyphenated/reordered-case
      const variantRx = new RegExp(parts.join('[\\s-]*'), 'gi');
      for (const p of indexTargets(ctx)) {
        for (const m of p.text.matchAll(variantRx)) {
          const found = m[0];
          if (!known.has(found.toLowerCase())) {
            hits.push({
              subject: pageSubject(p),
              summary: `Name variant "${found}" used for entity "${canonical}" (not a registered alias)`,
              evidence: [`found: "${found}"`, `canonical: "${canonical}"`],
              confidence: 'medium',
            });
            break; // one hit per page per entity
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ENTITY-007', name: 'Entity verification stale', namespace: 'ENTITY',
  description: 'An active entity has not been verified within the last 12 months (or last_verified missing).',
  discipline: ['geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { representation: 'medium', maintainability: 'medium' },
  applicable_requirement: 'GEO §3 entity record last_verified; lifecycle premises',
  remediation: 'Re-verify identity, category, relationships, and profiles; update last_verified.',
  verification: 'last_verified within 12 months.',
  check(ctx) {
    const cutoff = new Date(ctx.refDate ?? Date.now());
    cutoff.setMonth(cutoff.getMonth() - 12);
    return (ctx.registries.entities?.entries || [])
      .filter((e) => e.status === 'active' || e.status === 'verified')
      .filter((e) => !e.last_verified || new Date(e.last_verified) < cutoff)
      .map((e) => ({
        subject: entrySubject('entities', e.entity_id),
        summary: `Entity "${e.canonical_name}" not verified in the last 12 months (last: ${e.last_verified ?? 'never'})`,
        evidence: [`last_verified: ${e.last_verified ?? 'missing'}`],
      }));
  },
}));

export default D;
