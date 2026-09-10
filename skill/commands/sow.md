---
command: /citable sow generate [--target <dir|url>] [--run <id>] [--budget <amount>] [--budget-minor <cents>] [--format md|html|json] [--output <path>] [--sample] [--draft]
purpose: Generate a contractually binding, evidence-traceable enterprise Statement of Work (SOW) from verified audit findings through a formal 8-gate scope admissibility filter and 7-column traceability matrix.
preconditions: [at least one finalized audit run with verified findings or live target; sample mode required for synthetic demonstrations]
failure_behaviour: absent or unverified findings in contractual mode -> NoFindingsError; all findings refused -> NoAdmissibleRequirementsError; non-existent run -> RunNotFoundError; negative or sub-cent budget -> BudgetCalculationError; invariant drift -> SowInvariantError
artifacts_created: [SOW.md, SOW.html, or SOW.json at specified output path]
---

# Enterprise Statement of Work (SOW) Contract

The `citable sow` command generates enterprise-grade, evidence-backed Statements of Work derived from verified technical SEO, AEO, GEO, schema, and CRO audit findings. It establishes rigid, downward traceability:

```text
Evidence (observation envelope)
  ↓
Observation (deterministic DOM / HTTP probe)
  ↓
Finding (verified defect / friction)
  ↓
Recommendation (governed remediation)
  ↓
SOW Requirement (contractual scope)
  ↓
Deliverable (code patch / AST modification)
  ↓
Acceptance Test (automated closed-loop detector rerun)
```

## 1. Operating Premises & Commercial Disclaimers

1. **Fee Binding**: Supplier fees are bound exclusively to verified deliverable acceptance and closed-loop test execution.
2. **Strict Outcome Disclaimers**: In strict compliance with Citable governance principles, **no search engine crawling, indexation, ranking, AI answer citation, or conversion revenue is guaranteed**.
3. **No Synthetic Data in Contracts**: Attempting to generate a `CONTRACTUAL` SOW without verified empirical findings immediately fails closed with `NoFindingsError`. Synthetic findings are strictly confined to `--sample` / `--demo`.

## 2. The Scope Admissibility Gate

Audit findings do NOT automatically become contractual obligations. Every candidate finding must pass 8 admissibility gates:

| Gate | Verification Check | Failure Refusal Code | Contractual Handling |
| :--- | :--- | :--- | :--- |
| **1. Exclusion Gate** | Check against explicit excluded detectors list | `REFUSE-EXCLUDED` | Track in internal backlog; execute under separate advisory engagement. |
| **2. Discipline Authorization** | Check if discipline is authorized under contract | `REFUSE-DISCIPLINE-NOT-AUTHORIZED` | Expand authorized disciplines in SOW engagement terms or contract under separate SOW. |
| **3. Evidence Maturity** | Require deterministic/observed confidence & evidence | `REFUSE-EXPERIMENTAL` / `REFUSE-NO-EVIDENCE` | Run controlled observation probes before considering for contractual obligation. |
| **4. Scope Boundary** | Verify URL matches authorized host, subdomain, or path | `REFUSE-OUT-OF-SCOPE` | Escalate domain ownership verification or expand contractual executive scope. |
| **5. Feasibility Gate** | Reject legal, trademark, GDPR, or unfeasible remediation | `REFUSE-UNFEASIBLE-REMEDIATION` | Refer to specialized legal or compliance counsel outside scope. |
| **6. Materiality Gate** | Require critical/high severity or ICE score >= threshold | `REFUSE-LOW-MATERIALITY` | Log to internal product maintenance backlog; omit from high-value SOW. |
| **7. Acceptance Gate** | Require automated rerun detector or objective pass/fail test | `REFUSE-UNVERIFIABLE` | Define deterministic verification criteria before adding to scope. |
| **8. Ownership Clarity** | Resolve accountable owner from finding or role mappings | `REFUSE-OWNER-UNRESOLVED` | Specify delivery_owner on finding or map discipline to accountable role. |

All refused findings are recorded in the SOW's `admissibility_gate.refusal_log` with standard refusal codes and contractual handling guidance.

## 3. The 7-Column Traceability Matrix

Every admitted requirement must satisfy complete 7-column bidirectional traceability:

1. **Finding ID**: Verbatim identifier of the empirical defect (e.g. `F-TECH-001`).
2. **Recommendation**: Governed, safe remediation instruction.
3. **SOW Requirement ID**: Contractual clause identifier (`REQ-SOW-001`).
4. **Deliverable ID**: Accountable work package deliverable (`DELIV-01`).
5. **Acceptance Test ID**: Automated closed-loop test (`ACC-TEST-001`).
6. **Responsible Owner**: Named lead dev, architect, or agency practice owner.
7. **Source Evidence IDs**: Array of cryptographic observation IDs (`['EVD-CWV-001']`).

## 4. Commercial Currency & Minor-Unit Semantics

To eliminate commercial fee drift and rounding leaks, all internal calculations use exact **integer minor units (cents, exponent 2, currency `USD`)**:

* `currency`: Declared as `USD`.
* `currency_minor_unit_exponent`: Declared as `2`.
* `commercial_total_fee_minor`: Integer cents (e.g. `$50,000.00` = `5000000` cents).
* `milestones[].fee_minor`: Integer floor allocation across milestones with remainder pennies distributed deterministically to initial milestones.
* `commercial_total_fee_usd` / `milestones[].fee_usd`: Derived dollar representation formatted at presentation boundaries (`$33.34`, `$50,000`).
* Sub-cent fractional budgets (`100.001`) and negative budgets are strictly rejected.

## 5. Generation Modes & Machine-Readable Provenance

Every generated SOW embeds an immutable `generation_provenance` block:

* **`CONTRACTUAL`**: Generated from verified historical run findings or live target; synthetic evidence forbidden.
* **`DRAFT`**: Generated with preliminary scope or unfinalized commercial terms; requires executive sign-off.
* **`NON_CONTRACTUAL_SAMPLE`**: Generated with synthetic baseline findings strictly for evaluation/demo (`--sample`).

Provenance tracks:
* `generator_version`: Exact Citable semver.
* `generated_at`: ISO 8601 timestamp.
* `source_type`: `HISTORICAL_RUN`, `LIVE_INSPECTION`, `DIRECT_FINDINGS`, or `SAMPLE_BASELINE`.
* `source_identifier`: Target URL, run ID, or sample identifier.
* `source_findings_count`: Integer count of evaluated findings.
* `findings_integrity_hash`: SHA-256 hash of input findings.

## 6. SOW Verification Command

Run `citable sow validate <sow.json>` to verify:
1. Strict schema compliance against `schemas/sow.schema.json` (`additionalProperties: false`).
2. Cross-object invariants via `validateSowInvariants` (fee balancing, work package and deliverable parity, non-empty evidence links).
