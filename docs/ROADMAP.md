# Citable Roadmap

**Goal:** Build a defensible SEO/AEO/GEO evidence and governance tool. Citable
reports observable readiness and controlled citation outcomes; it does not
guarantee retrieval, ranking, citation, or model prioritization.

## Current State (v1.5.1)

| Metric | Value |
|--------|-------|
| Detectors | 123 across 18 namespaces |
| Tests | 122 pass |
| Registries | 13 schema-validated |
| Providers | 12 agent hosts |
| Distribution | 52 canonical skill files per provider |
| Release automation | npm trusted publishing with provenance; Linux, macOS, and Windows package gates |

The current release separates retrieval eligibility, source extraction and
support suitability, and observed citation behavior. `action-plan` converts
immutable findings into owned, ordered remediation work without mutating the
audited property or claiming that a recommendation was implemented.

## Delivered

- Public npm package and provider-specific skill installation.
- Immutable audit evidence, checksums, snapshot comparison, and fail-closed
  registry validation.
- Retry-bounded remote fetches with same-origin redirect enforcement,
  private-network rejection, timeouts, and response-size limits.
- SEO, AEO, GEO, crawler, structured-data, hreflang, CWV-readiness, and
  agent-readiness detectors.
- Prompt-to-page, entity, claim, and evidence mapping checks.
- Source-run-bound action plans with blockers, owners, semantic review gates,
  unsafe-shortcut warnings, and verification commands.
- Immutable observation collectors for optional browser rendering, Google or
  imported index evidence, controlled citation cohorts, crawler logs, passages,
  canonical/freshness consensus, CrUX/imported performance, and corroboration.
- Reviewed hash-locked remediation plus longitudinal evidence monitoring.

## Next Priorities

### Retrieval Evidence

- Provider-maintained IP-range retrieval and verification beyond imported
  owner verification results.
- Bing index and AI Performance adapters when supported export/API contracts
  can be captured defensibly.
- Multi-region and bot-specific reliability sampling.

### Extraction Evidence

- Mobile/cross-browser rendered comparison and interaction-hidden inventory.
- Stronger main-content segmentation and reviewed passage-integrity workflows.
- Canonical consensus matrices spanning redirects, markup, sitemaps, internal
  links, and observed search-engine selections.

### Observed Citation Testing

- First-party adapters for provider products whose supported interfaces expose
  complete answer and citation evidence; custom adapters already preserve mode.
- Citation correctness, first-party selection, canonical citation, attribution
  accuracy, stability, and provider-variance metrics.
- Competitive retrieval-set comparison without collapsing outcomes into a
  single visibility or authority score.

### Measurement Extensions

- Release `v1.5.0` gates provider-neutral metric declarations, optional owner
  imports, user-defined objectives, cohorts, windows, and guardrails before live
  connector work begins.
- Lighthouse lab execution; CrUX field collection is implemented while existing
  CWV detectors remain infrastructure-readiness checks.
- Multimodal extraction for images, video, audio, and PDFs with explicit
  provenance and confidence.
- Optional analytics integrations using aggregate data and documented consent
  boundaries.

## Release Policy

- **MAJOR:** breaking command, schema, registry, or artifact contract changes.
- **MINOR:** backward-compatible commands, detectors, adapters, or report fields.
- **PATCH:** backward-compatible fixes and documentation corrections.

Every release must pass `npm test`, rebuild distributions from `skill/`, validate
the packed tarball, and record user-visible changes in `CHANGELOG.md`.
