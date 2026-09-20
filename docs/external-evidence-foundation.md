# External evidence foundation

This document describes the implemented Wave 9 foundation in the Citable
development source after v1.20.0. It is an evidence contract, not a provider
integration or a truth oracle. It is not part of the released v1.20.0 package
until the normal release process accepts a later source revision.

## Implemented scope

The foundation implements ER-0, ER-7, ER-8, ER-11, and ER-9:

- provider-neutral `PAGE_OBSERVATION`, `EXTERNAL_OBSERVATION`, and
  `DERIVED_OBSERVATION` envelopes;
- immutable, hashed research datasets with declared-population coverage;
- explicit claim → dataset/derivation → observation lineage;
- version-aware external comparison states; and
- bounded `verifyClaim()` results that evaluate proposition support and scope
  support independently.

The implementation is available for a future Nebula adoption decision. It does
not collect from external providers, publish content, authorize deployment, or
change CALS experiments.

## Observation contract

`schemas/external-observation.schema.json` preserves source/provider,
collector/parser/configuration versions, observation and retrieval timestamps,
subject identity, population counts, retrieval/observation state, contextual
labels, lineage references, limitations, and a canonical evidence hash.

`context.supplied` is contextual interpretation supplied by a caller. It is
not merged into `data` and is never treated as an observed fact.

An external-provider observation means:

> provider P reported or returned X under the recorded conditions.

It does not establish that X is universally true. Source authority, method,
timestamp, configuration, scope, and limitations remain attached to the
observation.

## Research datasets

`schemas/research-dataset.schema.json` requires a dataset id and version,
declared purpose and population, inclusion/exclusion criteria, collection
range, source and observation references, normalization version, derivation
references, coverage counts, limitations, and a dataset hash.

`complete_for_declared_population` means completion of the declared population
only. `partial`, `truncated`, `indeterminate`, and `error` cannot support a
complete-population claim. Reusing a dataset id/version with changed content
fails integrity; a material change requires a new version.

## Claim and derivation lineage

Claims have a stable id/version, proposition, declared scope, evidence,
observation, dataset, and derivation references, a structured assertion, and
an integrity hash. A derivation records its operation, input observations,
predicate where applicable, result, implementation/version, and hash.

The resulting lineage is:

```text
claim → derivation → dataset/population → atomic observations → source evidence
```

Direct claims may reference observations without a dataset or derivation.
Derived values cannot discard their atomic inputs.

## Claim verification

`verifyClaim()` returns:

`SUPPORTED`, `PARTIALLY_SUPPORTED`, `UNSUPPORTED`, `CONTRADICTED`,
`INDETERMINATE`, or `NOT_OBSERVED`.

Every result includes separate `proposition_support` and `scope_support`
states, machine-readable reason codes, and lineage references.

For example, complete evidence for 3 of 12 declared products can support:

> 3 of the 12 observed products include X.

It cannot fully support:

> 25% of all products include X.

Missing evidence is `NOT_OBSERVED`, not contradiction. A complete declared
population that records all members as absent can support a bounded absence
claim, but not universal absence. Corrupt or unverifiable evidence is
`INDETERMINATE` and cannot yield normal `SUPPORTED` output.

## Comparability

`compareExternalObservations()` and `compareResearchDatasets()` preserve
`COMPARABLE`, `PARTIALLY_COMPARABLE`, `NOT_COMPARABLE`, and `INDETERMINATE`.
Provider, subject, collector, parser, configuration, population,
normalization, dataset version, and derivation version are explicit dimensions
where applicable. No delta is produced as a valid comparison when material
dimensions disagree.

## Backlog boundary

ER-1, ER-2, ER-3, ER-4, ER-5, ER-6, ER-10, ER-12, and ER-13 remain backlogged.
This tranche does not implement Search Console, SERP, AI-provider, backlink,
MCP, content-generation, publishing, marketing, or Nebula-specific adapters.
