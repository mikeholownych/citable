# Measurement Objectives

Citable can evaluate user-selected metrics without requiring a live provider
connection. The core audit, remediation, validation, and observation commands
continue to work when no metrics or objectives are configured.

## Contracts

- `metrics.yaml` declares provider metrics, units, aggregation, dimensions,
  direction, and known limitations.
- `objectives.yaml` selects primary, supporting, and guardrail metrics plus URL
  or query cohorts and comparison windows.
- `interventions.yaml` records deployments that may be temporally associated
  with later observations. It does not establish causation.
- `connections.yaml` records optional, non-secret connector state. No token,
  client secret, API key, or credential value belongs in this file.

All four registries reject unknown fields and participate in normal registry
validation and history snapshots.

## Import Metrics

Declare each metric before importing observations. A CSV row requires
`metric_id`, `value`, and `observed_at` (or `date`). Columns matching declared
dimensions are retained. JSON accepts an array or an object with `rows`.

```bash
citable metrics import --provider gsc --input gsc-metrics.csv
```

Imports fail closed for undeclared or deprecated metrics, provider mismatches,
invalid dates, invalid numeric types, or reversed periods. The immutable run
contains the raw-input checksum and one evidence-hashed observation per row.
Repeated imports are deduplicated by evidence hash during evaluation.

## Configure an Objective

Objective creation is a dry run unless `--write` is supplied:

```bash
citable objectives init --input objective.json
citable objectives init --input objective.json --write
citable objectives validate
```

Example objective:

```json
{
  "objective_id": "OBJECTIVE-PRODUCT_DISCOVERY",
  "name": "Product discovery",
  "status": "active",
  "primary_metrics": ["METRIC-GSC_IMPRESSIONS"],
  "supporting_metrics": ["METRIC-GA4_KEY_EVENTS"],
  "guardrails": [{
    "metric_id": "METRIC-GA4_KEY_EVENTS",
    "operator": "no_regression",
    "threshold": 0
  }],
  "cohort": { "urls": ["https://example.com/product/*"], "queries": [], "labels": [] },
  "comparison": { "baseline_days": 28, "evaluation_days": 28, "minimum_observations": 7 }
}
```

## Evaluate

```bash
citable evaluate OBJECTIVE-PRODUCT_DISCOVERY --ref-date 2026-07-18
```

Each metric retains its own provider, baseline, evaluation value, absolute and
relative change, observation counts, and limitations. Guardrails are reported
as `met`, `not_met`, or `inconclusive`. Metrics are not combined into a score.
Missing data is `inconclusive`, never zero. Changes are temporal associations;
Citable does not claim that an intervention caused them.

## Optional Connections

Live connectors are a later additive capability. Their state contract exists so
future adapters share one vocabulary, but a connection is never required. A
missing connection is `not_configured`, not a finding, failed audit, or evidence
that the provider observed no activity. Owner exports remain a supported path.
