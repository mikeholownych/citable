# Command guide

Use this page to choose a workflow. Run `citable --help` for the current
command and option inventory. A successful command establishes only what its
sealed artifacts record.

Claude Code users may delegate collection and existing-artifact review through
the bounded [Citable agent profiles](AGENT_PROFILES.md). The profiles do not
add commands or evidence authority.

## Establish the environment

| Command | Use it to | Boundary |
| --- | --- | --- |
| `citable install` | Install the skill into supported agent hosts | Installation does not prove runtime capability |
| `citable doctor` | Diagnose provider, integrity, browser, and credential prerequisites | `ready` does not prove authorization, access, or collection |
| `citable init [--seed <name>]` | Create non-destructive `.citable/` context | Seeded entries remain `unverified` |
| `citable demo` | Exercise bundled offline evidence | Synthetic output says nothing about a live property |

## Plan, audit, and inspect

| Command | Use it to | Primary result |
| --- | --- | --- |
| `citable plan-audit --target <dir\|url>` | Propose scopes and optional collectors | Plan only; no run is created |
| `citable audit [scope] --target <dir\|url>` | Run the full or scoped detector set | Immutable audit package |
| `citable inspect <page>` | Profile one page | Page-level inspection |
| `citable schema` | Validate deployed JSON-LD and derive a proposal | Validation plus registry-derived proposal |
| `citable validate [mode]` | Validate registries, claims, evidence, schema, or links | Contract results for the selected mode |

Audit scopes are `technical`, `seo`, `aeo`, `geo`, `architecture`, `entity`,
`claims`, `evidence`, `schema`, `lifecycle`, and `corroboration`. A scoped audit
can omit interactions that a full audit would expose.

## Collect observations

The general form is:

```bash
citable observe <mode> [--target <url>] [--input <file>]
```

| Mode | Source | Important requirement |
| --- | --- | --- |
| `render` | Local browser capture | Playwright and an authorized public target |
| `index` | Import or Google URL Inspection | `--site-url` and GSC authorization for live collection |
| `citations` | Owner import or controlled HTTPS adapter | Complete answers, citations, provider/mode disclosure |
| `logs` | Owner crawler-log export | Source identity and collection limits remain attached |
| `bing` | Bing Webmaster owner export | `--dataset search_performance` or `ai_performance` |
| `passages` | Captured page content | Candidate context remains review-required |
| `consensus` | Captured signals plus optional engine import | Strict canonical import contract |
| `performance` | Import, CrUX API, or local Lighthouse | API key or local optional dependency as applicable |
| `corroboration` | Third-party/owner import | Versioned authority and relationship declarations |
| `probes` | Synthetic per-agent requests | Spoofed identity never proves production crawler access |
| `network` | Regional runner import | Strict DNS, TLS, latency, and cache evidence contract |
| `media` | PDF, transcript, or image input | Medium-specific extraction limits remain explicit |
| `representation` | Controlled publisher surface | External probes cannot satisfy controlled release gates |

See [Integrations](INTEGRATIONS.md) before adding an external source.

## Turn findings into governed work

```bash
citable action-plan <run-id>
citable apply --input <reviewed-remediation.json>
citable compare-snapshots <run-a> <run-b>
citable monitor <run-a> <run-b>
```

`action-plan` does not modify the audited property. `apply` requires a reviewed,
hash-locked specification. Comparison reports changes in captured evidence; it
does not infer causality.

## Measurements and connectors

```bash
citable connect status
citable connect configure --input <connection.json> --write
citable connect validate --connection-id <id>
citable connect sync --connection-id <id> --start-date YYYY-MM-DD --end-date YYYY-MM-DD
citable metrics import --input <file>
citable objectives validate
citable evaluate <objective-id>
```

Connector configuration is non-secret. Supply credentials through the declared
environment variable. Metric observations remain subject to provider
aggregation, sampling, privacy, attribution, and availability limits.

## Governance, review, and portability

| Family | Purpose |
| --- | --- |
| `governance validate/evaluate` | Validate authority and produce separate enforcement dispositions |
| `reviews queue/prioritize/plan/sample/evaluate` | Create and evaluate bounded semantic review work |
| `schedules run` | Execute a version-pinned canonical schedule |
| `project github` | Render non-authoritative annotations |
| `corpus evaluate/publish/receipt/compare-receipts` | Govern acceptance evidence and reproducibility |
| `artifacts export/verify/import` | Move sealed runs without changing canonical bytes |

Executive reporting commands are listed by `citable --help`. They govern
declared KPIs, outcomes, risks, decisions, assumptions, scenarios, priorities,
and competitive evidence; they do not convert incomplete source evidence into
fact.
