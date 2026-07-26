# Citable Roadmap

**Goal:** Build a defensible SEO/AEO/GEO evidence and governance tool. Citable
reports observable readiness and controlled citation outcomes; it does not
guarantee retrieval, ranking, citation, or model prioritization.

## Current State (v1.13.1)

| Metric | Value |
|--------|-------|
| Detectors | 123 across 18 namespaces |
| Tests | 302 pass on Node 24 |
| Registries | 27 schema-validated |
| Providers | 12 agent hosts |
| Distribution | 95 packaged skill files per provider; 2 managed Claude profiles |
| Release automation | npm trusted publishing with provenance; Linux, macOS, and Windows package gates |

The current release separates retrieval eligibility, source extraction and
support suitability, and observed citation behavior. `action-plan` converts
immutable findings into owned, ordered remediation work without mutating the
audited property or claiming that a recommendation was implemented.

The current development branch builds 95 packaged skill files per provider
after the artifact-interchange and agent-profile contracts are generated from
canonical `skill/` sources. Claude additionally receives a separately
manifested two-profile discovery payload.

## Delivered

- Public npm package and provider-specific skill installation.
- Two evidence-phase Claude Code profiles: a guarded audit/collection role and
  a read-only semantic-review role, both generated from canonical `skill/`
  sources. Other hosts fail closed as unsupported for native profiles.
- Read-only installer and runtime capability diagnosis that keeps optional
  dependency or credential presence separate from successful browser launch,
  API authorization, property access, and collection.
- Read-only profile-aware audit planning with a two-signal inference threshold,
  explicit evidence/confidence, full-audit preservation, and independently
  blocked optional collectors.
- Immutable audit evidence, checksums, snapshot comparison, and fail-closed
  registry validation.
- Retry-bounded remote fetches with same-origin redirect enforcement,
  private-network rejection, timeouts, and response-size limits.
- SEO, AEO, GEO, crawler, structured-data, hreflang, CWV-readiness, and
  agent-readiness detectors.
- Prompt-to-page, entity, claim, and evidence mapping checks.
- Schema-validated normalized JSON-LD graph artifacts with source-block hashes,
  declared and unresolved edges, parse failures, and bounded visible-text
  support status.
- Source-run-bound action plans with blockers, owners, optional dependency
  relationships, explicit failure conditions, semantic review gates,
  unsafe-shortcut warnings, bounded monitoring fields, and verification
  commands. Unsupported dependencies or indicators remain empty rather than
  inferred.
- Immutable observation collectors for optional desktop/mobile/JavaScript-disabled
  Chromium rendering with bounded interactions and resumable partial failures, Google or
  imported index evidence, controlled citation cohorts, crawler logs, per-agent
  synthetic probes, passages with repeated-region extraction evidence,
  canonical/freshness consensus, CrUX/imported performance, and corroboration.
- Reviewed hash-locked remediation plus longitudinal evidence monitoring.
- Policy-driven reviewer authority and governed exceptions that preserve failed
  technical state while independently recording enforcement disposition,
  validity, residual risk, expiry, renewal, and invalidation evidence.
- Version-pinned canonical audit schedules, hash-bound GitHub projections, and
  differential comparability dimensions without causal attribution.

## v1.13 Validation Gates In Progress

- Canonical release manifests bind executable facts and controlled projections
  to the release commit; mismatched counts, versions, generated artifacts, or
  checksums fail closed.
- Releases use an explicit `published_unfinalized` phase. Publisher-controlled
  deployment receipts gate irreversible finalization, while later drift creates
  a new finding and never rewrites historical release state.
- Direct and cache-busted representation probes remain `external_unverified`
  longitudinal observations and cannot satisfy release gates.
- Acceptance-corpus evaluation preserves detector confusion matrices,
  incomplete evidence, reviewer agreement, execution cost, reproducibility,
  and remediation-verification denominators.
- Acceptance-run receipts bind verified run-package checksums to property,
  detector, configuration, observation-method, tool, and external-system
  dimensions. Environment-specific execution context remains visible but is
  excluded from canonical reproducibility fingerprints.
- Real-property corpus records require explicit architecture, owner authority,
  collection, retention, sanitization, publication, evidence availability, and
  contradiction state. Public projection refuses private scope, unsafe or
  unapproved references, expired authority, and undeclared limitations.
- Field-validation metrics disclose numerator, denominator, population,
  exclusions, confidence boundaries, collection provenance, sample/census
  design, and detector-version cohorts. JSON and Markdown are projections of
  the same hash-bound metrics object; unknown false negatives remain unknown.
- Browser evidence plans execute explicit Chromium, Firefox, and WebKit
  profiles with bounded interaction journeys. Browser/device/runtime state and
  raw, DOM, text, accessibility, screenshot, interaction, and failure artifacts
  remain separate; profile differences carry no semantic-impact claim.
- A versioned artifact interchange exports, independently verifies, and imports
  complete sealed runs without changing canonical bytes. It rejects tampering,
  unsealed files, unsafe paths, symbolic links, incompatible envelopes, and run
  collisions; hosted workspace implementation remains outside this repository.

These capabilities are unreleased until the v1.13 release gates pass. Their
presence on `main` is not evidence that hosted collectors, independent
attestation, or the four-property field corpus have been completed.

## Next Priorities

### MCP Evidence Transport

**Current status:** contract documented; runtime transport not implemented.
MCP Server Card discovery findings in site audits do not mean Citable can
connect to or collect evidence from an MCP server.

MCP is planned only as a transport into the existing immutable observation
model. It will not confer provider authority, authenticity,
representativeness, completeness, or semantic validity on a tool response.

1. **Transport envelope and threat model:** define server identity, pinned
   version or verified endpoint, protocol and tool schema, request/response
   hashes, authorization scopes, raw retention, incomplete states, and
   normalization provenance.
2. **Read-only provider pilot:** implement one provider-supported, allowlisted
   server and tool with least-privilege authorization, bounded pagination,
   positive/negative fixtures, and explicit unsupported states.
3. **Runtime diagnosis:** extend capability reporting to distinguish package or
   endpoint presence, protocol negotiation, authorization, tool availability,
   property access, collection, and normalization.
4. **Provider-by-provider expansion:** add transports only where a supported
   interface and stable evidence contract can be verified. Each provider keeps
   its own authority and completeness boundaries.

Non-goals are generic arbitrary-server passthrough, state-changing tools,
automatic installation of undocumented servers, persisted credentials,
execution of instructions returned by tools, and treating MCP responses as
authoritative merely because they arrived through MCP.

The proposed provenance fields and security gates are documented in
[Integrations and evidence transports](INTEGRATIONS.md#mcp-transport-contract).

### Retrieval Evidence

- Provider-maintained IP-range retrieval and verification beyond imported
  owner verification results. The staged identity contract and production-log
  normalization are implemented.
- Bing index and AI Performance adapters when supported export/API contracts
  can be captured defensibly. Owner-export normalization is implemented; a live
  AI Performance adapter remains blocked on a supported API contract.
- Multi-region and bot-specific reliability sampling.

### Extraction Evidence

- Reviewed cross-browser comparison policies and application-specific journey
  libraries. The open local execution contract and Playwright adapter are implemented.
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
- Repeated local Lighthouse lab execution and CrUX field collection are
  implemented; hosted regional runners remain future work and existing CWV
  detectors remain infrastructure-readiness checks.
- Bounded PDF text/metadata, transcript, and image-context evidence is
  implemented with explicit provenance and optional OCR. Native video/audio
  decoding, scanned-PDF OCR, table reconstruction, and visual entailment remain
  future version gates.
- Optional analytics integrations using aggregate data and documented consent
  boundaries. GSC Search Analytics and GA4 organic acquisition are implemented;
  additional providers remain version-gated.

### Review Scale

- Materiality-ranked semantic review queues with recorded population, census or
  seeded random sampling, assignment, disagreement, and extrapolation limits
  are implemented. Stratified allocation remains a future version gate.
- Expiring, evidence-backed exception renewal workflows and reviewer
  reassignment without weakening immutable source findings.

## Release Policy

- **MAJOR:** breaking command, schema, registry, or artifact contract changes.
- **MINOR:** backward-compatible commands, detectors, adapters, or report fields.
- **PATCH:** backward-compatible fixes and documentation corrections.

Every release must pass `npm test`, rebuild distributions from `skill/`, validate
the packed tarball, and record user-visible changes in `CHANGELOG.md`.
