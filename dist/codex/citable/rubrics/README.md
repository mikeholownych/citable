# Semantic rubrics

Deterministic detectors cannot judge meaning. These rubrics govern the semantic
half of Citable. Shared rules for every rubric:

- Output is a **posture classification** (`strong | partial | weak | not_established`),
  never an unexplained 0–100 number. Where numeric comparison is unavoidable,
  expose the formula, weights, missing data, confidence, and known limitations.
- Every rubric result must cite the observed evidence (quoted passages, registry
  entries, measured values) that produced it.
- Every rubric declares its ambiguity conditions and when human review is
  mandatory. When an ambiguity condition holds, the result is
  `not_established + review_required`, not a guess.
- Findings produced from rubrics are `evidence_backed_semantic_finding` at most —
  never `deterministic_observation`.

| Rubric | File | Human review mandatory when |
| --- | --- | --- |
| Semantic clarity | semantic-clarity.md | Term is jurisdiction- or discipline-specific |
| Intent alignment | intent-alignment.md | Commercial vs informational intent is contested |
| Answer extractability | answer-extractability.md | Extraction would change claim scope |
| Entity clarity | entity-clarity.md | Legal identity vs operating identity diverges |
| Claim boundedness | claim-boundedness.md | Claim is regulated, contractual, or comparative |
| Evidence strength | evidence-strength.md | Any upgrade toward verified status |
| Source authority | source-authority.md | Source independence is uncertain |
| Information gain | information-gain.md | Gain rests on unpublished internal data |
| Comparison fairness | comparison-fairness.md | Named competitors appear |
| Recommendation eligibility | recommendation-eligibility.md | Pricing/geography/ICP data incomplete |
| Conversion alignment | conversion-alignment.md | Page has no declared conversion action |
| Narrative accuracy | narrative-accuracy.md | Contradiction involves legal or security facts |
