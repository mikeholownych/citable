# Migration guide

Released schemas are contracts. Migrate input into a new file and preserve the
original source evidence; never rewrite an existing sealed run.

## Migration workflow

1. Record the Citable version and the rejected schema name.
2. Preserve the original export byte-for-byte.
3. Read the applicable `CHANGELOG.md` migration entry and schema in `schemas/`.
4. Create a migrated copy using known source facts only.
5. Validate required fields, enums, timestamps, authority, and coverage.
6. Run the relevant command and retain the new immutable run separately.
7. Compare results without treating format migration as an evidence change.

If a newly required fact is unknown, leave the collection blocked. Do not
invent it to satisfy validation.

## Current migration notes

### Corroboration imports

Legacy arrays and `independent` booleans are rejected. Use
`schema_version: 1` and disclose collection authority, authenticity,
representativeness, population coverage, source control, and relationship
status. Independence is classified only from the declared control and
relationship fields.

See `corroboration-import.schema.json` and the **Migration — Corroboration
Imports** entry in `CHANGELOG.md`.

### Source identity chains

Page and entity registries may add author entities, publisher entity,
correction path, and affiliation disclosures. These fields are optional for
existing registries. Populating them creates declared relationships, not proof
that disclosures are visible, current, or independent.

### Provenance `seededFrom`

Seeded starter records include provenance that distinguishes bundled
scaffolding from owner evidence. Preserve that provenance and the `unverified`
state when moving seeded registries forward.

### Acceptance corpus schema v2

Acceptance corpus files must use the current versioned contract. Follow the
**Migration — Acceptance Corpus Schema v2** entry in `CHANGELOG.md` and migrate
fixtures and tooling together. A schema migration does not establish property
authority, publication approval, or evidence availability.

## Contract compatibility

Read [API and contract stability](api-stability.md) before automating against
commands, schemas, registries, or artifact layouts. Breaking contract changes
require changelog migration guidance; optional backward-compatible fields do
not require fabricated values.
