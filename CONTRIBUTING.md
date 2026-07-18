# Contributing

- Every detector needs: namespace-prefixed ID, description, discipline(s),
  severity, determinism flag, remediation, verification, requirement lineage
  (`applicable_requirement`), and tests proving both detection and
  non-detection against fixtures.
- Heuristic detectors must declare false-positive conditions and cap
  confidence at high.
- Registry schema changes require a migration note in CHANGELOG.md and
  updated fixtures.
- `npm test` must pass; `npm run build:dist` must remain reproducible
  (identical content hashes across consecutive builds).
- New source requirements must be added to docs/architecture/traceability-matrix.md —
  no material requirement may disappear silently.
