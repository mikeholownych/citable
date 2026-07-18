---
command: /citable optimize-page
purpose: Improve one page's retrieval eligibility, answer clarity, entity relationships, and internal links while preserving its conversion role and claim boundaries.
inputs: [page reference (URL path or source file), site target]
optional_inputs: [specific findings to address, ref-date]
preconditions:
  - .citable/ initialized; page present in page registry (else run inspect + register first)
  - repository build and test commands known (project.yaml)
  - working tree clean or user-acknowledged
registries_read: [pages, queries, prompts, entities, claims, evidence]
registries_written: [pages (metadata only), claims (surface updates)]
detectors_run: [all page-scoped detectors before and after]
artifacts_created: [before/after inspect output, diff, post-change audit run]
refusal_conditions:
  - page carries regulated claims and no factual_reviewer is assigned
  - requested change matches a ⛔ anti-pattern
  - required facts (pricing, ICP, limitations) are unknown → blocked with required_input
failure_behaviour: build or render failure → report command, exit code, error output; no success status
---

# Workflow

1. `citable inspect <page> --target <built-output>` — capture the BEFORE state
   (intent, entities, claims, findings, conversion action, ambiguity list).
2. Read the page registry entry: intended query and prompt coverage, conversion
   role, lifecycle class. If ambiguity list is non-empty, resolve registry
   gaps before editing content.
3. Order of work (never reversed):
   a. **Technical defects first** — status, canonical, robots, sitemap, links
      (TECH/LINK findings).
   b. **Semantic ambiguity** — apply semantic-clarity and intent-alignment
      rubrics; fix subject/category/terminology drift.
   c. **Answer clarity** — direct answer block in first 50–100 words; atomic
      claims; evidence adjacent; scope and exclusions in-passage
      (answer-extractability rubric; ANS findings).
   d. **Claim boundaries** — every edited claim keeps its registered scope and
      exclusions verbatim or narrower; never broaden while "polishing".
      Attach evidence references beside claims.
   e. **Entity relationships & internal links** — upward hub link, lateral
      related links, commercial next step; descriptive anchors.
   f. **Schema** — only where justified by registry data (`citable schema`
      proposals); never hand-add assertions.
4. Style constraints: no keyword stuffing (PAGE-009 must not newly fire), no
   generic AI prose (ANS-001 must not newly fire), match the site's voice.
5. Preserve the conversion role — apply the conversion-alignment rubric; the
   registered conversion_action must remain present and reachable.
6. Build the project with the recorded build command. If it fails → failure
   behaviour, stop.
7. Re-audit: `citable audit --target <built-output>` and
   `citable compare-snapshots` — the page's prior findings should resolve and
   no new critical/high findings may appear.
8. Report: findings resolved, findings remaining (with reasons), unresolved
   conditions, registry diffs, and the run IDs of before/after evidence packages.
