# Changelog

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
