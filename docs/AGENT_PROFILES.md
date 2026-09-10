# Citable agent profiles

Citable ships four specialized Claude Code profiles. They enforce strict
separation of duties across the entire evidence lifecycle without creating
fragmented findings systems.

| Profile | Use when | Authority |
| --- | --- | --- |
| `citable-auditor` | A target needs capability diagnosis, planning, an audit, an observation, or an evidence-package summary | May run guarded Citable commands and create immutable evidence; cannot edit the audited property |
| `citable-semantic-reviewer` | An existing run, finding, review item, or action needs bounded semantic assessment | Read-only; cannot collect evidence, mutate artifacts, approve publication, or upgrade a claim |
| `citable-remediator` | Verified audit findings need safe AST code remediation, rollback snapshotting, detector rerun verification, or implementation kit export | May execute AST code mutations through `citable remediate`; refuses semantic copy edits; cannot guarantee commercial outcomes |
| `citable-sow-architect` | Audit findings need transformation into contractually enforceable SOWs, 7-gate admissibility filtering, 7-column traceability, or executive briefings | May run SOW generation/validation and executive reporting; refuses unevidenced scope in contractual mode; enforces integer minor-unit arithmetic |

Do not use the reviewer to run an audit. Do not use the auditor to approve a
semantic conclusion or remediate source. Do not use the remediator to draft
contractual commitments, and do not use the SOW architect to fabricate scope
unbacked by empirical evidence.

## Installation and discovery

For Claude Code, `citable install` writes:

```text
.claude/
├── skills/citable/
└── agents/citable/
    ├── citable-auditor.md
    ├── citable-remediator.md
    ├── citable-semantic-reviewer.md
    ├── citable-sow-architect.md
    └── manifest.json
```

Global installation uses the corresponding paths under `~/.claude/`. Claude
Code scans its agent directory recursively, so the `citable/` ownership
subdirectory remains discoverable.

The profile directory has its own hash manifest. `citable check` reports a
missing or locally modified profile independently from the skill. Installation
refuses an unmanaged `.claude/agents/citable/` collision unless `--force` is
explicitly supplied. Uninstall removes only manifested profile files and
preserves unrelated agents.

The skill remains available across all supported hosts. Native profile
installation is currently enabled only for Claude Code because other host
profile discovery, permission, and lifecycle contracts have not been verified.
Their distribution manifests report the profile capability as `unsupported`;
Citable does not guess equivalent paths or permissions.

## Auditor return contract

The auditor returns:

1. target, command, scope, and collection method;
2. run ID and artifact directory;
3. deterministic observations;
4. semantic findings and probabilistic inferences, separately;
5. skipped checks, failures, limitations, and residual unknowns;
6. exact evidence or owner input still required;
7. the next bounded review or action step.

It preserves `blocked`, `incomplete`, `not_established`, and `not_evidenced`
instead of translating them into pass, failure, zero, or absence.

## Reviewer return contract

The reviewer binds its assessment to the available run, finding, review item,
hash, policy, subject, and captured evidence. It reports supporting and
contradicting evidence, the applicable semantic dimensions, confidence,
false-positive conditions, missing inputs, residual risk, and the appropriate
human-review state.

Its output is review context. It cannot record an approval, satisfy an
owner-controlled gate, complete a required review, or change technical state.

## Remediator return contract

The remediator binds its interventions strictly to verified findings with
automated verification detectors. It returns:

1. finding ID, condition ID, and target source file;
2. framework detection and AST patch diff (unified diff format);
3. pre-patch and post-patch structural syntax validation results;
4. confidence score and confidence factor breakdown;
5. rollback snapshot path under `.citable/remediation/snapshots/`;
6. closed-loop detector rerun verification result (`PASS` / `FAIL`);
7. customer implementation kit path and export manifest.

It refuses automated writes if structural syntax checks fail, if confidence is
below `0.85`, or if the finding involves semantic copy / editorial content
(`CRO-012`, `COMP-003`).

## SOW architect return contract

The SOW architect transforms empirical audit runs into legally defensible,
evidence-traceable Statements of Work and executive briefings. It returns:

1. executive scope statement and declared boundaries (origin, host, path);
2. admissibility gate evaluation log (admitted vs refused findings with
   standardized refusal codes);
3. prioritized work packages with Impact, Effort, Confidence, and Business Value
   scoring;
4. 7-column Traceability Matrix mapping Finding ID → Recommendation → SOW
   Requirement ID → Deliverable ID → Acceptance Test ID → Responsible Owner →
   Source Evidence;
5. integer minor-unit milestone fee schedule (cents, exponent 2, currency `USD`);
6. concrete deliverable specifications and automated acceptance test definitions;
7. generation provenance (mode, source run ID, findings integrity hash,
   schema validation status).

In `CONTRACTUAL` mode, it fails closed if source findings or evidence items are
absent (`NO_FINDINGS`). Synthetic findings are strictly confined to `--sample` /
`--demo`.

## Why there are four

Technical, SEO, AEO, GEO, CRO, schema, lifecycle, and corroboration remain audit
scopes, not separate agents. Splitting those disciplines into independent
profiles would encourage overlapping collection, inconsistent scoring, and
parallel reports.

Instead, Citable defines four profiles along strict **evidence-phase and
authority boundaries**:

1. **Collection & Diagnosis** (`citable-auditor`): Sealed, immutable observation
   without editing authority.
2. **Human Review Context** (`citable-semantic-reviewer`): Read-only evaluation
   of probabilistic inferences and claims without mutation rights.
3. **Closed-Loop Remediation** (`citable-remediator`): AST-safe code changes
   verified by detector reruns and gated against editorial overreach.
4. **Contractual Governance** (`citable-sow-architect`): Evidence admissibility,
   traceability enforcement, and commercial scoping without hallucinated claims
   or outcome guarantees.

Profiles are added only where context isolation and separation of duties
materially improve the evidence and delivery workflow.
