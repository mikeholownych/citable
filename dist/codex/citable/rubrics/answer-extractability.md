# Rubric: answer extractability

Judges whether a page's principal answer survives being lifted out of the page
without distortion. Complements deterministic ANS-00x detectors.

## Scoring dimensions

1. **Position** — canonical answer within the first 50–100 words after the H1.
2. **Self-containment** — passage names its subject explicitly; no deictic
   references ("as shown above"), no pronoun whose referent is outside the passage.
3. **Atomicity** — one claim per key sentence; each independently understandable.
4. **Scope survival** — if the passage is quoted alone, its conditions and
   exclusions travel with it (in-sentence, not three paragraphs later).
5. **Definition quality** — "[Term] is [genus] that [differentia]" plus explicit
   "It does not include…".
6. **Structural support** — procedures as ordered steps; comparisons with stated
   basis and prose equivalent of any table.

## Posture

- `strong`: dimensions 1–4 all hold for the page's principal question.
- `partial`: answer present but scope/exclusions live outside the extractable span.
- `weak`: answer buried after preamble, or dependent on visual context.
- `not_established`: the page has no identifiable principal question (fix the
  page registry first — this is an intent problem, not a formatting problem).

## Evidence required

Quote the exact passage judged, with its position (paragraph index / selector).

## Example / counterexample

- Strong: "AI execution governance is the set of enforceable controls that
  determines whether a specific AI-initiated action is authorized at the moment
  of execution. It does not include model training governance."
- Weak: "This matters more than ever. As we saw above, there are many angles to
  consider before diving into what this means for your organization."

## Ambiguity conditions → human review

- Extraction would change the claim's scope (dimension 4 fails in a way that
  affects a registered claim).
- The principal question is contested between informational and commercial intent.
- Content is legally qualified language where tightening wording changes meaning.
