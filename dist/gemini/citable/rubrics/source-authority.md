# Rubric: source authority

Judges how much weight an external source can carry as corroboration. Used by
`/citable audit corroboration` and evidence review.

## Scoring dimensions

1. **Editorial independence** — no ownership, payment, or reciprocal
   arrangement with the claiming organization; disclosed relationships reduce
   but do not zero the score, *undisclosed* ones zero it.
2. **Topical retrieval presence** — is this a source engines already retrieve
   for the topic? (Observed citations in prompt-results are the evidence.)
3. **Substantive treatment** — the source describes the entity accurately and
   substantively, not a directory one-liner.
4. **Stability** — stable URL, accessible to retrieval systems, not paywalled
   into invisibility.
5. **Provenance** — publisher identity, publication date, and (for research)
   methodology visible.

## Posture

`strong` (independent + retrieved + substantive), `partial` (independent but
thin or unproven retrieval), `weak` (interest-conflicted or unstable),
`not_established` (independence cannot be determined → treat as owned until
verified).

## Hard exclusions (never count as corroboration)

Paid "best vendor" lists presented as editorial · fabricated comparison sites ·
synthetic community mentions · fake reviews · undisclosed sponsorships ·
programmatic pages ranking their own operator first · AI-generated third-party
profiles. These are anti-patterns to report, not sources to weigh.

## Ambiguity → human review

- Source independence uncertain (affiliate links present, sponsor unclear).
- Source is authoritative in one jurisdiction but not the claim's jurisdiction.
