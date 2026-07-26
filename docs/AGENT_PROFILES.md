# Citable agent profiles

Citable ships two experimental Claude Code profiles. They separate collection
from semantic review without creating a second findings system.

| Profile | Use when | Authority |
| --- | --- | --- |
| `citable-auditor` | A target needs capability diagnosis, planning, an audit, an observation, or an evidence-package summary | May run guarded Citable commands and create immutable evidence; cannot edit the audited property |
| `citable-semantic-reviewer` | An existing run, finding, review item, or action needs bounded semantic assessment | Read-only; cannot collect evidence, mutate artifacts, approve publication, or upgrade a claim |

Do not use the reviewer to run an audit. Do not use the auditor to approve a
semantic conclusion or remediate source.

## Installation and discovery

For Claude Code, `citable install` writes:

```text
.claude/
├── skills/citable/
└── agents/citable/
    ├── citable-auditor.md
    ├── citable-semantic-reviewer.md
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

## Why there are only two

Technical, SEO, AEO, GEO, schema, lifecycle, and corroboration remain audit
scopes, not separate agents. Splitting those disciplines into independent
profiles would encourage overlapping collection, inconsistent scoring, and
parallel reports. Profiles are added only where context isolation and
separation of duties materially improve the evidence workflow.
