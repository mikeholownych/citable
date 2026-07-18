# Rubric: semantic clarity

Judges whether a page's subject, terminology, and relationships are unambiguous
to a system that has never seen the organization before.

## Scoring dimensions

1. **Single subject** — one primary entity/concept per page; competitors for
   attention (multiple unrelated H2 topics) lower the score.
2. **Controlled terminology** — one canonical term used consistently; variants
   only if registered as aliases (ENTITY-006 flags drift deterministically;
   this rubric judges whether the drift is meaningful or benign inflection).
3. **Explicit relationships** — product→organization, capability→product,
   evidence→capability, concept→adjacent-concept distinctions stated in prose.
4. **Category anchoring** — the entity's category named in text, matching the
   registry category.
5. **Jargon load** — proprietary terms defined at first meaningful use.

## Posture

`strong` (1–4 hold), `partial` (subject clear, relationships implicit),
`weak` (subject or category ambiguous), `not_established` (page has no
registered primary entity — fix the registry first).

## Evidence required

Quoted passages showing the category statement and each relationship; the
registry entity rows compared against.

## Example / counterexample

- Strong: "Gatekeeper is a runtime enforcement component *from Example
  Governance* in the *AI execution governance* category. It differs from
  observability tooling because…"
- Weak: a page alternating between "platform", "framework", "suite", and
  "solution" for the same product, with the category never named.

## Ambiguity → human review

- Term meaning is jurisdiction- or discipline-specific (e.g., "authorization"
  in IAM vs healthcare).
- Two registered entities legitimately share the page (partnership pages).
