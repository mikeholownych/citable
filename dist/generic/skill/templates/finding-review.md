# Templates

## Blocked-status response (fail closed)

```yaml
status: blocked
reason: <what fact/evidence is missing>
required_input:
  - <exact missing input 1>
  - <exact missing input 2>
owner: <who can supply it>
```

## Incomplete external verification

```yaml
status: incomplete
reason: external verification unavailable
not_verified:
  - <competitor capabilities>
  - <current engine behaviour>
consequence: findings below exclude these dimensions
```

## Posture block (per page or entity)

```yaml
posture:
  retrieval_eligibility: strong | partial | weak | not_established
  semantic_clarity: ...
  answer_extractability: ...
  entity_resolution: ...
  evidence_strength: ...
  recommendation_eligibility: ...
confidence: confirmed | high | medium | low | unknown
basis: [run_id, rubric files applied, observations count]
```

## Experiment record (required before causal claims)

```yaml
experiment_id: <DISC>-EXP-<n>
hypothesis: >
  <specific, falsifiable>
primary_metric: <one>
secondary_metrics: []
control_group: <or baseline_window>
baseline_window: <days>
evaluation_window: <days>
known_confounders: [algorithm updates, seasonality, competitor publications, retrieval refresh timing]
decision_rule: >
  <what result retains/reverts the change>
owner: <name>
```
