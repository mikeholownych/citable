---
command: /citable measure seo|aeo|geo, test-prompts, monitor-crawlers, monitor-contradictions
purpose: Observation and measurement workflows. Citable records and validates observations; it does not claim live engine adapters it does not have.
---

# Honest capability statement

This MVP ships **no external engine adapters** (no Search Console API client,
no ChatGPT/Perplexity automation). Measurement commands therefore operate on
*operator-supplied observations*, validated against the data contracts, plus
registry-side integrity checks (MEAS-001/002/003). Do not imply otherwise.

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
