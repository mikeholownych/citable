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
| Core Web Vitals thresholds (§2) | Partially covered: performance budgets documented as limitation — no field-data adapter in MVP (see known-limitations.md) |
| Crawler-facing reliability telemetry (§2) | C: monitor-crawlers contract (operator logs); R: crawler ip_validation_method |
| Architecture: orphans, depth, hubs, dead ends, intent separation (§3) | D: ARCH-001…006 |
| Internal link rules, anchor quality, no automated link stuffing (§3) | D: LINK-001…004 |
| Content quality: intent answer, originality, defensible claims (§4) | U: information-gain, intent-alignment; D: CLAIM-007, PAGE-008 |
| Programmatic SEO controls (§9) | I: anti-patterns (duplicated programmatic prose, unbounded facets); D: PAGE-002/004 duplicate detection |
| On-page: title/H1/intro/headings/images/meta (§5) | D: PAGE-001…007; ANS-001 |
| Entity foundation + author transparency (§6) | R: entity registry; D: ENTITY-001…007; U: entity-clarity |
| Unsafe link acquisition list (§6) | I: anti-patterns ⛔ rows; premise 3.6 |
| Structured data controls: stable @id, visible content, no fabricated ratings, CI validation (§7) | D: SCHEMA-001…008, ENTITY-003; C: schema; V: audit schema scope |
| International/hreflang (§8) | Documented limitation — no hreflang detectors in MVP (known-limitations.md) |
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
| Multimodal assets (§10) | Documented limitation — no image/video/transcript detectors in MVP |
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
| ≥60 meaningful detectors (§9) | 123 detectors / 18 namespaces; T: count + per-namespace assertions |
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
