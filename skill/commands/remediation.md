---
command: /citable remediate --finding <id> [--target <file>] [--write]
purpose: Apply safe, validated AST code patches for deterministic defects with automated rollback snapshots, structural syntax validation, and confidence gating.
preconditions: [valid finding from audit run; target source file identified and writeable]
failure_behaviour: unknown framework -> fail closed; invalid syntax after patch -> rollback and refuse; confidence < 0.7 -> refuse write; semantic microcopy changes -> always refuse automated write (human editorial decision required)
artifacts_created: [.citable/remediation/snapshots/<snapshot-id>/, unified diff on stdout]
---

# Closed-Loop Code Remediation & Verification

The remediation suite provides safe, gated code fixes for deterministic technical, schema, and CRO defects discovered during audits. It bridges the gap between audit findings and customer-verified pull requests.

## 1. Safe Patch Application (`citable remediate`)

1. **Framework Detection**: Identifies target source syntax (`jsx`, `tsx`, `vue`, `html`). Fails closed on unknown or ambiguous frameworks.
2. **Idempotent AST Patching**: Patches are mathematically verified to be idempotent (`applyPatchDetailed`): applying the patch a second time produces an identical AST (a fixed point).
3. **Structural Validation Gate**: Runs `validatePatchedSource` to confirm that the patch does not break AST structure, introduce syntax errors, or alter unrelated code blocks.
4. **Confidence Threshold**: Computes an explicit multi-factor confidence score (`computeConfidence`). `--write` is refused if confidence falls below `0.70`.
5. **Editorial Boundary (Semantic Microcopy Refusal)**: Automated `--write` is strictly refused for semantic copy, CTA wording, or headline changes (e.g. `CRO-012`, `COMP-003`). Microcopy is a human editorial and brand judgment (fact ≠ inference).
6. **Rollback Snapshot**: Every `--write` automatically snapshots the target file under `.citable/remediation/snapshots/<timestamp>/` with a SHA-256 manifest before making any disk modifications.

## 2. Closed-Loop Verification (`citable verify remediation`)

Running a patch is NOT proof that a defect is resolved:

```bash
citable verify remediation --run <run-id> --finding <id> [--target <file>] [--apply]
```

1. **Deterministic Detector Rerun**: Re-executes the exact source detector (`detector_to_rerun`) against the patched target.
2. **Regression Sweep**: Sweeps for newly introduced critical or high severity defects compared to the baseline run.
3. **Verification Envelopes**: Emits a checksum-bound before/after verification envelope conforming to `schemas/remediation-verification.schema.json`.
4. **Verdict Classification**:
   * `verified`: Target detector no longer reports the defect; zero regressions introduced.
   * `not_resolved`: Target detector still detects the condition on the patched surface.
   * `blocked`: Prerequisite dependencies, build tools, or environments unavailable.
   * `patch_refused`: Confidence below threshold, semantic copy gated, or syntax check failed.
5. **Outcome Boundary**: Resolution means the detector no longer flags the subject — **it is never an outcome guarantee of rankings, AI citations, or conversion lift**.

## 3. Customer Implementation Kits (`citable kit export`)

Produce an engineer-ready delivery kit for customer development teams:

```bash
citable kit export --run <run-id> --finding <id> [--target <file>]
```

Creates a self-contained directory containing:
* Verbatim finding with evidence lineage.
* Exact unified diff for code review.
* Reusable Nebula design system component template (React / Vue / HTML).
* Rendering-evidence manifest (real captured DOM/visual state; synthetic evidence forbidden).
* Acceptance test criteria and re-audit verification script.
* Deployment and rollback instructions.
* Explicit technical limitations and non-guarantee disclosures.
