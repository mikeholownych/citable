# Troubleshooting

Treat errors and incomplete runs as evidence. Do not replace an unavailable
collector with an inferred success.

## `doctor` reports a missing or blocked capability

**Meaning:** a prerequisite was not observed or a managed installation has an
integrity problem.

**Checks:**

```bash
citable doctor
citable list
```

Install the named optional dependency, supply the declared environment
credential, or resolve the exact managed-file conflict. A `ready` result still
does not establish browser launch, authorization, property access, quota, or
collection.

## Claude cannot find the Citable profiles

Run `citable check` and inspect the independent agent-profile state. Claude
Code discovers the profiles under `.claude/agents/citable/` or
`~/.claude/agents/citable/`. If the parent `agents` directory was first created
during an already-running Claude session, restart that session. Do not copy the
profiles into unrelated provider directories.

A missing, modified, or unmanaged profile directory is not `current`.
Reinstall or update only after reviewing collision details; `--force` can
replace user content and must be deliberate.

## An audit is incomplete or has fewer pages than expected

Check the run manifest, warnings, captured inputs, and crawl limits before the
report. Confirm the target, `--base-url` for local builds, redirects, response
limits, and public-destination policy. Preserve the run as incomplete and
create a new run after correcting the input; do not edit sealed evidence.

## Browser rendering is unavailable

Run `citable doctor` and verify the Playwright capability. Browser installation
and successful launch are separate states. A static audit can still run, but
render-dependent evidence remains unavailable and must not be described as a
render pass.

## GSC, GA4, or CrUX collection is unavailable

Use the expected environment variable:

```bash
GSC_ACCESS_TOKEN=... citable connect validate --connection-id <gsc-id>
GA4_ACCESS_TOKEN=... citable connect validate --connection-id <ga4-id>
CRUX_API_KEY=... citable observe performance --target https://example.com
```

Do not place the secret in connection registries. A rejected token, missing
property, quota response, or incomplete page set remains an explicit
collection limitation.

## A URL or adapter endpoint is rejected

Remote collection accepts authorized public destinations and applies
same-origin or no-redirect rules according to the collector. Citation adapters
require HTTPS and reject redirects. Do not weaken these controls to reach a
private, loopback, documentation, benchmark, or otherwise blocked address.
Use an authorized isolated runner and a versioned import contract instead.

## An import violates a contract

Read the named schema error and identify the exact import schema in `schemas/`.
Common strict inputs include:

- `corroboration-import.schema.json`
- `canonical-index-import.schema.json`
- `regional-network-import.schema.json`

Keep the original export unchanged. Produce a migrated copy, add missing
authority and coverage declarations from known source facts only, validate it,
then create a new observation. See [Migrations](MIGRATIONS.md).

## An action plan is entirely or partly blocked

Inspect missing owners, decision owners, required reviews, dependencies, and
failure conditions. `blocked` is the correct state until those inputs exist.
Do not insert placeholder owners or mark semantic review complete to make an
action appear ready.

## MCP collection is unavailable

Citable does not currently implement an MCP evidence transport. MCP Server Card
findings concern discovery on the audited site; they do not indicate that
Citable connected to an MCP server. Use a currently supported direct connector
or strict import and retain its authority and provenance boundaries.

## A published release is not finalized

Package publication and controlled-surface finalization are separate. A
`published_unfinalized` release must remain in that state until the required
publisher-controlled receipts match the release manifest. External probes are
longitudinal observations and cannot substitute for those receipts.

If the error is reproducible and the documented contract appears violated,
open an issue with the command, Citable version, sanitized input shape, exact
error, and run manifest. Never attach tokens or sensitive raw evidence.
