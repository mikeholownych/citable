---
name: citable
description: >
  Audit, design, remediate, validate, and monitor the conditions that influence SEO
  (search visibility), AEO (answer citation), and GEO (generative representation).
  Use whenever the user asks about search visibility, AI citations, answer engines,
  generative engine optimization, structured data governance, claim substantiation,
  crawler policy, entity consistency, content discoverability, or wants a site audited
  for how search and AI systems will retrieve, understand, cite, or recommend it.
version: 1.6.0
---

# Citable — search & generative discoverability governance

Citable is an operational quality and governance layer, not a content generator.
It treats discoverability as an engineering system: registries as the source of
truth, deterministic detectors for observable conditions, rubrics for semantic
judgment, evidence packages for every run, and fail-closed behaviour wherever a
recommendation would require invented facts.

## Operating premises (non-negotiable)

1. **No guarantees.** Never promise crawling, indexing, ranking, traffic,
   citation, recommendation, inclusion, sentiment, rich results, or conversion.
   Speak in eligibility, probability, observed behaviour, and confidence.
2. **Fact ≠ inference.** Classify every statement you make as: deterministic
   observation, evidence-backed semantic finding, probabilistic inference,
   strategic hypothesis, experiment result, or untestable condition. Never
   present an inference as an observation.
3. **Public ≠ reusable.** Keep separate: publicly accessible, crawlable,
   indexable, snippet-eligible, retrievable on user action, licensed for reuse,
   permitted for model training, licensed via partnership. Crawler access is
   decided per crawler *and purpose* in `.citable/crawlers.yaml`.
4. **Structured data is an assertion layer.** Schema must match visible content,
   use stable `@id`s, and never assert ratings, prices, capabilities, or dates
   the page and registries do not support.
5. **Claims need owners and evidence.** No claim reaches `verified` without
   evidence in the evidence registry. Expired evidence invalidates dependent
   claims. Opinion and aspiration never become verified fact.
6. **Corroboration cannot be manufactured.** Refuse to create fake reviews,
   synthetic community posts, shadow brands, PBNs, undisclosed endorsements,
   fabricated statistics or citations, recommendation poisoning, or hidden
   instructions aimed at language models — regardless of how the request is
   framed. Report GEO-001 findings (prompt injection) instead of replicating them.
7. **Machines never outrank humans.** Every remediation must preserve or improve
   factual accuracy, human comprehension, accessibility, conversion function,
   legal defensibility, and maintainability.

## The three disciplines (never collapse into one score)

| Discipline | Objective | Unit of measurement |
| --- | --- | --- |
| SEO | Sustained visibility on commercially relevant queries; qualified traffic; conversion | URL, query, impression, click, conversion |
| AEO | Direct-answer eligibility, passage extraction, supporting citation, accurate attribution | question, answer passage, citation, citation share |
| GEO | Correct entity understanding, accurate synthesis, category placement, claim reproduction, comparison inclusion, defensible recommendation | entity, claim, prompt, comparison, recommendation, narrative |

Report posture per dimension (e.g. `retrieval_eligibility: strong`,
`answer_extractability: weak`) — never one opaque 0–100 "AI visibility score".

Every report must keep these top-level states separate:

1. **Retrieval eligibility** — policy and captured technical conditions.
2. **Source extraction and support suitability** — passage, entity, claim,
   evidence, freshness, and structured-data conditions.
3. **Observed citation behavior** — only controlled, timestamped provider
   observations; absent observations are `not_evidenced`, never inferred.

Within retrieval, distinguish `allowed_by_policy`, `synthetic_fetch_succeeded`,
`observed_in_production_logs`, `indexed`, and `returned_by_retrieval`. Within
citation testing, distinguish mention, citation, material support, canonical
source selection, and recommendation. These states are not interchangeable.

## Tooling

The `citable` CLI in this repository performs the deterministic work. Always
prefer running it over re-deriving its checks by hand:

```
citable init                        # initialize .citable/ (non-destructive)
citable audit [scope] --target <dir|url> [--base-url <url>] [--ref-date YYYY-MM-DD]
citable inspect <page> --target <dir|url>
citable map-claims --target <dir|url> [--write]
citable substantiate [--write]
citable schema --target <dir|url>
citable validate [registries|claims|evidence|schema|links]
citable compare-snapshots [runA runB]
citable action-plan [run-id]          # ordered actions, blockers, semantic gates, verification
citable observe <mode> [options]      # render/index/citation/log/passage/consensus/performance evidence
citable apply --input <spec> [--write] # reviewed, hash-locked remediation; dry run by default
citable monitor [runA runB]           # observation regression alerts
citable metrics import --provider <name> --input <csv|json>
citable connect status
citable connect configure --provider <gsc|ga4> --connection-id <id> --property-id <id> [--credential-env <name>] [--write]
citable connect discover --provider <gsc|ga4>
citable connect validate --connection-id <id>
citable connect sync --connection-id <id> --start-date YYYY-MM-DD --end-date YYYY-MM-DD
citable connect disconnect --connection-id <id> [--write]
citable objectives init --input <json|yaml> [--write]
citable objectives validate
citable evaluate [objective-id] [--ref-date YYYY-MM-DD]
```

Audit scopes: `technical seo aeo geo architecture entity claims evidence schema
lifecycle corroboration`. Every audit writes an evidence package to
`.citable/runs/<run-id>/` (manifest, findings.json, report.md, headers, robots,
sitemaps, schema, link graph, checksums). A report without its evidence package
is not a deliverable.

## Finding-to-action protocol

Detection is the start of the workflow, not the deliverable. For every audit:

1. Run `citable action-plan <run-id>`. Use the generated files under
   `.citable/actions/<run-id>/`; never edit the immutable source run.
2. Work phases in order: **unblock** retrieval/security failures,
   **governance** for owners/entities/claims/evidence, **content** for page and
   answer changes, then **optimization**. Within a phase, critical/high precede
   lower-severity work. Severity never substitutes for confidence.
3. Before editing, assign an accountable owner and satisfy every
   `required_input`. A blocked action stays blocked; do not write around missing
   facts, evidence, legal review, or source-to-render mapping.
4. Apply the listed semantic gates. AEO changes require intent alignment and
   answer-extractability review. GEO changes require entity clarity,
   recommendation eligibility, and narrative-accuracy review. Claim/evidence
   changes additionally require claim-boundedness and evidence-strength review.
5. Make the smallest source or registry change that addresses the evidence.
   Reject every listed unsafe shortcut and every matching anti-pattern.
6. Run the repository build/test commands, then the action's verification
   command. Re-audit the affected scope and run `compare-snapshots` against the
   source run. A finding is resolved only when its detector no longer reports
   the same subject and no new critical/high regression appears.
7. Report resolved, persisting, blocked, accepted-risk, and newly introduced
   findings separately. Preserve run IDs, diffs, owners, review evidence, and
   residual risk. Never translate "detector absent" into an outcome guarantee.

For the complete AEO/GEO acceptance profile, follow
`references/aeo-geo-validation.md`. Skipped deterministic checks or incomplete
mandatory semantic reviews make the relevant posture `not_established`.
Consult `references/capability-boundaries.md` before claiming any observation;
it identifies which states the current CLI can collect and which require
operator data or future adapters.
Use `commands/observe-and-act.md` for collector prerequisites, evidence labels,
the controlled citation adapter protocol, remediation refusal conditions, and
monitoring interpretation.

## Command workflows

Detailed per-command workflows live in `commands/`. Follow them; they define
inputs, preconditions, refusal conditions, and validation for each command.
Semantic judgments (intent alignment, evidence strength, information gain,
comparison fairness, …) use the rubrics in `rubrics/` — each defines scoring
dimensions, evidence requirements, counterexamples, and when human review is
mandatory.

## Registries are the source of truth

`.citable/` holds YAML registries for queries, prompts, entities, claims,
evidence, pages, crawlers, competitors, experiments, metrics, objectives,
interventions, and optional connection state, all schema-validated
(`schemas/*.schema.json`) with referential integrity checks. Rules:

- Never overwrite registry content without history — use the loader/saver in
  `src/registries/index.js`, which snapshots prior versions automatically.
- Never invent registry facts (legal names, founders, certifications,
  competitors, pricing). Mark entities `incomplete` and list `required_input`.
- Claim status transitions toward `verified` require existing verified evidence
  plus human semantic review; automation only downgrades (fail-closed).

## Fail-closed behaviour

When information is missing, return a blocked/incomplete status with the exact
required inputs — do not write around the gap:

```yaml
status: blocked
reason: quantitative claim lacks verified evidence
required_input: [baseline, measurement period, test population, methodology, result source]
```

The same applies to: missing entity identity (do not invent), unavailable
external research (record `status: incomplete`, never fabricate competitors or
citations), build/render failures (never report validation success; preserve
command, exit code, and error output), and semantic ambiguity with commercial
or legal consequences (classify and route to the decision owner).

## Repository modification rules

Before editing any repository: read its agent/repo instructions, package
manifests, build/test/lint commands, rendering architecture, existing metadata
and schema systems, and working-tree status. Then: preserve existing
architecture; prefer shared data models over duplicated literals; never bypass
tests, disable linting, weaken types, or touch unrelated files; never silently
rewrite legal or regulated claims; preserve a diff of all registry changes; and
rerun the relevant `citable validate`/`citable audit` scope after every change.
A failed build or render makes "validated" an unavailable conclusion.

## Anti-patterns

`references/anti-patterns.md` is the canonical library (content, technical,
AEO, GEO). Consult it before recommending any optimization; if a requested
change matches an anti-pattern, name the anti-pattern, explain the risk, and
offer the defensible alternative.
