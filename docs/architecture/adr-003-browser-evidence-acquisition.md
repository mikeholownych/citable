# ADR-003: Deterministic Bounded Browser Journey Evidence Acquisition

Status: accepted · Date: 2026-09-11

## Context

Citable provides reproducible evidence acquisition for SEO, AEO, and GEO governance. Browser journeys executed via Playwright (`observe render --input <plan.json>`) previously captured initial server response, rendered DOM, text, accessibility snapshots, screenshots, console errors, and failed network requests (`requestfailed`).

Downstream consumers (such as Nebula Components and enterprise verification workflows) require verifiable, bounded evidence about:
1. Successful and failed browser network transactions;
2. Relevant browser state across journey checkpoints (URL, query parameters, cookies, storage, global runtime state, DOM metrics);
3. Explicitly configured runtime events (such as application event queues or window event dispatches).

Crucially, Citable must remain an evidence-acquisition and integrity substrate. It must NOT become an analytics product, marketing evaluation tool, or synthetic CRO evaluator. Citable establishes what was observed, what was filtered/redacted, what was unobservable, and whether capture was truncated; downstream consumers determine whether those facts satisfy application-specific or marketing criteria (such as GA4 tag health or conversion attribution).

## Decisions

1. **Explicit Schema Governance for New Evidence Artifacts**
   - Three dedicated schemas define the evidence contracts:
     - `schemas/browser-network-events.schema.json`
     - `schemas/browser-state-observations.schema.json`
     - `schemas/browser-runtime-events.schema.json`
   - `schemas/browser-evidence-plan.schema.json` is backward-compatibly extended with optional `network_policy`, `state_policy`, and `runtime_event_policy` at the profile and plan levels, and an optional `checkpoint` action in journey steps. Existing v1 plans remain 100% valid without modification.

2. **Strict Deny-by-Default Privacy, Sensitive-Field Protection & Residual Risk**
   - In accordance with repository privacy standards, default collection captures no sensitive headers, query parameters, cookies, or storage keys.
   - Body capture is strictly deny-by-default (`request_body: false`, `response_body: false`). Host allowlists govern network event retention, but body capture requires explicit opt-in.
   - `authorization`, `bearer`, `cookie`, `set-cookie`, `proxy-authorization`, `api_key`, `password`, `token`, `session`, `csrf`, `code`, `jwt`, `credit_card`, and related credentials are unconditionally redacted (`[REDACTED_SECRET]`) if matched in headers, queries, cookies, storage, or runtime payloads.
   - HttpOnly cookies are observable by Playwright's browser context API, but raw plaintext values are strictly suppressed by Citable policy as `[POLICY_RESTRICTED_HTTPONLY]` in `allowlist_values` mode. Downstream consumers receive presence, byte length, and security flags (`http_only: true`, `secure: true`, `same_site`), while technical unobservability is reserved strictly for browser context or connection failures.
   - Residual Risk: Citable relies on structural minimization and regex heuristics. Novel unstructured secrets in customer-authorized fields carry residual exposure risk; operators requiring zero risk must configure `hash_only: true` or omit payload capture.

3. **Resource Bounding and Strict ABSENT Epistemic Invariant**
   - Hard limits govern maximum network events (default 200, max 1000), runtime events (default 200, max 1000), checkpoints (max 500), payload depth (max 10), and field sizes (max 4096).
   - When limits are reached, collectors cease recording detailed items and set `summary.truncated = true` with an explicit `truncation_reason`.
   - The Strict `ABSENT` Invariant: Absence (`ABSENT` / `exists: false`) is asserted ONLY when the target was in declared scope, the collector was active for the entire journey, collection was not truncated, the candidate was not excluded by filters, and no collector errors occurred.
   - If limits are reached, status is `TRUNCATED`. If excluded by allowlists, status is `filtered`. If the browser or collector fails, status is `UNOBSERVABLE` (with entries in `unavailable_items`) or `collector_status: "failed"`.

4. **Monotonic Sequencing, In-Flight Accounting & Asynchronous Correlation**
   - Wall-clock timestamps are accompanied by an integer sequence counter (`1, 2, 3...`) and a monotonic execution offset (`monotonic_offset_ms`) from journey start.
   - Events are correlated to active journey steps (`step_id`, `step_sequence`, `checkpoint_id`, `initiated_step_id`, `completed_step_id`).
   - Asynchronous transactions completing across step or journey boundaries are explicitly labeled `attribution_phase: "ambiguous_async"` with `ambiguous_async: true`.
   - Requests unresolved at journey conclusion are counted in `summary.in_flight_requests`. Bounded settling delays can be configured via `network_policy.settling_timeout_ms` (0 to 5000ms).

5. **Safe In-Page Execution, Tamper Resilience & Collector Health**
   - Global object inspections enforce a strict syntactic identifier/bracket regex (`^[a-zA-Z0-9_$.[\]'"]+$`), rejecting function invocations or eval patterns fail-closed.
   - Circular and recursive object graphs in runtime events or payloads are safely handled with `WeakSet` cycle tracking, emitting `[CIRCULAR]` markers without crashing.
   - Runtime event collection hooks queues via `Object.defineProperty(window, prop, ...)` to intercept queue reassignment (`window.dataLayer = []`) with polling fallback for unhooked mutations.
   - In-page and Node serialization safely inspect property descriptors to catch hostile throwing getters (`[GETTER_ERROR]`).
   - Collector health metadata is recorded in `summary.collector_health` (`status`, `queue_replaced`, `push_replaced`, `polling_fallback_used`, `supported_contexts: ["top_level_main_frame"]`, `unsupported_contexts: ["cross_origin_iframes", "web_workers"]`).

6. **Full Integration into Evidence Manifests and Checksums**
   - Generated artifacts (`network-events.json`, `state-observations.json`, `runtime-events.json`) are written into `.citable/runs/<run-id>/journeys/<profile-id>/`.
   - Artifact hashes are registered in `manifest.json` under `output_hashes` and verified in `checksums.json`.

## Consequences

- Citable provides deterministic, bounded, provenance-locked browser evidence for downstream systems without embedding vendor-specific marketing logic into core Citable.
- Plans omitting the new policies experience zero behavioral change or performance overhead.
- All artifact generation participates in run sealing and tamper verification.
