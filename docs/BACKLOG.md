# Citable delivery backlog

Execution-level work registry. [ROADMAP.md](ROADMAP.md) states direction and
delivered state; this document states ordered, sized, dependency-checked work
items and the conditions under which each is done.

Nothing in this backlog asserts that a completed item improves retrieval,
ranking, citation, recommendation, or conversion. Items are scoped to
observable tool capability only.

## Provenance

| Field | Value |
| --- | --- |
| Baseline | v1.20.0, released semantic-completeness baseline |
| Verification method | Requirements reconciliation against the v1.20.0 contracts; this update authorizes no implementation |
| Source requirements | The seven `Requirements for a Top-Tier …` documents plus the external-evidence requirements captured in this section |
| Sizes | Relative bands, not commitments: S ≤ 1 day, M 2–5 days, L 1–3 weeks, XL > 3 weeks, single experienced contributor |
| Dependency claims | Derived from the baseline source, not from documentation |

Three of the seven source documents (AEO, GEO, SEO) are already committed at
repository root and are the specification the current detectors implement.
Four (SERP, Backlink, Website Effectiveness, AI Readiness) describe surfaces
Citable was not built for. This backlog treats those four as candidate modules,
not as an obligation to implement all of them.

## Sequencing rules

These are constraints on the backlog itself, not aspirations.

1. **Every wave terminates in a releasable minor version.** No wave leaves a
   contract half-migrated across a release boundary.
2. **No item depends on two waves that are unreleased at the same time.**
   Cross-wave dependencies must resolve along a single release chain, so that
   at any point exactly one blocking substrate is outstanding.
3. **Additive items are not blocked by non-additive ones.** Items that extend
   an existing contract without changing it carry `blocked_by: -` and may ship
   in parallel with substrate work. Wave 6A exists solely to enforce this.
4. **Non-additive work precedes the domains that would otherwise entrench the
   defect.** The determination layer, condition versioning, and replay change
   every detector's output contract; adding domains first multiplies the
   migration cost.
5. **A defect fix is not complete until the defect class is prevented.** Stale
   generated documentation is fixed by generating it and gating it in CI, not
   by editing it.
6. **A module may be disabled without breaking the core.** Any domain that
   cannot be switched off cleanly has failed its acceptance criteria.

## Module map

The modular target. Waves 0–4 establish it; Waves 5–8 consume it.

```text
core/evidence      observation envelope, immutable evidence store, run package, hashing
core/conditions    condition registry, determination engine, applicability, site profile
core/lineage       collector/parser versioning, replay, parser drift, unknown-artifact retention
core/report        projections, scoring denominators, run diffs, regression classification
core/authorize     recommendation → authorization → execution boundary, budgets, kill switches
domains/seo        TECH CRAWL ARCH PAGE LINK HREFLANG CWV
domains/aeo        ANS CLAIM EVD
domains/geo        GEO RECO ENTITY SCHEMA EXT
domains/cro        CRO MEAS
domains/agent      AGENT
domains/serp       new
domains/discovery  external search and backlink observations
domains/representation  provider-neutral AI representation observations
domains/webeffect  new
products/outreach  new, separate package, separate authorization model
```

`core/authorize` is currently implicit and partial (`verify remediation`,
`apply --write` gating). Wave 8 requires it explicitly; Wave 5 requires the
budget half of it. It is introduced in Wave 5 and completed in Wave 8.

## Wave summary

| Wave | Theme | Releasable outcome | Blocked by |
| --- | --- | --- | --- |
| 0 | Integrity | Published claims match the shipped tree, and drift is gated | — |
| 1 | Determination layer | Per-condition determinations exist; regressions are distinguishable from new failures | — |
| 2 | Condition registry | Conditions are versioned artifacts; revalidation binds a version | 1 |
| 3 | Lineage and replay | Preserved evidence can be re-derived under a newer parser | 2 |
| 4 | Module contract | Domains register through one interface and can be disabled | 2 |
| 5 | SERP | Independent SERP observation with provider abstraction and budgets | 4 |
| 6A | Agent capability (additive) | Declared agent capabilities are validated, not counted | — |
| 6B | Agent capability (substrate) | Readiness levels with published gating rules | 4, 6A |
| 7 | Website effectiveness | Analytics, attribution, consent, commerce, dependency domains | 4 |
| 8 | Outreach | Separate product line with explicit execution authorization | 5 |
| 9 | External evidence and representation | Provider-neutral discovery/representation evidence, versioned populations, claim-evidence lineage, and machine-readable access | 4; evidence-triggered |

Waves 3 and 4 are siblings on Wave 2 and may run in either order or
concurrently. B-088 requires B-030 from Wave 3, so Wave 3 must land before
Wave 8; it does so in any ordering that reaches Wave 8 through Wave 5.

Wave 6A carries no substrate dependency and is the highest value-per-day work
in the backlog. It should start concurrently with Wave 1, not after it.

## Item registry

Field contract: `id`, `module`, `title`, `size`, `blocked_by`, `done_when`.
`done_when` states the observable condition that closes the item; it is the
acceptance criterion, not a description of the work.

### Wave 0 — Integrity

Immediate value. Every item here is a published claim that does not match the
shipped tree. Citable enforces claim substantiation on audited properties; these
are the same failures in its own documentation.

```toon
items[6]{id,module,title,size,blocked_by,done_when}:
  B-001,core/report,"Persist finding identity across runs",M,-,"first_seen reflects the earliest run that observed the finding; occurrence_count and TRANSIENT|RECURRENT|PERSISTENT are derivable without re-reading every run directory"
  B-002,docs,"Generate the traceability matrix from detector metadata",M,-,"matrix rows are emitted from applicable_requirement fields; CI fails when a committed matrix differs from the generated one"
  B-003,docs,"Assert README and ROADMAP counters against the tree",S,-,"a test compares namespace list, detector count, test count, and schema count to the source; the current README namespace list (AEO, EXP, CONF, SEC are not namespaces) fails it before the fix"
  B-004,tests,"Repair the tautological compatibility assertion",S,-,"tests/unit/compatibility.test.js:32 asserts the engine contract directly; the assertion fails on an incorrect result at any Node version rather than collapsing to true below 24"
  B-005,docs,"Reconcile known-limitations with shipped capability",S,B-002,"no limitation entry contradicts a shipped detector or collector; hreflang, media, and CrUX entries reflect v1.10.0+ reality"
  B-006,ci,"Gate documentation drift in the release workflow",S,"B-002,B-003","release:validate fails on any generated-doc or counter mismatch"
```

### Wave 1 — Determination layer

The non-additive prerequisite. Citable currently emits a record only when a
detector fires, so a pass, a non-applicable condition, and an unevaluated
condition are indistinguishable downstream. This blocks correct regression
semantics, honest scoring denominators, and applicability.

```toon
items[5]{id,module,title,size,blocked_by,done_when}:
  B-010,core/conditions,"Emit a determination per condition per subject",L,-,"every evaluated condition yields PASS|FAIL|WARNING|INDETERMINATE|NOT_APPLICABLE|NOT_TESTED|ERROR; findings become a projection of FAIL and WARNING determinations rather than the primary record"
  B-011,core/conditions,"Site profile and applicability resolution",M,B-010,"a content-only property records ecommerce conditions as NOT_APPLICABLE; NOT_APPLICABLE never contributes to a failure count or a denominator"
  B-012,core/report,"Classify run diffs by determination transition",M,B-010,"compare-snapshots distinguishes NEW_FAILURE, REGRESSION, RESOLVED, UNCHANGED_FAILURE, NEWLY_APPLICABLE, NO_LONGER_APPLICABLE; a new finding is no longer labelled a regression"
  B-013,core/report,"Applicability-scoped scoring with exposed inputs",M,"B-011,B-012","any reported score exposes input conditions, weights, formula, score_version, and applicability denominator; profiles with different applicable counts are never compared on a shared denominator"
  B-014,core/conditions,"Collector failure never becomes condition failure",S,B-010,"DNS_FAILED, TIMEOUT, BLOCKED, CAPTCHA, RATE_LIMITED, PARSER_FAILED resolve to ERROR or NOT_TESTED, never FAIL"
```

### Wave 2 — Condition registry and versioning

`defineDetector` hardcodes `version: 1` and one detector overrides it. Nothing
forces a bump when semantics change, and `verify remediation` does not compare
versions across the re-run, so the documented FAIL → PASS guarantee is asserted
in prose and unenforced in code.

```toon
items[4]{id,module,title,size,blocked_by,done_when}:
  B-020,core/conditions,"Condition registry as a first-class versioned artifact",L,B-010,"each condition carries condition_id, condition_version, applicability_rule, observation_requirements, evaluation_method, severity_rule, normative_sources, introduced_at, deprecated_at"
  B-021,ci,"Enforce version bumps on semantic change",M,B-020,"a semantic fingerprint over check logic, thresholds, and output shape is committed; CI fails when the fingerprint changes without a condition_version increment"
  B-022,core/conditions,"Bind revalidation to condition version",M,"B-020,B-021","verify remediation reports a true FAIL → PASS only when both determinations share condition_id and condition_version; otherwise it reports a new condition evaluation"
  B-023,core/conditions,"Normative source and maturity registry",M,B-020,"every condition links a normative source classed STANDARD|RFC|SPECIFICATION|VENDOR_REQUIREMENT|VENDOR_GUIDANCE|COMMUNITY_CONVENTION|RESEARCH|HEURISTIC|INTERNAL_RULE with maturity; a heuristic is never presented as a standard"
```

### Wave 3 — Lineage and replay

`collector_version` and `parser_version` appear nowhere in the baseline tree;
lineage is run-granular. `collected_at` is set at envelope construction, so an
owner import of a June observation records today's timestamp. Without replay, a
parser defect permanently contaminates history.

```toon
items[4]{id,module,title,size,blocked_by,done_when}:
  B-030,core/lineage,"Collector and parser versions on the observation envelope",M,-,"every observation carries collector_id, collector_version, parser_version, configuration_version; no derived metric lacks lineage to them"
  B-031,core/evidence,"Decompose the observation timestamp",M,B-030,"requested_at, observed_at, ingested_at, and normalized_at are distinct; an owner import records the source observation time separately from ingest time"
  B-032,core/lineage,"Replay preserved evidence under newer versions",L,"B-020,B-030","a historical run can be re-derived under a new parser or condition version, producing NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE; the original observation and determination are preserved unchanged"
  B-033,core/lineage,"Parser drift and unknown-artifact retention",M,B-030,"unknown DOM structures, schema types, and protocol artifacts are retained rather than discarded; drift in unknown-rate is reported per condition"
```

### Wave 4 — Domain module contract

The modularity seam. Until this exists, each new domain forks conventions.

```toon
items[3]{id,module,title,size,blocked_by,done_when}:
  B-040,core/conditions,"Domain module interface",L,"B-010,B-020","a domain registers conditions, observation kinds, collectors, and report projections through one interface; adding a domain touches no core file"
  B-041,domains/*,"Migrate existing namespaces onto the interface",L,B-040,"all 19 namespaces register through the module interface; the migration proves the interface rather than the interface being written to fit one domain"
  B-042,core/conditions,"Per-module enable, disable, and profile gating",M,B-041,"any domain can be disabled without affecting determinations in other domains; disabled domains produce NOT_TESTED, not absence"
```

### Wave 5 — SERP

Currently absent. `inspect serp` estimates how a first-party title renders in
pixels; it is a preview tool, not observation. `report share-of-voice` computes
share from AI citation observations, which is a different axis and should not
be renamed to cover SERP.

```toon
items[7]{id,module,title,size,blocked_by,done_when}:
  B-050,domains/serp,"Observation context envelope",M,B-040,"an observation is addressable by query x engine x surface x location x language x device x timestamp; a desktop observation is never silently compared with mobile, nor a city with a country"
  B-051,domains/serp,"Provider adapter interface and canonical SERP schema",L,B-050,"no vendor schema is canonical; at least two adapters are constructible and one is operated; provider disagreement is measurable rather than discarded"
  B-052,domains/serp,"SERP element model with unknown-feature retention",L,B-051,"each visible element is an independent normalized entity with rank_absolute and rank_group; an unrecognized feature records UNKNOWN_FEATURE with raw evidence and never maps to organic"
  B-053,domains/serp,"AI Overview and AI Mode as first-class result types",M,B-052,"AI results have their own model with citations, mentions, and follow-ups; AI citation position is never treated as organic rank; cited, mentioned, linked, and neither are measured separately"
  B-054,domains/serp,"Change detection with an explicit comparability guard",M,"B-052,B-012","ENTRY, EXIT, RANK_GAIN, RANK_LOSS, FEATURE_APPEARED, CITATION_LOSS and related events derive only from comparable observations; a failed collection never reads as a ranking loss"
  B-055,core/authorize,"Collection scheduler with enforced budgets",M,B-051,"per-query, per-provider, and per-project cost limits fail closed; adaptive frequency increases are bounded by budget"
  B-056,domains/serp,"Cross-provider validation sampling",M,"B-051,B-030","duplicate observations across independent providers are periodically run and divergence is stored as evidence of collection reliability"
```

### Wave 6A — Agent capability validation (additive)

No substrate dependency. The eleven AGENT detectors check for the presence of
files and headers, which the AI Readiness document names in §1 and §133 as the
failure mode it exists to correct. AGENT-004 fires on a missing
`/.well-known/mcp` and never parses the card, so a card advertising a tool that
does not exist passes. The existing `src/connectors/mcp/` client already
implements transport, schema handling, and allowlisting, and is directly
reusable here.

```toon
items[5]{id,module,title,size,blocked_by,done_when}:
  B-060,domains/agent,"Validate MCP card contents and tool semantics",M,-,"tools, resources, input schemas, descriptions, and authorization requirements are parsed and validated; a declared tool that cannot be invoked yields DECLARED_CAPABILITY_INVALID at higher severity than a missing card"
  B-061,domains/agent,"Extend protocol validation to A2A, WebMCP, and ARD",M,B-060,"each declared capability is testable; declared-but-absent capability is distinguished from not-declared"
  B-062,domains/agent,"Classify side effects and destructive actions",M,-,"machine-exposed operations classify as READ|CREATE|UPDATE|DELETE|FINANCIAL|COMMUNICATION|PRIVILEGE_CHANGE; DELETE_ACCOUNT, CANCEL_SUBSCRIPTION and equivalents carry elevated risk"
  B-063,domains/agent,"Form safety and confirmation boundary detection",M,B-062,"forms classify as read-only, reversible, state-mutating, financial, or destructive; a high-impact control whose consequence is machine-ambiguous produces a finding"
  B-064,domains/agent,"Prompt-injection surface scan",S,-,"agent-directed instructions embedded in HTML, metadata, comments, structured data, UGC, and tool descriptions are surfaced as observations; presence is reported without asserting intent"
```

### Wave 6B — Agent readiness maturity

```toon
items[3]{id,module,title,size,blocked_by,done_when}:
  B-065,domains/agent,"Grounded task-oriented agent journeys",L,"B-040,B-060","bounded journeys resolve to SUCCESS|PARTIAL|FAILED|INDETERMINATE|BLOCKED; every extracted answer cites source URL and element, and direct evidence is distinguished from model inference"
  B-066,domains/agent,"Readiness levels with published gating rules",M,"B-013,B-065","levels 0-5 publish their exact required conditions; Agent Native is unreachable by accumulating points while an unresolved CRITICAL finding exists"
  B-067,domains/agent,"Repeatability testing for probabilistic determinations",M,B-065,"consequential model-assisted determinations are repeat-tested; unstable conclusions report BUSINESS_IDENTITY_AMBIGUOUS or equivalent rather than the last run's answer"
```

### Wave 7 — Website effectiveness domains

Partially present. SSRF defence (`src/crawler/fetch.js`), evidence packages,
browser journeys, and remediation verification already satisfy their sections.
The items below are the domains with no current counterpart. Commerce
consistency reuses the existing SCHEMA truthfulness detectors (SCHEMA-002, 005,
006, 007, 009, 012) rather than reimplementing them.

```toon
items[6]{id,module,title,size,blocked_by,done_when}:
  B-070,domains/webeffect,"Canonical event registry and semantic event validation",L,B-040,"an event fires only when its business-defined trigger occurs; page load does not satisfy a named business event unless declared so"
  B-071,domains/webeffect,"Duplicate and double-fire detection",M,B-070,"duplicate pageviews, duplicate purchases, SPA re-fires, and tag-manager duplication are distinguished from a working implementation"
  B-072,domains/webeffect,"Attribution continuity validation",M,B-070,"UTMs, referrer, click IDs, cross-domain state, and checkout-provider returns are traced across the journey; loss points are localized"
  B-073,domains/webeffect,"Consent state differential observation",M,B-040,"network activity is compared before consent, after reject, after accept, and after withdrawal; technical observation is never reported as a legal compliance determination"
  B-074,domains/webeffect,"Commerce fact consistency across representations",M,"B-040,B-073","price, currency, availability, and variant are compared across visible page, structured data, API, cart, and checkout; contradiction is high severity"
  B-075,domains/webeffect,"Third-party dependency graph",M,B-040,"dependencies are inventoried with purpose, blocking state, performance cost, failure effect, and privacy effect"
```

### Wave 8 — Outreach

Separate product line. The Backlink Acquisition document describes a system that
discovers, contacts, negotiates, and pays — a different risk class from an
evidence tool. Folding it into `citable` would put state-changing external
communication behind the same entry point as read-only observation and
compromise the fail-closed posture.

It ships as its own package consuming the shared evidence substrate, with its
own execution-authorization model. Its §54 execution boundary — recommendation
is not authorization, authorization is not execution — is the same separation
Citable already enforces between finding and remediation, and is worth
implementing once in `core/authorize` rather than twice.

Current state: `analysis/offpage.js` and `audit backlinks` provide passive
profile audit over an owner import. No acquisition capability exists —
`outreach`, `deliverability`, `DMARC`, `unsubscribe`, `paid_placement`, and
`circuit_breaker` return zero matches across `src/` and `schemas/`.

```toon
items[10]{id,module,title,size,blocked_by,done_when}:
  B-080,products/outreach,"Opportunity discovery with preserved evidence",L,B-040,"every opportunity retains what was observed, when, how, and by which collector; the derived hypothesis never overwrites the observation"
  B-081,products/outreach,"Separate domain and page qualification",M,B-080,"a high-authority domain with a low-quality links page is not automatically high-value; third-party authority metrics retain provider, metric, value, retrieved_at and are never canonical"
  B-082,products/outreach,"Asset inventory, linkability, and ASSET_GAP",M,B-080,"the system can conclude NO_LINKABLE_ASSET rather than fabricating an outreach angle"
  B-083,products/outreach,"Public contact resolution",M,B-081,"contact evidence retains its source; private contact data is never inferred; a billing address is never repurposed as an editorial contact"
  B-084,products/outreach,"Suppression registry, deduplication, frequency control",M,B-083,"suppression overrides campaign logic; two agents cannot independently contact the same editor for the same opportunity"
  B-085,products/outreach,"Outreach drafting with full provenance",M,"B-082,B-083","every generated message retains strategy, template, model, prompt version, and evidence ids; fabricated familiarity, statistics, and relationships are rejected before review"
  B-086,core/authorize,"Execution boundary and authorization",L,B-085,"generating a message does not authorize sending it; identifying a publisher does not authorize contact; a payment request does not authorize purchase; budget exhaustion fails closed"
  B-087,products/outreach,"Sending controls, deliverability, circuit breaker",L,B-086,"SPF, DKIM, DMARC and reputation are monitored; threshold breach halts the campaign and requires explicit reauthorization; kill switches exist at organization, sender, campaign, strategy, agent, and domain"
  B-088,products/outreach,"Independent link verification and lifecycle",M,"B-030,B-086","publisher confirmation alone is never verification; follow to nofollow preserves both observations; link loss and modification are detected"
  B-089,products/outreach,"Strategy performance and acquisition economics",M,B-088,"outcomes attribute to strategy with cost per acquired link and per qualified referral; ranking improvement is never asserted as caused by an acquired link"
```

### Wave 9 — External evidence and representation

This family extends the evidence substrate across three deliberately separate
domains:

```text
FIRST-PARTY STATE       website resources, content, metadata, structured data,
                        performance, accessibility, readiness, claims, config

DISCOVERY STATE         Search Console/search observations, query-page
                        relationships, SERPs, backlinks, referring domains

REPRESENTATION STATE    provider/model/surface responses, mentions, citations,
                        cited URLs, competitor observations, prompt populations
```

All three produce typed observations in the shared evidence corpus. An
observation is not an interpretation, a provider response is not ground truth,
and a score is never a substitute for its atomic evidence. This wave does not
turn Citable into an SEO, AI-visibility, content, publishing, outreach, or
autonomous-growth product.

The common observation taxonomy is `PAGE_OBSERVATION`,
`EXTERNAL_OBSERVATION`, and `DERIVED_OBSERVATION`. Derived observations retain
lineage to atomic observations and cannot widen their scope, population,
precision, or certainty. Every external family records declared,
observable/retrieved/evaluated, failed or unavailable populations and explicit
limitations, following the v1.20.0 coverage contract.

Existing work is intentionally reused: B-030/B-031 provide collector/parser
and timestamp lineage; B-032 provides replay; B-040 provides the domain seam;
B-050–B-056 provide SERP context, provider abstraction, unknown retention,
comparability, budgets, and cross-provider sampling; B-065–B-067 provide
bounded agent journeys and repeatability; B-080/B-081/B-088/B-089 provide
passive backlink evidence, provider-qualified metrics, lifecycle, and
non-causal outcome rules. Existing GSC/GA4 import paths and `observe` commands
remain adapters to reconcile with these contracts, not a reason to create a
second evidence model.

```toon
items[14]{id,module,title,size,blocked_by,timing,done_when}:
  ER-0,core/evidence,"Common external observation contract",L,"B-030,B-031,B-040",PRESERVE_OPTION,"PAGE_OBSERVATION, EXTERNAL_OBSERVATION, and DERIVED_OBSERVATION share a versioned envelope with source, population, context, provenance, coverage, limitations, and atomic lineage; provider-specific fields remain in adapters"
  ER-1,domains/discovery,"Search discovery observation adapter",L,"ER-0,B-050",EVIDENCE_TRIGGER,"Search Console/search observations preserve query, page, interval, impressions, clicks, CTR, average position, optional country/device/appearance, property identity, collection configuration, retrieval state, and provider-reported limits; supplied intent or commercial context is typed interpretation"
  ER-2,domains/discovery,"Query-page relationship evidence",M,ER-1,EVIDENCE_TRIGGER,"the corpus answers which pages were reported for a query, which queries for a page, and comparable interval changes without deciding value, opportunity, targeting, or striking distance"
  ER-3,domains/representation,"Versioned prompt populations",M,"ER-0,B-030",PRESERVE_OPTION,"prompt_set_id/version, generation method/version/input, sampling, included/excluded prompts and reasons, intended population, and comparability metadata are immutable lineage; v1 and v2 are not comparable without an explicit contract"
  ER-4,domains/representation,"Provider-neutral AI representation observations",L,ER-3,EVIDENCE_TRIGGER,"ChatGPT, Gemini, Perplexity, Google AI, and future adapters record provider/product/surface/model, prompt and execution identity, configuration, response hash, mention/citation state, cited URLs, competitors, retrieval/observation status, limitations, and legally permitted raw evidence"
  ER-5,core/lineage,"AI citation provenance graph",L,"ER-0,ER-3,ER-4",IMPLEMENT_NOW,"immutable response spans link provider citations to displayed/resolved sources, retrieval evidence, proposition support, and prevalence derivations without treating representation as fact"
  ER-6,domains/representation,"Competitor representation observations",M,ER-4,IMPLEMENT_NOW,"ambiguous-or-resolved entity observations retain exact response spans, representation type, prompt/execution lineage, citation/proposition relationships, and bounded comparisons; no canonical AI-visibility score is emitted"
  ER-7,core/evidence,"Research datasets as immutable evidence objects",L,"ER-0,B-030,B-032",PRESERVE_OPTION,"dataset id/version, question, declared population, sample, inclusion/exclusion, source retrieval times, observations, normalization/derivation versions, limitations, and coverage are sealed; historical versions are never rewritten"
  ER-8,core/lineage,"Claim-to-evidence lineage",M,"ER-7,B-020,B-032",PRESERVE_OPTION,"a claim binds to a derivation, dataset/population, atomic observations, and sources; complete-for-declared-population is distinct from unsupported generalization beyond that population"
  ER-9,core/conditions,"claim.verify() bounded verifier",L,"ER-7,ER-8,B-010,B-013,B-020",EVIDENCE_TRIGGER,"a future verifier returns SUPPORTED, PARTIALLY_SUPPORTED, UNSUPPORTED, CONTRADICTED, INDETERMINATE, or NOT_OBSERVED only after validating both proposition support and scope/generalization support"
  ER-10,domains/discovery,"Passive backlink and referring-domain observations",M,"ER-0,B-080,B-088",EVIDENCE_TRIGGER,"source URL/domain, target URL, observed link, anchor/rel when observable, first/last observed, source, timestamp, and retrieval state are preserved; acquisition, exchange, outreach, purchase, and link-quality conclusions remain outside Citable"
  ER-11,core/conditions,"External longitudinal comparability",M,"ER-0,B-012,B-050,B-054",PRESERVE_OPTION,"provider, model, prompt/query set, property, geography, device, interval, sampling, collector/parser/API/normalization versions yield COMPARABLE, PARTIALLY_COMPARABLE, NOT_COMPARABLE, or INDETERMINATE; missing observation is never resolution"
  ER-12,core/evidence,"Machine-consumable evidence interface",L,"ER-0,ER-7,ER-8,B-040",EVIDENCE_TRIGGER,"structured operations expose observations, evidence verification, coverage, conditions, comparisons, datasets, claims, citations, prompt sets, and lineage with explicit epistemic state; transport remains a later consumer-driven choice"
  ER-13,domains/representation,"Autonomous-content evidence boundary",M,"ER-9,ER-12",EVIDENCE_TRIGGER,"content systems may submit proposed claims and receive evidence-bounded verification; Citable does not generate content or authorize publication unless a downstream authority explicitly does so"
```

#### External-evidence requirements

The following are acceptance constraints for every ER item, not optional
provider features:

- Provider output means “provider P reported/returned X under conditions C at
  time T.” It is not universal truth or proof of indexing, ranking, causality,
  or business value.
- Query/page, citation, competitor, and backlink records preserve source,
  collection time, method, account/property identity, configuration, coverage,
  failure/unavailability, and limitations. Supplied intent, funnel stage, or
  commercial relevance is contextual interpretation, never source fact.
- Prompt populations are first-class evidence. Wording, population,
  generation, sampling, provider, model, and execution-context changes remain
  visible and block unqualified comparisons.
- Temporal ordering (for example, a content change followed by a ranking or
  citation change) is not causal proof.
- Privacy controls cover tenant/account isolation, credential separation,
  encryption, retention, redaction, export, and private-versus-publishable
  evidence while preserving provenance after redaction.

#### Wave 9 consumer and authority

The primary consumer for this family is **Nebula Components**. Nebula's
operational need is established: it requires bounded evidence for search
discovery, AI representation, competitor observation, research provenance,
claim verification, autonomous-content validation, and longitudinal
improvement. Citable supplies observable evidence and bounded determinations;
Nebula interprets and applies that evidence; CALS uses it inside authorized
continuous-improvement loops.

These capabilities are not speculative features waiting for an external
consumer. The identified consumer does not, however, authorize implementation
by itself. Backlog inclusion remains a requirements decision, not an
implementation approval. External Citable demand is not required when Nebula
operational value is established.

Wave 9 sequencing is determined by Nebula operational need, dependency order,
information-loss risk, current acquisition/content/improvement priorities,
implementation cost, and evidence that a capability improves the current
operating loop. A named consumer is an implementation trigger input, not an
automatic `IMPLEMENT_NOW` classification.

Before the foundation tranche, ER-0, ER-3, ER-7, ER-8, and ER-11 were
`PRESERVE_OPTION` items because recording generic source/population/version/
lineage fields avoids irreversible information loss. ER-1, ER-2, ER-4–ER-6,
ER-9, ER-10, ER-12, and ER-13 were `EVIDENCE_TRIGGER` items. The authorized
foundation tranche changes the implementation status of only the five items
listed below; it does not authorize the remaining Wave 9 capabilities.

```text
ER-0  IMPLEMENTED
ER-7  IMPLEMENTED
ER-8  IMPLEMENTED
ER-11 IMPLEMENTED
ER-9  IMPLEMENTED
ER-1  IMPLEMENTED
ER-2  IMPLEMENTED
ER-3  IMPLEMENTED
ER-4  IMPLEMENTED
ER-5  IMPLEMENTED
ER-6  IMPLEMENTED
ER-10 IMPLEMENTED
ER-12 IMPLEMENTED
ER-13 IMPLEMENTED
```

ER-0 through ER-13 are implemented in the isolated Wave 9 development source
but remain unreleased until a separate release authorization.

“Implemented” here means available in the isolated Citable development source
after tests and review; it does not mean released, adopted by Nebula, or
deployed to Nebula production.

The recommended dependency sequence is:

```text
ER-0 ──┬── ER-1 ── ER-2
       ├── ER-3 ── ER-4 ── ER-5 ── ER-6
       ├── ER-7 ── ER-8 ── ER-9 ── ER-13
       └── ER-10
ER-0 + existing B-012/B-050/B-054 ── ER-11
ER-0 + ER-7 + ER-8 + B-040 ── ER-12
```

This sequence is advisory backlog ordering, not implementation authorization.

#### Claim verification composition review

`claim.verify()` is primarily a future composition of existing primitives:
versioned observations and evidence packages, v1.20.0 coverage ledgers,
condition/determination evaluation, B-020 condition versions, B-030/B-032
lineage and replay, snapshot comparability, sealed-package verification, and
claim/evidence detector mappings. The missing primitives are an explicit
claim envelope with declared scope, immutable research-dataset and derivation
objects, atomic observation references, a population/generalization evaluator,
and a verifier result contract. ER-0 → ER-7/ER-8 → ER-11 → ER-9 is therefore
the minimum safe sequence; ER-12 exposes it to machines and ER-13 consumes it.

The verifier must be able to return `SUPPORTED` for a claim such as “3 of 12
observed products include X” while refusing to widen that result into “25% of
all products” when the declared population does not support that generalization.

#### Downstream responsibility boundary

| Component | Responsibility in this family |
| --- | --- |
| Citable | Observe; preserve evidence; version populations; record provenance; calculate explicitly defined derivations; verify packages; evaluate versioned conditions; verify claims against evidence; expose structured evidence and uncertainty |
| Nebula | Interpret evidence commercially; contextualize findings; prioritize customer problems; create product diagnoses and repair specifications; communicate value |
| CALS | Form and challenge hypotheses; authorize and execute interventions; measure outcomes; evaluate effectiveness; retain learning; drive continuous improvement |

The boundary is deliberate: Citable does not become a content generator,
publishing authority, strategy engine, or autonomous business decision-maker.

#### Traceability

| Requirement area | Backlog item(s) | Primitive/dependency | Intended consumer | Invariant preserved |
| --- | --- | --- | --- | --- |
| First-party/discovery/representation domains | ER-0, ER-1, ER-4 | `core/evidence`, B-040 module interface | Citable adapters; Nebula Components | domain state is typed; domains are not collapsed into one score |
| Search Console and query/page facts | ER-1, ER-2 | existing GSC/GA4 imports, B-050 context | Nebula research and downstream prioritization | provider report is distinct from opportunity interpretation |
| Prompt populations and AI citations | ER-3–ER-6 | B-030/B-032 lineage and replay | representation analysis | prompt/model/provider changes remain visible and comparable only when justified |
| Research and claim evidence | ER-7–ER-9 | B-010/B-013/B-020, sealed packages | autonomous content, reports, research | proposition support and scope support are checked separately |
| Backlinks | ER-10 | B-080/B-088 passive evidence | optional downstream outreach product | observation does not authorize acquisition or imply value |
| Longitudinal comparison | ER-11 | B-012/B-050/B-054 | monitoring and analysis | no delta from non-comparable or unavailable evidence |
| Programmatic access | ER-12 | B-040, verified loader, schemas | agents and integrations | machines receive structured evidence, not prose-only certainty |
| Autonomous content boundary | ER-13 | ER-9 and ER-12 | Nebula/CALS | verification is evidence, not publication authorization |

#### Explicit non-goals

Unless separately authorized, this family does not include AI content
generation, autonomous publishing, editorial or keyword strategy, backlink
exchange/outreach/purchasing, social distribution, campaign management, CRM,
generic marketing automation, a canonical “AI visibility score,” unsupported
SEO opportunity scores, causal attribution from temporal correlation,
autonomous business decisions, replacing Nebula/CALS interpretation, or
treating any external-provider output as authoritative truth.

#### Soak-period execution policy

Nebula Components is the primary consumer, and its current soak is a
stabilized operation and evidence-accumulation period—not a Citable
engineering freeze. Citable backlog work may proceed during the soak, but it
must remain isolated from active Nebula production and evidence-accumulation
state until a separate adoption decision.

The authority boundaries are independent:

```text
Citable backlog implementation       != Nebula integration
Nebula integration                   != Nebula production deployment
Nebula production deployment        != CALS experiment mutation
```

During the soak:

| Surface | State |
| --- | --- |
| Citable | ACTIVE ENGINEERING PERMITTED |
| Nebula production | STABILIZED |
| CALS-001 | EVIDENCE ACCUMULATION |
| Automatic Nebula adoption | PROHIBITED |
| CALS-001 semantic changes | PROHIBITED unless explicitly authorized after confounding analysis |

An implementation may be authorized item-by-item using the Wave 9 sequencing
criteria. It must use isolated Citable source/worktree state, preserve the
released v1.20.0 behavior until a new release is explicitly authorized, and
complete independent tests, review, and evidence-bound acceptance before any
consumer discussion. Completion produces:

```text
AVAILABLE_FOR_NEBULA_ADOPTION
```

It does not produce `DEPLOY_TO_NEBULA`, change Nebula production, or alter an
active CALS experiment. This policy update does not select an item or begin
implementation.

#### Backlog status

```text
CITABLE_ENGINEERING_DURING_SOAK: PERMITTED
IMPLEMENTATION_AUTHORIZED: ITEM_SPECIFIC_ONLY
NEBULA_ADOPTION_AUTHORIZED: NO
NEBULA_PRODUCTION_DEPLOYMENT_AUTHORIZED: NO
CALS_SEMANTIC_CHANGES_AUTHORIZED: NO
CURRENT_RELEASE: v1.20.0 (COMPLETE_PROVEN)
```

## Dependency constraints

```text
W0 ─────────────────────────────────── independent, ships first
W6A ────────────────────────────────── independent, start concurrently with W1

W1 ── W2 ──┬── W3 ─────────────────┐
           │                       │
           └── W4 ──┬── W5 ────────┴── W8
                    ├── W6B  (also requires W6A)
                    └── W7

W4 + existing lineage/comparability ── W9 (preserve-option and
                                      evidence-triggered items; no automatic start)
```

Rule 2 holds throughout. Where an item names two blockers, either both sit in
the same wave (B-006, B-013, B-022, B-054 in part, B-066, B-074) or one blocker
is already released along the chain (B-032, B-040, B-056, B-065, B-088).

## Non-goals

- Aggregating any domain into a single visibility, authority, or readiness
  score. Domain states remain independently visible.
- Asserting causation from temporal association in any wave, including the
  outreach and experiment domains.
- Live consumer answer-product automation beyond disclosed, supported
  interfaces.
- Implementing all four candidate domains. Waves 5, 7, and 8 are independently
  cancellable; Waves 0–4 and 6A are not, because they correct defects or
  entrenched contracts in shipped code.
- Moving human-authoritative judgments (passage suitability, claim entailment,
  citation correctness) into automated determination in any wave.

## Maintenance

This backlog is verified against a specific commit. When the baseline moves,
re-derive the Wave 0 and Wave 1 dependency claims from source before treating
any item as still valid. An item whose `done_when` cannot be observed
mechanically is not ready to start.
