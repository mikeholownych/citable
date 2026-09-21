# Wave 9 ER-5/ER-6 bounded design

## Scope

ER-5 records provider citation provenance and the evidence chain from a
prompt execution to a displayed or resolved source. ER-6 records competitor
or peer representation observed in the same execution. Both are extensions
of the Wave 9 `external-observation` envelope; they are not a second evidence
package or a visibility score.

## Reused primitives

- `createExternalObservation` / `verifyExternalObservation` for immutable
  identity and evidence hashes;
- ER-4 prompt-set, execution, response hash, parser, provider and evidence
  origin fields;
- ER-7 derivations for prevalence, with all included and excluded execution
  references retained in the derivation result;
- ER-8 claims and `verifyClaim` for bounded proposition support;
- ER-11 comparison statuses for provider, prompt, model, configuration and
  population changes;
- the existing sealed run/package verifier and canonical evidence serializer.

## New evidence objects

1. **Response span** — an immutable offset/text/hash reference to the exact
   provider response. A sentence may contain multiple proposition spans.
2. **Citation observation** — raw marker/ordinal/placement, displayed title,
   domain and URL, resolved URL/redirects when observable, and references to
   the execution, response span and optional source retrieval.
3. **Source retrieval observation** — a separate observation of retrieval
   status, final identity, content hash, retrieval timestamp and limitations.
4. **Competitor representation observation** — explicitly supplied entity
   identity (or ambiguity), response span, representation type and optional
   citation/proposition references. Co-occurrence never resolves an entity or
   assigns a comparison.

## Support and prevalence

Citation presence, source identity, retrieval, relevance and proposition
support are separate fields. Retrieval failure is indeterminate, not
unsupported. Proposition support is accepted only from an explicit bounded
support assessment or a claim assertion over that assessment; repeated
provider output remains representation evidence.

Representation prevalence is a derived observation over a declared set of
successful/evaluable executions. Refusals, safety interstitials, timeouts and
parser failures are excluded with reasons and remain in lineage. The result
contains numerator, denominator, exclusions and derivation version; it is not
a score or a factual generalization.

## Compatibility and non-goals

Existing ER-4 shapes remain valid. New objects are additive and can be placed
in existing external-observation packages. No provider collector, live
provider access, ER-10/12/13 capability, competitor ranking, recommendation,
causal claim or Nebula integration is included.

## Acceptance proof

Deterministic fixtures cover citation/span linkage, unknown mappings,
displayed/resolved URLs, tracking URLs, retrieval/support states, failures,
tamper detection, prevalence exclusions, entity ambiguity and bounded claim
verification. The supplied Nebula corpus is used only as a recorded challenge
corpus; it is not converted into synthetic ground truth.
