# Citable — Build Plan

## Phase 0: Source analysis and architecture
- [x] Read all three normative requirement docs in full
- [ ] Architecture decision record (docs/architecture/adr-001)
- [ ] Traceability matrix (docs/architecture/traceability-matrix.md)

## Phase 1: Skill foundation
- [ ] Repo scaffold, package.json, git init
- [ ] JSON Schemas for all registries + finding + run manifest
- [ ] Registry loader/validator with referential integrity
- [ ] Canonical skill/SKILL.md

## Phase 2: Technical inspection engine
- [ ] HTML extractor → PageModel (title, metas, canonicals, robots, headings, links, JSON-LD, text)
- [ ] robots.txt parser, sitemap parser, URL fetcher w/ header capture
- [ ] Site model + internal link graph

## Phase 3: Detectors (target ≥60, tested)
- [ ] TECH, CRAWL, ARCH, PAGE, ANS, ENTITY, CLAIM, EVD, SCHEMA, LINK, EXT, GEO, RECO, LIFE, MEAS

## Phase 4: MVP commands
- [ ] init, audit, inspect, map-claims, substantiate, schema, validate, compare-snapshots

## Phase 5: Evidence and regression
- [ ] Run manifests, checksums, findings.json + report.md, snapshot diffing

## Phase 6: Skill content
- [ ] Command workflow docs, 12 rubrics, anti-pattern library, crawler policy templates

## Phase 7: Distribution
- [ ] scripts/build-dist.js → dist/{claude-code,codex,cursor,gemini,generic}

## Verification
- [ ] node --test green
- [ ] Example run against fixture site with inspectable evidence package
- [ ] Acceptance criteria assessment (25 criteria)

## Review

Completed 2026-07-18. All phases delivered except live-engine adapters
(documented as out of MVP scope in docs/known-limitations.md, per §20 phase 6
"do not claim external engine support where no reliable adapter exists").

- 102 detectors / 15 namespaces, 33 tests green, positive+negative fixtures
- 8 CLI commands + agent-workflow contracts for the rest
- Evidence packages with checksums; reproducible dist builds (verified twice)
- Traceability matrix maps all three source docs to controls
- Example run committed under examples/demo/.citable/runs/

Follow-ups (highest value first): rendered-vs-initial HTML comparison via
headless browser; Search Console/Bing export adapters; hreflang detectors.
