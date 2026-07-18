# Rubric: recommendation eligibility

Judges whether an engine has enough qualified information to defensibly
recommend the product — distinct from citation eligibility. RECO-001…006 check
presence deterministically; this rubric judges adequacy.

## Scoring dimensions

1. **ICP precision** — target user described with qualifying attributes (size,
   sector, operational situation), not "companies that want to do X better".
2. **Non-ICP honesty** — a real buyer segment is excluded, with the reason.
3. **Qualification data** — deployment models, geography, integrations,
   pricing (public or explicitly qualified), maturity signals.
4. **Proof linkage** — recommendation-relevant claims trace to registry claims
   with evidence (not marketing copy that bypasses the claim registry).
5. **Limitation materiality** — stated limitations are ones a buyer would care
   about, not humble-brags ("we're so focused on enterprise…").
6. **Purchase path** — a concrete next action exists and matches the segment.

## Posture

`strong` (1–5 hold), `partial` (ICP + data present, limitations cosmetic),
`weak` (concealed commercial data or no exclusions), `not_established`
(pricing/geography/ICP unknown to the auditor → required_input list, no guessing).

## Counterexample

A product page whose only limitation is "not for teams unwilling to invest in
excellence" and whose pricing is "contact us" with no qualification of range,
model, or floor — `weak` on dimensions 3 and 5.

## Ambiguity → human review

- Pricing disclosure is a business decision pending → record `not_established`,
  route to the commercial owner; do not infer price ranges.
- Regulated buyer segments (finance, health) in the ICP.
