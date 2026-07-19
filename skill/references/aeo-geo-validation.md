# AEO/GEO validation profile

This profile is an acceptance gate for eligibility and governance conditions,
not a prediction of citation or recommendation. Report every row as
`pass | finding | skipped | not_established`; never collapse rows into one score.

## Top-level state separation

| State | Current evidence boundary |
| --- | --- |
| Retrieval eligibility | Static policy plus captured synthetic HTTP response; crawler identity remains simulated unless verified logs/IP evidence are supplied |
| Source extraction and support suitability | Initial HTML plus registries/detectors/rubrics; optional Chromium profiles can establish bounded raw/desktop/mobile/JavaScript-disabled parity, while cross-browser and application-specific journeys remain unproven |
| Observed citation behavior | Operator-supplied prompt-result observations only; report cohort size and property citation presence, never infer from readiness |

## AEO checks

| Condition | Deterministic controls | Semantic gate |
| --- | --- | --- |
| Retrievable, indexable answer surface | TECH, CRAWL, LINK; no skipped critical transport checks | intent-alignment |
| Governed question coverage | ANS-009; page target_prompts resolve to active prompts | intent-alignment |
| Direct, self-contained answer | ANS-001…004, ANS-008 | answer-extractability |
| Atomic, bounded factual claims | ANS-005, CLAIM-004/007/009 | claim-boundedness |
| Evidence adjacent and supportable | ANS-010, EVD-001…007 | evidence-strength, source-authority |
| Procedures and comparisons extract cleanly | ANS-006/007 | answer-extractability, comparison-fairness |
| Entity attribution is stable | ENTITY-001…007, GEO-005 | entity-clarity |
| Visible schema agrees with content | SCHEMA-001…008 | semantic-clarity |

## GEO checks

| Condition | Deterministic controls | Semantic gate |
| --- | --- | --- |
| Prompt portfolio is evaluable | GEO-006, MEAS-001…003 | narrative-accuracy |
| Entity and category representation is explicit | GEO-002/003/005, ENTITY-001…007 | entity-clarity |
| Claims preserve scope, evidence, and legal status | CLAIM-001…009, EVD-001…007, ANS-010 | claim-boundedness, evidence-strength |
| Recommendation inputs are complete | RECO-001…006 | recommendation-eligibility |
| Comparisons are fair and corroborated | ANS-007, EXT-001/002 | comparison-fairness, source-authority |
| Model-directed manipulation is absent | GEO-001/004 | mandatory human review for ambiguous hidden content |
| Temporal and narrative integrity is governed | LIFE, MEAS, SCHEMA-004/006 | narrative-accuracy |

## Acceptance rules

- A deterministic finding means the corresponding condition is not met.
- A skipped detector means the condition is `not_established`, not pass.
- A heuristic detector absence is not proof; complete the semantic rubric.
- Any rubric ambiguity condition produces `not_established + review_required`.
- AEO/GEO posture can improve only after a before/after audit resolves the
  relevant detector/subject pair without introducing critical/high regression.
- Effectiveness is measured only from repeated, segmented observations using
  the measurement workflow. Eligibility checks alone do not establish engine
  behavior or causal impact.
