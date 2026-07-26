import { sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

function visibleSupport(node, page) {
  const candidates = [
    ...list(node.name).map((value) => ['name', value]),
    ...list(node.headline).map((value) => ['headline', value]),
    ...list(node.description).map((value) => ['description', value]),
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  if (!candidates.length) return { status: 'not_testable', matched_fields: [] };
  const visible = `${page.title || ''} ${page.text || ''}`.toLocaleLowerCase();
  const matchedFields = [...new Set(candidates
    .filter(([, value]) => visible.includes(value.trim().toLocaleLowerCase()))
    .map(([field]) => field))].sort();
  return { status: matchedFields.length ? 'supported' : 'not_observed', matched_fields: matchedFields };
}

function referencedIds(value, relation, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) referencedIds(item, relation, out);
  } else if (value && typeof value === 'object') {
    if (typeof value['@id'] === 'string') out.push({ relation, target_id: value['@id'] });
    else for (const [key, nested] of Object.entries(value)) referencedIds(nested, key, out);
  }
  return out;
}

export function buildEntityGraph(pages) {
  const nodeMap = new Map();
  const pendingEdges = [];
  const parseFailures = [];
  for (const page of pages) {
    for (const script of page.jsonLd) {
      if (script.parseError) {
        parseFailures.push({ url: page.url, error: script.parseError, raw_hash: sha256(script.raw) });
        continue;
      }
      for (const block of script.blocks) {
        if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
        const blockHash = sha256(JSON.stringify(block));
        const nodeId = typeof block['@id'] === 'string' && block['@id'].trim()
          ? block['@id']
          : `urn:citable:jsonld:${blockHash}`;
        const prior = nodeMap.get(nodeId) || {
          node_id: nodeId, types: [], names: [], source_blocks: [],
          visible_support: { status: 'not_testable', matched_fields: [] },
        };
        prior.types = [...new Set([...prior.types, ...list(block['@type']).filter((value) => typeof value === 'string')])].sort();
        prior.names = [...new Set([...prior.names, ...list(block.name).filter((value) => typeof value === 'string' && value.trim())])].sort();
        prior.source_blocks.push({ url: page.url, block_hash: blockHash });
        const support = visibleSupport(block, page);
        prior.visible_support = {
          status: prior.visible_support.status === 'supported' || support.status === 'supported'
            ? 'supported'
            : prior.visible_support.status === 'not_observed' || support.status === 'not_observed'
              ? 'not_observed'
              : 'not_testable',
          matched_fields: [...new Set([...prior.visible_support.matched_fields, ...support.matched_fields])].sort(),
        };
        nodeMap.set(nodeId, prior);
        for (const [relation, value] of Object.entries(block)) {
          if (relation.startsWith('@')) continue;
          for (const ref of referencedIds(value, relation)) {
            pendingEdges.push({ source_id: nodeId, relation: ref.relation, target_id: ref.target_id, source_url: page.url });
          }
        }
      }
    }
  }
  const nodes = [...nodeMap.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const allEdges = pendingEdges.map((edge) => ({ ...edge, target_declared: nodeIds.has(edge.target_id) }))
    .sort((a, b) => `${a.source_id}:${a.relation}:${a.target_id}`.localeCompare(`${b.source_id}:${b.relation}:${b.target_id}`));
  const graph = {
    version: 1,
    nodes,
    edges: allEdges.filter((edge) => edge.target_declared),
    unresolved_references: allEdges.filter((edge) => !edge.target_declared),
    parse_failures: parseFailures,
    limitations: [
      'Normalization reports declared JSON-LD structure and literal visible-text matches; it does not establish semantic correctness, eligibility, search-engine recognition, or ranking impact.',
    ],
  };
  const check = validateAgainst('entity-graph.schema.json', graph);
  if (!check.valid) throw new Error(`entity graph violates contract: ${check.errors.join('; ')}`);
  return graph;
}
