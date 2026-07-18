# Changelog

## Unreleased

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

### Fixed

- `citable install --all` now selects every supported provider in addition to
  confirming non-interactively.

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
