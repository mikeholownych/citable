# Rubric: evidence strength

Judges whether attached evidence actually supports a claim *as worded*. This is
the mandatory semantic gate before any claim moves toward `verified`
(`citable substantiate` handles only the deterministic preconditions).

## Scoring dimensions

1. **Directness** — does the evidence address the claim's exact proposition, or
   an adjacent one? ("handles 10k rps" is not supported by "architecture is
   horizontally scalable".)
2. **Primacy** — primary artifact (test result, specification, certification,
   registration) vs secondary report of one.
3. **Methodological completeness** — methodology, test conditions, measurement
   period, population, and environment recorded and appropriate.
4. **Currency** — evidence dated within the claim's temporal class (see
   lifecycle table in the AEO source doc §8).
5. **Independence** (for comparative/market claims) — at least one source not
   controlled by the claiming organization.
6. **Coverage of scope** — evidence covers every deployment/scenario inside the
   claim's declared scope; anything uncovered must appear in exclusions.

## Posture

- `strong`: all six dimensions satisfied; claim wording does not exceed evidence.
- `partial`: directness + currency satisfied, but scope coverage or primacy
  incomplete → outcome is `verified_narrowed` with explicit narrowed scope.
- `weak`: evidence is adjacent, stale, or secondary-only → `insufficient_evidence`.
- `not_established`: evidence inaccessible or methodology absent.

## Confidence

`confirmed` only when the evidence artifact itself was read (not its registry
row). `high` when methodology and directness verified. Never above `medium`
when working from registry metadata alone.

## Example / counterexample

- Supported: "Gatekeeper validates actions before execution *in enforcement
  deployments*" ← architecture spec + live validation report covering
  enforcement mode. Scope stated, exclusions stated.
- Not supported: "reduces compliance costs by 70%" ← a customer quote saying
  "significantly reduced our costs". Quote is directional, not quantitative;
  outcome is `insufficient_evidence` with required_input: baseline, period,
  population, methodology, source.

## Ambiguity conditions → human review

- Any upgrade toward `verified`/`verified_narrowed` (always).
- Evidence in a language or jurisdiction the reviewer cannot assess.
- Contradictory evidence exists of comparable primacy.
- Claim is legal/regulatory, security, financial, medical, certification, or
  names a customer — legal/SME review regardless of evidence quality.
