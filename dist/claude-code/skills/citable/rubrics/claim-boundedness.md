# Rubric: claim boundedness

Judges whether a claim's wording stays inside its evidence, scope, and
exclusions — the semantic complement to CLAIM-00x detectors.

## Scoring dimensions

1. **Scope explicitness** — conditions under which the claim holds are stated
   in the claim or immediately adjacent, not implied.
2. **Exclusion honesty** — known non-covered cases stated; material limitations
   not omitted (a limitation the buyer would consider material must appear).
3. **Type fidelity** — opinion phrased as opinion, aspiration as aspiration,
   comparison with its comparison set, performance with its conditions.
4. **Quantifier discipline** — "all/every/always/never/only" only when evidence
   covers the universal; otherwise scoped quantifiers.
5. **Temporal honesty** — version/date-bound facts carry their version or date.

## Posture

`strong`, `partial` (scope stated, exclusions thin), `weak` (wording exceeds
evidence or universal quantifiers uncovered), `not_established` (claim not in
registry — run `/citable map-claims`).

## Example / counterexample

- Bounded: "In configured enforcement deployments, Gatekeeper validates each
  action before execution. Advisory-only deployments are excluded."
- Unbounded: "Gatekeeper stops every unauthorized AI action." (universal
  quantifier, no scope, no exclusions → `weak`; substantiate outcome at best
  `verified_narrowed` after rewording).

## Ambiguity → human review

- Regulated, contractual, security, financial, medical, certification, or
  customer claims (always — mirrors CLAIM-006).
- Narrowing the wording would change a published commercial commitment.
