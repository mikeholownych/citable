# Citable documentation

Citable produces evidence packages, not outcome guarantees. Start with the task
you need to complete, and keep observed facts, imported declarations, and
inferences separate.

## Start here

| Need | Read |
| --- | --- |
| Run a first audit | [Getting started](GETTING_STARTED.md) |
| Find the right CLI workflow | [Command guide](COMMANDS.md) |
| Connect or import external evidence | [Integrations](INTEGRATIONS.md) |
| Delegate collection or semantic review | [Agent profiles](AGENT_PROFILES.md) |
| Diagnose an incomplete or blocked run | [Troubleshooting](TROUBLESHOOTING.md) |
| Adapt an older file or workflow | [Migrations](MIGRATIONS.md) |
| Understand what Citable cannot establish | [Known limitations](known-limitations.md) |

## Evidence lifecycle

```text
prerequisites → plan → immutable run → governed action → new observation
    doctor     plan-audit    audit       action-plan      monitor/compare
```

- `doctor` reports prerequisite state; it does not prove successful collection.
- `plan-audit` produces a bounded proposal; it does not create evidence.
- `audit` and `observe` create immutable run packages.
- `action-plan` preserves findings and exposes owners, blockers, reviews, and
  verification work.
- `monitor` and `compare-snapshots` compare captured states without assigning
  cause.

## Reference and governance

- [Architecture decision record](architecture/adr-001-architecture.md)
- [Traceability matrix](architecture/traceability-matrix.md)
- [Capability gap analysis](capability-gap-analysis.md)
- [Measurement objectives](measurement-objectives.md)
- [Reviewer and exception governance](governance/reviewer-exceptions.md)
- [API and contract stability](api-stability.md)
- [Roadmap](ROADMAP.md)

Released schemas and the canonical material in `skill/` govern behavior. This
documentation explains those contracts but does not replace them.
