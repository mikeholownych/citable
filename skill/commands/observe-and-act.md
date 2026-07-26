---
command: /citable observe|apply|monitor
purpose: Collect external and rendered evidence, apply reviewed source changes, and detect regressions without collapsing unlike evidence states.
failure_behaviour: unavailable dependency, credential, source run, reviewer, exact hash, or unique replacement -> incomplete or fail; never infer success
---

# Observe, apply, and monitor

## Collection modes

- `observe render --target <URL>` uses optional Playwright. Browser evidence is
  not search-index evidence. It captures independent desktop, mobile, and
  JavaScript-disabled profiles. `--interactions` exercises at most 20 visible
  disclosure, inactive-tab, and load-more-like controls; it does not prove an
  application-specific journey. `--resume-run` reuses only successful profile
  observations from the named immutable run and recollects failed/absent ones.
  `observe render --input <browser-evidence-plan.json>` executes an
  explicit Chromium, Firefox, or WebKit profile matrix. Each plan records the
  browser version, device, JavaScript, locale, consent, authentication state,
  and ordered interaction steps. Fill/select values are referenced by
  environment-variable name and are never written to the plan or artifacts.
  Targets, subresources, and navigation steps must remain on public network
  destinations; unsupported schemes and configured non-public address ranges
  are blocked. DNS validation does not pin the later browser connection, so
  isolated execution with egress controls remains required for untrusted URLs.
  Plans may include a strict semantic-impact policy covering text retention,
  heading, link, and structured-data parity. Deterministic violations name a
  review owner and always remain `review_required`; passing configured checks
  does not establish semantic or retrieval equivalence.
- `observe index --input <JSON>` imports owner exports. With `--target`,
  `--site-url`, and `GSC_ACCESS_TOKEN`, it calls Google URL Inspection, which
  reports the indexed version rather than performing a live indexability test.
- `observe citations --input <JSON>` imports complete controlled observations.
  With `--endpoint`, the input is a versioned prompt corpus and each prompt runs
  1-20 times (default 3) through the disclosed adapter protocol. An API is not
  presumed equivalent to a provider's consumer search experience. Adapter
  endpoints require HTTPS, must resolve only to public destinations, and may
  not redirect.
  Citation objects may include a strict `source_profile` containing declared
  format, word and heading counts, freshness date, and evidence features.
  Competitive summaries group these profiles by cited domain. Imported profile
  values are comparative metadata, not independently fetched or verified
  qualities.
- `observe logs --input <JSON>` imports server/CDN records. User-agent matches
  without IP verification remain low confidence.
- `observe probes --target <URL> [--region <label>]` sends one bounded synthetic
  request for every active identity in `crawlers.yaml`, preserving response
  bodies, safe diagnostic headers, redirects, and coarse edge/challenge
  classification. The request merely spoofs each declared user agent: it does
  not establish crawler identity, production access, regional
  representativeness, or alignment between declared policy and actual crawler
  treatment.
- `observe network --input <JSON>` accepts a strict regional runner export with
  region, network, user agent, DNS answers, TLS authorization/fingerprint,
  status, latency, and cache state for every probe. Citable validates and seals
  these observations but does not operate the runner or infer global coverage.
- `observe passages|consensus --target <dir|URL>` performs static extraction.
  Passage observations include raw/extracted byte and visible-token ratios plus
  exact repeated header, navigation, aside, and footer regions across the
  audited page cohort. These classifications are descriptive and do not imply
  content harm, retrieval effects, or ranking effects.
  Versioned passage records also join declared page prompts, questions, and
  expected answer components. This only creates review context:
  question-to-passage suitability remains `review_required`.
  Consensus normalizes parseable HTTP, sitemap, and visible/meta freshness
  dates, preserves conflicts and invalid values, and compares the current
  content hash with the latest immutable page snapshot. A detected hash change
  establishes only an interval after the prior capture—not an exact change
  time, cause, quality improvement, or ranking effect. Lifecycle review dates
  remain a separate governance signal.
  `observe consensus --input <canonical-index-import.json>` additionally joins
  schema-validated engine-selected canonical observations while preserving
  their collection authority and authenticity. Missing engine observations
  remain `null`; they are never inferred from static declarations.
- `observe performance` imports evidence or calls CrUX with `CRUX_API_KEY`.
  `--lighthouse` instead performs 1-5 local lab runs (default 3) using optional
  `lighthouse` and `chrome-launcher` peers, preserving each result and a median
  summary. Lab evidence remains separate from CrUX field evidence.
- `observe corroboration --input <JSON>` accepts only the versioned
  `corroboration-import` contract. Each mention must disclose source control,
  relationship, collection authority, authenticity, and dataset coverage.
  Legacy independence booleans and undisclosed control fail closed. An
  observable mention does not establish source authority, claim support,
  ranking impact, citation eligibility, or representative coverage.

## Guarded remediation

`apply --input remediation-spec.json` is a dry run. Every operation binds to an
existing audit run and finding IDs, stays inside repository source, names a
reviewer, matches the exact file hash, and identifies exactly one source string.
`--write` applies only after all operations validate. Build, tests, semantic
review, re-audit, and snapshot comparison remain mandatory afterward.

## Monitoring

`monitor [runA runB]` reports state changes, missing observations, index loss,
canonical disagreement, and citation-presence changes. Alerts are evidence
changes, not causal explanations or ranking conclusions. Schedule it in CI at
the cadence defined by lifecycle and experiment records.
