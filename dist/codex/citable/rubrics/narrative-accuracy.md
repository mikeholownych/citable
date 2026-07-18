# Rubric: narrative accuracy

Judges whether a generated answer (or third-party description) accurately
represents the entity, against the approved narrative baseline in the entity
and claim registries. Used by `/citable test-prompts` scoring and
`/citable monitor-contradictions`.

## Scoring dimensions

1. **Identity accuracy** — right organization, right products, right people;
   no entity confusion with similarly named parties.
2. **Category accuracy** — placed in the registry category, not an adjacent one.
3. **Claim fidelity** — priority claims reproduced within their scope; scope
   stripping counts as an error even when the words match.
4. **Omission materiality** — missing limitations or exclusions that change a
   buyer's conclusion count as inaccuracies, not just absences.
5. **Fabrication detection** — asserted facts with no owned or observed source
   (certifications, customers, integrations, breach events) — classify by
   contradiction type: naming, legal identity, category, capability,
   performance, pricing, integration, maturity, customer, founder, security,
   regulatory status, product availability.

## Posture

`strong` (identity + category + claims accurate, no material omissions),
`partial` (accurate identity, minor claim drift), `weak` (category error or
scope-stripped claims), `not_established` (single observation only — needs
repeated sampling before any posture is recorded; MEAS-002).

## Evidence required

The exact generated output, capture metadata (engine, model, date, locale,
account state), the registry rows compared, and per-error classification.

## Severity mapping (GEO incident classes)

- SEV-1: fabricated breach/regulatory action, false certification claim →
  incident runbook, not just a finding.
- SEV-2: wrong category across engines, false integration, stale pricing.
- SEV-3: stale biography, minor wording drift, intermittent omission.

## Ambiguity → human review

- Contradiction involves legal or security facts (always).
- The "error" may reflect a true fact the registries have not caught up with —
  verify internal truth before external correction (runbook step 4).
