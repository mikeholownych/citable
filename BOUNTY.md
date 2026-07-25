# Fail-Closed Bounty

Citable's core guarantee is that no claim reaches `verified` without evidence
in the evidence registry, and that missing facts return `blocked` rather than
an invented answer (`skill/SKILL.md`, operating premise 5). This bounty pays
in permanent, public attribution — not money — to anyone who proves that
guarantee failed.

## What Qualifies

A submission qualifies if it demonstrates, with a reproducing fixture, that:

- A claim reached `verified` status without sufficient evidence in the
  evidence registry, or with evidence that had expired, or without the
  required human semantic review; or
- A detector, rubric, or registry validation silently passed a case that
  `skill/SKILL.md`'s operating premises require to be `blocked` or
  `unverified`.

General bugs, typos, and feature requests are not bounty submissions — use
the Issue forms described in `CONTRIBUTING.md`. This bounty is scoped
narrowly to the fail-closed guarantee itself.

## Acceptance Criteria

Every submission is a pull request containing:

1. A **positive fixture** reproducing the breach: the exact input that
   currently reaches `verified` (or otherwise passes) when it should not,
   added under `tests/fixtures/`.
2. A **negative fixture** proving the fix: the same case correctly resolving
   to `blocked`, `unverified`, or a failed/non-finding state once corrected.
3. The code or schema change that closes the gap, satisfying the existing
   engineering contracts in `CONTRIBUTING.md` (namespace-prefixed detector
   IDs where applicable, requirement lineage, false-positive conditions for
   heuristic detectors, etc.).
4. A passing `npm test` run across the full suite — the fix must not
   regress any other fixture.

Submissions that only report the breach without a reproducing fixture and a
proposed fix are welcome as Issues, but do not qualify for the Hall of Fame
entry — the bounty rewards closing the gap, not just finding it.

## Reward

A confirmed, merged submission earns a permanent entry in the
[**Fail-Closed Hall of Fame**](CHANGELOG.md#fail-closed-hall-of-fame) in
`CHANGELOG.md`: the submitter's name, the date, and a one-line description of
the breach, cross-linked to the fixture that now guards against its
regression. Entries are append-only and are never edited or removed once
merged — the record is the point.

There is no monetary payout. The project is Apache-2.0, single-maintainer,
and unfunded; see `GOVERNANCE.md`.

## Process

1. Open the pull request against `main` following the normal contribution
   path in `CONTRIBUTING.md`.
2. Title it `fail-closed(bounty): <short description>` so it's identifiable
   as a bounty submission in review and in `git log`.
3. Reference this file (`BOUNTY.md`) in the PR description and state which
   operating premise or detector the fixture pair targets.
4. On merge, the maintainer adds the Hall of Fame entry in the same PR or a
   direct follow-up.

Participation is governed by `CODE_OF_CONDUCT.md`. By submitting, you agree
your contribution is licensed under the repository's Apache-2.0 license, per
`CONTRIBUTING.md`.
