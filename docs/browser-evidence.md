# Browser Journey Evidence Acquisition

Citable's browser evidence collector acquires deterministic, bounded, provenance-preserving evidence about web application execution. It operates as an objective observation substrate: it captures observable facts, records redactions and truncations, and hashes evidence artifacts. It **deliberately does not interpret** whether those facts represent valid marketing conversions, correct Google Analytics 4 (GA4) setups, compliant advertising tags, or optimal conversion rates.

---

## 1. Capabilities Overview

When executing a browser journey via `citable observe render --input <plan.json>`, Citable can collect:

1. **Network Activity**: Bounded capture of both successful and failed HTTP(S) requests and responses, request methods, status codes, timing offsets, redirects, allowlisted headers, and hashed/allowlisted payloads.
2. **Browser State**: Explicitly declared observations of the active URL, query parameters, document referrer, navigation type, governed cookies, localStorage, sessionStorage, safe global expressions, and DOM queries.
3. **Runtime Events**: Bounded capture of browser-side event streams (such as `window.dataLayer`, custom event queues, or window events) with cycle detection, sequence ordering, and field-level redaction.

---

## 2. Architectural Boundary & Non-Goals

Citable owns:
- Validating that an evidence plan is structurally sound and bounded.
- Enforcing public-network safety (blocking private/loopback SSRF).
- Executing declared browser profiles and interaction steps.
- Recording observed requests, responses, state properties, and runtime events.
- Redacting credentials, secret tokens, passwords, and sensitive values.
- Attributing events to journey steps with monotonic sequencing.
- Sealing artifacts in immutable run directories with cryptographic hashes (`manifest.json`, `checksums.json`).

Citable **does NOT own**:
- GA4, Google Tag Manager, or Meta Pixel correctness checks.
- Ad conversion verification or attribution modeling.
- Marketing campaign health or CRO scoring.
- Synthetic uptime monitoring or RPA.

Downstream systems (e.g. Nebula Components) read Citable's sealed evidence to evaluate assertions such as `MEAS-GA4-CONVERSION-OBSERVED@1.0`.

---

## 3. Capture Policies, Deny-by-Default Safety & Residual Risk

Evidence acquisition enforces strict deny-by-default posture:
- **Network transactions**: No requests or responses are retained unless `network_policy.enabled` is `true`. Even when enabled, request and response bodies are **deny-by-default** (`request_body: false`, `response_body: false`). Host allowlisting alone does NOT enable body capture.
- **Headers & Query Parameters**: Request headers, response headers, and query parameters default to `null` with status `not_requested` unless explicitly listed in `capture_request_headers`, `capture_response_headers`, or `capture_query_params`.
- **Storage & State**: No storage (cookies, localStorage, sessionStorage) is queried unless explicitly allowlisted by key name in `state_policy`. Indiscriminate storage dumping is forbidden.
- **Mandatory Sensitive Field Protection**: Keys matching sensitive credential patterns (`authorization`, `bearer`, `cookie`, `set-cookie`, `proxy-authorization`, `token`, `secret`, `api_key`, `password`, `session`, `csrf`, `code`, `jwt`, `credit_card`) and values matching credential formats (Bearer tokens, GitHub tokens, JWTs, card numbers) are **unconditionally redacted** as `[REDACTED_SECRET]`, even if specifically requested in an allowlist.
- **HttpOnly Cookie Semantics**: Playwright's `context.cookies()` API operates at the browser context level and can observe HttpOnly cookies. Citable records their presence, byte length, and security flags (`http_only: true`, `secure: true`, `same_site`), but strictly suppresses raw cookie values as `[POLICY_RESTRICTED_HTTPONLY]` (with `disposition: "policy_restricted"`) when `mode: "allowlist_values"` is configured. Plaintext values of HttpOnly cookies are never exposed in evidence artifacts. Technical unobservability is reserved strictly for browser context or connection failures.
- **Residual Risk Disclosure**: Citable combines structural minimization (deny-by-default omission) with heuristic regex redaction. Novel, unstructured, or bespoke secrets placed in customer-allowlisted payload fields that do not match known key or format heuristics cannot be deterministically detected without semantic comprehension. Operators requiring zero secret exposure risk must configure `hash_only: true` or omit body capture.

---

## 4. Resource Bounds & Strict ABSENT Invariant

To prevent memory exhaustion, log pollution, or hostile page Denial of Service:
- `max_events`: Defaults to 200, maximum 1000 for network and runtime events.
- `max_observations`: Maximum 500 for state checkpoints.
- `max_payload_depth`: Maximum 10 levels for JSON serialization.
- `max_field_size`: Maximum 4096 characters per string value.

### The Strict ABSENT Invariant

Downstream systems evaluate evidence based on rigorous epistemic status distinctions. Citable guarantees that `ABSENT` (or `exists: false`) is asserted **only** when all of the following conditions are met:
1. The target property or event was explicitly declared within collection scope;
2. The collector was active throughout the entire observation window;
3. Collection was not truncated (`summary.truncated == false`);
4. The candidate was not filtered out by host, method, name, or key allowlists;
5. No collector or browser execution errors occurred.

If any of these conditions are violated, absence **cannot** be asserted:

| Situation | Evidence Disposition | Status Field | Epistemic Meaning |
|---|---|---|---|
| Property/event absent within bounds | `exists: false` / omitted from `events[]` | `collector_status: "complete"` | Target was observable and did not occur. |
| Limit reached | `summary.truncated: true` | `collector_status: "truncated"` | Limit reached; absence cannot be asserted. |
| Excluded by allowlist | Omitted from output or `filtered` | `status: "filtered"` | Excluded by policy; absence cannot be asserted. |
| Context/DOM error | `null` with `unavailable_items` | `observation_status: "unavailable"` | Observation failed; absence cannot be asserted. |
| Journey step failure | Profile state `failed` | `collector_status: "failed"` | Execution crashed; run is invalid. |

---

## 5. Journey Step Correlation, In-Flight Accounting & Settling

Each network transaction and runtime event is assigned:
- A monotonic integer sequence (`sequence: 1, 2, 3...`).
- A monotonic execution time offset from journey start (`timing.monotonic_offset_ms`).
- A correlation envelope (`step_id`, `step_sequence`, `checkpoint_id`, `initiated_step_id`, `completed_step_id`, `ambiguous_async`).
- An `attribution_phase`:
  - `initial`: Before any journey step.
  - `during_step`: While an action is actively executing.
  - `between_steps`: After an action completed but before the next step.
  - `post_journey`: After all steps concluded.
  - `ambiguous_async`: When an asynchronous request was initiated during one step but completed during another step or after journey conclusion.

### In-Flight Network Accounting & Settling
- `summary.in_flight_requests`: Network requests initiated during the journey that did not complete before journey teardown are recorded in summary accounting and not assumed to be absent or failed.
- `network_policy.settling_timeout_ms`: Optional bounded settling delay (0 to 5000ms, defaulting to 0) executed at journey end to allow pending asynchronous network transactions to settle before teardown.

---

## 5.1 Runtime Event Collection & Tamper Resilience

Runtime event collection hooks browser global event queues (e.g., `window.dataLayer`) using `Object.defineProperty(window, prop, ...)` to intercept queue reassignments (`window.dataLayer = []`) and wraps `.push` to capture real-time events.
- **Hostile Payload Protection**: In-page extraction scripts and serialization logic safely inspect property descriptors to prevent hostile throwing getters (`get prop() { throw new Error(); }`) from crashing the collector, recording `[GETTER_ERROR]` instead.
- **Collector Health Reporting**: The artifact summary exposes `collector_health`:
  - `status`: Collector health state (`healthy`, `degraded`, `failed`).
  - `queue_replaced`: Whether page scripts reassigned the global queue.
  - `push_replaced`: Whether page scripts overwrote the array's `.push` method.
  - `polling_fallback_used`: Whether unhooked mutations were recovered via fallback polling.
  - `supported_contexts`: Explicitly disclosed as `["top_level_main_frame"]`.
  - `unsupported_contexts`: Explicitly disclosed as `["cross_origin_iframes", "web_workers"]`.

---

## 6. Example Configuration

```json
{
  "schema_version": 1,
  "plan_id": "BROWSER-PLAN-CHECKOUT-FLOW",
  "target": "https://example.test/cart",
  "network_policy": {
    "enabled": true,
    "allowed_host_patterns": ["example.test", "*.analytics.test"],
    "allowed_methods": ["GET", "POST"],
    "capture_request_headers": ["content-type", "accept"],
    "capture_query_params": ["utm_source", "campaign"],
    "capture_payload": {
      "request_body": true,
      "allowed_json_fields": ["event", "transaction_id", "value"],
      "hash_only": false
    },
    "max_events": 100
  },
  "state_policy": {
    "enabled": true,
    "checkpoints": ["initial", "step", "final"],
    "cookies": {
      "allowed_names": ["consent_status"],
      "mode": "allowlist_values"
    },
    "local_storage": {
      "allowed_keys": ["cart_id"],
      "mode": "allowlist_values"
    },
    "globals": [
      { "name": "app_version", "expression": "window.APP_CONFIG.version", "mode": "scalar_value" }
    ]
  },
  "runtime_event_policy": {
    "enabled": true,
    "sources": [
      {
        "source_id": "app_data_layer",
        "type": "global_array",
        "global_name": "window.dataLayer",
        "event_name_key": "event"
      }
    ],
    "allowed_event_names": ["begin_checkout", "purchase"],
    "allowed_fields": ["event", "currency", "value"],
    "max_events": 50
  },
  "profiles": [
    {
      "profile_id": "chromium-desktop",
      "browser": { "engine": "chromium", "expected_version": null },
      "device": { "name": "Desktop", "viewport": { "width": 1280, "height": 800 }, "is_mobile": false },
      "javascript_enabled": true,
      "locale": "en-US",
      "consent_state": "granted",
      "authentication_state": "anonymous",
      "steps": [
        {
          "step_id": "click-checkout",
          "action": "click",
          "locator": "button#checkout",
          "value_env": null,
          "key": null,
          "url": null,
          "required": true,
          "capture_screenshot": true,
          "checkpoint_id": "chk-after-click"
        }
      ],
      "limitations": ["Fixture environment does not simulate multi-region latencies."]
    }
  ],
  "limitations": ["Citable records observed events; attribution and conversion validity belong to downstream consumers."]
}
```

---

## 7. Artifact Manifest Integration

When executed, the run creates the following artifacts in `.citable/runs/<run-id>/journeys/<profile-id>/`:
- `network-events.json` (validates against `browser-network-events.schema.json`)
- `state-observations.json` (validates against `browser-state-observations.schema.json`)
- `runtime-events.json` (validates against `browser-runtime-events.schema.json`)

All artifacts are hashed and recorded in `manifest.json` (`output_hashes`) and sealed in `checksums.json`.
