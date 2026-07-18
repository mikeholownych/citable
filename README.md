# Citable

An installable agent skill and CLI for auditing, remediating, validating, and
monitoring the conditions that influence **SEO** (search visibility), **AEO**
(answer citation), and **GEO** (generative representation).

Citable is an operational quality and governance layer — not a content
generator, not a Lighthouse wrapper, not an "AI visibility score".

> Nothing Citable produces guarantees crawling, indexing, ranking, citation,
> recommendation, inclusion, sentiment, or conversion. It manages eligibility,
> evidence, and probability.

## What it does

- **Persistent registries** (`.citable/`): queries, prompts, entities, claims,
  evidence, pages, crawler policies, competitors, experiments — all
  JSON-Schema validated with referential integrity and history-preserving saves.
- **102 detectors** across 15 namespaces (TECH, CRAWL, ARCH, PAGE, ANS,
  ENTITY, CLAIM, EVD, SCHEMA, LINK, EXT, GEO, RECO, LIFE, MEAS), each with
  remediation, verification, severity, and determinism declared.
- **Evidence packages** for every run: manifest, findings, report, captured
  robots/sitemaps/headers/schema/link graph, checksums.
- **Fail-closed governance**: claims can't become verified without evidence,
  expired evidence invalidates claims, schema is never fabricated, missing
  facts return `blocked` with `required_input`.
- **Semantic rubrics** (12) for the judgments detectors can't make, with
  mandatory human-review conditions.
- **Multi-agent distribution**: Claude Code, Codex-compatible, Cursor, Gemini,
  generic — generated from one canonical `skill/` source.

## Quick start

```bash
npm install
npm test                      # 33 tests
node src/cli/index.js help

cd your-site/
citable init                  # creates .citable/ (non-destructive)
citable audit --target ./dist --base-url https://example.com
citable substantiate          # claim/evidence assessment (dry run)
citable validate              # registry schema + referential integrity
```

## Repository map

| Path | Purpose |
| --- | --- |
| `skill/` | Canonical agent skill: SKILL.md, command contracts, rubrics, anti-patterns, policies, templates |
| `src/` | CLI, commands, registries, detectors, crawler/extractor, evidence, reporting |
| `schemas/` | JSON Schemas: 9 registries + finding + run + config + prompt-result |
| `tests/` | Unit + integration suites; positive/negative fixtures |
| `docs/` | ADR, traceability matrix, known limitations |
| `dist/` | Generated distribution packages (run `npm run build:dist`) |

## Documentation

- [Architecture decision record](docs/architecture/adr-001-architecture.md)
- [Traceability matrix](docs/architecture/traceability-matrix.md) — every
  material source requirement mapped to a control
- [Known limitations](docs/known-limitations.md) — read this before relying on
  any coverage claim

## Requirements

Node >= 20. Network access only for URL-mode audits. Supported frameworks for
auto-detection: Next.js, Astro, Nuxt, SvelteKit, Gatsby (other stacks: audit
their built HTML output).

## License

MIT
