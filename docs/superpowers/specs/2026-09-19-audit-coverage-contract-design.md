# Semantic Completeness and Audit Coverage Contract Design

Date: 2026-09-19
Status: approved for implementation planning

## Problem

Deployed-URL audits currently use an internal 50-page default that callers cannot configure. The collector records truncation, but coverage is not a first-class contract and downstream determinations can depend on ad hoc checks. This makes it too easy for a partial corpus to be interpreted more broadly than the evidence supports.

The remediation must preserve bounded resource use while making scope, limits, actual coverage, and downstream evidence eligibility explicit. It covers the complete epistemic chain from collection through downstream presentation, without becoming a general Citable redesign.

## Overarching Invariant

No determination, comparison, score, summary, plan, or claim may express greater certainty or scope than the evidence population from which it was derived.

This specifically prevents the failure chain:

```text
missing observation -> apparently valid conclusion -> downstream action
```

## Invariants

1. **No silent truncation.** A run that stops before its requested scope is evaluated cannot report complete coverage.
2. **Explicit bounded limits.** Page and time budgets are invocation or project-configuration inputs, recorded in evidence, validated before collection, and capped by documented safety limits.
3. **Coverage is evidence.** Requested, discovered, eligible, excluded, attempted, retrieved, valid-resource, evaluated, failed, indeterminate, truncated, and unvisited URL scopes remain distinguishable and reconcile arithmetically.
4. **No scope widening.** Evidence from evaluated URLs supports only those URLs unless the run establishes complete corpus coverage. Corpus-wide negative determinations require complete coverage.
5. **Regression protection above 50 pages.** Automated tests exercise sites larger than the former ceiling.
6. **Bounded operation.** The collector retains page, time, origin, response-size, redirect, and frontier controls. Configurability does not mean unbounded crawling.

## Selected Approach

Implement five ordered gates:

1. collection completeness;
2. epistemic propagation;
3. connector completeness;
4. evidence integrity;
5. adversarial end-to-end proof and language audit.

This is broader than raising a constant or exposing one flag, but narrower than a general redesign or the introduction of resumable or distributed crawling.

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
  - discovery-method completion state, so frontier exhaustion is not misrepresented as proof that every site URL was discoverable
- `eligible_scope`
  - discovered URLs admitted by the declared collection policy
- `attempted_scope`
  - eligible URLs for which retrieval began, including per-attempt provenance
- `retrieved_scope`
  - attempted URLs for which a transport response was captured
- `valid_resource_scope`
  - retrieved URLs classified as the requested resource rather than an empty body, soft 404, bot challenge, login/consent wall, unexpected MIME type, truncated body, or unevaluated application shell
- `evaluated_scope`
  - valid resources actually made available to applicable detectors
- `excluded_scope`
  - intentionally unevaluated URLs with stable reason codes
- `failed_scope`
  - resources whose bounded retrieval attempts were exhausted, with sanitized bounded errors
- `indeterminate_scope`
  - retrieved resources whose validity or evaluability could not be established
- `pending_scope`
  - a derived compatibility view of unvisited URLs when collection stopped, not an additional population in reconciliation
- `unvisited_scope`
  - eligible URLs for which collection never began
- `stop_reason`
  - frontier exhausted, page budget exhausted, time budget exhausted, or fatal collection failure
- `completeness`
  - `complete`, `truncated`, or `indeterminate`
- aggregate counts and a reconciliation result
- machine-readable limitation codes and human-readable explanations

Exact URL records are retained up to the 10,000-page safety maximum. Errors and explanatory fields are size-bounded. URL normalization and deduplication rules must be deterministic and documented.

### State Rules

Every discovered in-scope URL must have a deterministic state transition through the coverage model. Every eligible URL ends in exactly one terminal state: evaluated, failed, indeterminate, or unvisited. Excluded URLs are discovered but not eligible. `truncated` is a coverage condition over the population, not a competing per-URL terminal state.

The aggregate invariant is:

```text
discovered = excluded + eligible
eligible = evaluated + valid_but_unevaluated + failed + indeterminate + unvisited
attempted = retrieved + failed
retrieved = valid_resource + indeterminate
valid_resource = evaluated + valid_but_unevaluated
```

If the implementation does not need `valid_but_unevaluated` in ordinary operation, it must still preserve that state for evaluator-level failure rather than coercing it into retrieval failure. Aggregate reconciliation is schema-validated and a mismatch fails finalization.

An URL may retain multiple discovery-provenance entries without being counted more than once. Out-of-origin URLs can be recorded as exclusions when encountered but are not part of the same-origin discovered-scope denominator; the schema must make this distinction unambiguous.

`complete` means the declared discovery methods completed and every eligible discovered URL reached a determination-sufficient terminal state for the relevant coverage requirement. It does not prove the existence or nonexistence of URLs outside those discovery methods. Fetch or evaluator failures make corpus evidence `indeterminate` for determinations that depend on those resources, even if no URLs remain unvisited. Page- or time-budget exhaustion is `truncated`.

## Independent Status Dimensions

The system must not overload one status field with three different meanings:

- `execution_status`: whether the command and artifact persistence completed successfully;
- `coverage_status`: whether the declared requested population was completely and validly observed;
- `determination_status`: whether a particular determination's evidence requirement was satisfied.

For example, this is valid and expected:

```text
execution_status: completed
coverage_status: incomplete
determination_status: indeterminate
```

`completed_with_warnings` is an execution state only and never implies complete evidence.

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

Sitemap URLs participate in discovery and requested coverage instead of serving only as post-crawl comparison inputs. Collection supports sitemap indexes, bounded nested indexes, multiple declarations, compressed `.xml.gz` documents, duplicates, malformed entries, partial child failures, and deterministic same-origin enforcement. Existing private-network, redirect, body-size, timeout, and retry protections remain in force.

Transport success is not resource validity. HTTP status, empty-body detection, content type, challenge/login/consent classification, soft-404 signals, body truncation, and raw-versus-rendered capability remain separate evidence fields. Classifiers must use conservative `indeterminate` states when validity cannot be established.

## Completion and Downstream Evidence Rules

The run manifest remains the concise status surface, but coverage status is derived from `coverage.json` rather than independently reconstructed.

- Frontier exhausted with no unresolved failures: `completed` unless another audit subsystem is incomplete.
- Page or time budget exhausted with pending URLs: `incomplete`.
- Collection failures that prevent a required determination: `incomplete`.
- Fatal contract or schema failure: `failed`.

Every determination type declares a machine-readable coverage requirement. At minimum, supported requirements distinguish:

- one identified resource and observation method;
- every successfully evaluated member of a declared subset;
- a declared sample with sampling metadata;
- exhaustive requested-scope coverage;
- rendered rather than raw-HTTP observation;
- provider-bounded coverage whose provider itself does not promise exhaustiveness.

The determination engine evaluates whether available evidence satisfies the declared requirement. Insufficient coverage yields `indeterminate` or an explicitly qualified subset determination; it does not globally invalidate unrelated positive observations.

Page-local positive findings remain valid observations about evaluated URLs. Their subject and evidence references must not imply unaudited pages. An observed Organization schema remains observed on its resource even if the wider crawl is incomplete. Failure to observe Organization schema cannot establish site-wide absence without exhaustive applicable coverage.

Corpus-wide determinations, especially absence claims, require `completeness: complete`. When coverage is `truncated` or `indeterminate`, such determinations must be suppressed or represented as `not_established` with a machine-readable coverage dependency. They must not be emitted as passing or absent merely because the evaluated subset did not trigger a detector.

Commands that consume a source run must preserve its coverage limits. Action plans, comparisons, exports, dashboards, and verification flows may narrow scope but cannot silently widen an incomplete source run into a site-wide claim.

### Snapshot and Remediation Comparison

Comparison uses resource identity, observation method, evaluator version, and coverage sufficiency before interpreting finding-set differences. Supported comparison states include:

- `persisted`
- `resolved`
- `new`
- `changed`
- `not_comparable`
- `not_reobserved`
- `indeterminate`

Absence from run B is `resolved` only when B sufficiently reobserved the resource and evidence scope responsible for the finding in run A using a comparable method. A missing or failed page is `not_reobserved`, never fixed. The same rule applies to remediation verification and Fix Pack lineage.

## Connector Collection Contract

All collection connectors implement a shared result contract rather than provider-specific arrays that imply completeness. The contract contains:

- `items`
- `pagination_state`
- `provider_reported_total`
- `retrieved_total`
- `coverage_status`
- `continuation_state`
- `limitations`
- `errors`

Connectors must follow pagination until exhaustion or an explicit configured boundary. Provider uncertainty remains visible even when pagination technically completes. A provider that returns only top rows can therefore report completed collection with provider-bounded or indeterminate population coverage. WordPress and Webflow migrate to this interface; GA4 and GSC retain their provider-specific limitations through the same contract.

## Evidence Identity and Integrity

Requested URL, redirect chain, effective URL, declared canonical URL, and evaluated resource identity remain separate. Normalization rules that influence evidence identity are named and versioned.

Hashes are layered according to what they prove. Supported fields include, where applicable:

- `response_body_hash`
- `rendered_dom_hash`
- `extracted_text_hash`
- `structured_data_hash`
- `evidence_hash`
- `artifact_hash`

No generic `content_hash` may silently mean different layers in different code paths. Missing layers are explicit rather than synthesized.

Run packages use a declared integrity mode. The initial mode is sealed/closed-world: every persisted package member except the checksum index itself must be declared, and unexpected files invalidate verification. If extension support is added later, extensions must be declared outside the sealed canonical set with explicit integrity and interpretation rules.

All downstream run consumers use one verified package loader. They do not independently read `findings.json` or trust manifest status without schema, checksum, integrity-mode, and coverage validation. Partial persistence cannot create a consumable completed run.

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
- execution, coverage, and determination statuses shown separately

The top-level CLI result must print execution and coverage status separately and provide a clear explanation whenever coverage is not complete. It may retain a compatibility `Status: incomplete` summary only if it is explicitly identified as coverage status rather than execution failure. Reports must describe the evaluated corpus rather than calling it the whole site unless complete coverage was established.

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
- subset determinations remain explicitly qualified as subset determinations;
- snapshot comparisons emit `not_reobserved` instead of `resolved` when run B lacks sufficient observation;
- remediation verification uses the same comparability rule;
- connectors follow pagination or expose continuation and incomplete/provider-bounded coverage;
- requested, effective, canonical, and evaluated-resource identities remain distinct;
- layered hashes bind only the evidence representations named by each field;
- sealed-package verification rejects missing, tampered, and unexpected artifacts;
- every downstream consumer rejects an unverified or contract-incompatible source package;
- complete small-site audits remain complete;
- CLI text, JSON output, manifest state, and report language agree.

### Adversarial 257-Page Property

The end-to-end fixture contains nested sitemap indexes, at least one failed child sitemap, and deliberately placed conditions:

```text
1    normal
49   unique finding A
50   unique finding B
51   unique finding C
99   redirect
100  unique finding D
101  soft 404 returning HTTP 200
149  timeout then success
150  permanent timeout
199  unexpected MIME type
200  unique finding E
201  discoverable only through a child sitemap
249  duplicate/canonical edge case
256  bot challenge or invalid-resource simulation
257  unique finding F
```

Runs use page budgets 50, 100, 256, 257, and 500. Differences must reconcile to declared evidence boundaries. A comparison whose second run cannot retrieve page 200 must classify finding E as `not_reobserved`, not `resolved`.

Action planning, remediation verification, technical sweep, CRO reporting, executive export, and CI reporting run against intentionally incomplete packages to prove that incompleteness cannot widen into assurance.

### Epistemic Language Audit

After mechanical changes, inspect all user, JSON, API, MCP, documentation, and agent-facing surfaces for absolute terms including `all`, `none`, `clean`, `verified`, `complete`, `resolved`, `optimal`, `site-wide`, `entire`, `no issues`, `100%`, and `passed`.

Every retained use must be justified by its evidence and denominator. Empty populations produce `not_evidenced`, `not_applicable`, or `indeterminate` as appropriate; they never produce maximal assurance. Presentation-layer tests bind language to coverage and determination states.

The repository's full `npm test` suite must pass before the behavior is claimed to work. If canonical distribution content changes, `npm run build:dist` must regenerate distributions from `skill/`; generated `dist/` files will not be edited directly.

## Documentation and Compatibility

Update CLI help, README usage, canonical `skill/SKILL.md`, MCP/API descriptions, agent-facing profiles, and CHANGELOG. The former 50-page behavior was an undocumented implementation default, so raising the default is not itself a schema break. Coverage, connector collection, comparison, evidence identity, and package integrity contracts are versioned. Any breaking change to an existing schema receives the required CHANGELOG entry and fixture migrations. Historical packages are never assigned convenient defaults that widen their original meaning; unknown versions fail predictably.

## Deferred Work

The following are deliberately outside this remediation:

- persistent or resumable crawl frontiers;
- distributed crawling;
- authentication and scripted browsing;
- robots-policy changes beyond accurately recording current behavior;
- adaptive budgets chosen without operator input;
- claims of exhaustive site inventory when discoverability itself is incomplete.

These can build on the coverage contract later without weakening its invariants.
