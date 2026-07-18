# Rubric: entity clarity

Judges whether an external system can resolve who/what an entity is, what it
owns, and what category it belongs to — across owned and observed surfaces.

## Scoring dimensions

1. **Identity completeness** — canonical name, type, canonical URL, and (for
   organizations) legal vs operating identity explained.
2. **Relationship graph** — ownership and product-family relationships recorded
   and mirrored in structured data (@id references, publisher links).
3. **Cross-surface consistency** — same category and description across website,
   profiles, directories, documentation (small wording drift is normal;
   *category contradiction* is the failure).
4. **Alias governance** — every name variant in the wild is either registered
   as an alias or scheduled for correction.
5. **External anchoring** — sameAs/profiles limited to verified authoritative
   accounts.

## Posture

`strong`, `partial` (identity complete, cross-surface unverified),
`weak` (category contradiction or ownership ambiguity), `not_established`
(identity fields missing — mark the entity `incomplete`; never invent legal
names, founders, addresses, or registration status).

## Evidence required

Registry entity row, schema blocks, and the exact conflicting descriptions with
their sources and retrieval dates.

## Counterexample (category contradiction)

Website: "AI execution governance platform" / LinkedIn: "ethical AI consulting"
/ directory: "AI marketing automation" → `weak`, with each conflicting surface
listed as a contradiction finding.

## Ambiguity → human review

- Legal identity vs operating identity diverge (renames, acquisitions).
- Entity shared between organizations (joint ventures, resold products).
