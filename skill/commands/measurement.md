---
command: /citable measure seo|aeo|geo, test-prompts, monitor-crawlers, monitor-contradictions
purpose: Observation and measurement workflows with exact collector and product-mode boundaries.
---

# Honest capability statement

Citable ships Google URL Inspection, CrUX field collection, normalized owner
imports, and a disclosed custom citation-adapter protocol. It does not claim
Bing AI Performance automation or equivalence between an API adapter and a
consumer answer product. Preserve collector and product mode on every result.

# implemented metric, connector, and objective workflow

`citable metrics import --provider <name> --input <csv|json>` validates every
row against a declared entry in `metrics.yaml` and writes immutable metric
observations. `citable objectives init --input <json|yaml>` is dry-run by
default; `--write` adds the validated objective with registry history.
`citable objectives validate` checks contracts and metric references.
`citable evaluate [objective-id]` compares independent baseline and evaluation
windows, deduplicates repeated evidence, and reports each metric and guardrail
separately. Insufficient data is `inconclusive`, never zero. Results describe
temporal association and do not establish causation.

Metrics, objectives, interventions, and connection state are optional. The
absence of provider credentials is `not_configured`, not a finding and not
evidence of zero activity. Credentials must never enter registries or evidence
packages.

Live GSC and GA4 connections are explicitly optional. Configure only a
property identifier and the name of the environment variable that holds its
OAuth token; never place the token itself in `.citable/connections.yaml`.
`citable connect configure` and `disconnect` are dry runs unless `--write` is
used. `connect discover`, `validate`, and `sync` require read-only provider
authorization. `sync` writes declared metric observations with provider
limitations and advances a non-secret cursor. Provider errors are recorded as
connection state, not converted into zero observations or audit findings.

The GSC adapter collects final Search Analytics rows and inherits Search
Console aggregation, privacy filtering, and top-row availability limits. The GA4 adapter collects Data API
rows restricted to the `Organic Search` default channel group and inherits the
property's reporting identity, thresholding, attribution, and consent choices.
Neither source establishes that an intervention caused an observed change.

# measure seo
Inputs the operator exports (Search Console/Bing/analytics CSV or JSON).
Workflow: validate segmentation (brand vs non-brand, intent, page type,
device, country), map rows to query registry ids, store under the run's
evidence package, report coverage of the query portfolio — never sitewide
averages alone. Refuse to attribute movement to a change without an
experiment record (MEAS-003).

# measure aeo / measure geo / test-prompts
1. Each observation must satisfy `schemas/prompt-result.schema.json`: engine,
   model where visible, interface, account state, location, locale, language,
   date-time, prompt + variant, follow-up context, answer, retrieved sources,
   citations, mention/recommendation status, position, factual accuracy,
   entity confusion, omissions, sentiment, run index/series.
2. Store observations under `.citable/runs/<run>/prompt-results/*.json` —
   MEAS detectors read them from there.
3. Scoring uses the narrative-accuracy rubric. One output is anecdote:
   definitive accuracy_status in the prompt registry requires ≥3 observations
   (MEAS-002). Report variance, never a single-run truth.
4. Causal claims require an experiment registry entry with baseline, windows,
   and confounders (MEAS-003).

# monitor-crawlers
Input: server/CDN logs the operator provides. Workflow: aggregate by user
agent × URL × status; flag 403/429/5xx concentrations against declared-allow
crawlers; note that user-agent strings are spoofable and IP validation is the
confirmation step (crawler registry ip_validation_method). Compare observed
access against `crawlers.yaml` decisions (CRAWL-001 logic applied to logs).

# monitor-contradictions
Compare approved entity + claim records against: owned pages (automated, via
audit), and operator-collected external surfaces (profiles, directories,
partner pages, generated answers). Classify contradictions by the fourteen
types in the narrative-accuracy rubric; SEV-map material ones; follow the
correction runbook (capture → materiality → source lineage → verify internal
truth → correct owned → escalate external → recrawl request → retest cohort →
preserve before/after → residual risk).
