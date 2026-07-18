---
command: /citable ingest (also map-site, map-queries, map-prompts, map-entities, map-evidence)
purpose: Populate registries from repository content and operator input without inventing facts.
preconditions: [.citable/ initialized]
registries_written: [pages, queries, prompts, entities, evidence]
refusal_conditions:
  - inventing entity identity facts (legal names, founders, registrations, certifications)
  - fabricating queries/prompts presented as demand data (proposals must be labeled candidate)
failure_behaviour: unknown facts → entity/page marked incomplete with required_input
---

# Workflows

## map-site
1. Enumerate routes/pages from the built output (or `citable audit` pages index).
2. For each page, propose a page-registry entry: url, page_type (from content
   shape), indexing_intent (default from config), status `draft`.
3. Leave owner, reviewer, lifecycle, conversion_action for the operator —
   list them as required_input per page. Write with saveRegistry (history kept).

## map-queries / map-prompts
1. Derive *candidate* queries/prompts from page subjects, headings, and the
   intent classes required by the spec (problem-awareness → brand for queries;
   definition → follow-up for prompts). Adversarial and jurisdictional variants
   are proposed but flagged for operator confirmation.
2. Status is always `candidate`; business_value, difficulty, and ownership are
   operator decisions. Never present derived candidates as measured demand.

## map-entities
1. Extract entity candidates from schema blocks, headings, and repeated proper
   nouns; type them (organization/product/concept/…).
2. Record only observed facts (name as printed, URL where described). All
   identity fields not directly observable → omit and list in required_input.
   The entity enters as status `incomplete` or `candidate`, never `verified`.

## map-evidence
1. Inventory evidence artifacts in the repo (specs, benchmarks, reports,
   datasets) and register them with observed metadata plus integrity hash.
2. verification_status starts `unverified`; a named reviewer moves it to
   `reviewed`/`verified` — automation never does.

## Validation (all)
`citable validate` must pass after every write; referential integrity errors
block the write, not the report.
