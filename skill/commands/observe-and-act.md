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
- `observe index --input <JSON>` imports owner exports. With `--target`,
  `--site-url`, and `GSC_ACCESS_TOKEN`, it calls Google URL Inspection, which
  reports the indexed version rather than performing a live indexability test.
- `observe citations --input <JSON>` imports complete controlled observations.
  With `--endpoint`, the input is a versioned prompt corpus and each prompt runs
  1-20 times (default 3) through the disclosed adapter protocol. An API is not
  presumed equivalent to a provider's consumer search experience.
- `observe logs --input <JSON>` imports server/CDN records. User-agent matches
  without IP verification remain low confidence.
- `observe passages|consensus --target <dir|URL>` performs static extraction.
- `observe performance` imports evidence or calls CrUX with `CRUX_API_KEY`.
  `--lighthouse` instead performs 1-5 local lab runs (default 3) using optional
  `lighthouse` and `chrome-launcher` peers, preserving each result and a median
  summary. Lab evidence remains separate from CrUX field evidence.
- `observe corroboration --input <JSON>` records observable external mentions;
  controlled or unverified sources do not become authority claims.

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
