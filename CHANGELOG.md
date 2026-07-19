# Changelog

## Unreleased

### Added — Executive Reporting Suite

**Governed input registries (8 new schemas + registry specs)**

- `kpi` command — KPI Architecture registry: govern metric definitions, sources,
  targets, calculation, known limitations, and restatement policy. Refuses metrics
  lacking executive definitions or empty `known_limitations`.
- `variance` command — Variance analysis registry: enforces four-act narrative
  (plan → actual → cause → response). Rejects vague causes (`market conditions`,
  `timing`, `customer behaviour`) as primary drivers. Material/critical variances
  require `management_response`.
- `outcomes` command — Customer Outcomes registry: separates activity from
  validated impact. Enforces `finding_produced → finding_accepted →
  answer_engine_changed → commercial_value_claimed →
  causal_relationship_established` progression. Blocks `commercial_value` at
  `finding_produced` stage.
- `risk` command — Risk Register: top risks sorted by residual exposure, KRI
  tracking, trigger thresholds, control effectiveness. Board-visible risks require
  `trigger_threshold`. High/critical risks require `key_risk_indicators`.

**Executive output commands**

- `executive-review` — Monthly Executive Operating Review. Evidence ledger built
  first (governed metrics, variance counts, outcome stages, risk counts), then
  four-act narrative template generated. Returns `ungoverned_warning` when no KPIs
  registered — refuses to produce narrative from ungoverned data.
- `board-report` — Quarterly Board Pack. Every reported statement carries
  `statement_type`, `source_records`, `period`, `confidence`, and `limitations`.
  Returns `refused_sections` when kpis/customer-outcomes/risks are absent.
- `decision-memo` — Bounded Decision Record. Requires: named consulted parties,
  `what_would_change_recommendation`, real trade-offs on every option (no
  strawmen), specific `supporting_evidence`, and `reopen_conditions` for
  effectively-one-way decisions.

**Strategic analysis commands**

- `assumption-audit` — Assumption validity tracking. Validated assumptions require
  `evidence_for`; contradicted assumptions require `evidence_against`; critical
  importance requires `next_test` date.
- `scenario` — Compound Risk Scenario War Room. Capped at 3 variables per
  scenario. Requires `cascade_analysis`, all three states (base/stress/severe),
  hedges with cost/impact/owner/deadline, and `early_warning_triggers`.
- `prioritize` — Initiative Prioritization with transparent scoring: `(demand +
  revenue + differentiation − engineering − operating − legal) × evidence_multiplier`.
  Weights exposed in output. Rejects `revenue_potential=transformative` with
  `evidence_strength=assumption`.
- `competitive-intel` — Competitive Intelligence. Every claim requires
  `observation_date`, `source`, and `claim_type`. Unreliable sources (G2, Capterra,
  homepage, LLM recall) require `independent_verification`. Includes `stale`
  subcommand.

**Orchestration**

- `executive` command — Chief-of-Staff Router. Routes 11 request patterns to
  the correct reporting skill. Max orchestration depth: 1 (no recursive routing).
  Logs all routing decisions to `.citable/executive-log.yaml` (last 100 retained).
  `--route <command>` forces a specific route. `--log` shows recent decisions.

**Infrastructure**

- 8 new JSON schemas registered in `REGISTRY_SPECS`:
  `kpi`, `variance`, `customer-outcome`, `risk`, `decision`, `assumption`,
  `scenario`, `initiative` — all with `citable://schemas/` `$id` prefix for AJV
  compatibility.
- Comprehensive unit coverage in `tests/unit/executive-reporting.test.js` for
  governed inputs, reports, cross-registry integrity, deterministic IDs, and fixed-date evaluation.

## 1.12.0 — 2026-07-19

### Fixed

- Replaced regex-based HTML and transcript tag stripping with structured parsing
  that excludes executable elements, including malformed end-tag variants.
- Restricted schema-source discovery to exact `schema.org` hosts instead of
  accepting deceptive hostname substrings.
- Removed command-line-derived release-note regular expressions and an
  ineffective identity replacement in schema integration coverage.

### Added

- Independent desktop, mobile, and JavaScript-disabled Chromium render profiles
  with raw/rendered parity artifacts and bounded interaction discovery.
- Partial-failure evidence and `--resume-run` recovery that reuses only
  successful profiles from an immutable source run.
- Optional repeated local Lighthouse execution with pinned runtime metadata,
  per-run artifacts, lab/field separation, and median metric summaries.

## 1.11.0 — 2026-07-19

### Added

- Bounded media evidence collection for local PDF text/metadata with page
  anchors, transcript cues with provenance, and image alt/caption context.
- Explicit optional OCR behavior and media-to-claim linkage validation through
  `citable observe media --input <manifest> [--ocr]`.
- Medium-specific limitations that prevent extraction from being represented as
  claim support, reading-order validation, transcription accuracy, or semantic equivalence.

## 1.10.0 — 2026-07-19

### Added

- Version-pinned audit schedules that invoke the canonical audit path and keep
  external trigger limitations explicit.
- Hash-bound, non-authoritative GitHub annotation projections from immutable runs.
- Differential comparability dimensions for resource, evidence artifact,
  detector, configuration, observation method, tool, and external-system changes.

## 1.9.0 — 2026-07-19

### Added

- Materiality-ranked semantic review queues with explicit missing-input states,
  reviewer assignment, hash-bound decisions, and independent adjudication.
- Reproducible census and seeded random sampling plans recording population
  hashes, inclusion/exclusion criteria, assignment method, and extrapolation limits.
- `citable reviews queue|prioritize|plan|sample|evaluate` workflows.

## 1.8.0 — 2026-07-19

### Added

- Schema-validated reviewer, review-policy, and governed-exception registries
  with role authorization, declared conflicts, separation-of-duty controls,
  expiry, renewal limits, supersession, compensating controls, and audit history.
- `citable governance validate` and `citable governance evaluate` for
  policy validation and immutable enforcement-disposition evidence packages.
- Finding, policy, and evidence hash binding so stale approvals fail closed.

### Changed

- Accepted exceptions no longer alter technical finding state. Reports preserve
  `technical_state: failed` and record `accepted_exception` only as a separate
  enforcement disposition with explicit residual risk and validity.
- The supported runtime floor is Node.js 24, matching all CI, package, release,
  and trusted-publishing gates.

## 1.7.0 — 2026-07-19

### Added

- Multidimensional evidence authority metadata separating source authority,
  collection authority, authenticity, and representativeness.
- A staged crawler-identity evidence contract that requires checksummed range
  provenance, DNS, edge, and origin evidence before `fully_verified`.
- JSON/CSV production-log normalization and Bing Search Performance or AI
  Performance owner-export observations with explicit interpretation limits.

### Changed

- Crawler log observations no longer reduce identity to an
  `identity_verified` boolean; incomplete and contradictory chains remain
  visible in the immutable evidence.

## 1.6.0 — 2026-07-19

### Added

- Optional read-only connector SDK with explicit non-secret connection state,
  property discovery, access validation, bounded synchronization, and disconnect.
- Google Search Console Search Analytics and GA4 Data API adapters that collect
  declared metrics into immutable observations without storing access tokens.

## 1.5.1 — 2026-07-18

### Fixed

- `Ship release` now explicitly dispatches trusted npm publishing at the newly
  created tag because GitHub suppresses workflow events generated by its own
  repository token.

## 1.5.0 — 2026-07-18

### Added

- Installer aliases compatible with the common `skills` CLI interface:
  repeatable `--agent`/`-a`, `--skill`/`-s`, `--copy`, `-p`, `-g`, and `*`
  provider selection.
- Explicit copy-only integrity policy and actionable rejection of unsupported
  symlink installs.
- Structured pull request controls with code ownership, a required PR contract,
  Conventional Commits title validation, and release-note enforcement.
- Review-gated release preparation and shipping workflows with semantic-version
  consistency checks, changelog-derived GitHub releases, protected tagging, and
  npm trusted publishing handoff.
- Optional provider-neutral metric, objective, intervention, and connection-state
  contracts with strict schema and referential validation.
- CSV/JSON metric imports, user-owned objective creation and validation, and
  evidence-deduplicated baseline/evaluation reporting with explicit guardrails
  and inconclusive outcomes.

### Fixed

- `citable install --all` now selects every supported provider in addition to
  confirming non-interactively.
- Release preparation now updates and validates the canonical skill version in
  addition to package, lockfile, changelog, and roadmap versions.

## 1.4.0 — 2026-07-18

### Added

- Governed observation envelopes and evidence collectors for rendered DOM,
  search-index exports/live Google inspection, controlled citation experiments,
  citation support review, production crawler logs, answer passages,
  canonical/freshness consensus, CrUX or imported performance data, and external
  corroboration.
- `citable apply` for reviewed, source-run-bound, hash-locked source changes;
  dry-run is the default and stale or ambiguous operations fail closed.
- `citable monitor` for observation-state, index, canonical, and citation
  regressions across immutable runs.
- Optional Playwright peer integration and a disclosed HTTP adapter protocol
  for repeatable provider/prompt experiments.

## 1.3.1 — 2026-07-18

### Fixed

- GitHub workflows now use `actions/checkout@v7` and `actions/setup-node@v7`,
  whose action runtimes target Node.js 24, in addition to running project tasks
  on Node.js 24.

## 1.3.0 — 2026-07-18

### Added

- `citable action-plan [run-id]` converts immutable audit findings into ordered remediation artifacts with owners, blockers, unsafe shortcuts, semantic review gates, and detector-specific verification commands.
- ANS-009/010 and GEO-005/006 validate prompt-to-page coverage, page-level claim/evidence mapping, primary entity mapping, and complete prompt evaluation briefs.
- Canonical finding-to-action and AEO/GEO acceptance workflows for installed agent skills.
- Separate audit posture states for retrieval eligibility, source extraction/support suitability, and observed citation behavior; no aggregate AI visibility score.
- Capability-boundary and gap-analysis references covering crawler identity, index presence, rendered extraction, passage integrity, canonical consensus, and controlled citation evidence.

### Changed

- Registry entry schemas now reject unknown properties so misspelled governance fields fail validation instead of being ignored. This is a stricter contract; existing registries with extension fields must migrate those fields into the documented schema before validation.
- Remote audits now restrict redirects to the audited origin, reject private-network destinations, enforce per-attempt timeouts, and cap response bodies at 5 MiB.

### Fixed

- Invalid `--ref-date` values now fail closed before expiry or evidence evaluation.
- `self-upgrade` reports a nonzero process exit status when registry checks or cache refreshes fail.
- Release packaging supports both array-shaped and package-keyed `npm pack --json` metadata through a shared parser.

## 1.2.0 — 2026-07-18

### Added

- **`self-upgrade` command** — checks npm registry for the latest version and upgrades the npx cache if a newer version is available:
  - `npx @nebulacomponents/citable self-upgrade` — check and upgrade
  - `npx @nebulacomponents/citable self-upgrade --check` — check only, no upgrade
  - `npx @nebulacomponents/citable self-upgrade --json` — machine-readable output
  - Uses Node's built-in `fetch` (no extra deps), 10s timeout, graceful offline error
- **6 new tests** for self-upgrade (current, update-available, registry failure × 2 each for human/JSON output)

### Changed

- Test count: 84 → 90

## 1.1.0 — 2026-07-18

### Added

- **AGENT namespace** — 10 agent-readiness detectors based on [isitagentready.com](https://isitagentready.com/) checks:
  - **AGENT-001** `AI bot rules absent from robots.txt` — checks for GPTBot, ClaudeBot, PerplexityBot, anthropic-ai, and other AI crawler rules
  - **AGENT-002** `Link response headers absent` — HTTP Link headers for agent discovery (sitemap, MCP, API catalog)
  - **AGENT-003** `llms.txt missing` — llmstxt.org structured Markdown for LLM consumption
  - **AGENT-004** `MCP Server Card not discoverable` — `/.well-known/mcp` for Model Context Protocol server auto-discovery (API sites only)
  - **AGENT-005** `A2A Agent Card not discoverable` — `/.well-known/agent.json` for Google A2A inter-agent discovery (agent sites only)
  - **AGENT-006** `Markdown content negotiation not supported` — `Accept: text/markdown` / Cloudflare Markdown for Agents
  - **AGENT-007** `Web Bot Auth not declared` — Cloudflare Web Bot Auth for authenticated bot access
  - **AGENT-008** `Content-Signals header absent` — Cloudflare Content Signals for AI usage permissions
  - **AGENT-009** `auth.md not present` — `/auth.md` authentication documentation for agent consumers (API/auth sites only)
  - **AGENT-010** `Agentic commerce protocols not declared` — x402, MPP, UCP, ACP payment protocol signals (commerce sites only)
- **38 new tests** for AGENT detectors
- **`agent-readiness` discipline** added to finding schema
- **`file` subject type** added to finding schema

### Changed

- Detector count: 102/15 namespaces (0.1.0) → 109/17 (1.0.0) → **119/18 namespaces** (this release)
- Test count: 46 → 84

## 1.0.0 — 2026-07-18

**First production release.**

### Added

- **HREFLANG namespace** — 3 detectors for international SEO validation:
  - HREFLANG-001: hreflang link validation (valid hreflang values)
  - HREFLANG-002: self-reference check (page should reference itself)
  - HREFLANG-003: x-default presence (missing default language fallback)
- **CWV namespace** — 3 infrastructure detectors for Core Web Vitals readiness:
  - CWV-001: LCP potential blockers (render-blocking scripts, images without dimensions)
  - CWV-002: preconnect hints for fonts
  - CWV-003: image optimization checks (format, dimensions, lazy loading)

  > **Limitation:** no field or lab data collection; the CWV detectors check
  > infrastructure readiness, not performance.
- **URL fetch resilience** — retry with exponential backoff + jitter, 5xx handling
- **CI workflow** — GitHub Actions for Node 22 matrix testing

### Changed

- **Detector count** — now 109 detectors across 17 namespaces
- **Documentation** — fixed test count (33 → 46), updated README/CLAUDE.md/AGENTS.md

### Fixed

- CI workflow compatibility — use actions@v4, Node 22 (not v6, Node 24)
- npm-publish workflow — fixed version check for new packages

## 0.1.0 — 2026-07-18

Initial MVP.

- npm package exposes a real `citable` executable at `cli/bin/citable.js` with
  installer commands: install, update, check, uninstall, list, doctor, help,
  `--version`, JSON output, dry-run support for mutating commands, and
  provider-specific project/global path handling.
- `npx @nebulacomponents/citable install` installs from the packaged `dist/universal/` bundle
  without requiring a Git checkout, with managed manifests, SHA-256 payload
  hashes, atomic target replacement, idempotency checks, and unmanaged/local
  modification refusal.
- Universal distribution bundle now covers Claude Code, OpenAI Codex, Cursor,
  Gemini CLI, GitHub Copilot, OpenCode, Kiro, Pi, Qoder, Trae, Trae CN, and
  Rovo Dev from the canonical `skill/` and `schemas/` sources.
- 9 schema-validated registries with referential integrity and history-preserving saves
- 102 detectors across 15 namespaces, positive/negative fixture coverage
- Commands: init, audit (11 scopes), inspect, map-claims, substantiate, schema,
  validate (5 modes), compare-snapshots
- Evidence packages with manifests, checksums, and regression comparison
- Canonical skill (SKILL.md, 12 rubrics, anti-pattern library, command contracts)
- Generated universal bundle variants for supported agent hosts
- Known gaps documented in docs/known-limitations.md (no live engine adapters,
  no browser rendering, no CWV/hreflang/multimodal detectors)
