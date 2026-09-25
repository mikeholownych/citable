# Traceability matrix

Maps material requirements from the three normative documents to implemented
controls. Control types: **I** skill instruction · **C** command · **R**
registry field · **D** detector · **U** rubric · **V** validation rule · **T**
test · **P** report field · **L** lifecycle control.

Consolidation note: overlapping requirements across the three documents are
consolidated into shared controls (single registry set, shared detector
namespaces); rows cite all contributing sources. Conflicts encountered: none
material — where SEO doc treats robots/noindex loosely and AEO/GEO demand
purpose separation, the more conservative purpose-per-crawler model was chosen
(crawlers registry).

## SEO — "Requirements for a Top-Tier SEO System"

| Source requirement | Controls |
| --- | --- |
| No ranking guarantees (§preamble) | I: SKILL.md premise 1; P: no-guarantee banner in every report (tested) |
| Query registry with intent/funnel/value/owner fields (§1) | R: query.schema.json (all listed fields); C: map-queries contract |
| Intent classes problem-awareness→brand (§1) | R: query intent enum; C: map-queries |
| Prioritize by value × intent ÷ cost, not volume (§1) | I: map-queries contract (operator-owned business_value); U: intent-alignment |
| URL-level conditions: 200, MIME, indexable, canonical, title, H1, content, links, sitemap (§2) | D: TECH-001/002/012, PAGE-001/005/008, TECH-016, LINK-001; T: detectors.test |
| robots.txt vs noindex distinction (§2) | D: TECH-003 remediation text; I: crawler-policy-template rule 4 |
| Canonical signal agreement + failure catalogue (§2) | D: TECH-004/005/006/007/009, SCHEMA-003 |
| Rendering: critical content in initial HTML (§2) | D: TECH-011; C: validate-render contract |
| Mobile-first parity (§2) | D: TECH-018 (proxy check; full parity documented as limitation) |
| Core Web Vitals thresholds (§2) | D: CWV-001…004; infrastructure-readiness checks (LCP potential blockers, preconnect hints, image optimization, DOM complexity) |
| Crawler-facing reliability telemetry (§2) | C: monitor-crawlers contract (operator logs); R: crawler ip_validation_method |
| Architecture: orphans, depth, hubs, dead ends, intent separation (§3) | D: ARCH-001…006 |
| Internal link rules, anchor quality, no automated link stuffing (§3) | D: LINK-001…004 |
| Content quality: intent answer, originality, defensible claims (§4) | U: information-gain, intent-alignment; D: CLAIM-007, PAGE-008 |
| Programmatic SEO controls (§9) | I: anti-patterns (duplicated programmatic prose, unbounded facets); D: PAGE-002/004 duplicate detection |
| On-page: title/H1/intro/headings/images/meta (§5) | D: PAGE-001…007; ANS-001 |
| Entity foundation + author transparency (§6) | R: entity registry; D: ENTITY-001…007; U: entity-clarity |
| Unsafe link acquisition list (§6) | I: anti-patterns ⛔ rows; premise 3.6 |
| Structured data controls: stable @id, visible content, no fabricated ratings, CI validation (§7) | D: SCHEMA-001…008, ENTITY-003; C: schema; V: audit schema scope |
| International/hreflang (§8) | D: HREFLANG-001…003; valid ISO language-country codes, self-referencing hreflang, x-default fallback |
| Measurement metrics + segmentation (§10) | C: measure seo contract; P: summary by discipline/namespace |
| Experiment record + causal caution (§11) | R: experiment.schema.json; D: MEAS-003 |
| Governance roles + pre-deploy controls (§12) | R: owner fields across registries; D: LIFE-001…005; C: compare-snapshots in CI |
| Incident severity + evidence (§13) | I: measurement.md runbook; U: narrative-accuracy SEV mapping |
| Page/site acceptance standards (§14–15) | D: aggregate of TECH/PAGE/ANS/LIFE; P: posture template |
| Maturity model (§16) | Reference material: skill/references (informational; not a score) |

## AEO — "Requirements for a Top-Tier AEO System"

| Source requirement | Controls |
| --- | --- |
| No citation guarantees; citation share objective (§preamble) | I: premise 1; P: report banner |
| Question corpus 200–500, subquestions, adversarial variants (§1) | R: query registry variants/intent; C: map-queries contract |
| Crawler access per engine (OAI-SearchBot, PerplexityBot…) (§2) | R: crawlers.yaml defaults seeded by init; D: CRAWL-001…006 |
| Search discovery ≠ training controls (§2) | D: CRAWL-002; R: purpose enum; I: premise 3.3 |
| Indexing controls incl. nosnippet/max-snippet (§2) | D: TECH-017 |
| No JS-dependence for core content; no PDF-only evidence (§2) | D: TECH-011; I: anti-patterns technical |
| Sitemap segmentation by content class (§2) | C: audit captures sitemaps per file; I: page-work architect |
| Entity architecture + org proof + author authority (§3) | R: entities; D: ENTITY-*; U: entity-clarity |
| Citation-grade structure: direct answer, definitions, atomic claims, evidence adjacency, tables+prose, procedures, boundaries (§4) | D: ANS-001…008; U: answer-extractability; C: answer-block |
| Original evidence classes (§4/§5) | R: evidence_type enum (16 types); U: information-gain |
| Content portfolio classes (§5) | R: page_type enum (definition/problem/comparison/implementation/evidence/…) |
| Schema accuracy, no mass FAQ markup, llms.txt is not foundational (§6) | D: SCHEMA-007, GEO-004; I: anti-patterns |
| External corroboration: high-value vs harmful list (§7) | U: source-authority (hard exclusions); D: EXT-001/002; I: premise 3.6 |
| Freshness lifecycle classes + review controls + no freshness theater (§8) | R: page lifecycle_class enum mirrors §8 table; D: LIFE-003/006; L: review_cadence fields |
| Version evidence for technical content (§8) | R: evidence methodology/test_conditions/measurement_period |
| Internal linking/knowledge graph; one canonical answer page per question (§9) | D: ARCH-004/006; C: interlink |
| Measurement model: citation share, absorption, fidelity, volatility (§10) | R: prompt-result schema fields; C: measure aeo contract |
| Testing protocol: engines, regions, repetition; one output ≠ ranking (§10) | D: MEAS-001/002; C: test-prompts contract |
| Governance roles + provenance register (§11) | R: claims/evidence registries; D: CLAIM-006, LIFE-002 |
| Automation limits: publication gating, unsafe pattern (§12) | I: map-claims/create-page contracts (candidate-only writes); T: map-claims test |
| Page acceptance checklist (§13) | D: aggregate; P: posture template |
| Findings proceed through owned remediation and verification | C: action-plan; I: finding-to-action protocol; V: source-run hash + before/after audit |

## GEO — "Requirements for a Top-Tier GEO System"

| Source requirement | Controls |
| --- | --- |
| No recommendation/narrative guarantees (§preamble) | I: premise 1; P: banner |
| Prompt registry with class/risk/baseline/accuracy fields (§1) | R: prompt.schema.json (all fields); prompt classes enum (10 classes) |
| Access layers must not be conflated; crawler-purpose matrix (§2) | R: crawler purpose enum (6 layers); D: CRAWL-001/002; I: crawler-policy-template |
| Technical conditions for GEO targets (§2) | D: TECH-* shared (consolidated control) |
| Crawler telemetry; UA spoofing caution (§2) | C: monitor-crawlers contract; R: ip_validation_method |
| Entity resolution: canonical entities, consistency, category contradictions (§3) | D: ENTITY-002/006, GEO-003; U: entity-clarity counterexample |
| Claim registry with scope/exclusions/legal status/surfaces/coverage (§4) | R: claim.schema.json (all fields) |
| Claim hierarchy (factual/performance/comparative/opinion/aspirational) must not flatten (§4) | R: claim_type enum; D: CLAIM-005; C: substantiate (opinion track) |
| Generative-ready content: definitional clarity, atomicity, adjacency, controlled terminology, falsifiability, scope, info gain (§5) | D: ANS-*, ENTITY-006; U: semantic-clarity, information-gain |
| Recommended page composition (§5) | C: create-page workflow (10-part composition) |
| External corroboration; unsafe practices list (§6) | D: EXT-001/002, GEO-001; I: premise 3.6 ⛔ list |
| Recommendation eligibility data (target/non-target/deployment/geo/pricing/limitations…) (§7) | D: RECO-001…006; U: recommendation-eligibility |
| Narrative baseline + contradiction classes + correction runbook (§8) | C: monitor-contradictions contract; U: narrative-accuracy (14 contradiction classes, SEV mapping) |
| Structured data graph consistency; llms.txt optional (§9) | D: ENTITY-003, SCHEMA-008, GEO-004; C: schema @id generation |
| Multimodal assets (§10) | D: SCHEMA-013 (VideoObject); media collectors for PDF, transcript, and image text |
| Temporal integrity + historical content controls (§11) | D: LIFE-003/006, SCHEMA-004/006; R: valid_from/expires |
| Measurement metrics + dimensions + repeatability (§12) | R: prompt-result schema; D: MEAS-001/002 |
| Separate scores, no opaque aggregate (§13) | I: posture model; P: posture template exposes dimensions |
| Experimentation + invalid conclusion pattern (§14) | R: experiments; D: MEAS-003 |
| Governance roles + controls (§15) | R: owner fields; D: LIFE-*; L: registry history |
| Provenance/reuse distinctions (public≠reusable) (§16) | R: evidence access_status + reuse_status enums; I: premise 3.3 |
| Automation controls; unsafe workflow (§17) | I: command refusal conditions; T: candidate-only write tests |
| Incident management SEV classes + runbook (§18) | I: measurement.md; U: narrative-accuracy |
| Page/site acceptance standards (§19–20) | D: aggregate; P: posture |
| Prompt/page/entity/evidence readiness before optimization | D: ANS-009/010, GEO-005/006; C: action-plan; U: AEO/GEO validation profile |

## Cross-cutting build-prompt requirements

| Requirement | Controls |
| --- | --- |
| Finding data contract (§12 of build prompt) | schemas/finding.schema.json; V: audit validates every finding, fails run on breach (tested) |
| Evidence package layout (§13) | src/evidence/run.js; T: integration test asserts manifest/findings/report/checksums/robots |
| Severity ≠ confidence (§11) | Finding schema separate enums; framework defaults |
| 6-way finding classification (§3.2) | finding_type enum; deterministic flag per detector |
| ≥60 meaningful detectors (§9) | 181 detectors / 19 namespaces; T: count + per-namespace assertions |
| Positive and negative fixtures (§17) | tests/fixtures/site-clean vs site-broken, registries-good vs registries-bad |
| Detector that flags everything is defective (§17) | T: "flags every page" sanity test on clean fixture |
| Repeated runs stable (§21.21) | T: deterministic rerun test (identical finding IDs) |
| Fail-closed behaviours (§16) | substantiate outcomes, schema blocked list, init unresolved_assumptions, audit incomplete_checks; T: multiple |
| Multi-agent distribution (§18) | `scripts/build-dist.js` → 12 provider-specific managed skill locations under `dist/universal/` |

## ADR-002 — Release evidence and representation drift

| Requirement | Controls |
| --- | --- |
| One canonical release manifest | R: `release-manifest.schema.json`; C: `scripts/release-governance.js manifest`; V: executable facts and projection hashes recomputed before publish |
| Phase-one projection consistency fails closed | C: `release-governance validate`; T: projection tampering and stale documented registry count are refused |
| Two-phase release state with bounded dwell | R: `release-state.schema.json`; C: candidate → published_unfinalized → finalized/superseded/withdrawn transition policy |
| Finalization is immutable | V: terminal states reject every later transition; post-finalization drift remains a separate observation |
| Publisher receipts are owner-controlled execution evidence | R: `deployment-receipt.schema.json`; V: exact surface, manifest, projection, expiry, status, and receipt-hash binding |
| Required receipts gate finalization | C: protected `finalize-release.yml`; V: missing, duplicate, expired, contradictory, malformed, and tampered receipts fail closed |
| Intermediary observations cannot gate | C: `observe representation`; P: `authority_label: external_unverified`, `gates_release_finalization: false`; T: direct/cache-busted integration fixture |
| Representation drift is longitudinal | C: `monitor`; V: stable surface/path/region/request key plus observed divergence and convergence intervals |
| Transformed release surfaces cannot produce false body-hash drift | R: controlled-surface verification method; C: exact body or declared projection-hash header; V: missing transformed-surface proof is insufficient evidence |
| Browser journeys preserve profile and artifact boundaries | R: `browser-evidence-plan.schema.json`; C: `observe render --input`; V: engine/version/device/JavaScript/locale/consent/auth/steps explicit, profile failures independent, artifacts separate, no semantic-impact inference |
| Corpus metrics preserve denominators | R: `acceptance-corpus.schema.json`; C: `corpus evaluate`; V: confusion matrix, incomplete evidence, reviewer, execution, reproducibility, and remediation metrics |
| Acceptance runs have bounded reproducibility receipts | R: `acceptance-run-receipt.schema.json`; C: `corpus receipt`, `corpus compare-receipts`; V: sealed-package integrity, stable canonical fingerprints, six independent change dimensions, and visible partial observations |
| Public field corpus is owner-authorized and sanitized | R: acceptance corpus v2 plus `corpus-publication-receipt.schema.json`; C: `corpus publish`; V: private scope, expired authority, unsafe/unapproved refs, sensitive patterns, missing limitations, and overwrite attempts fail closed |
| Field metrics preserve methodology and provenance | R: `field-validation-metrics.schema.json`; C: `corpus evaluate`, `corpus publish`; V: numerator/denominator/population/exclusions/confidence, sample/census, collection dates, detector-version cohorts, unknown false negatives, and receipt-bound JSON/Markdown projections |
| Sealed runs remain portable without hosted authority | R: `artifact-interchange.schema.json`; C: `artifacts export`, `artifacts verify`, `artifacts import`; V: exact inventory, manifest and checksum binding, historical source versions, atomic import, idempotence, and fail-closed tamper/path/collision handling |

## Executive Reporting Suite (feat/executive-reporting-suite)

| Requirement | Controls |
| --- | --- |
| Governed metric definitions with known limitations and restatement policy | R: `kpi.schema.json`; C: `kpi validate` rejects empty `known_limitations` and missing `executive_definition` |
| Four-act variance narrative: plan → actual → cause → response | R: `variance.schema.json`; V: `variance validate` rejects vague causes; material variances require `management_response` |
| Customer outcome stage progression (finding → causal) | R: `customer-outcome.schema.json` (5-stage enum); V: `outcomes validate` blocks `commercial_value` at `finding_produced` |
| Outcome separation: activity vs validated impact | C: `outcomes summary` warns when all at `finding_produced`; `independently_verified` requires `customer_confirmed` |
| Risk register with KRIs, triggers, controls, and board visibility | R: `risk.schema.json`; V: high/critical residual requires KRIs; board-visible requires `trigger_threshold` |
| Executive review: evidence ledger before narrative | C: `executive-review`; returns `ungoverned_warning` when no KPIs governed; T: test asserts |
| Board pack: every statement governed and sourced | C: `board-report`; returns `refused_sections` when kpis/outcomes/risks absent; T: test asserts |
| Bounded decision record with trade-offs and "what would change my mind" | R: `decision.schema.json`; V: `decision-memo validate` requires consulted parties, `what_would_change_recommendation`, trade-offs; `effectively_one_way` requires `reopen_conditions` |
| Assumption validity tracking with expiry and escalation | R: `assumption.schema.json`; V: validated status requires `evidence_for`; critical requires `next_test`; T: expired subcommand test |
| Compound risk scenario with cascade, hedges, and early-warning triggers | R: `scenario.schema.json`; V: max 3 variables; hedges require cost/impact/owner/deadline; `cascade_analysis` required; T: triggers test |
| Initiative prioritization with transparent scoring | C: `prioritize rank` — scoring formula and weights exposed in output; rejects `transformative` + `assumption` combination; T: test asserts |
| Competitive intelligence provenance controls | R: competitors.yaml extended; V: `competitive-intel validate` requires `observation_date`, `source`, `claim_type`; unreliable sources require `independent_verification` |
| Chief-of-staff routing with audit trail | C: `executive` routes 11 patterns; max depth 1; logs to `.citable/executive-log.yaml`; T: 7 routing tests |

## ADR-003 — Browser Evidence Acquisition (Network, State, and Runtime Events)

| Requirement | Controls |
| --- | --- |
| Network transaction capture with host allowlists | R: `schemas/browser-network-events.schema.json`; C: `src/observations/browser/networkCollector.js`; V: `host_allowlist` pattern filtering, redirects, status, timing; T: `tests/unit/browser-network.test.js` |
| Bounded network headers, query params, and payloads | C: `src/observations/browser/sanitizer.js`, `networkCollector.js`; V: `max_events`, `max_body_bytes`, allowlist filtering, truncation indicators; T: `tests/unit/browser-network.test.js` |
| Browser state checkpoints (navigation, cookies, storage, globals, DOM) | R: `schemas/browser-state-observations.schema.json`; C: `src/observations/browser/stateCollector.js`; V: `allowlisted_cookies`, `allowlisted_local_storage_keys`, `safe_globals`, `dom_queries`; T: `tests/unit/browser-state.test.js` |
| Safe global variable evaluation without arbitrary code execution | C: `src/observations/browser/stateCollector.js`; V: strict regex identifier/bracket path parser, no `eval`, safe traversal; T: `tests/unit/browser-state.test.js` |
| Generic runtime event listening (data layers & window events) | R: `schemas/browser-runtime-events.schema.json`; C: `src/observations/browser/runtimeEventCollector.js`; V: queue polling/patching, cycle-safe cloning, event/field allowlists, SHA-256 field hashing; T: `tests/unit/browser-runtime-events.test.js` |
| Secret detection and unconditional redaction | C: `src/observations/browser/sanitizer.js`; V: Authorization/Bearer, cookies, passwords, API keys, cards, private keys unconditionally redacted to `[REDACTED_SECRET]`; T: `tests/unit/browser-sanitizer.test.js`, `tests/unit/browser-adversarial.test.js` |
| Step correlation without false causal claims | C: `src/observations/browser/correlation.js`; V: monotonic timestamps, step sequences, phase classification (`during_step`, `between_steps`, `post_journey`), `ambiguous_async` flagging; T: `tests/unit/browser-correlation.test.js` |
| Epistemic status separation for absent vs unobserved vs failed | R: `browser-network-events.schema.json`, `browser-state-observations.schema.json`, `browser-runtime-events.schema.json`; V: explicit `ABSENT`, `TRUNCATED`, `UNOBSERVABLE`, `FAILED` values; T: `tests/unit/browser-adversarial.test.js` |
| Plan contract backward-compatibility | R: `schemas/browser-evidence-plan.schema.json`; V: optional `network_policy`, `state_policy`, `runtime_event_policy`, `action: "checkpoint"`; validated via `npm run validate:schemas` |
| Partial evidence preservation on journey failure | C: `src/observations/browserJourney.js`; V: required step failure packages partial network, state, and runtime artifacts alongside error; T: `tests/integration/browser-journey-enhanced.test.js` |
| Evidence envelope and schema validation gates | C: `src/observations/browserJourney.js`; V: `validateAgainst` Ajv compilation for all three artifacts, summary refs in `observation.schema.json` envelope; T: `tests/integration/browser-journey-enhanced.test.js` |

## Shipped Detector Traceability Matrix

<!-- BEGIN GENERATED DETECTOR TRACEABILITY MATRIX -->
| Detector ID | Name | Namespace | Severity | Applicable Requirement |
| --- | --- | --- | --- | --- |
| AGENT-001 | AI bot rules absent from robots.txt | AGENT | medium | AEO §2 required crawler access; isitagentready.com Discoverability |
| AGENT-002 | Link response headers absent | AGENT | low | RFC 8288 Web Linking; isitagentready.com Discoverability |
| AGENT-003 | llms.txt missing | AGENT | low | GEO §3 discoverability; isitagentready.com Content Accessibility |
| AGENT-004 | MCP Server Card not discoverable | AGENT | low | MCP spec §discovery; isitagentready.com Protocol Discovery |
| AGENT-005 | A2A Agent Card not discoverable | AGENT | low | Google A2A spec; isitagentready.com Protocol Discovery |
| AGENT-006 | Markdown content negotiation not supported | AGENT | low | isitagentready.com Content Accessibility; Cloudflare Markdown for Agents |
| AGENT-007 | Web Bot Auth not declared | AGENT | low | isitagentready.com Bot Access Control; Cloudflare Web Bot Auth |
| AGENT-008 | Content-Signals header absent | AGENT | low | isitagentready.com Bot Access Control; Cloudflare Content Signals |
| AGENT-009 | auth.md not present | AGENT | low | isitagentready.com Protocol Discovery; Auth.md convention |
| AGENT-010 | Agentic commerce protocols not declared | AGENT | low | isitagentready.com Commerce; x402/MPP/UCP/ACP protocols |
| AGENT-011 | llms.txt structure or link integrity broken | AGENT | medium | llmstxt.org specification; GEO §3 discoverability; agent-readiness §content-accessibility |
| ANS-001 | Generic preamble before answer | ANS | medium | AEO §4 direct answer block in first 50–100 words; GEO §5 avoid "in today's rapidly evolving..." openings; anti-pattern: generic AI introductions |
| ANS-002 | Question heading without direct answer | ANS | medium | AEO §4 answer extractability; anti-pattern: question headings created only for formatting |
| ANS-003 | Circular definition | ANS | medium | AEO §4 explicit definitions; anti-pattern: circular definitions |
| ANS-004 | Deictic dependency in answer text | ANS | low | AEO §4: extracted passage must not distort or lose meaning; GEO §5 decomposable content |
| ANS-005 | Relative quantity without baseline or timeframe | ANS | medium | AEO §4 atomic factual claims with measurement conditions; detector spec: numerical claim without unit or timeframe; anti-pattern: false precision |
| ANS-006 | Procedure content without ordered steps | ANS | low | AEO §4 procedures: provide explicit steps |
| ANS-007 | Comparison without explicit basis | ANS | medium | AEO §4 comparison tables with prose; detector spec: comparison without explicit comparison basis |
| ANS-008 | Missing scope or limitations on answer page | ANS | medium | AEO §4 boundary conditions; GEO §5 scope boundaries; acceptance standard: limitations disclosed |
| ANS-009 | Answer-target page has no prompt coverage | ANS | medium | AEO §1 governed question corpus and §13 page acceptance; GEO §1 prompt registry and §19 page acceptance |
| ANS-010 | Published claims lack page evidence mapping | ANS | high | AEO §4 evidence adjacency and atomic claims; GEO §4 claim registry and §5 claim-evidence proximity |
| ANS-011 | Over-diluted answer passage (missing direct answer lead) | ANS | medium | AEO §4 direct answer block in first 50–100 words; AEO §5 concise declarative answer passages |
| ANS-012 | Ungrounded quantitative metric in answer passage | ANS | medium | AEO §8 version evidence; GEO §5 substantiated factual claims; premise 3.5: quantitative outcomes require grounding |
| ANS-013 | Comparative or procedural section lacking structured table or ordered sequence | ANS | medium | AEO §5 structured answer surfaces; GEO §4 extractability; premise 3.3 information gain |
| ANS-014 | Low information-gain fluff ratio in answer prose | ANS | low | AEO §8 concise factual grounding; GEO §4 information gain; premise 3.3 substantive answer density |
| ANS-015 | Definitional page lacks direct copular definition | ANS | medium | AEO §4 direct copular answer block; search engine featured snippet & LLM definition synthesis requirements |
| ANS-016 | Comprehensive long-form guide lacks executive summary or key takeaways | ANS | low | AEO §4 structural answer density; GEO §4 top-level synthesis grounding for RAG embedding retrieval |
| ARCH-001 | Orphan page | ARCH | high | SEO §3 no orphan pages; AEO §9 eliminate orphan pages |
| ARCH-002 | Dead-end page | ARCH | medium | SEO §3 internal links: link upward, laterally, and to the commercial next step |
| ARCH-003 | Excessive crawl depth | ARCH | medium | SEO §3 shallow access to important pages |
| ARCH-004 | Duplicate query target | ARCH | high | SEO §3 one canonical URL per primary intent; AEO §9 one clear canonical answer page per question |
| ARCH-005 | Overlapping primary intent | ARCH | medium | SEO §3 consolidated duplicate or overlapping pages; §9 detectors: overlapping intent |
| ARCH-006 | Page without topic-hub relationship | ARCH | low | SEO §3 clear hub-and-spoke relationships; AEO §9 link back to canonical topic hubs |
| CLAIM-001 | Verified claim without evidence | CLAIM | critical | Premise 3.5: owned claims require evidence; acceptance criterion 11: claims cannot become verified without evidence |
| CLAIM-002 | Verified claim depends on expired or revoked evidence | CLAIM | high | Acceptance criterion 12: expired evidence invalidates dependent claims; §8.5 substantiate outcomes |
| CLAIM-003 | Claim active after expiry | CLAIM | high | Detector spec (lifecycle): claim remains active after expiry |
| CLAIM-004 | Quantitative or comparative claim without evidence | CLAIM | high | Detector spec: unsupported quantitative claim, comparative claim without evidence; SEO §4 defensible claims |
| CLAIM-005 | Opinion or aspiration represented as verified fact | CLAIM | medium | GEO §4 claim hierarchy: engines may flatten distinctions, your content must not; §6.4 prevent opinion/aspiration silently becoming fact |
| CLAIM-006 | Regulated claim without required review | CLAIM | high | §8.4: human review required for regulated, contractual, security, financial claims |
| CLAIM-007 | Unbounded superlative in page text | CLAIM | medium | Detector spec: superlative without comparison set; SEO §4 no unsupported claims of superiority; anti-pattern: unbounded superlatives |
| CLAIM-008 | Published claim missing from page text (surface drift) | CLAIM | low | §6.4 publication_surfaces tracking; contradiction management |
| CLAIM-009 | Verified claim without semantic support assessment | CLAIM | high | Premise 3.5 + evidence-strength rubric: verified status requires semantic adequacy review, not only deterministic linkage |
| CRAWL-001 | robots.txt contradicts crawler policy decision | CRAWL | high | GEO §2 crawler-policy matrix; premise 3.3 crawler access managed by crawler and purpose |
| CRAWL-002 | Training-purpose access not decided separately | CRAWL | medium | Premise 3.3: crawler access for search is not permission for model training; GEO §2 access layers must not be conflated |
| CRAWL-003 | robots.txt missing | CRAWL | medium | SEO §2 crawl controls; GEO §2 crawler-policy matrix |
| CRAWL-004 | robots.txt parse problems | CRAWL | medium | SEO §2 explicit control over robots.txt |
| CRAWL-005 | Crawler policy review overdue | CRAWL | low | Registry §6.7 review_date/next_review_date; lifecycle premise |
| CRAWL-006 | Undecided crawler with observed governance relevance | CRAWL | low | GEO §2: decision required per crawler and purpose |
| CRAWL-007 | Spoofed crawler identity in access logs | CRAWL | high | GEO §2 crawler verification; staged identity contract and provider-published IP boundaries |
| CRO-001 | Declared conversion action missing visible interactive CTA | CRO | medium | Premise 3.1: conversion action must be grounded in page interaction surfaces; CRO §1 CTA visibility |
| CRO-002 | Friction-heavy or defective lead capture form | CRO | medium | CRO §2 lead capture form accessibility and interaction friction minimization |
| CRO-003 | Commercial intent page lacks proximate conversion pathway | CRO | medium | CRO §3 commercial intent conversion pathway alignment; SEO §1 commercial page value realization |
| CRO-004 | Defective or unverified outbound conversion target | CRO | medium | CRO §4 conversion link integrity and target availability |
| CRO-005 | Search-to-landing scent gap: primary H1 fails to corroborate title | CRO | medium | CRO §5 message-match alignment; SEO §4 title-to-H1 topic continuity |
| CRO-006 | Commercial lead capture form lacks proximate trust proof or security badges | CRO | low | CRO §6 conversion surface trust and security proof presence |
| CRO-007 | Identity or contact input fields lack HTML5 autocomplete attributes | CRO | low | CRO §7 form field autofill accessibility and mobile input friction minimization |
| CRO-008 | Form inputs rely solely on placeholder without accessible label | CRO | low | CRO §8 form label accessibility; WCAG 2.1 Success Criterion 3.3.2 Labels or Instructions |
| CRO-009 | Mobile input type mismatch for email or telephone fields | CRO | low | CRO §9 mobile virtual keyboard optimization; HTML5 semantic input types |
| CRO-010 | Choice overload: excessive competing primary CTAs in hero conversion zone | CRO | medium | CRO §10 visual hierarchy and decision friction minimization; Hick's Law |
| CRO-011 | Buried primary conversion pathway on long-form commercial page | CRO | medium | CRO §11 commercial conversion pathway accessibility and scroll latency |
| CRO-012 | Low-intent generic CTA microcopy on primary commercial action | CRO | low | CRO §12 CTA microcopy actionability and perceived value clarity |
| CRO-013 | Enclosed checkout or lead funnel leak: distraction navigation present on conversion step | CRO | medium | CRO §13 enclosed checkout and distraction removal; funnel leakage prevention |
| CRO-014 | Unprotected post-conversion confirmation page lacks noindex directive | CRO | medium | CRO §14 conversion confirmation index protection; SEO §2 clean index hygiene |
| CRO-015 | Mobile touch target size below recommended 48px threshold | CRO | low | CRO §15 mobile touch target sizing; WCAG 2.1 Success Criterion 2.5.5 Target Size |
| CRO-016 | Diminutive font size on primary conversion CTA microcopy | CRO | low | CRO §16 CTA microcopy legibility and perceived affordance |
| CRO-017 | Multi-step conversion funnel break: intermediate step unavailable or defective | CRO | high | CRO §17 multi-step funnel continuity and endpoint availability |
| CRO-018 | Funnel progression link fails to preserve campaign attribution parameters | CRO | low | CRO §18 campaign parameter preservation and cross-step attribution continuity |
| CRO-019 | AI Answer cited landing page lacks immediate claim corroboration or conversion pathway | CRO | medium | CRO §19 AI citation-to-conversion pathway alignment; AEO §4 corroboration continuity |
| CRO-020 | Statistical underpower risk on low-traffic A/B experiment | CRO | low | CRO §20 statistical power governance; Experimentation §3 sample size adequacy |
| CRO-021 | High-intent conversion step lacks express payment wallet options | CRO | medium | CRO §21 express checkout ergonomics; mobile checkout friction reduction (payment wallets; authentication readiness tracked separately) |
| CWV-001 | LCP potential blockers | CWV | medium | SEO §2 Core Web Vitals thresholds; LCP potential blockers and render-blocking resources |
| CWV-002 | preconnect hints | CWV | low | SEO §2 Core Web Vitals thresholds; preconnect hints for critical third-party origins |
| CWV-003 | image optimization | CWV | medium | SEO §2 Core Web Vitals thresholds; hero image optimization and responsive sizing |
| CWV-004 | Excessive DOM size and depth | CWV | medium | SEO §2 Core Web Vitals thresholds; excessive DOM size and depth thresholds |
| ENTITY-001 | Entity missing canonical URL | ENTITY | medium | AEO §3 every entity should have one canonical URL; GEO §3 canonical entities |
| ENTITY-002 | Schema entity name conflicts with registry | ENTITY | high | GEO §3 required consistency; detector spec: schema entity differs from visible entity |
| ENTITY-003 | Unstable @id for same entity | ENTITY | medium | SEO §7 stable @id identifiers; GEO §9 required graph consistency |
| ENTITY-004 | sameAs profile not in authoritative list | ENTITY | low | AEO §6 sameAs limited to authoritative profiles; detector spec: unsupported sameAs |
| ENTITY-005 | Product entity without owner relationship | ENTITY | medium | GEO §3 the engine must determine which products the organization owns; detector spec: product ownership ambiguous |
| ENTITY-006 | Unregistered name variant in page text | ENTITY | low | GEO §3 category contradictions and naming drift; SEO §6 consistent names |
| ENTITY-007 | Entity verification stale | ENTITY | low | GEO §3 entity record last_verified; lifecycle premises |
| EVD-001 | Evidence past validity date | EVD | medium | Registry §6.5 valid_until; AEO §8 source revalidation |
| EVD-002 | Benchmark/test evidence missing methodology | EVD | medium | AEO §8 version evidence: methodology, test date; detector spec: missing methodology / measurement period |
| EVD-003 | Claim references dangling or unverified evidence | EVD | high | Referential integrity between claim and evidence registries; premise 3.5 |
| EVD-004 | Secondary evidence where primary is required | EVD | medium | Detector spec: secondary evidence used where primary evidence is required; AEO §4 primary sources where available |
| EVD-005 | Customer evidence lacks attribution | EVD | low | Detector spec: customer evidence lacks attribution; premise 3.6 no fabricated customers |
| EVD-006 | Evidence integrity hash absent | EVD | low | Registry §6.5 integrity_hash; detector spec: evidence integrity hash absent where expected |
| EVD-007 | Evidence marked inaccessible still supporting claims | EVD | medium | Detector spec: evidence source inaccessible; revoked evidence still supporting published claim |
| EVD-008 | Dangling media reference in claim evidence | EVD | high | Registry §6.5 evidence sources; premise 3.5: verified evidence must be grounded and inspectable |
| EVD-009 | Unanchored PDF claim citation | EVD | low | AEO §8 version evidence; premise 3.5 precise citation anchoring for defensible claims |
| EXT-001 | Corroboration claimed from owned surface | EXT | medium | AEO §7: corroboration must be editorially independent; premise 3.6 |
| EXT-002 | Comparative claim lacking independent corroboration | EXT | low | GEO §6: owned content is necessary but insufficient; AEO §7 external corroboration layer |
| GEO-001 | Hidden instructions targeting language models | GEO | critical | Premise 3.6: no hidden instructions for language models, no crawler prompt injection; GEO §6 unsafe practices |
| GEO-002 | Proprietary concept without stable definition | GEO | medium | Detector spec: proprietary term lacks a stable definition; GEO §5 controlled terminology |
| GEO-003 | Entity absent from its category page | GEO | medium | Detector spec: entity omitted from its relevant category page; GEO §3 category placement |
| GEO-004 | llms.txt treated as authority mechanism | GEO | low | Anti-pattern: treating llms.txt as an authority mechanism; GEO §9 llms.txt is optional and experimental |
| GEO-005 | Generative target lacks primary entity mapping | GEO | high | GEO §3 canonical entity registry and §19 page acceptance; AEO §3 entity architecture |
| GEO-006 | Active prompt lacks evaluation brief | GEO | medium | GEO §1 prompt registry, §12 repeatable measurement, and §15 governance; AEO §1 question corpus |
| GEO-007 | Unfavorable or distorted entity stance in recorded generative answers | GEO | high | GEO §6: accurate synthesis and entity representation; Rubric: narrative accuracy (§4 & §5) |
| GEO-008 | Generative citation attributes unverified or distorted claim to brand | GEO | high | GEO §6: accurate synthesis and entity representation; Rubric: narrative accuracy (§4 & §5) and claim boundedness (§1) |
| GEO-009 | Unstable citation presence across repeated probes | GEO | medium | GEO §6 generative retrieval stability; longitudinal observation controls; answer-engine variance tracking |
| GEO-010 | Brand erasure in multi-competitor category prompt | GEO | high | GEO §6 entity representation in competitive category synthesis; GEO §1 share of model parity |
| GEO-011 | RAG chunk fracture: claim separated from citation across oversized section | GEO | medium | GEO §4 RAG semantic chunk boundary preservation; AEO §4 modular evidence proximity |
| GEO-012 | Repetitive phrase stuffing in section headings degrading dense retrieval | GEO | low | GEO §4 semantic vector distinctiveness; SEO §4 heading diversity and keyword stuffing avoidance |
| GEO-013 | AI engine assertion contradicts verified publisher claim registry | GEO | high | GEO §13 AI hallucination and claim contradiction governance; AEO §2 factual integrity |
| HREFLANG-001 | hreflang link valid | HREFLANG | high | SEO §8 International/hreflang; valid ISO language-country codes and absolute URLs |
| HREFLANG-002 | hreflang self-reference | HREFLANG | medium | SEO §8 International/hreflang; self-referencing hreflang annotations |
| HREFLANG-003 | hreflang x-default | HREFLANG | medium | SEO §8 International/hreflang; x-default fallback for international pages |
| LIFE-001 | Page without content owner | LIFE | medium | SEO §14 lifecycle: owner assigned; AEO §13 content owner assigned |
| LIFE-002 | Claim-bearing page without factual reviewer | LIFE | medium | AEO §8 required update controls: factual reviewer; SEO §12 subject-matter expert role |
| LIFE-003 | Review overdue | LIFE | medium | AEO §8 lifecycle classification and review intervals; SEO §12 content review dates |
| LIFE-004 | Page without lifecycle classification | LIFE | low | AEO §8 every page needs a lifecycle classification; detector spec: content lacks lifecycle classification |
| LIFE-005 | Regulatory content without jurisdiction | LIFE | medium | Detector spec: regulatory content lacks jurisdiction; AEO §1 jurisdiction field |
| LIFE-006 | Freshness theater (date bumped, content unchanged) | LIFE | medium | AEO §8 do not update dates without materially updating content ("freshness theater") |
| LINK-001 | Broken internal link | LINK | medium | SEO §12 broken internal-link detection; §2 crawlable internal links |
| LINK-002 | Internal link to redirect | LINK | low | SEO §3 avoid links to redirects or canonical duplicates |
| LINK-003 | Generic anchor text | LINK | low | SEO §3 meaningful anchor text; avoid "click here" |
| LINK-004 | Sitewide repeated exact-match anchor | LINK | low | SEO §3 avoid sitewide exact-match anchors and automated keyword-matched links |
| LINK-005 | Internal redirect hop chain or circular redirect loop | LINK | medium | SEO §3 eliminate multi-hop internal redirects; prevent crawler trap redirect loops |
| LINK-006 | Excessive naked URL or uninformative internal anchor text ratio | LINK | low | SEO §3 descriptive anchor text; AEO §2 semantic entity linking; premise 3.3 topic graph integrity |
| MEAS-001 | Prompt observation missing required metadata | MEAS | medium | §8.8 test-prompts must record model, interface, locale, date; GEO §12 evidence capture |
| MEAS-002 | Single observation treated as stable outcome | MEAS | medium | AEO §10 statistical caution: do not claim improvement from one prompt/one day; GEO §12 repeatability |
| MEAS-003 | Causal experiment conclusion without controls | MEAS | medium | SEO §11 required experiment record; GEO §14 invalid conclusion pattern |
| PAGE-001 | Missing title element | PAGE | high | SEO §2 unique and accurate title; §5 title element |
| PAGE-002 | Duplicate title across pages | PAGE | medium | SEO §5 title should distinguish the page from other pages; avoid boilerplate duplication |
| PAGE-003 | Missing meta description | PAGE | low | SEO §5 meta description as search-result copy, not a ranking lever |
| PAGE-004 | Duplicate meta description | PAGE | low | SEO §5 avoid duplicated descriptions |
| PAGE-005 | Missing or multiple H1 | PAGE | medium | SEO §2 one clear primary heading; §5 primary heading |
| PAGE-006 | Heading hierarchy skip | PAGE | low | SEO §5 headings represent real document hierarchy |
| PAGE-007 | Image missing alt text | PAGE | low | SEO §5 images: appropriate alt text; accessibility preservation (premise 3.7) |
| PAGE-008 | Thin index-target content | PAGE | medium | SEO §2 meaningful main content; §4 sufficient depth |
| PAGE-009 | Keyword stuffing | PAGE | medium | SEO §5 semantic coverage, not term-frequency quotas; anti-pattern library: keyword stuffing |
| PAGE-010 | High boilerplate-to-content ratio in extracted answer passages | PAGE | medium | SEO §5 main content extraction; AEO §4 concise and focused answer passages |
| PAGE-011 | Critical entity claims rendered inside transient/collapsible UI containers without fallback | PAGE | medium | AEO §2 crawlable and indexable answer surfaces; premise 3.5: claims must be verified and crawlable |
| RECO-001 | Recommendation data missing: target user | RECO | medium | GEO §7 target user |
| RECO-002 | Recommendation data missing: non-target user / exclusions | RECO | medium | GEO §7 non-target user; recommendation page lacks non-target user |
| RECO-003 | Recommendation data missing: deployment model | RECO | medium | GEO §7 deployment |
| RECO-004 | Recommendation data missing: pricing qualification | RECO | medium | GEO §7 pricing public or clearly qualified |
| RECO-005 | Recommendation data missing: limitations | RECO | medium | GEO §7 limitations; detector spec: missing limitations |
| RECO-006 | Recommendation data missing: geography | RECO | medium | GEO §7 geography |
| SCHEMA-001 | JSON-LD parse failure | SCHEMA | high | SEO §7 schema validation in CI/CD; detector spec: JSON-LD parse failure |
| SCHEMA-002 | Schema headline/name mismatch with visible content | SCHEMA | medium | Premise 3.4: structured data must match visible content; SEO §7 no invisible marked-up claims |
| SCHEMA-003 | Schema URL conflicts with canonical | SCHEMA | medium | SEO §2 canonical signals should agree across structured data URLs |
| SCHEMA-004 | Inaccurate schema dates | SCHEMA | medium | SEO §7 accurate dates; AEO §8 do not update dates without material updates |
| SCHEMA-005 | Rating/review markup without visible reviews | SCHEMA | critical | Premise 3.4: no fabricated ratings or reviews; SEO §7 required controls |
| SCHEMA-006 | Stale offer price validity | SCHEMA | medium | Premise 3.4: avoid stale prices or availability; GEO §11 pricing: immediate on change |
| SCHEMA-007 | FAQPage markup without matching visible questions | SCHEMA | high | AEO §6 do not deploy mass-generated FAQ schema; anti-pattern: FAQ schema without substantive FAQ content |
| SCHEMA-008 | Contradictory Organization graphs | SCHEMA | high | Detector spec: multiple contradictory entity graphs; GEO §9 graph consistency |
| SCHEMA-009 | Structured data entity facts unsupported by visible content | SCHEMA | high | Premise 3.4: structured data must match visible content; Google Structured Data General Guidelines: no invisible marked-up facts |
| SCHEMA-010 | Dangling or circular @id reference in entity graph | SCHEMA | high | GEO §9 graph consistency and entity resolution; Schema.org graph reference integrity |
| SCHEMA-011 | BreadcrumbList schema broken or unanchored | SCHEMA | medium | SEO §7 schema validation; Google Search Central Breadcrumb structured data specification |
| SCHEMA-012 | Temporal contradiction between schema dates, visible text, and HTTP headers | SCHEMA | medium | Premise 3.4: structured data must match visible content; SEO §7 freshness consensus; AEO §8 version evidence |
| SCHEMA-013 | VideoObject schema missing critical SERP playback prerequisites | SCHEMA | medium | Google Search Central Video structured data guidelines; SEO §7 schema validation |
| SCHEMA-014 | Organization or LocalBusiness schema missing authoritative identity attributes | SCHEMA | low | Google Search Central Organization structured data; GEO §9 knowledge graph entity resolution |
| SCHEMA-015 | Circular or self-referential JSON-LD @id node reference | SCHEMA | high | Google Search Central structured data syntax; Knowledge Graph acyclic graph integrity |
| SCHEMA-016 | Author Person entity lacks external disambiguation URL or sameAs | SCHEMA | medium | Google Search Central Article author structured data; E-E-A-T author identity disambiguation |
| TECH-001 | Non-200 index-target URL | TECH | critical | SEO §2 required URL-level conditions; AEO §2 required indexing controls; GEO §2 required technical conditions |
| TECH-002 | Accidental noindex on index-target page | TECH | critical | SEO §2 crawl controls; AEO §2 no accidental noindex |
| TECH-003 | robots.txt blocks index-target page | TECH | critical | SEO §2 critical distinction (robots.txt vs noindex); AEO §2 required crawler access |
| TECH-004 | Multiple conflicting canonical declarations | TECH | high | SEO §2 canonicalization: common canonical failures |
| TECH-005 | Canonical points to redirect | TECH | high | SEO §2 canonical failures: canonical points to a redirect |
| TECH-006 | Canonical points to error page | TECH | high | SEO §2 canonical failures: canonical target returns an error |
| TECH-007 | Canonical points to noindex page | TECH | high | SEO §2 canonical failures: canonical target is noindex |
| TECH-008 | Sitemap contains redirecting URL | TECH | medium | SEO §2: sitemap contains redirect |
| TECH-009 | Sitemap contains non-canonical URL | TECH | medium | SEO §2 canonical signals should agree across sitemap entries |
| TECH-010 | Sitemap URL unresolvable or errors | TECH | medium | SEO §2 sitemap processing; clean sitemap coverage (§15) |
| TECH-011 | Render-dependent primary content | TECH | high | SEO §2 rendering; AEO §2 rendering requirements; GEO §2 server-rendered principal content |
| TECH-012 | Invalid MIME type for HTML page | TECH | high | SEO §2 correct MIME type |
| TECH-013 | Redirect chain | TECH | medium | SEO §2 no redirect chain |
| TECH-014 | Soft-404 behaviour | TECH | medium | SEO §2 no soft-404 behaviour |
| TECH-015 | Staging or preview host exposed as indexable | TECH | critical | SEO §2 staging environments; §12 staging environment protection |
| TECH-016 | Missing sitemap | TECH | medium | SEO §2 inclusion in the appropriate XML sitemap; AEO §2 sitemap architecture |
| TECH-017 | Snippet suppression on citation-target page | TECH | high | AEO §2 no restrictive nosnippet; GEO §2 snippet eligibility |
| TECH-018 | Missing viewport (mobile readiness) | TECH | low | SEO §2 mobile-first requirements (proxy check; full parity requires dual rendering) |
| TECH-019 | Open Graph URL conflicts with canonical | TECH | medium | SEO §2 canonical signals should agree across Open Graph and HTML declarations; AEO §2 consistent identity signals |
| TECH-020 | Missing reciprocal hreflang return link | TECH | high | SEO §2 internationalization controls; RFC 8288 and search engine hreflang reciprocity requirement |
| TECH-021 | Invalid or non-standard BCP 47 hreflang syntax | TECH | high | SEO §2 BCP 47 language/region standards (ISO 639-1 language, ISO 3166-1 alpha-2 region) |
| TECH-022 | Hreflang alternate target conflicts with rel=canonical | TECH | critical | SEO §2 canonical and alternate harmony; localized pages in an hreflang cluster must be self-canonical |
| TECH-023 | Hydration gap: critical metadata or schema missing from initial server HTML response | TECH | high | SEO §2 crawlable HTML and server-side rendering; AEO §2 immediate extractability without execution delay |
| TECH-024 | Excessive render-blocking script payload exceeding crawler execution budget | TECH | medium | SEO §2 crawler execution budget; Google Search Central JavaScript rendering guidelines |
| TECH-025 | Oversized uncompressed image asset or heavy inline image payload | TECH | medium | SEO §2 crawler media payload budget; Google Search Central image optimization guidelines |
<!-- END GENERATED DETECTOR TRACEABILITY MATRIX -->
