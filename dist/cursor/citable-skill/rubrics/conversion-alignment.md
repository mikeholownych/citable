# Rubric: conversion alignment

Judges whether optimization preserved or improved the page's commercial
function — the guard against "optimized for machines, ruined for buyers"
(premise 3.7).

## Scoring dimensions

1. **Action preservation** — the registered conversion_action is still present,
   visible, and functional after changes.
2. **Stage fit** — the action matches the funnel stage of the mapped
   queries/prompts.
3. **Friction honesty** — added answer blocks, definitions, or schema did not
   push the conversion element below the fold on the page's dominant viewport
   class (verify, don't assume).
4. **Trust continuity** — limitations and scope statements added for AEO/GEO
   are framed accurately but not self-sabotagingly (state the limitation; don't
   editorialize against your own product).
5. **Accessibility preserved** — interactive conversion elements keep their
   labels, focus order, and keyboard operability after edits.

## Posture

`strong`, `partial` (action present, stage fit doubtful), `weak` (action lost,
demoted, or broken), `not_established` (no conversion_action registered —
that's an inspect/registry finding first).

## Evidence required

Before/after presence of the conversion element (selector or line reference)
and the registry conversion_action row.

## Ambiguity → human review

- Page has no declared conversion action but obviously sells something.
- Optimization requires choosing between answer position and conversion
  position — commercial owner decides, not the optimizer.
