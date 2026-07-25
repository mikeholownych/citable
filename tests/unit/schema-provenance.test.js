import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

function registryOf(entity) {
  return { version: 1, kind: 'entities', entries: [entity] };
}

test('provenance.seededFrom validates when fully populated', () => {
  const entity = {
    entity_id: 'ENT-1', canonical_name: 'Example', entity_type: 'organization', status: 'unverified',
    provenance: { seededFrom: { seedName: 'saas-pricing', seedVersion: '1.0.0', importedAt: '2026-07-25' } },
  };
  const { valid, errors } = validateAgainst('entity.schema.json', registryOf(entity));
  assert.equal(valid, true, errors.join('; '));
});

test('provenance.seededFrom is rejected when missing a required sub-field', () => {
  const entity = {
    entity_id: 'ENT-1', canonical_name: 'Example', entity_type: 'organization', status: 'unverified',
    provenance: { seededFrom: { seedName: 'saas-pricing', importedAt: '2026-07-25' } }, // missing seedVersion
  };
  const { valid, errors } = validateAgainst('entity.schema.json', registryOf(entity));
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /seedVersion/.test(e)));
});

test('existing provenance without seededFrom remains valid (backward compatible)', () => {
  const entity = {
    entity_id: 'ENT-1', canonical_name: 'Example', entity_type: 'organization', status: 'verified',
    provenance: { created: '2026-01-01', updated: '2026-01-02', created_by: 'someone', source: 'manual' },
  };
  const { valid, errors } = validateAgainst('entity.schema.json', registryOf(entity));
  assert.equal(valid, true, errors.join('; '));
});
