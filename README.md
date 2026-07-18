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
- **119 detectors** across 18 namespaces (TECH, CRAWL, ARCH, PAGE, ANS,
  ENTITY, CLAIM, EVD, SCHEMA, LINK, EXT, GEO, RECO, LIFE, MEAS, HREFLANG, CWV, AGENT), each with
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
- **Agent-readiness detectors** (AGENT namespace): agents are both readers
  and writers of your site — `llms.txt` and Markdown content negotiation shape
  what they consume; MCP Server Cards and A2A Agent Cards expose what they can
  invoke; Content-Signals and Web Bot Auth govern the permissions they receive.
  Citable checks all of these in one pass alongside the rest of your
  SEO/AEO/GEO signal surface.

## Install

Install Citable into detected coding agents:

```bash
npx @nebulacomponents/citable install
```

Install into specific agents:

```bash
npx @nebulacomponents/citable install --providers=claude,codex,cursor
```

Install globally:

```bash
npx @nebulacomponents/citable install --global
```

Preview changes:

```bash
npx @nebulacomponents/citable install --dry-run
```

Check installed versions:

```bash
npx @nebulacomponents/citable check
```

Diagnose installation problems:

```bash
npx @nebulacomponents/citable doctor
```

The npm package is scoped as `@nebulacomponents/citable`; the installed
executable is still named `citable`.

Supported provider ids are `claude`, `codex`, `cursor`, `gemini`, `github`,
`opencode`, `kiro`, `pi`, `qoder`, `trae`, `trae-cn`, and `rovodev`. Project
installs write to each provider's project skill directory, for example
`.claude/skills/citable/`, `.agents/skills/citable/`,
`.cursor/skills/citable/`, and `.gemini/skills/citable/`. Global installs use
provider-specific home paths, including `~/.claude/skills/citable/`,
`~/.agents/skills/citable/`, `~/.cursor/skills/citable/`, and
`~/.gemini/skills/citable/`.

Target resolution is deterministic: explicit `--providers` wins, then project
harness directories, then user-home harness hints. `--providers=detected`
selects every detected supported provider; `--providers=all` selects every
supported provider layout for the requested scope. Unknown provider names fail
non-zero. In non-interactive mode, use `--yes`; project scope is the default
unless `--global`/`--user`/`--scope=global` is supplied. The installer never
reports success when no install target was selected.

Managed installs carry `manifest.json` with `managedBy: "citable-cli"` and
SHA-256 hashes for the installed payload. Repeated installs validate the tree
and report `already current`. `update` compares the complete managed tree, not
only `SKILL.md` or the version string. `uninstall` removes managed files only
and preserves unrelated files in the skill directory. Locally modified managed
installs and unmanaged `citable/` collisions are refused unless `--force` is
used.

The initial installer installs the skill payload only. It does not install
provider hooks, sidecar configuration, telemetry, or unrelated agent settings.
The package ships `dist/universal/` for offline installation from the npm
tarball; no Git checkout or npm cache files are required after installation.
Windows PowerShell, Linux shells, and macOS shells are supported through Node's
filesystem APIs, with platform-specific file-mode differences reported by
`doctor` where relevant. Unsupported hosts can still use the generated
`dist/universal/` payload manually, but they are not auto-mutated.

## Quick start

```bash
npm install
npm test
npx @nebulacomponents/citable help

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
- [npm trusted publishing](docs/release/npm-trusted-publishing.md) — release
  workflow and trusted publisher setup
- [Known limitations](docs/known-limitations.md) — read this before relying on
  any coverage claim

## Requirements

Node >= 22.22.2. Network access only for URL-mode audits. Supported frameworks for
auto-detection: Next.js, Astro, Nuxt, SvelteKit, Gatsby (other stacks: audit
their built HTML output).

## License

Apache-2.0
