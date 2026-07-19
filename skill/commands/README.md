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
| /citable observe | implemented — render, index, citation, crawler-log, passage, consensus, performance, and corroboration evidence |
| /citable apply | implemented — reviewed, hash-locked source replacements; dry run by default |
| /citable monitor | implemented — compares immutable observation runs and emits evidence-linked alerts |
| /citable metrics import | implemented — validates declared CSV/JSON metrics and writes immutable observations |
| /citable objectives init / validate | implemented — user-owned metric selection, cohorts, windows, and guardrails |
| /citable evaluate | implemented — independent baseline/evaluation comparisons with inconclusive handling |
| /citable governance validate / evaluate | implemented — validates reviewer and exception authority and emits immutable dispositions without changing failed findings |
| /citable reviews queue / prioritize / plan / sample / evaluate | implemented — materiality queues, reproducible sampling, stale-decision checks, and independent disagreement adjudication |
| /citable schedules run / project github | implemented — canonical scheduled audits and hash-bound non-authoritative GitHub projections |
| /citable ingest, map-site, map-queries, map-prompts, map-entities, map-evidence | specified (ingest.md) |
| /citable optimize-page | specified (optimize-page.md) — requires source-to-render mapping, claim-preserving rewrites, build execution, rollback; none of that is proven yet |
| /citable create-page, answer-block, architect, interlink, consolidate, metadata | specified (page-work.md) |
| /citable validate-render | partially implemented by `observe render`; mobile/cross-browser and interaction exploration remain |
| /citable measure seo/aeo/geo, test-prompts, monitor-crawlers, monitor-contradictions | partially implemented by metric/observation imports, objective evaluation, Google/CrUX live APIs, custom citation adapters, and monitor comparisons |

Shared refusal conditions (all commands): any action that would fabricate
facts, citations, evidence, authorship, reviews, corroboration, or hidden
model instructions; any change that matches a ⛔ anti-pattern; publishing
unverified registry entries as factual content.

Shared validation (all mutating commands): rerun the relevant `citable
validate` scope and the affected detectors; a failed build/render forbids a
"validated" status; preserve registry diffs (automatic via saveRegistry).
