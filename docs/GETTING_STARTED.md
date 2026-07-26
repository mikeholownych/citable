# Getting started with Citable

Citable turns a site or built output into evidence-backed findings, governed
actions, and comparable follow-up runs. It does not predict rankings or promise
citations.

```text
Inspect prerequisites → plan → audit → action plan → review/change → re-audit
        doctor        plan-audit  evidence     blocked work       comparison
```

## Choose your path

| If you are… | Start with | Pay attention to |
| --- | --- | --- |
| An engineer | `doctor`, `plan-audit`, `audit technical` | Fetch/render failures, canonicals, links, schema parity, verification commands |
| An SEO or content lead | `plan-audit`, `audit seo`, `audit aeo` | Page intent, answer extraction, lifecycle, semantic review gates |
| A governance or legal reviewer | `validate`, `substantiate`, `reviews queue` | Claim scope, evidence authority, expiry, ownership, unsafe shortcuts |
| An agency or multi-property operator | `schedules run`, `artifacts export`, `compare-snapshots` | Version pinning, comparable cohorts, portable evidence, residual unknowns |
| An AI-search analyst | `audit geo`, `observe citations`, `observe bing` | Retrieval versus citation, prompt cohorts, material support, provider boundaries |

These are entry points, not permission to skip other disciplines. Use the full
audit when one scope can affect another.

## Your first five minutes

### 1. Install and diagnose

```bash
npx @nebulacomponents/citable install
npx @nebulacomponents/citable doctor
```

`doctor` reports installer integrity and optional capabilities independently.
`ready` establishes prerequisite presence, not successful browser launch,
authorization, property access, or collection.

### 2. Initialize governed context

```bash
citable init
```

This creates `.citable/` without overwriting existing registries. Do not fill
unknown entities, claims, evidence, competitors, or crawler permissions with
guesses.

For an explicitly synthetic starting example:

```bash
citable init --seed saas-pricing
```

Seeded records remain `unverified`; they are scaffolding, not owner facts.

### 3. Plan without creating a run

```bash
citable plan-audit --target ./dist --base-url https://example.com
# or
citable plan-audit --target https://example.com
```

The planner labels profiles as probabilistic inferences, discloses their
signals and confidence, preserves the full audit, proposes semantic emphasis,
and marks optional collectors `available` or `blocked`. It creates no audit,
observation, snapshot, or remediation artifact.

### 4. Create the immutable audit package

```bash
citable audit --target ./dist --base-url https://example.com
```

Save the printed run ID. The run directory contains the manifest, findings,
summary, report, captured inputs, and checksums. A report without its evidence
package is not the deliverable.

### 5. Turn findings into governed work

```bash
citable action-plan <run-id>
```

Actions retain source findings, phases, owners, decision owners, blockers,
semantic gates, unsafe shortcuts, failure conditions, dependencies, monitoring
fields, and verification. Empty dependency or monitoring fields mean “not
established,” not “none exist.”

## What actual output looks like

These excerpts were generated on 2026-07-26 from Citable’s bundled synthetic
`site-clean` fixture. They demonstrate output shape only and say nothing about
a live company.

### Planner excerpt

```json
{
  "statement_type": "probabilistic_inference",
  "profiles": [{
    "id": "saas",
    "confidence": "high",
    "evidence": [
      "pricing URL discovered",
      "product, feature, integration, or documentation URL discovered",
      "software or platform language observed"
    ]
  }]
}
```

The profile remains an inference despite three supporting signals.

### Audit posture excerpt

```json
{
  "retrieval_eligibility": {
    "result": "pass",
    "finding_count": 0
  },
  "source_extraction_and_support": {
    "result": "not_established",
    "skipped_checks": ["LIFE-006"]
  },
  "observed_citation_behavior": {
    "result": "not_evidenced",
    "observations": 0,
    "citation_presence_rate": null
  }
}
```

`pass`, `not_established`, and `not_evidenced` remain separate. The first state
cannot be averaged with or substituted for the others.

### Action-plan excerpt

```json
{
  "summary": {
    "total_actions": 3,
    "ready": 0,
    "blocked": 3
  }
}
```

Review-required fixture actions had no accountable owners. Citable blocked
them instead of generating implementation facts.

## The evidence journey

```text
Target source or URL
        │
        ├── plan-audit ── profile inference + prerequisite map (no artifacts)
        ▼
   immutable audit run
        ├── findings.json ─ detector evidence and limitations
        ├── summary.json  ─ separate readiness/observation states
        ├── report.md     ─ human projection
        └── checksums.json
                │
                ▼
          action-plan
        owners + blockers + review gates + verification
                │
                ▼
       reviewed source change → new audit/observation
                │
                ▼
  compare-snapshots / monitor
  resolved, persisting, blocked, new, and still unknown
```

## Adding external evidence

```bash
citable observe render --target https://example.com
CRUX_API_KEY=... citable observe performance --target https://example.com
citable observe performance --target https://example.com --lighthouse --repeat 3
GSC_ACCESS_TOKEN=... citable observe index \
  --target https://example.com/page --site-url sc-domain:example.com
citable observe citations --input prompt-corpus.json \
  --endpoint https://controlled-adapter.example/run --repeat 3
```

Browser and adapter targets must be authorized public destinations. Citation
adapters require HTTPS and cannot redirect. DNS validation does not eliminate
DNS-rebinding risk; isolate untrusted collection with network egress controls.

## Closing a finding

1. Identify the source run and exact subject.
2. Supply required inputs and accountable owners.
3. Record required semantic reviews.
4. Build and test the target repository.
5. Run the generated verification command.
6. Confirm the detector no longer reports the same subject.
7. Compare snapshots and check for new critical/high regressions.
8. Preserve residual risk and unavailable evidence.

## Common interpretation mistakes

| Output | What it means | What it does not mean |
| --- | --- | --- |
| `ready` capability | Prerequisite appears present | Browser/API execution succeeded |
| Retrieval `pass` | Captured retrieval checks passed | Indexed, ranked, cited, or representative |
| No detector finding | Condition was not reported in that run | The property has no issue |
| `not_evidenced` | Required observation is absent | Negative outcome |
| Action `ready` | Declared blockers are satisfied | Change is safe without review/testing |
| Citation present | Controlled response cited the property | Material support, authority, or recurrence |

## Where to go next

- [Known limitations](known-limitations.md)
- [Capability gap analysis](capability-gap-analysis.md)
- [Measurement objectives](measurement-objectives.md)
- [Reviewer and exception governance](governance/reviewer-exceptions.md)
- [Architecture](architecture/adr-001-architecture.md)
