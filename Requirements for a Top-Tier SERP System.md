# SERP Intelligence System

## 1. System Objective

The system SHALL continuously observe, preserve, normalize, analyze, and explain search-engine result environments.

Its purpose is not merely to answer:

> “What position do we rank for?”

It must answer:

> What search experience was actually observed, under what conditions, what occupied the available search surface, how did that state change, what evidence explains the change, what opportunity exists, and what intervention can be tested?

The system SHALL treat every SERP observation as evidence with provenance rather than as an ephemeral metric.

---

# 2. Core Design Principles

### 2.1 Observation is not interpretation

Raw observations SHALL remain immutable.

Derived classifications, scores, opportunities, recommendations, and explanations SHALL be stored separately from observations.

A later algorithm or model change SHALL NOT rewrite historical observations.

### 2.2 Rank is contextual

A ranking SHALL NOT exist without an observation context.

At minimum:

`query × engine × surface × location × language × device × timestamp`

Where supported:

`× OS × coordinates × radius × search mode × provider × personalization mode`

### 2.3 Position is not visibility

The system SHALL distinguish:

* organic rank
* absolute SERP position
* feature-group rank
* pixel position
* viewport position
* above/below fold status
* SERP feature occupancy
* estimated visual prominence
* domain visibility
* URL visibility
* citation/mention visibility

This distinction is necessary because modern SERPs contain heterogeneous elements rather than ten equivalent blue links. SERP providers already distinguish absolute versus feature-group rankings and can expose pixel geometry.

### 2.4 Absence is evidence only when collection succeeded

The system SHALL distinguish:

`NOT_PRESENT`

from:

`NOT_OBSERVED`

from:

`COLLECTION_FAILED`

from:

`UNSUPPORTED`

from:

`INDETERMINATE`

A failed fetch SHALL NEVER be interpreted as a ranking loss.

### 2.5 Search-engine state is time-dependent

Every observation SHALL have:

* requested_at
* observed_at
* provider_completed_at
* ingested_at
* normalized_at
* analyzed_at

These timestamps SHALL NOT be collapsed into a single `created_at`.

---

# 3. Search Surface Coverage

The architecture SHALL support multiple search surfaces rather than hard-code Google Organic.

Required surface taxonomy:

| Surface                           | Requirement                  |
| --------------------------------- | ---------------------------- |
| Google Organic                    | Required                     |
| Google AI Overview                | Required                     |
| Google AI Mode                    | Required                     |
| Google Local / Maps               | Required where relevant      |
| Google Images                     | Required where relevant      |
| Google News                       | Supported                    |
| Google Shopping / product results | Supported                    |
| Bing Organic                      | Required                     |
| Bing AI/search features           | Extensible                   |
| YouTube Search                    | Supported                    |
| Other engines                     | Plugin/provider architecture |

Google currently exposes many different search appearances, while third-party SERP providers separately expose Organic, AI Mode, Maps, Local Finder, News, Images and other search surfaces.

AI results MUST be treated as first-class result types rather than parsed as unusual organic results.

---

# 4. Query Registry

Every monitored query SHALL have an immutable query identity.

Required fields:

```text
query_id
query_text
query_normalized
language
market
intent_classification
topic_cluster
brand_classification
commercial_stage
priority
monitoring_policy
created_at
retired_at
registry_version
```

The system SHOULD classify queries into:

* navigational
* informational
* commercial investigation
* transactional
* local
* support/problem
* comparison
* alternative
* category
* branded
* non-branded
* competitor-branded

Classification SHALL be versioned.

An AI-generated query classification SHALL NOT overwrite the underlying query.

---

# 5. Observation Context

Every SERP request SHALL carry an explicit observation envelope.

Minimum:

```text
observation_id
query_id
engine
search_surface
location
country
language
device
os
requested_depth
requested_at
provider
provider_request_id
collector_version
```

Where supported:

```text
latitude
longitude
radius
browser
viewport_width
viewport_height
search_parameters
safe_search
search_domain
personalization_mode
```

Location SHALL NOT be represented only as a country when city-level or coordinate-level targeting was requested.

Commercial SERP APIs currently support location, coordinate, language, device and OS variations, making these practical acquisition dimensions rather than theoretical ones.

---

# 6. Raw Evidence Preservation

Every completed observation SHOULD retain, subject to provider rights and storage policy:

```text
raw_response
raw_html
screenshot
provider_metadata
request_parameters
response_headers
collection_status
checksum
```

Evidence SHALL be content-addressed or cryptographically hashed.

Recommended:

```text
sha256(raw_payload)
sha256(screenshot)
sha256(normalized_result_set)
```

The system SHOULD support immutable object storage for raw evidence.

No normalized representation SHALL be considered sufficient evidence by itself.

---

# 7. SERP Element Model

Every visible SERP element SHALL become an independent normalized entity.

Example:

```text
serp_element_id
observation_id
element_type
rank_absolute
rank_group
pixel_top
pixel_left
pixel_width
pixel_height
domain
url
canonical_url
title
snippet
display_url
source
raw_reference
```

`element_type` SHALL be open-ended and version-controlled.

Examples include:

```text
organic
paid
featured_snippet
ai_overview
ai_mode_response
ai_citation
people_also_ask
knowledge_panel
local_pack
map_result
video
image
news
shopping
discussion
reddit
forum
sitelink
related_search
direct_answer
carousel
```

Unknown features MUST NOT silently map to `organic`.

Instead:

```text
UNKNOWN_FEATURE
```

with the raw representation retained.

---

# 8. AI Search Representation

AI Overviews and AI Mode SHALL have their own data model.

Required fields SHOULD include:

```text
response_present
response_text_hash
response_structure
citation_count
cited_domains
cited_urls
brand_mentions
competitor_mentions
entity_mentions
follow_up_queries
source_relationships
```

AI citation position SHALL NOT be treated as equivalent to organic rank.

The system SHALL separately measure:

* cited
* mentioned
* linked
* cited and linked
* neither

Google AI Overview and AI Mode are now separately retrievable search surfaces through commercial SERP infrastructure, including AI-specific content and references.

---

# 9. Domain and Entity Resolution

URLs MUST be normalized before comparison.

Required canonicalization SHOULD account for:

* HTTP vs HTTPS
* `www`
* fragments
* tracking parameters
* canonical host aliases
* redirects
* mobile URLs
* locale URLs

But:

`observed_url`

MUST remain preserved separately from:

`resolved_url`

The system SHALL also maintain:

```text
domain
root_domain
organization
brand
entity
```

These SHALL not be assumed equivalent.

Example:

A YouTube result mentioning a company may provide entity visibility without domain visibility.

---

# 10. Historical State Model

The system SHALL preserve every observation.

Historical rank SHALL never be represented by overwriting a row.

The system MUST support reconstruction of:

> “What did the SERP look like for query Q from Toronto on mobile at observation T?”

without relying on current data.

Historical results SHALL remain attributable to:

* collector version
* parser version
* classification version
* provider
* query registry version

---

# 11. Change Detection

Change events SHALL be derived from consecutive comparable observations.

The system SHALL detect at least:

| Event               | Example                              |
| ------------------- | ------------------------------------ |
| ENTRY               | URL enters observed result set       |
| EXIT                | URL disappears                       |
| RANK_GAIN           | Position improves                    |
| RANK_LOSS           | Position declines                    |
| FEATURE_APPEARED    | AI Overview/local pack/etc. appears  |
| FEATURE_DISAPPEARED | Feature removed                      |
| URL_REPLACED        | Ranking page changes                 |
| COMPETITOR_ENTRY    | New competitor appears               |
| COMPETITOR_EXIT     | Competitor disappears                |
| CITATION_GAIN       | Domain gains AI citation             |
| CITATION_LOSS       | Domain loses AI citation             |
| TITLE_CHANGE        | Search title changed                 |
| SNIPPET_CHANGE      | Search snippet changed               |
| VOLATILITY_SPIKE    | Result set changes unusually quickly |

Comparability SHALL be explicitly determined.

A desktop result MUST NOT silently be compared with mobile.

A Toronto observation MUST NOT silently be compared with Canada-wide observations.

---

# 12. SERP Similarity and Volatility

The system SHOULD calculate result-set similarity.

Possible measures:

* Jaccard similarity
* weighted rank overlap
* Spearman correlation
* Kendall tau
* normalized discounted cumulative overlap
* domain churn
* URL churn
* feature churn

The exact algorithm SHALL be versioned.

Store:

```text
metric_name
metric_version
value
input_observation_ids
```

A “volatility score” SHALL therefore be reproducible.

---

# 13. First-Party Search Performance

The system SHALL ingest Google Search Console separately from observed SERP data.

Required GSC dimensions:

* date
* query
* page
* country
* device
* search appearance
* search type

Required metrics:

* impressions
* clicks
* CTR
* average position

Search Console data SHALL retain:

```text
data_state
aggregation_type
retrieval_time
request_dimensions
request_filters
```

The system MUST record that GSC query/page data may be incomplete because Google explicitly states that detailed retrieval can omit rows and prioritizes top data.

Consequently:

**GSC absence SHALL NOT mean zero searches.**

---

# 14. Indexation Intelligence

The system SHOULD separately track:

```text
discovered
crawlable
crawled
indexable
indexed
search-visible
ranking
```

These states MUST NOT be collapsed.

Google itself separates crawling, indexing and serving, and explicitly states that technical eligibility does not guarantee indexing or appearance in results.

This enables diagnosis such as:

```text
URL exists
→ crawlable
→ indexed
→ no impressions
→ likely discoverability/relevance problem
```

rather than incorrectly labeling everything “SEO.”

---

# 15. Search Demand Model

The system SHOULD ingest independent keyword-demand data.

Required dimensions:

```text
query
market
language
period
estimated_search_volume
CPC
competition
trend
source
source_version
retrieved_at
```

Search volume SHALL be identified as an estimate.

It SHALL NOT be mixed with Search Console impressions.

Definitions:

`search demand estimate != observed impressions != SERP observation count`

---

# 16. Competitive Intelligence

Competitor identification SHALL operate at three levels:

### Declared competitors

Organizations explicitly registered as competitors.

### Observed competitors

Domains repeatedly occupying SERPs relevant to the monitored corpus.

### Query-specific competitors

Entities competing for the same search surface even if they are not commercial competitors.

The system SHALL calculate:

```text
domain_share_of_voice
query_coverage
top_3_presence
top_10_presence
feature_ownership
AI_citation_share
SERP_overlap
competitive_displacement
```

Metrics MUST identify the underlying query universe and weighting algorithm.

“Share of voice = 32%” without a query population and calculation version is invalid.

---

# 17. Query Discovery

The system SHALL continuously discover candidate queries from:

* Search Console
* SERPs
* autocomplete
* People Also Ask
* related searches
* AI follow-up questions
* competitor rankings
* internal site search
* landing-page vocabulary
* content corpus
* analytics/conversion data

People Also Ask can itself contain traditional answers and AI-generated expansions, reinforcing the need to preserve the actual feature type and source relationship.

New queries SHALL enter a candidate state before becoming monitored queries.

Recommended lifecycle:

```text
DISCOVERED
→ CLASSIFIED
→ QUALIFIED
→ MONITORED
→ DEPRIORITIZED
→ RETIRED
```

---

# 18. Intent and Journey Mapping

Each query SHOULD map to one or more business intents.

Example:

```text
query
→ intent
→ problem
→ expected content type
→ target URL
→ offer
→ conversion event
```

The system SHOULD identify mismatches such as:

```text
informational SERP
→ transactional landing page
```

or:

```text
comparison query
→ generic homepage
```

These should be findings, not automatic conclusions.

---

# 19. Search Intent Derived From the SERP

Declared query intent SHOULD be tested against observed SERP composition.

Example:

If Google returns:

* local pack
* maps
* review sites
* nearby businesses

then observed SERP evidence suggests local intent.

If Google returns:

* guides
* explanations
* forums
* AI Overview

then observed SERP evidence suggests informational intent.

Store:

```text
declared_intent
observed_intent
intent_confidence
classifier_version
evidence
```

Do not silently change query intent.

---

# 20. Opportunity Detection

The system SHOULD detect opportunities including:

```text
high impressions + low CTR
positions 4–15
high demand + no owned result
competitor weakness
SERP feature opportunity
AI citation opportunity
content cannibalization
wrong URL ranking
local pack opportunity
image/video opportunity
outdated competitor results
weak search intent alignment
```

Every opportunity SHALL reference the observations and metrics that caused it.

Example:

```text
OPPORTUNITY-481
reason:
  query impressions = ...
  current rank = ...
  observed SERP = ...
  CTR = ...
  competing feature = ...
```

No opaque “SEO score.”

---

# 21. Cannibalization Detection

The system SHALL detect multiple owned URLs competing for the same query.

It MUST differentiate:

* healthy multi-URL visibility
* URL substitution
* intentional multiple intent coverage
* probable cannibalization

Cannibalization SHALL NOT be inferred merely because two URLs rank for the same keyword.

---

# 22. CTR Analysis

The system SHALL calculate observed CTR performance.

Expected CTR models MUST account for:

* position
* device
* query intent
* brand/non-brand
* SERP feature composition
* AI Overview presence
* rich result presence

A generic:

`position 1 should equal X% CTR`

SHALL NOT be treated as factual.

Models SHALL retain:

```text
model_version
training_population
observation_period
confidence_interval
```

---

# 23. Visual SERP Analysis

Where screenshots or element coordinates are available, the system SHOULD calculate:

* above-fold occupancy
* organic pixel depth
* ads before organic
* AI Overview footprint
* local pack footprint
* owned-result visual share
* competitor visual share

This produces an important distinction:

```text
organic_rank = 1
absolute_position = 8
pixel_depth = 2200
```

Those describe radically different visibility than traditional “#1 ranking.”

---

# 24. Recommendations

Recommendations SHALL be generated from findings.

Required lineage:

```text
Observation
→ Determination
→ Finding
→ Hypothesis
→ Recommendation
```

Recommendation is NOT authorization.

The recommendation object SHOULD contain:

```text
recommendation_id
finding_ids
proposed_change
target
expected_mechanism
expected_metric
confidence
estimated_effort
risk
evidence
model_version
created_at
```

The system SHALL NOT claim predicted ranking gains as facts.

---

# 25. Experimentation

SEO changes SHOULD be treated as experiments wherever attribution permits.

Required lifecycle:

```text
HYPOTHESIS
→ BASELINE
→ INTERVENTION
→ OBSERVATION_WINDOW
→ EVALUATION
→ OUTCOME
```

Required evidence:

```text
target URLs
target queries
pre-change observations
change version
deployment timestamp
post-change observations
external volatility
confounding events
```

Possible outcomes:

```text
SUPPORTED
NOT_SUPPORTED
INCONCLUSIVE
CONFOUNDED
INSUFFICIENT_EVIDENCE
```

“Ranking increased after change” SHALL NOT automatically become “change caused ranking increase.”

---

# 26. External Event Correlation

The system SHOULD maintain an event timeline for:

* site deployments
* content changes
* redirects
* migrations
* outages
* robots changes
* sitemap changes
* algorithm updates
* manual actions
* security incidents
* competitor changes

Correlation MAY be calculated.

Causation SHALL NOT be inferred automatically.

---

# 27. Data Provenance

Every data point MUST identify:

```text
source
provider
retrieved_at
observation_time
raw_evidence_reference
collector_version
parser_version
schema_version
```

Derived values additionally require:

```text
derivation_method
derivation_version
input_ids
```

No metric without lineage.

---

# 28. Provider Abstraction

No external SERP provider SHALL become the canonical internal schema.

Architecture:

```text
Provider Adapter
      ↓
Raw Provider Evidence
      ↓
Canonical SERP Schema
      ↓
Derived Intelligence
```

This prevents provider migration from rewriting the system.

At least two SERP-provider adapters SHOULD be technically possible even if only one is operated.

Provider disagreement SHOULD be measurable rather than discarded.

---

# 29. Validation Sampling

The system SHOULD periodically run duplicate observations across independent providers.

Compare:

```text
top-N URLs
rank
SERP features
titles
snippets
AI Overview presence
citations
```

Store divergence.

This provides empirical knowledge of collection reliability.

---

# 30. Collection Scheduler

Monitoring frequency SHOULD depend on importance and volatility.

Example policies:

| Class               |    Frequency |
| ------------------- | -----------: |
| Critical commercial | Hourly/daily |
| Strategic           |        Daily |
| Active experiment   |        Daily |
| Standard            |       Weekly |
| Long-tail           |      Monthly |
| Discovery           |     Adaptive |

The system SHOULD automatically increase observation frequency during detected volatility or active experiments.

Cost limits MUST bound adaptive scheduling.

---

# 31. Budget Enforcement

Collection SHALL have hard budget constraints.

Required:

```text
daily_request_limit
daily_cost_limit
query_cost
provider_cost
project_budget
priority
```

The scheduler MUST fail closed when limits are reached unless explicitly reauthorized.

Cost SHOULD be attributable:

```text
project
→ query
→ observation
→ provider request
```

---

# 32. Reliability

Collection infrastructure SHALL expose:

* success rate
* timeout rate
* parser failure rate
* provider error rate
* CAPTCHA/block indicators
* empty SERP anomalies
* latency
* retries
* cost
* queue depth

Retries SHALL preserve attempt history.

A retry SHALL NOT replace the failed attempt.

---

# 33. Parser Change Control

SERPs change frequently.

Parser changes therefore require:

```text
parser_version
fixture corpus
regression suite
known-feature coverage
unknown-feature rate
before/after comparison
```

Historical raw SERPs SHOULD be replayable against a new parser.

This is essential.

Without replay capability, parser bugs permanently contaminate historical intelligence.

---

# 34. Schema Evolution

All externally visible schemas MUST be versioned.

Breaking schema changes SHALL require migration.

Historical observations SHALL remain readable.

Suggested identifiers:

```text
observation_schema_version
serp_element_schema_version
classifier_version
metric_version
parser_version
registry_version
```

---

# 35. Deterministic Analytics

Calculations such as:

* visibility
* volatility
* share of voice
* opportunity
* competition
* trend

SHOULD be deterministic given the same input data and algorithm version.

LLMs MAY explain the result.

LLMs SHALL NOT be the canonical calculator.

---

# 36. AI Usage

AI MAY perform:

* query clustering
* topic classification
* intent hypotheses
* SERP summarization
* competitor categorization
* finding explanation
* recommendation drafting

AI SHALL NOT establish canonical facts when deterministic evidence exists.

AI output MUST carry:

```text
model
model_version
prompt_version
input evidence IDs
output
timestamp
```

---

# 37. Confidence

Confidence SHALL describe the quality of a determination, not rhetorical certainty.

Possible inputs:

```text
sample count
observation freshness
provider agreement
measurement consistency
classification certainty
data completeness
```

Confidence models MUST be versioned.

The system SHALL permit:

```text
INDETERMINATE
```

rather than force classifications.

---

# 38. Alerts

Alerts SHOULD be generated for events such as:

* high-value ranking loss
* indexation loss
* competitor displacement
* AI citation loss
* new AI Overview appearance
* feature displacement
* sharp impression decline
* significant CTR deviation
* robots/noindex problem
* SERP volatility spike
* provider/parser degradation

Alerts MUST contain evidence.

Example:

```text
ALERT
Query: landing page audit
Previous observed rank: 3
Current observed rank: 11
Location: Toronto
Device: mobile
Observation IDs: ...
Confidence: HIGH
```

Not:

> “Your SEO is getting worse.”

---

# 39. Search Performance State Machine

Queries SHOULD progress through explicit measurable states.

Example:

```text
UNKNOWN
DISCOVERED
NOT_VISIBLE
VISIBLE
IMPRESSION_GENERATING
CLICK_GENERATING
CONVERSION_GENERATING
```

Separately track content state:

```text
UNKNOWN
NOT_INDEXED
INDEXED
RANKING
COMPETITIVE
```

Do not construct one meaningless universal “SEO health” score.

---

# 40. Business Attribution

Search visibility SHOULD ultimately connect to product outcomes.

Required lineage where technically available:

```text
query
→ SERP
→ impression
→ click
→ landing page
→ session
→ journey
→ conversion
→ revenue
```

Attribution limitations MUST be explicit.

SERP observation alone cannot prove that an observed ranking generated an individual conversion.

---

# 41. Canonical Metrics

The system SHOULD establish a metric registry.

Every metric definition requires:

```text
metric_id
name
definition
formula
input_types
unit
version
effective_from
deprecated_at
```

Example:

```text
METRIC-SOV-001
SERP Visibility Share
v2
```

Changing the weighting formula creates a new version.

---

# 42. Evidence Graph

Top-tier implementation SHOULD model relationships as an evidence graph.

Example:

```text
Query
 ↓
Observation
 ↓
SERP Element
 ↓
Domain
 ↓
Page
```

and:

```text
Observation
 ↓
Finding
 ↓
Hypothesis
 ↓
Recommendation
 ↓
Experiment
 ↓
Outcome
```

This allows every conclusion to be traced backward.

---

# 43. APIs

The system SHOULD expose APIs for:

```text
queries
observations
SERP elements
domains
URLs
competitors
features
metrics
findings
opportunities
experiments
alerts
evidence
```

Queries MUST support historical `as_of` semantics.

Example:

```text
GET /serp/query/{id}?as_of=2026-09-19T12:00:00Z
```

---

# 44. Interface Requirements

The UI SHOULD expose five principal operating views.

### Query View

Complete history of one query.

### URL View

Everything known about a page.

### SERP View

Reconstruction of a specific observed SERP.

### Competitor View

Observed competitive search footprint.

### Opportunity View

Evidence-backed candidate interventions.

A dashboard is secondary.

The primary system is the evidence and analytical substrate.

---

# 45. Reproducibility Requirement

Given:

```text
observation IDs
metric version
classifier version
parser version
```

the system MUST be capable of reproducing a historical determination.

This should be an acceptance criterion, not an aspiration.

---

# 46. Audit Requirement

For any displayed conclusion, a user MUST be able to traverse:

```text
Conclusion
→ calculation/classification
→ input records
→ normalized observations
→ raw evidence
→ acquisition metadata
```

No dead ends.

---

# 47. Retention

Retention policy SHOULD distinguish:

```text
raw SERP evidence
screenshots
normalized observations
derived metrics
findings
recommendations
experiments
audit events
```

Derived objects SHOULD generally outlive provider caches.

Provider contractual rights and licensing MUST be considered before persisting or redistributing raw SERP material.

---

# 48. Security

Required controls:

* project/tenant isolation
* service authentication
* least-privilege API credentials
* secrets isolation
* encrypted transport
* encrypted persistence
* immutable audit history
* access logging
* API rate limiting
* ingestion validation
* untrusted HTML isolation

Raw SERP HTML SHALL be treated as untrusted input.

---

# 49. System Health

The SERP system must observe itself.

Required operational metrics:

```text
observation success %
collection freshness
queue lag
provider latency
provider errors
normalization failures
unknown feature rate
parser drift
GSC freshness
cost/query
cost/project
storage growth
cross-provider disagreement
```

A system that cannot determine whether its own evidence collection is functioning cannot defensibly report search changes.

---

# 50. Acceptance Criteria

A production-ready system SHALL demonstrate all of the following:

1. Reproduce a historical SERP observation from preserved evidence.
2. Distinguish rank-group position from absolute SERP position.
3. Detect and preserve SERP feature changes.
4. Handle AI Overview and AI Mode as independent result structures.
5. Compare location/device-specific results without contaminating observations.
6. Preserve failed observations without treating them as rank losses.
7. Replay historical evidence using a new parser.
8. Trace every derived metric to immutable inputs.
9. Distinguish Search Console performance from independent SERP observations.
10. Detect provider disagreement.
11. Reproduce every metric using its historical algorithm version.
12. Track intervention → observation → outcome without claiming unsupported causation.
13. Operate within enforced collection-cost budgets.
14. Detect degradation in its own collection pipeline.
15. Represent insufficient evidence as INDETERMINATE rather than fabricate certainty.

---

# 51. Architectural Boundary

The canonical architecture should therefore be:

```text
                    ┌─────────────────────┐
                    │ Query Discovery     │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Query Registry      │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Collection Planner  │
                    └──────────┬──────────┘
                               ↓
          ┌────────────────────┼─────────────────────┐
          ↓                    ↓                     ↓
      SERP APIs              GSC                Demand Data
          ↓                    ↓                     ↓
          └────────────────────┼─────────────────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Evidence Store      │
                    │ Raw + Immutable     │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Normalization       │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Canonical Search    │
                    │ Observation Store   │
                    └──────────┬──────────┘
                               ↓
                 ┌─────────────┴────────────┐
                 ↓                          ↓
        Deterministic Metrics        Classification
                 ↓                          ↓
                 └─────────────┬────────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Findings            │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Hypotheses          │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Recommendations     │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Experiments         │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Outcomes / Learning │
                    └─────────────────────┘
```

The important architectural property is that the system never jumps directly from:

```text
SERP API → AI recommendation
```

It must travel through preserved evidence and explicit determinations first.
