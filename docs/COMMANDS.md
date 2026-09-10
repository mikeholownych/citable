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
| `citable sweep technical --target <dir\|url>` | Static Core Web Vitals sweep (LCP, INP, CLS) | Vitals readiness report |
| `citable inspect <page>` | Profile one page | Page-level inspection |
| `citable inspect eeat --target <dir\|url>` | On-page content & E-E-A-T evaluation (0-5 scale) | Trust & authority report |
| `citable inspect readiness --target <dir\|url>` | Multi-engine answer extraction readiness | AEO readiness report |
| `citable inspect cro <page> --target <dir>` | Conversion friction, forms, and CTA clarity | CRO diagnostic profile |
| `citable audit backlinks --input <file>` | Off-page authority & toxic domain assessment | Disavow & authority audit |
| `citable schema` | Validate deployed JSON-LD and derive a proposal | Validation plus registry-derived proposal |
| `citable validate [mode]` | Validate registries, claims, evidence, schema, or links | Contract results for the selected mode |

Audit scopes are `technical`, `seo`, `aeo`, `geo`, `cro`, `architecture`, `entity`,
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

## Closed-loop code remediation and delivery kits

```bash
citable remediate --finding <id> --target <file>        # dry run: diff + AST validation + confidence
citable remediate --finding <id> --target <file> --write # gated write; snapshot created
citable verify remediation --run <id> --finding <id> --target <file> --apply # re-runs detector
citable kit export --run <id> --finding <id> --target <file> # exports client delivery kit
```

- `remediate` uses AST parsing to calculate idempotent patches. Automated writes
  require structural syntax validation, confidence score >= `0.70`, and an
  automatic rollback snapshot under `.citable/remediation/snapshots/`.
- Automated writes refuse semantic copy or editorial content (`CRO-012`, `COMP-003`).
- `verify remediation` re-runs the source detector against the modified target to
  confirm resolution with zero regressions before closing work.

## Prioritization and strategic roadmaps

```bash
citable prioritize matrix --run <run-id>
citable roadmap strategic --run <run-id>
citable cro roadmap --run <run-id>
citable cro backlog --run <run-id>
citable check experiment <id> --observed-control 5000 --observed-variant 4980 --days-running 6
```

- `prioritize matrix` calculates Impact / Effort / Confidence (ICE) scores
  balanced by Business Value (BV).
- `roadmap strategic` and `cro roadmap` structure findings into 30-day (immediate
  technical blockers), 90-day (structural/extraction fixes), and 180-day
  (architecture & governance) horizons.
- `cro backlog` compiles falsifiable test hypotheses with guardrails and stopping criteria.

## Executive intelligence briefings

```bash
citable report search [--target <dir|url>] [--run <run-id>]
citable report cro [--target <dir|url>] [--run <run-id>]
```

- **Enterprise Search Intelligence Briefing** (`citable report search`): 19 diagnostic
  pillars covering technical search infrastructure, crawlability, CWV, organic demand,
  SERP landscape, entity footprint, and multi-engine answer extraction readiness.
- **Enterprise CRO & Customer Journey Briefing** (`citable report cro`): 25 diagnostic
  pillars covering full-funnel drop-off, message match, cognitive friction, CTA
  conspicuity (visual saliency), offer architecture, and experiment backlog.
- Reports enforce strict fact/inference separation and never guarantee search rankings,
  AI answer inclusion, or conversion revenue.

## Enterprise Statement of Work (SOW) generation

```bash
citable sow generate [--run <id>] [--scope <domain>] [--budget-minor <cents>] [--out <file>]
citable sow validate <sow-file.json>
```

- `sow generate` transforms empirical audit findings into contractually enforceable SOWs.
- **8 Scope Admissibility Gates**: Enforces origin, host, subdomain, path boundaries,
  resource types, non-template ownership, and verified rerun detectors before findings
  become contractual scope. Refused findings are cataloged in `refusal_log` with
  standard refusal codes.
- **7-Column Traceability Matrix**: Finding ID → Recommendation → SOW Requirement ID →
  Deliverable ID → Acceptance Test ID → Responsible Owner → Source Evidence.
- **Integer Minor-Unit Currency**: Milestones and budgets are calculated in integer
  cents (`USD`, exponent 2) to eliminate fractional pennies and commercial drift.
- **Fail-Closed Contractual Generation**: In contractual mode, generation fails closed
  (`NoFindingsError`) if audit findings or evidence items are absent. Synthetic
  findings are strictly confined to explicit `--sample` / `--demo` mode.
- `sow validate` validates the SOW artifact against `schemas/sow.schema.json` and
  enforces cross-object commercial and deliverable invariants.

## Customer artifact verification

```bash
citable artifacts verify-customer <file>
```

- Verifies customer-facing deliverables (SOW JSON, Search Report JSON, CRO Report JSON) against Draft-07 schemas.
- Validates arithmetic consistency across minor-unit currencies and deliverable budgets.
- Scans for raw `<script>` tags, inline javascript event handlers (`onerror`, `onload`), and template default owner placeholders.

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
| `artifacts export/verify/import/verify-customer` | Move sealed runs and verify customer deliverables (SOW, Search, CRO) |

All Citable commands govern declared KPIs, outcomes, risks, decisions,
assumptions, scenarios, priorities, and competitive evidence; they do not
convert incomplete source evidence into fact.
