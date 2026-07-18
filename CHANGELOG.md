# Changelog

## 0.1.0 — 2026-07-18

Initial MVP.

- 9 schema-validated registries with referential integrity and history-preserving saves
- 102 detectors across 15 namespaces, positive/negative fixture coverage
- Commands: init, audit (11 scopes), inspect, map-claims, substantiate, schema,
  validate (5 modes), compare-snapshots
- Evidence packages with manifests, checksums, and regression comparison
- Canonical skill (SKILL.md, 12 rubrics, anti-pattern library, command contracts)
- Generated distributions: claude-code, codex, cursor, gemini, generic
- Known gaps documented in docs/known-limitations.md (no live engine adapters,
  no browser rendering, no CWV/hreflang/multimodal detectors)
