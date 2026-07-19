# Contributing

By submitting a contribution, you agree that it is licensed under the
repository's Apache-2.0 license. Participation is governed by
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Start In The Right Channel

- Reproducible bugs, detector challenges, documentation corrections, and
  supported integration proposals use the matching Issue form.
- Usage questions, early ideas, provider research, and examples use
  [GitHub Discussions](https://github.com/mikeholownych/citable/discussions).
- Security vulnerabilities use private vulnerability reporting. Never include
  credentials, customer data, or private evidence in public channels.
- Hosted dashboard, account, billing, and service work is outside this
  repository. See [`SUPPORT.md`](SUPPORT.md).

## Pull Requests

- Branch from current `main`; direct pushes to `main` are not the supported
  contribution path.
- Use a Conventional Commits PR title such as `feat(installer): add agent
  discovery` or `fix(crawler): bound redirect retries`. The squash-merge commit
  should use the validated PR title.
- Complete every section of the pull request template. Record exact validation
  commands, semantic release impact, residual risk, and any checks not run.
- User-facing changes under `src/`, `skill/`, `schemas/`, or `cli/` must add a
  bounded entry to the `Unreleased` section of `CHANGELOG.md`.
- Require the `PR structure and release notes`, `test`, `lint`, and platform npm
  package checks before merge. Require a code-owner review when an eligible
  maintainer other than the PR author is available.
- Link the accepted Issue when one exists. A Discussion alone does not establish
  implementation approval.

## Engineering Contracts

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
- Run `node scripts/validate-community.js` when changing community forms,
  governance files, or support routing.

## Release Changes

Do not combine feature work and a version bump in the same pull request. A
maintainer prepares a dedicated release branch through the `Prepare release
branch` workflow, then opens its PR so normal PR events run every required
check. After review and merge, a maintainer dispatches `Ship release` for the
same version. See [the release runbook](docs/release/npm-trusted-publishing.md).
