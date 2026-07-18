# Citable command contracts

Each command is a bounded workflow with explicit inputs, preconditions,
refusal conditions, and validation. Two execution classes:

- **CLI-backed** — deterministic core implemented in `src/commands/`; the agent
  runs the CLI and interprets/extends results with rubrics.
- **Agent-workflow** — no dedicated binary; the agent follows the contract here
  using the CLI's audit/inspect/validate primitives plus repository editing.

| Command | Class | Status |
| --- | --- | --- |
| /citable init | CLI-backed | implemented |
| /citable audit (+ scopes: technical seo aeo geo architecture entity claims evidence schema lifecycle corroboration) | CLI-backed | implemented |
| /citable inspect | CLI-backed | implemented |
| /citable map-claims | CLI-backed | implemented |
| /citable substantiate | CLI-backed (deterministic half) + evidence-strength rubric | implemented |
| /citable schema | CLI-backed | implemented |
| /citable validate, validate-claims, validate-evidence, validate-schema, validate-links | CLI-backed | implemented |
| /citable compare-snapshots / validate-regression | CLI-backed | implemented |
| /citable ingest, map-site, map-queries, map-prompts, map-entities, map-evidence | agent-workflow | contract defined (ingest.md) |
| /citable optimize-page | agent-workflow | contract defined (optimize-page.md) |
| /citable create-page, answer-block, architect, interlink, consolidate, metadata | agent-workflow | contract defined (page-work.md) |
| /citable validate-render | agent-workflow | contract defined (validate-render.md) |
| /citable measure seo/aeo/geo, test-prompts, monitor-crawlers, monitor-contradictions | agent-workflow | contract defined (measurement.md) — no external engine adapters are claimed |

Shared refusal conditions (all commands): any action that would fabricate
facts, citations, evidence, authorship, reviews, corroboration, or hidden
model instructions; any change that matches a ⛔ anti-pattern; publishing
unverified registry entries as factual content.

Shared validation (all mutating commands): rerun the relevant `citable
validate` scope and the affected detectors; a failed build/render forbids a
"validated" status; preserve registry diffs (automatic via saveRegistry).
