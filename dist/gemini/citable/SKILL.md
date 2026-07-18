---
name: citable
description: >
  Audit, design, remediate, validate, and monitor the conditions that influence SEO
  (search visibility), AEO (answer citation), and GEO (generative representation).
  Use whenever the user asks about search visibility, AI citations, answer engines,
  generative engine optimization, structured data governance, claim substantiation,
  crawler policy, entity consistency, content discoverability, or wants a site audited
  for how search and AI systems will retrieve, understand, cite, or recommend it.
version: 0.1.0
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
```

Audit scopes: `technical seo aeo geo architecture entity claims evidence schema
lifecycle corroboration`. Every audit writes an evidence package to
`.citable/runs/<run-id>/` (manifest, findings.json, report.md, headers, robots,
sitemaps, schema, link graph, checksums). A report without its evidence package
is not a deliverable.

## Command workflows

Detailed per-command workflows live in `commands/`. Follow them; they define
inputs, preconditions, refusal conditions, and validation for each command.
Semantic judgments (intent alignment, evidence strength, information gain,
comparison fairness, …) use the rubrics in `rubrics/` — each defines scoring
dimensions, evidence requirements, counterexamples, and when human review is
mandatory.

## Registries are the source of truth

`.citable/` holds nine YAML registries (queries, prompts, entities, claims,
evidence, pages, crawlers, competitors, experiments), all schema-validated
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
