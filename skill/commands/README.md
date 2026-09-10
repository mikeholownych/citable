# Citable command contracts

Each command is a bounded workflow with explicit inputs, preconditions,
refusal conditions, and validation. Three status classes — a contract proves
intent, not executability, so statuses are strict:

- **implemented** — callable, tested code exists in `src/commands/`.
- **orchestrated** — an agent can execute a *tested composition* of implemented
  primitives; the composition itself has been exercised end to end.
- **specified** — only a command contract exists; the workflow has not been
  proven executable. Do not present specified commands as capabilities.

| Command | Status |
| --- | --- |
| /citable init | implemented |
| /citable audit (+ scopes: technical seo aeo geo architecture entity claims evidence schema lifecycle corroboration) | implemented |
| /citable inspect | implemented |
| /citable map-claims | implemented |
| /citable substantiate (deterministic + entailment gate; semantic upgrades need the evidence-strength rubric) | implemented |
| /citable schema | implemented |
| /citable validate, validate-claims, validate-evidence, validate-schema, validate-links | implemented |
| /citable compare-snapshots / validate-regression | implemented |
| /citable action-plan | implemented — writes ordered, source-run-bound action artifacts outside immutable evidence packages |
| /citable observe | implemented — render, index, citation, crawler-log, passage, consensus, performance, corroboration, and stance evidence |
| /citable apply | implemented — reviewed, hash-locked source replacements; dry run by default |
| /citable connect status / configure / discover / validate / sync / read / apply / disconnect / indexnow / mcp | implemented — GA4, GSC, WordPress, Webflow, IndexNow, and allowlisted read-only MCP transport adapters |
| /citable monitor | implemented — compares immutable observation runs and emits evidence-linked alerts |
| /citable report dashboard | implemented — folds each run's recorded summary into a cross-run Markdown/HTML trend; derives no new findings and no combined score |
| /citable report share-of-voice | implemented — joins competitor registry against recorded citation observations to compute verified share-of-citation |
| /citable report consensus | implemented — synthesizes observed canonical signals across publisher headers, tags, sitemaps, and search engines |
| /citable metrics import | implemented — validates declared CSV/JSON metrics and writes immutable observations |
| /citable objectives init / validate | implemented — user-owned metric selection, cohorts, windows, and guardrails |
| /citable evaluate | implemented — independent baseline/evaluation comparisons with inconclusive handling |
| /citable governance validate / evaluate | implemented — validates reviewer and exception authority and emits immutable dispositions without changing failed findings |
| /citable exceptions list / renew / invalidate | implemented — governed exception lifecycle, renewal limits, authority validation, and audit logging |
| /citable reviews queue / prioritize / plan / sample / evaluate | implemented — materiality queues, reproducible sampling, stale-decision checks, and independent disagreement adjudication |
| /citable schedules run / project github | implemented — canonical scheduled audits and hash-bound non-authoritative GitHub projections |
| /citable observe media | implemented — bounded PDF, transcript, image-context, optional OCR, and declared claim-link evidence |
| /citable ingest, map-site, map-queries, map-prompts, map-entities, map-evidence | specified (ingest.md) |
| /citable optimize-page | specified (optimize-page.md) — requires source-to-render mapping, claim-preserving rewrites, build execution, rollback; none of that is proven yet |
| /citable create-page, answer-block, architect, interlink, consolidate, metadata | specified (page-work.md) |
| /citable validate-render | partially implemented by `observe render`; fixed Chromium profiles and schema-validated Chromium/Firefox/WebKit journeys are implemented, while reviewed semantic-impact detectors and reusable application-specific journey libraries remain |
| /citable measure seo/aeo/geo, test-prompts, monitor-crawlers, monitor-contradictions | partially implemented by metric/observation imports, objective evaluation, Google/CrUX live APIs, custom citation adapters, and monitor comparisons |
| `citable artifacts export/verify/import` | implemented — portable, versioned, checksum-bound run interchange without hosted-service authority |
| /citable sow generate / validate | implemented — 25-pillar SOW with 7-gate admissibility, 7-column traceability matrix, and integer minor-unit arithmetic (sow.md) |
| /citable report search / cro | implemented — split 19-pillar Search and 25-pillar CRO executive briefings with observation vs hypothesis vs causation taxonomy (reporting.md) |
| /citable sweep technical | implemented — static Core Web Vitals readiness analysis (LCP, INP, CLS) |
| /citable inspect eeat / inspect readiness | implemented — on-page 0-5 E-E-A-T rubric scoring and multi-answer-engine readiness (Perplexity, Copilot, ChatGPT) |
| /citable audit backlinks | implemented — off-page authority assessment, toxic TLD detection, and disavow generator |
| /citable prioritize matrix | implemented — Impact / Effort / Confidence (ICE) scoring matrix for findings |
| /citable roadmap strategic / cro roadmap | implemented — 30/90/180-day milestone implementation roadmaps |
| /citable cro / cro backlog | implemented — conversion path continuity, message match, cognitive friction, and falsifiable experiment backlog |
| /citable remediate / verify remediation / kit export | implemented — framework detection, idempotent AST patches, confidence gate, detector rerun verification, and customer delivery kits (remediation.md) |
| /citable check experiment | implemented — sample-ratio mismatch (SRM), early stopping, and statistical power guardrails |
| /citable test visual / preview cro | implemented — visual layout contract testing and accessibility-aware preview sandbox |
| /citable compatibility | implemented — pre-flight runtime, dependency, framework, and edge worker diagnostics |
| /citable corpus benchmark | implemented — golden benchmark corpus evaluation with per-detector precision/recall gates |

Shared refusal conditions (all commands): any action that would fabricate
facts, citations, evidence, authorship, reviews, corroboration, or hidden
model instructions; any change that matches a ⛔ anti-pattern; publishing
unverified registry entries as factual content.

Shared validation (all mutating commands): rerun the relevant `citable
validate` scope and the affected detectors; a failed build/render forbids a
"validated" status; preserve registry diffs (automatic via saveRegistry).
