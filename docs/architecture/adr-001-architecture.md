# ADR-001: Citable architecture

Status: accepted · Date: 2026-07-18

## Context

Citable must be an auditable operational system for SEO/AEO/GEO governance:
deterministic where conditions are observable, rubric-driven where judgment is
required, fail-closed where facts are missing, and installable across agent
environments. The three normative requirement documents (SEO/AEO/GEO, repo
root) are the source of controls.

## Decisions

1. **Node 22 ESM, minimal dependencies** (js-yaml, ajv + formats,
   node-html-parser). Node's built-in test runner, fetch, and crypto remove
   the need for heavier tooling; every dependency is parse/validate-only, so
   the audit path has no network or binary dependencies beyond optional URL
   fetching.
2. **Registries as YAML + JSON Schema.** Human-diffable in review, machine
   validated (ajv), referential integrity enforced in the loader. Saves are
   history-preserving (snapshots/registry-history) — requirement §5 "do not
   overwrite user-maintained registry content".
3. **Detector = data + pure check function.** `defineDetector` enforces the
   contract fields (remediation, verification, namespace-prefixed id,
   discipline, determinism flag). Detectors read a shared context (site model,
   registries, prompt results, snapshots) and emit hits; the framework wraps
   hits into schema-validated findings with stable content-derived IDs
   (deterministic reruns → identical IDs, acceptance criterion 21).
4. **Two-tier truth model.** Deterministic detectors produce
   `deterministic_observation`; heuristic detectors are marked
   `deterministic: false`, capped at medium/high confidence, and carry
   false-positive conditions. Semantic judgment lives in `skill/rubrics/*` and
   is executed by the agent, not the CLI — the CLI never pretends to judge
   meaning (premise 3.2).
5. **SiteModel from built output or URL.** Static analysis of built HTML is
   the primary mode (reproducible, CI-friendly); URL mode uses bounded
   same-origin fetch with redirect-chain capture. Transport facts a static
   dir can't know (status, headers) come from an optional
   `_citable-transport.json` sidecar; absent sidecar means 200/no-headers
   assumptions are recorded, not hidden. Full browser rendering is out of MVP
   scope and explicitly reported as an incomplete check (never silently
   skipped).
6. **Evidence package per run.** `.citable/runs/<id>/` with manifest (tool
   version, commit, tree state, hashes), findings, report, captured robots/
   sitemaps/headers/schema/link graph, and checksums.json over every artifact.
   A report without its package is not a deliverable (§13).
7. **Fail-closed command semantics.** `substantiate` can only downgrade claim
   status automatically; upgrades require verified evidence *plus* the
   evidence-strength rubric with human review. `schema` blocks proposals for
   incomplete entities with required_input instead of inventing fields.
   `map-claims` writes only `candidate`/`review_required` statuses.
8. **Single canonical skill source, generated distributions.**
   `skill/` is canonical; `scripts/build-dist.js` renders per-environment
   packages (claude-code, codex, cursor, gemini, generic) from it. No manually
   divergent command copies (§18).
9. **No fabricated engine adapters.** Measurement commands validate
   operator-supplied observations against contracts; MEAS detectors enforce
   statistical caution. Claiming live ChatGPT/Perplexity/GSC adapters without
   reliable implementations would violate §20 phase 6 ("do not claim external
   engine support where no reliable adapter exists").

## Consequences

- The MVP is strongest on repository/built-output governance and weakest on
  live-engine observation — by design and documented.
- Heuristic detectors trade recall for explainability; thresholds live in
  config (`audit.thin_content_words`, `max_crawl_depth`) rather than code.
- Node-only implementation means non-JS repos are audited via their built
  HTML output, not their source templates.
