# v1.13 field-validation corpus

This directory contains the first owner-authorized public field-validation
projection for Citable. It evaluates a bounded v1.12.0 detector cohort across:

- `gofaultline.dev`
- `aisyndicate.io`
- `mikeholownych.com`
- `nebulacomponents.shop`

The corpus is a disclosed sample, not a benchmark for all detectors or sites.
It includes every critical and high finding from the selected runs plus four
predeclared negative controls. Medium and low findings, unknown false negatives,
semantic reviews without two independent reviewers, and external outcome
causation are outside the measured population.

## Defect-discovery cohort results

- 22 declared cases
- 17 false positives
- 4 true negatives
- 1 incomplete heuristic
- 0 adjudicated true positives or false negatives
- 0% precision among the 17 emitted, adjudicated detections in this sample
- unknown false negatives: `not_quantified`
- reproducible receipt fingerprints: 0 of 4; repeated envelopes were comparable,
  but live artifacts changed

The false positives exposed three implementation defects:

1. HTML-only detectors treated indexable Markdown, JSON, CSV, and RSS resources
   as HTML pages.
2. Cloudflare email-protection utility URLs were treated as index targets.
3. Sitemap URLs omitted by the 50-page crawl bound were treated as unresolved
   rather than incomplete coverage.

AI Syndicate returned Cloudflare HTTP 530 during preflight and HTTP 200 during
the selected audit. Both are retained as owner-controlled observations; neither
establishes global availability or independently attested origin state.

## Post-remediation cohort results

The paired v1.13.0 cohort reran the same 22 declared cases from clean commit
`709c8e81a14cdaf3d68bc9191b281b9c70bd88ea` with the same 50-page crawl bound:

- 21 true negatives;
- 0 false positives;
- 1 incomplete expected detection (`TECH-011` on `aisyndicate.io`);
- 0 adjudicated true positives or false negatives;
- 100% remediation-verification success across the three affected properties;
- 50% incomplete-execution rate because two properties reached the declared
  crawl bound;
- precision and recall not established because the evaluated population had no
  completed positive observations.

All 17 detector/subject pairs adjudicated as false positives in the v1.12.0
cohort were absent. This verifies the disclosed detector-behavior remediation;
it does not estimate accuracy outside the paired cases or establish any effect
on indexing, retrieval, citation, traffic, or conversion.

## Artifacts

- `public-corpus.json`: canonical disclosed corpus
- `public-corpus.json.metrics.json`: hash-bound machine-readable metrics
- `public-corpus.json.metrics.md`: human-readable metric projection
- `public-corpus.json.receipt.json`: owner-authorized publication receipt
- `post-remediation-corpus.json`: paired v1.13.0 corpus
- `post-remediation-corpus.json.metrics.json`: paired machine-readable metrics
- `post-remediation-corpus.json.metrics.md`: paired human-readable metrics
- `post-remediation-corpus.json.receipt.json`: paired publication receipt

The receipt proves publisher-controlled projection integrity. It is not
independent attestation. Raw private run artifacts are retained separately and
are not included in this public projection.
