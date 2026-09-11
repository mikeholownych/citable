# Citable Roadmap

**Goal:** Build a defensible SEO/AEO/GEO evidence and governance tool. Citable
reports observable readiness and controlled citation outcomes; it does not
guarantee retrieval, ranking, citation, or model prioritization.

## Current State (v1.19.0)

| Metric | Value |
|--------|-------|
| Detectors | 181 across 19 namespaces |
| Tests | 618 pass across 29 test suites |
| Registries | 29 schema-validated |
| Providers | 12 agent hosts |
| Distribution | 111 packaged files per provider; 4 managed Claude profiles |
| Release automation | npm trusted publishing with provenance; Linux, macOS, and Windows package gates |

The current release separates retrieval eligibility, source extraction and
support suitability, and observed citation behavior. `action-plan` converts
immutable findings into owned, ordered remediation work without mutating the
audited property or claiming that a recommendation was implemented.

The current development branch builds 111 packaged skill files per provider
after the artifact-interchange and agent-profile contracts are generated from
canonical `skill/` sources. Claude additionally receives a separately
manifested four-profile discovery payload.

## Delivered

- Bounded browser-journey evidence acquisition for Playwright rendering: schema-governed
  network transaction capture (`network-events.json`), multi-checkpoint browser state
  observation (`state-observations.json`), and generic runtime event observation
  (`runtime-events.json`) with strict host allowlists, cycle-safe JSON cloning, mandatory
  secret redaction, epistemic status classification (`ABSENT`, `TRUNCATED`, `UNOBSERVABLE`,
  `FAILED`), monotonic step correlation (`during_step`, `between_steps`, `post_journey`,
  `ambiguous_async`), and partial artifact preservation on required-step failure.

- Public npm package and provider-specific skill installation.
- Four Claude Code profiles: a guarded audit/collection role, a read-only
  semantic-review role, a closed-loop remediation role, and an enterprise SOW/governance
  role, all generated from canonical `skill/` sources. Other hosts fail closed as
  unsupported for native profiles.
- Read-only installer and runtime capability diagnosis that keeps optional
  dependency or credential presence separate from successful browser launch,
  API authorization, property access, and collection.
- Read-only profile-aware audit planning with a two-signal inference threshold,
  explicit evidence/confidence, full-audit preservation, and independently
  blocked optional collectors.
- Immutable audit evidence, checksums, snapshot comparison, and fail-closed
  registry validation.
- Retry-bounded remote fetches with same-origin redirect enforcement,
  private-network rejection, timeouts, and response-size limits.
- SEO, AEO, GEO, crawler, structured-data, hreflang, CWV-readiness, and
  agent-readiness detectors.
- Prompt-to-page, entity, claim, and evidence mapping checks.
- Schema-validated normalized JSON-LD graph artifacts with source-block hashes,
  declared and unresolved edges, parse failures, and bounded visible-text
  support status.
- Source-run-bound action plans with blockers, owners, optional dependency
  relationships, explicit failure conditions, semantic review gates,
  unsafe-shortcut warnings, bounded monitoring fields, and verification
  commands. Unsupported dependencies or indicators remain empty rather than
  inferred.
- Immutable observation collectors for optional desktop/mobile/JavaScript-disabled
  Chromium rendering with bounded interactions and resumable partial failures, Google or
  imported index evidence, controlled citation cohorts, crawler logs, per-agent
  synthetic probes, passages with repeated-region extraction evidence,
  canonical/freshness consensus, CrUX/imported performance, and corroboration.
- Reviewed hash-locked remediation plus longitudinal evidence monitoring.
- Policy-driven reviewer authority and governed exceptions that preserve failed
  technical state while independently recording enforcement disposition,
  validity, residual risk, expiry, renewal, and invalidation evidence.
- Version-pinned canonical audit schedules, hash-bound GitHub projections, and
  differential comparability dimensions without causal attribution.
- Direct IndexNow submission connector with fail-closed key verification, batch chunking, dry-run safety, and immutable delivery receipts.
- Canonical discovery consensus matrix synthesizing publisher headers, tags, sitemaps, and search engines (`citable report consensus` + detector `TECH-019`).
- Allowlisted read-only MCP evidence transport adapter with strict payload limits, private IP blocking, and schema validation (`citable connect mcp`).
- Citation attribution and claim entailment verification with distortion detection (`observe attribution` + detector `GEO-008`).
- Governed exception lifecycle management supporting expiry audits, authority-checked renewals, and audit-logged revocations (`citable exceptions <list|renew|invalidate>`).
- Hreflang & Internationalization Signal Consensus detectors (`TECH-020`, `TECH-021`, `TECH-022`).
- Structured data entity-to-text entailment and graph reference integrity (`SCHEMA-009`, `SCHEMA-010`).
- Citation volatility and temporal stability tracking (`GEO-009`).
- MCP transport diagnostic suite for stdio execution, HTTP guards, schema validation, and registry bindings (`citable doctor --mcp`).
- Continuous longitudinal monitoring webhook delivery with HMAC-SHA256 request signing and dispatch receipts (`citable monitor --webhook`).
- Cross-Run Evidence Dashboard (`citable report dashboard`) generating Markdown and self-contained HTML reports with inline SVG trend visualization.
- Multi-Property Fleet Governance with schema `schemas/fleet.schema.json`, registry `fleet.yaml` (29th schema-validated registry), and command `citable fleet [summary|audit]`.
- Cloudflare & Edge Worker remediation adapter in `src/commands/edgeRules.js` (`citable export edge` and `citable test edge`) for redirects, WAF bot blocking expressions, and `HTMLRewriter` Worker scripts with synthetic edge pass-through verification.
- Automated AI Search Engine probing runner `citable probe <query|prompt_id>` in `src/commands/probe.js` generating schema-validated observation envelopes (`observation.schema.json`) for Perplexity, SearchGPT, and Gemini.
- Component-level static AST linter `citable lint components [dir]` in `src/commands/lintComponents.js` detecting touch target violations, unlabelled icon buttons, generic CTA microcopy, missing input labels, autocomplete omission, and image dimension defects.
- Executive presentation and client deliverables exporter `citable report export` in `src/reporting/executiveExport.js` supporting printable HTML briefing documents and slide decks, alongside Slack, Microsoft Teams, and Discord structured alert formatters in `src/monitoring/alertDelivery.js`.
- Causal impact and differential intervention attribution command `citable attribute impact` in `src/commands/attributeImpact.js` calculating difference-in-differences lift estimates with explicit statistical caveats.
- Real-time brand hallucination sentinel detector `GEO-013` in `src/detectors/geoReco.js`.
- Comprehensive Conversion Rate Optimization (CRO) Suite with detectors `CRO-007` through `CRO-020`, multi-step funnel modeling (`funnels.yaml`, `schemas/funnel.schema.json`, `citable test funnel`), and statistical A/B experiment sample size and power planning (`citable plan experiment`).
- Pre-commit CRO auditing in CI/CD pipelines via `citable audit --scope cro`.
- Closed-loop remediation and fulfillment (Nebula release requests): production-safe patch review (framework detection, unified diffs, structural validation, confidence gate, rollback snapshots), `citable verify remediation` with schema-bound before/after evidence bundles, `citable kit export` customer implementation kits, per-finding provenance envelopes, `citable compatibility` and `citable verify page`, edge-code security audit (EDGSEC-001..007), experiment safety guardrails with an explicit lifecycle, deterministic visual layout contracts plus a viewport/variant screenshot matrix, the stable `citable_output_schema` 1.0 JSON envelope, and the labeled golden benchmark corpus (`citable corpus benchmark`).
- Terminology hardening: CRO-021 v2 separates payment-wallet readiness from passkey/WebAuthn authentication readiness; unsupported latency claims removed; ScentBeacon referral fragments documented and enforced as untrusted input; FSA/PCI/gaze outputs labeled as modeled heuristic indices; executive decks separate measured outcomes from modeled estimates and never claim revenue or conversion uplift.

## v1.13 Validation Gates In Progress

- Canonical release manifests bind executable facts and controlled projections
  to the release commit; mismatched counts, versions, generated artifacts, or
  checksums fail closed.
- Releases use an explicit `published_unfinalized` phase. Publisher-controlled
  deployment receipts gate irreversible finalization, while later drift creates
  a new finding and never rewrites historical release state.
- Direct and cache-busted representation probes remain `external_unverified`
  longitudinal observations and cannot satisfy release gates.
- Acceptance-corpus evaluation preserves detector confusion matrices,
  incomplete evidence, reviewer agreement, execution cost, reproducibility,
  and remediation-verification denominators.
- Acceptance-run receipts bind verified run-package checksums to property,
  detector, configuration, observation-method, tool, and external-system
  dimensions. Environment-specific execution context remains visible but is
  excluded from canonical reproducibility fingerprints.
- Real-property corpus records require explicit architecture, owner authority,
  collection, retention, sanitization, publication, evidence availability, and
  contradiction state. Public projection refuses private scope, unsafe or
  unapproved references, expired authority, and undeclared limitations.
- Field-validation metrics disclose numerator, denominator, population,
  exclusions, confidence boundaries, collection provenance, sample/census
  design, and detector-version cohorts. JSON and Markdown are projections of
  the same hash-bound metrics object; unknown false negatives remain unknown.
- Browser evidence plans execute explicit Chromium, Firefox, and WebKit
  profiles with bounded interaction journeys. Browser/device/runtime state and
  raw, DOM, text, accessibility, screenshot, interaction, and failure artifacts
  remain separate; profile differences carry no semantic-impact claim.
- A versioned artifact interchange exports, independently verifies, and imports
  complete sealed runs without changing canonical bytes. It rejects tampering,
  unsealed files, unsafe paths, symbolic links, incompatible envelopes, and run
  collisions; hosted workspace implementation remains outside this repository.

These capabilities shipped through the governed v1.13 release track. The
owner-authorized four-property field corpus and paired post-remediation corpus
are published under [`docs/field-validation/v1.13/`](field-validation/v1.13/).
They remain bounded publisher-controlled evidence, not independent attestation
or evidence that hosted collectors exist.

## Next Priorities

### MCP Evidence Transport

**Current status:** contract and read-only pilot implemented (`citable connect mcp`).
MCP Server Card discovery findings in site audits do not mean Citable can
connect to or collect evidence from an arbitrary MCP server.

MCP operates strictly as a transport into the existing immutable observation
model. It does not confer provider authority, authenticity,
representativeness, completeness, or semantic validity on a tool response.

1. **Transport envelope and threat model:** (Completed) defined server identity,
   pinned version or verified HTTPS endpoint, protocol and tool schema,
   request/response hashes, authorization scopes, raw retention, and
   normalization provenance (`schemas/mcp-transport-envelope.schema.json`).
2. **Read-only provider pilot:** (Completed) implemented allowlisted server
   (`citable-evidence-pilot`) and read-only tools (`inspect_target`, `get_canonical_evidence`,
   `query_search_index`) across stdio and HTTP transports with bounded timeouts,
   payload limits, loopback/private IP blocking, and positive/negative fixtures.
3. **Runtime diagnosis:** extend capability reporting to distinguish package or
   endpoint presence, protocol negotiation, authorization, tool availability,
   property access, collection, and normalization.
4. **Provider-by-provider expansion:** add transports only where a supported
   interface and stable evidence contract can be verified. Each provider keeps
   its own authority and completeness boundaries.

Non-goals are generic arbitrary-server passthrough, state-changing tools,
automatic installation of undocumented servers, persisted credentials,
execution of instructions returned by tools, and treating MCP responses as
authoritative merely because they arrived through MCP.

The proposed provenance fields and security gates are documented in
[Integrations and evidence transports](INTEGRATIONS.md#mcp-transport-contract).

### Retrieval Evidence

- Provider-maintained IP-range retrieval and verification beyond imported
  owner verification results. The staged identity contract and production-log
  normalization are implemented.
- Bing index and AI Performance adapters when supported export/API contracts
  can be captured defensibly. Owner-export normalization is implemented; a live
  AI Performance adapter remains blocked on a supported API contract.
- Multi-region and bot-specific reliability sampling.

### Extraction Evidence

- Reviewed cross-browser comparison policies and application-specific journey
  libraries. The open local execution contract and Playwright adapter are implemented.
- Stronger main-content segmentation and reviewed passage-integrity workflows.
- Canonical consensus matrices spanning redirects, markup, sitemaps, internal
  links, and observed search-engine selections.

### Observed Citation Testing

- First-party adapters for provider products whose supported interfaces expose
  complete answer and citation evidence; custom adapters already preserve mode.
- Citation correctness, first-party selection, canonical citation, attribution
  accuracy, stability, and provider-variance metrics.
- Competitive retrieval-set comparison without collapsing outcomes into a
  single visibility or authority score.

### Measurement Extensions

- Release `v1.5.0` gates provider-neutral metric declarations, optional owner
  imports, user-defined objectives, cohorts, windows, and guardrails before live
  connector work begins.
- Repeated local Lighthouse lab execution and CrUX field collection are
  implemented; hosted regional runners remain future work and existing CWV
  detectors remain infrastructure-readiness checks.
- Bounded PDF text/metadata, transcript, and image-context evidence is
  implemented with explicit provenance and optional OCR. Native video/audio
  decoding, scanned-PDF OCR, table reconstruction, and visual entailment remain
  future version gates.
- Optional analytics integrations using aggregate data and documented consent
  boundaries. GSC Search Analytics and GA4 organic acquisition are implemented;
  additional providers remain version-gated.

### Review Scale

- Materiality-ranked semantic review queues with recorded population, census or
  seeded random sampling, assignment, disagreement, and extrapolation limits
  are implemented. Stratified allocation remains a future version gate.
- Expiring, evidence-backed exception renewal workflows and reviewer
  reassignment without weakening immutable source findings.

## Nebula CRO Strategic Roadmap: The Unrivaled Conversion Platform ("The Obvious Choice")

### Strategic Vision: The "FUCK YES! FINALLY" Paradigm

Traditional CRO audits fail developers, growth teams, and founders. When a team submits a URL to legacy optimization platforms, they typically receive a 40-page generic PDF filled with vague, speculative feedback ("improve value proposition", "make the primary CTA orange", "add social proof"). Developers don't know what code to write, designers don't have mockups, executives don't see deterministic proof, and the audit languishes in a Jira backlog for months.

Nebula Components (`nebulacomponents.com`) transforms conversion rate optimization from an academic critique into an instant, mechanical remediation engine. When an engineer or marketer submits a page for audit, their reaction must be an immediate, visceral: **"FUCK YES! FINALLY."**

This breakthrough experience is built on six operational pillars:
1. **Instant Drop-In Code Synthesis**: The audit never stops at diagnosing defects; it generates the exact, production-ready, fully accessible React, Next.js, Vue, or Tailwind component or unified AST patch ready to paste or commit (`npx nebulacomponents add <component>`).
2. **Interactive Visual "Before & Remediated" Sandbox**: Immediate visual gratification through a side-by-side interactive split-screen preview showing the live friction hotspots on the left and the clean, high-converting Nebula remediation on the right across mobile, tablet, and desktop viewports.
3. **Zero-Deploy CDN Edge Remediation**: For organizations blocked by frozen CMS platforms (Shopify, Webflow, WordPress, legacy monoliths), instant Cloudflare Worker (`HTMLRewriter`), Vercel Edge Middleware, or Fastly scripts patch friction directly at the CDN layer in under 60 seconds without code deployments.
4. **AI-Search "Query-to-Scent" Dynamic Personalization**: In an era where commercial traffic increasingly originates from conversational AI engines (ChatGPT Search, Perplexity, Gemini, Claude), landing pages must dynamically anchor to the exact cited passage and surface context-aligned conversion hooks (`NebulaScentBeacon`).
5. **Zero-Tracker Algorithmic Attention Heatmaps**: Visual conspicuity scoring computed directly from DOM luminance-contrast geometry — eliminating intrusive tracking scripts, privacy risks, and GDPR consent banners. Output is a modeled heuristic index, never observed user behavior.
6. **Deterministic Friction Surface Area Modeling**: Honoring Citable's Premise 1 (*No guarantees*), replace fabricated revenue promises with rigorous, deterministic accounting of eliminated mechanical friction, verified touch boundaries, and unbroken funnel continuity.

---

### Strategic Opportunity Tracks

#### Track 1: "Audit-to-Component" 1-Click Code Synthesis & Drop-in Remediation Engine

- **The Problem**: Audits diagnose problems; engineering has to build solutions. Bridging the gap between an audit finding and a production pull request takes weeks of design and development time.
- **The Nebula Solution**: Deterministic 1:1 binding between Citable CRO findings and battle-tested, accessible Nebula Component primitives:
  - `CRO-007` (Autocomplete missing) & `COMP-005` (Input labels/autocomplete) ➔ `<NebulaFrictionlessInput />` and `<NebulaAddressAutofill />` with validated W3C `autocomplete` tokens (`name`, `email`, `tel`, `address-line1`, `postal-code`) and floating labels.
  - `CRO-008` (Disappearing placeholder-only labels) ➔ `<NebulaFloatingLabelField />` ensuring cognitive label persistence across all viewport states.
  - `CRO-009` (Mobile keyboard mismatch) ➔ `<NebulaKeyboardAdaptiveInput />` with device-native virtual keyboard mappings (`type="tel"`, `type="email"`, `inputmode="numeric"`, `enterkeyhint="next"`).
  - `CRO-010` (Hero choice overload) ➔ `<NebulaHeroCTA />` enforcing single dominant visual action (60%+ visual contrast dominance) with secondary actions demoted to accessible ghost/link variants.
  - `CRO-011` (Buried CTA) ➔ `<NebulaStickyMobileDock />` providing an ergonomic 48px sticky thumb-zone conversion dock with scroll-depth disclosure.
  - `CRO-012` (Low-intent generic microcopy) & `COMP-003` (Generic CTA text) ➔ `<NebulaIntentMicrocopy />` replacing dead-end generic verbs ("Submit", "Click Here") with outcome-oriented action verbs based on detected page intent.
  - `CRO-013` (Enclosed checkout distraction leaks) ➔ `<NebulaEnclosedCheckoutHeader />` stripping primary navigation, search bars, social icons, and extraneous footer links during checkout steps.
  - `CRO-014` (Receipt page missing noindex) ➔ Auto-injecting `noindex, nofollow` headers/meta alongside `<NebulaOrderConfirmationReceipt />` with self-service retention hooks.
  - `CRO-015` (Touch target < 44px) & `COMP-001` (Touch target dimension violation) ➔ `<NebulaTouchTarget />` ensuring 48x48px accessible hit areas with zero layout distortion.
  - `CRO-016` (CTA font size < 12px) ➔ `<NebulaTypographyScale />` enforcing minimum 16px body/button legible baselines across responsive breakpoints.
  - `CRO-017` & `CRO-018` (Funnel step breaks & stripped campaign tracking) ➔ `<NebulaFunnelLink />` ensuring unbroken URL parameters, campaign tracking, and prefetching.
  - `CRO-019` (AI Search claim-to-conversion gap) ➔ `<NebulaScentBeacon />` dynamic passage anchoring.
- **Automated AST Code Modding (`citable remediate --component <name> --target <file>`)**:
  - Parses JSX/TSX ASTs via `@babel/parser` and `@babel/traverse`.
  - Replaces non-conforming HTML primitives with corresponding Nebula Components while preserving all existing event handlers, state hooks, and custom props.
  - Emits clean unified Git diffs ready for review and merge.
- **Terminal Scaffolding**: Audit CLI outputs copy-pasteable scaffolding commands (e.g. `npx nebulacomponents add sticky-dock`) directly below each finding.

#### Track 2: Interactive Visual "Before / Remediated" Sandbox & Live DOM Mutation Previews

- **The Problem**: Stakeholders cannot visualize what an audit recommendation actually looks like without design meetings and mockups.
- **The Nebula Solution**: CLI command `citable preview cro <url|file>`:
  - Spins up a local, zero-dependency sandboxed preview server.
  - Generates a side-by-side interactive split-screen view:
    - **Left Pane (Current Page)**: Interactive DOM snapshot with highlighted friction hotspots (red boundary boxes with detector tooltips and issue severity).
    - **Right Pane (Remediated Page)**: Live rendered DOM with Nebula Components seamlessly swapped in.
  - **Interactive Features**:
    - **Viewport Emulation**: Seamlessly toggle between Mobile (375px), Tablet (768px), and Desktop (1280px).
    - **Live Interaction Testing**: Click buttons, focus inputs, test virtual keyboard simulation, and inspect touch target hitboxes.
    - **Exportable Client/Executive Presentation Artifact**: Self-contained, single-file HTML bundle (`citable report export --format preview`) with embedded SVG diffs and zero external CDN dependencies for instant stakeholder approval.

#### Track 3: AI-Search "Query-to-Scent" Dynamic Personalization & Answer Anchoring (`NebulaScentBeacon`)

- **The Problem**: Modern traffic increasingly arrives from AI answer engines (SearchGPT, Perplexity, Gemini, Claude). The AI cites a specific paragraph or feature deep inside the page. When the user clicks the citation, they land at the top of a generic homepage, see no immediate connection to what the AI answered, experience cognitive dissonance, and bounce.
- **The Nebula Solution**: The `NebulaScentBeacon` architecture:
  - Parses incoming referral headers and URL text fragment anchors (`#:~:text=...`).
  - Cross-references query parameters against `claims.yaml` and `pages.yaml`.
  - Automatically highlights the exact corroborating passage that the AI search cited (satisfying `CRO-019`).
  - Dynamically docks a contextual conversion trigger immediately adjacent to the cited passage: e.g., *"You arrived looking for [Feature X cited by SearchGPT]. Test the live sandbox below."*
  - 100% static HTML crawlability, zero latency impact, zero cloaking, and full SEO/AEO indexability.

#### Track 4: Privacy-First Algorithmic Attention & Visual Saliency Modeling (Zero-Tracker Heatmaps)

- **The Problem**: Traditional session recorders and heatmap scripts (Hotjar, CrazyEgg, FullStory) add 150KB–300KB of heavy JavaScript, degrade Core Web Vitals (INP/LCP), and require intrusive GDPR/CCPA cookie consent banners that reduce initial page conversion.
- **The Nebula Solution**: Pure DOM & Computer Vision Saliency Engine:
  - Uses deterministic luminance-contrast algorithms, visual edge detection, typography weight distribution, and whitespace ratios directly from the headless Chromium DOM snapshot.
  - Instant output: Within 500ms of running `citable audit --scope cro`, outputs an algorithmic visual attention heatmap overlay.
  - **Saliency Metrics**:
    - **Primary CTA Conspicuity Index (PCI)**: Mathematical ratio of CTA visual salience relative to surrounding hero elements.
    - **Visual Clutter & Cognitive Load Index**: Quantification of competing high-contrast elements in the initial 1000px viewport.
    - **Gaze Vector Probability**: Predicts the first three fixations of a first-time visitor.

#### Track 5: Form Friction Micro-Diagnostics & Biometric/One-Tap Checkout Readiness

- **The Problem**: Over 70% of conversion drop-off occurs inside form and checkout steps, yet standard audits merely advise "shorten the form" without analyzing input mechanics.
- **The Nebula Solution**: Granular form ergonomics diagnostics:
  - **Keystroke Effort Index (KEI)**: Calculates total taps, keyboard switches (alpha to numeric), and shift-key presses required to complete the form on mobile. Compares raw manual entry vs autofill-enabled entry.
  - **Password Manager & Browser Autofill Compatibility Score**: Simulates autofill event dispatch across Chrome, Safari, 1Password, Bitwarden, and Apple Keychain. Identifies silent autofill failures caused by custom divs or detached inputs.
  - **Inline Validation Ergonomics**: Analyzes input validation event listeners. Flags hostile "validate on keydown" patterns that flash red errors while the user is still typing, replacing them with standard "validate on blur" patterns.
  - **Biometric & Express Checkout Detector** (`CRO-021` proposed): Verifies presence of Apple Pay, Google Pay, and WebAuthn Passkey triggers on high-intent conversion steps.

#### Track 6: Zero-Flicker Edge Remediation & CDN Middleware Adapters

- **The Problem**: In mid-market and enterprise organizations, deploying code changes through traditional engineering sprints can take 6–12 weeks due to frozen release windows or legacy CMS constraints.
- **The Nebula Solution**: Turnkey CDN Edge Adapters (`citable export edge --remediation cro`):
  - **Cloudflare Workers**: High-performance streaming `HTMLRewriter` scripts that inject missing `autocomplete` attributes, adjust touch target classes, insert sticky mobile CTA docks, and modify microcopy at the edge. No latency figure is claimed anywhere: edge overhead must be measured per deployment under a documented methodology before it may be stated.
  - **Vercel Edge Middleware**: Edge functions for Next.js deployments that rewrite responses on the fly.
  - **Shopify App Embed & Liquid Bridges**: Pre-packaged liquid snippets and Web Pixel extensions to resolve checkout and cart friction.
  - **Fastly Compute & AWS CloudFront Functions**: VCL and Rust edge transforms.
  - **Synthetic Edge Verification (`citable test edge`)**: Simulates edge request pass-through and verifies that the output DOM satisfies all CRO detector criteria without regressions.

#### Track 7: Turnkey Deterministic A/B Experimentation Engine

- **The Problem**: Setting up third-party A/B testing platforms (Optimizely, VWO) costs tens of thousands of dollars annually, introduces severe layout shift (CLS) through anti-flicker snippets, and often results in inconclusive tests due to underpowered sample sizes.
- **The Nebula Solution**: Native Experiment Blueprinting (`experiments.yaml` + `citable plan experiment`):
  - Automatically translates an audit finding into an empirical A/B experiment spec.
  - Calculates two-tailed binomial sample size, minimum detectable effect (MDE), and required runtime duration to prevent premature termination (`CRO-020`).
  - Generates ready-to-run code for Variant A (control) and Variant B (Nebula remediated).
  - **Zero-Flicker Edge Variant Routing**: CDN-level hash-based traffic splitting (`murmurhash3(visitor_id + experiment_id) % 100`) without layout shift (CLS) or client-side flicker tags.
  - **Telemetry & Conversion Schema Binding**: Enforces schema-validated conversion event dispatching (`schemas/observation.schema.json` envelopes) to prevent corrupted analytics data.

#### Track 8: Shift-Left CI/CD Funnel Sentinel & Continuous Drift Guard

- **The Problem**: Development teams frequently deploy pull requests that unintentionally break conversion funnels—accidentally stripping form labels, shrinking button hit areas, or dropping campaign tracking parameters.
- **The Nebula Solution**: GitHub Actions / Pre-Commit Hook Integration (`citable audit --scope cro --strict`):
  - Blocks pull requests that introduce:
    - Mobile touch target regressions under 44px (`CRO-015`, `COMP-001`).
    - Form field additions lacking `id`, `<label>`, or `autocomplete` (`CRO-007`, `COMP-005`).
    - Funnel link breakages or parameter stripping (`CRO-017`, `CRO-018`).
    - Non-descriptive CTA buttons ("Submit", "Click Here") (`CRO-012`, `COMP-003`).
  - **Automated PR Review Bot**: Comments directly on the offending pull request diff with the exact GitHub suggestion block containing the fixed Nebula Component markup.

#### Track 9: Executive "Friction Surface Area" & Defensible ROI Sizing Matrix

- **The Problem**: Conversion optimization reports frequently make exaggerated, untestable revenue claims ("this will lift conversion by 34%") that destroy credibility with engineering and finance leaders.
- **The Nebula Solution**: Grounded in Citable Premise 1 (*No guarantees*):
  - Replaces speculative revenue claims with the **Deterministic Friction Surface Area (FSA)** index:
    $$\text{FSA} = \sum (\text{Mechanical Defects} \times \text{Funnel Step Weight} \times \text{Device Traffic Share})$$
  - Classifies every issue into:
    - **Deterministic Blocker**: Broken steps, unclickable CTAs, missing mobile input types.
    - **Empirically Measurable Friction**: Unlabelled fields, choice overload, low contrast.
    - **Strategic Hypothesis**: Alternative value propositions, social proof density.
  - **Executive Export (`citable report export --scope cro`)**: Generates crisp, presentation-ready briefing decks for founders, CMOs, and engineering leaders, demonstrating exact engineering effort vs friction eliminated.

#### Track 10: Multi-Platform Design System Component Library (`@nebulacomponents/core`)

- Accessible, high-converting component implementations across modern web frameworks:
  - React / Next.js (`@nebulacomponents/react`)
  - Vue / Nuxt (`@nebulacomponents/vue`)
  - Svelte / SvelteKit (`@nebulacomponents/svelte`)
  - Web Components / Vanilla HTML (`@nebulacomponents/web`)
- **Core Conversion Primitives**:
  - `NebulaHeroCTA`: Ergonomic primary conversion block with choice-minimizing hierarchy.
  - `NebulaFrictionlessForm`: Multi-step form with inline validation, keyboard switching, and 100% autofill coverage.
  - `NebulaStickyMobileDock`: Fixed-bottom mobile CTA with scroll-aware disclosure.
  - `NebulaSocialProofStrip`: Accessible, non-distracting social proof with verified review markup.
  - `NebulaExitIntentModal`: Accessible dialog triggered on mouseout/tab-switch with keyboard trap and focus restoration.
  - `NebulaPricingTable`: Choice-governed pricing matrix with annual/monthly billing toggle and recommended tier emphasis.
  - `NebulaScentBeacon`: AI-search query/passage highlighting and context-aligned conversion banner.

## Release Policy

- **MAJOR:** breaking command, schema, registry, or artifact contract changes.
- **MINOR:** backward-compatible commands, detectors, adapters, or report fields.
- **PATCH:** backward-compatible fixes and documentation corrections.

Every release must pass `npm test`, rebuild distributions from `skill/`, validate
the packed tarball, and record user-visible changes in `CHANGELOG.md`.
