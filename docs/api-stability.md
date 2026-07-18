# API Stability Guarantees — v1.0.0+

Citable follows [Semantic Versioning](https://semver.org/) with the following contract.

## Stable Public API (semver-protected from v1.0.0)

Changes to any of the following require a **MAJOR** version bump:

| API Surface | Description |
|---|---|
| `finding` schema | `findings.json` field names, required fields, `classification.severity` values |
| `manifest` schema | `manifest.json` envelope fields required by downstream consumers |
| Detector IDs | `detector_id` values (e.g. `TECH-001`) — referenced in suppressions and reports |
| Namespace names | `TECH`, `CRAWL`, `ARCH`, etc. — used in `--scope` flag |
| CLI commands | `audit`, `init`, `inspect`, `map-claims`, `substantiate`, `schema`, `validate`, `compare-snapshots` |
| CLI flags | `--scope`, `--target`, `--output-dir`, `--providers`, `--yes`, `--dry-run`, `--force` |
| Exit codes | `0` = success, `1` = findings at or above threshold, `2` = tool error |
| Registry schemas | JSON-Schema files in `schemas/` — changes to required fields |

## Backwards-Compatible Changes (MINOR version)

- New detectors (new `detector_id` values)
- New namespaces
- New CLI commands
- New optional CLI flags
- New optional registry fields
- New agent host providers in `dist/universal/`

## Bug Fixes (PATCH version)

- Detector logic corrections that don't change detector IDs
- Documentation fixes
- Dependency updates (non-breaking)
- Performance improvements

## Not Covered by Stability Guarantees

- Internal module APIs (`src/**`) — these are implementation details
- `skill/SKILL.md` content — the guidance text may change as best practices evolve
- Report formatting (`report.md` rendered output) — cosmetic changes are not breaking
- Evidence package filenames beyond `findings.json` and `manifest.json`

## Suppression Compatibility

`detector_id` values are **permanent once published**. If a detector is retired, it will be:
1. Deprecated in a MINOR release (documented, still runs, emits `deprecated: true` field)
2. Removed in the next MAJOR release

This ensures suppressions in `.citable/` registries don't silently stop working.
