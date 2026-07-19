# Field validation corpus

Use this workflow to assemble, evaluate, and publish an acceptance corpus. A
fixture-valid corpus is not field evidence. Do not describe a corpus as real,
representative, accurate, or public until the corresponding records and reviews
exist.

## Preconditions

For every property, record:

- architecture and property class;
- owner authorization for collection, retention, review, and the intended
  publication level;
- collection methods, authority labels, timestamps, and limitations;
- unavailable evidence, intentional incompleteness, and contradictions;
- publication approval, retention, and the exact artifact-reference allowlist;
- human sanitization review covering personal data, credentials, and source
  identifiers.

Every execution must reference raw artifacts, deterministic and heuristic
findings, reviewer assignments, disagreements, exceptions, interventions,
verification, and its reproducibility receipt where available. Empty reference
arrays are valid only where that class of evidence did not occur.

## Evaluate

```sh
citable corpus evaluate --input acceptance-corpus.json
```

Evaluation validates the v2 contract and writes `accuracy-metrics.json` plus a
human-readable `accuracy-metrics.md` projection from the same hash-bound data.
Every reported metric discloses its numerator, denominator, population,
exclusions, and confidence limits. Sample and census designs remain distinct,
and detector versions are reported as separate cohorts. Evaluation does not
authorize publication. Unknown false negatives remain unknown; discovered
false-negative rates apply only to adjudicated expected detections in the
disclosed population.

## Publish

```sh
citable corpus publish \
  --input acceptance-corpus.json \
  --output public-corpus.json
```

Publication fails closed when any property is private or aggregate-only, owner
authority is expired or incomplete, sanitization review is incomplete, an
artifact reference is unsafe or outside the allowlist, sensitive patterns are
detected, or the output already exists. It emits the public corpus, a hash-bound
publisher-controlled receipt, and an immutable local evidence package.

Automated checks supplement but do not replace human sanitization review. The
receipt is owner-authorized publication evidence, not independent attestation.
Never publish production credentials, customer data, private property artifacts,
or evidence outside the exact approved scope.

## Reproducibility

Create one receipt per sealed acceptance run, then compare repeated envelopes:

```sh
citable corpus receipt --run <run-id> --input execution-context.json
citable corpus compare-receipts <receipt-a.json> <receipt-b.json>
```

Treat fingerprint equality as bounded equality of declared inputs, methods,
tools, external-system versions, and artifacts. It does not establish causation
or performance on untested properties.
