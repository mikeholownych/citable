# Audit Coverage Contract Design

Date: 2026-09-19
Status: approved for implementation planning

## Problem

Deployed-URL audits currently use an internal 50-page default that callers cannot configure. The collector records truncation, but coverage is not a first-class contract and downstream determinations can depend on ad hoc checks. This makes it too easy for a partial corpus to be interpreted more broadly than the evidence supports.

The remediation must preserve bounded resource use while making scope, limits, actual coverage, and downstream evidence eligibility explicit.

## Invariants

1. **No silent truncation.** A run that stops before its requested scope is evaluated cannot report complete coverage.
2. **Explicit bounded limits.** Page and time budgets are invocation or project-configuration inputs, recorded in evidence, validated before collection, and capped by documented safety limits.
3. **Coverage is evidence.** Requested, discovered, evaluated, excluded, failed, and pending URL scopes remain distinguishable and reconcile arithmetically.
4. **No scope widening.** Evidence from evaluated URLs supports only those URLs unless the run establishes complete corpus coverage. Corpus-wide negative determinations require complete coverage.
5. **Regression protection above 50 pages.** Automated tests exercise sites larger than the former ceiling.
6. **Bounded operation.** The collector retains page, time, origin, response-size, redirect, and frontier controls. Configurability does not mean unbounded crawling.

## Selected Approach

Add a first-class, schema-validated audit coverage contract and make downstream completeness decisions consume it. This is broader than raising a constant or exposing one flag, but narrower than introducing resumable or distributed crawling.

Rejected alternatives:

- **Raise the constant and add a flag:** does not prevent downstream scope widening.
- **Replace the crawler with resumable jobs:** potentially valuable, but unnecessarily expands this remediation into job persistence and distributed execution semantics.

## Invocation Contract

The URL audit interface will support:

```text
citable audit [scope] --target <url> [--max-pages <1..10000>] [--time-budget-seconds <positive integer>]
```

Project configuration will support:

```yaml
audit:
  max_pages: 500
  time_budget_seconds: 1800
```

Resolution precedence is:

1. CLI option
2. `.citable/config.yaml`
3. documented application default

The default page budget is 500 and the hard maximum is 10,000. The default time budget is 1,800 seconds and its hard maximum is 86,400 seconds. These limits accommodate a sequential production crawl while keeping every invocation finite. Invalid, fractional, zero, negative, non-numeric, or over-limit values must fail before the first network request.

The resolved budgets must be recorded as requested-scope evidence. Directory audits are not subject to network crawl budgets and must state their different scope model explicitly.

## Coverage Artifact

Every deployed-URL audit will write `coverage.json` and validate it against a new versioned schema before the run can be finalized.

The artifact contains:

- `schema_version`
- `scope_kind`: deployed URL crawl
- `requested_scope`
  - start URL and origin
  - inclusion and normalization policy
  - discovery sources in scope
  - resolved page and time budgets
- `discovered_scope`
  - normalized unique URLs
  - discovery provenance, including links and sitemaps
- `evaluated_scope`
  - successfully fetched URLs actually made available to applicable detectors
- `excluded_scope`
  - intentionally unevaluated URLs with stable reason codes
- `failed_scope`
  - attempted URLs that could not be evaluated, with sanitized bounded errors
- `pending_scope`
  - discovered URLs not evaluated when collection stopped, with the stop reason
- `stop_reason`
  - frontier exhausted, page budget exhausted, time budget exhausted, or fatal collection failure
- `completeness`
  - `complete`, `truncated`, or `indeterminate`
- aggregate counts and a reconciliation result
- machine-readable limitation codes and human-readable explanations

Exact URL records are retained up to the 10,000-page safety maximum. Errors and explanatory fields are size-bounded. URL normalization and deduplication rules must be deterministic and documented.

### State Rules

Every discovered in-scope URL must end in exactly one terminal coverage bucket: evaluated, excluded, failed, or pending.

The aggregate invariant is:

```text
discovered = evaluated + excluded + failed + pending
```

An URL may retain multiple discovery-provenance entries without being counted more than once. Out-of-origin URLs can be recorded as exclusions when encountered but are not part of the same-origin discovered-scope denominator; the schema must make this distinction unambiguous.

`complete` means the frontier was exhausted and every in-scope discovered URL is evaluated or explicitly excluded. Fetch failures make the corpus evidence `indeterminate` for determinations that depend on those pages, even if no URLs remain pending. Page- or time-budget exhaustion is `truncated`.

## Collection Flow

1. Parse and validate CLI values.
2. Load and validate project configuration.
3. Resolve effective budgets and scope policy.
4. Initialize a reason-coded, normalized same-origin frontier.
5. Discover URLs from the start page, eligible same-origin links, and parsed same-origin sitemaps.
6. Transition each discovered URL to evaluated, excluded, failed, or pending.
7. Stop only with an explicit recorded reason.
8. Build and validate `coverage.json`.
9. Derive manifest status, summary language, and report limitations from the validated coverage contract.
10. Run downstream determinations under the coverage eligibility rules.

Sitemap URLs participate in discovery and requested coverage instead of serving only as post-crawl comparison inputs. Existing same-origin, private-network, redirect, body-size, timeout, and retry protections remain in force.

## Completion and Downstream Evidence Rules

The run manifest remains the concise status surface, but coverage status is derived from `coverage.json` rather than independently reconstructed.

- Frontier exhausted with no unresolved failures: `completed` unless another audit subsystem is incomplete.
- Page or time budget exhausted with pending URLs: `incomplete`.
- Collection failures that prevent a required determination: `incomplete`.
- Fatal contract or schema failure: `failed`.

Page-local positive findings remain valid observations about evaluated URLs. Their subject and evidence references must not imply unaudited pages.

Corpus-wide determinations, especially absence claims, require `completeness: complete`. When coverage is `truncated` or `indeterminate`, such determinations must be suppressed or represented as `not_established` with a machine-readable coverage dependency. They must not be emitted as passing or absent merely because the evaluated subset did not trigger a detector.

Commands that consume a source run must preserve its coverage limits. Action plans, comparisons, exports, dashboards, and verification flows may narrow scope but cannot silently widen an incomplete source run into a site-wide claim.

## User-Facing Reporting

Human and JSON output will report at least:

- requested page and time budgets
- unique URLs discovered
- URLs evaluated
- URLs excluded
- URLs failed
- URLs pending
- completeness state and stop reason
- limitations affecting downstream determinations

The top-level CLI result must continue to print `Status: incomplete` and a clear explanation whenever coverage is not complete. Reports must describe the evaluated corpus rather than calling it the whole site unless complete coverage was established.

## Testing Strategy

Tests will be written before implementation and must demonstrate the intended failure before production changes.

Coverage tests will include synthetic properties larger than 50 pages and verify:

- the 500-page default evaluates beyond page 50;
- CLI values below and above the default are honored;
- project configuration is honored and CLI values take precedence;
- invalid budgets fail before any fetch;
- the hard 10,000-page maximum is enforced;
- page-budget and time-budget exhaustion cannot produce a completed run;
- discovered, evaluated, excluded, failed, and pending counts reconcile;
- every discovered in-scope URL has one terminal coverage state;
- link and sitemap discovery provenance is preserved;
- sitemap-discovered URLs participate in collection;
- failures yield indeterminate coverage where required;
- corpus-wide absence determinations are not established from incomplete coverage;
- page-local findings retain evaluated-URL scope;
- complete small-site audits remain complete;
- CLI text, JSON output, manifest state, and report language agree.

The repository's full `npm test` suite must pass before the behavior is claimed to work. If canonical distribution content changes, `npm run build:dist` must regenerate distributions from `skill/`; generated `dist/` files will not be edited directly.

## Documentation and Compatibility

Update CLI help, README usage, canonical `skill/SKILL.md`, and CHANGELOG. The former 50-page behavior was an undocumented implementation default, so raising the default is not itself a schema break. The new coverage schema is additive and versioned. Any changes to an existing schema contract will receive the required CHANGELOG entry and fixture migrations.

## Deferred Work

The following are deliberately outside this remediation:

- persistent or resumable crawl frontiers;
- distributed crawling;
- authentication and scripted browsing;
- robots-policy changes beyond accurately recording current behavior;
- adaptive budgets chosen without operator input;
- claims of exhaustive site inventory when discoverability itself is incomplete.

These can build on the coverage contract later without weakening its invariants.
