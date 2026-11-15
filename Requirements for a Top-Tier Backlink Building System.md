# AI Automated Backlink Acquisition System

## 1. System Objective

The system SHALL continuously discover, evaluate, pursue, verify, and learn from backlink acquisition opportunities.

Its objective is not:

> maximize backlink count

Its objective is:

> acquire attributable, contextually relevant, durable, defensible references from legitimate third-party properties through evidence-backed acquisition strategies.

The system MUST distinguish between:

* earned links
* contributed-content links
* resource-page links
* citation links
* partnership links
* directory/listing links
* community references
* editorial mentions
* sponsored links
* affiliate links
* user-generated links
* syndication links
* replicated/scraped links
* potentially manipulative links

These MUST NOT be treated as equivalent.

---

# 2. Primary System Principles

## 2.1 Quality over volume

The system MUST NOT optimize directly for:

```text
total_backlinks
```

or:

```text
domains_contacted
```

Primary optimization SHOULD instead consider:

```text
relevance
editorial legitimacy
audience overlap
domain quality
page quality
placement quality
link durability
traffic potential
acquisition cost
conversion contribution
risk
```

---

## 2.2 Observation must remain separate from interpretation

Raw evidence SHALL be preserved independently from classifications.

Example:

```text
Observed:
Domain X links to competitor Y from URL Z

Derived:
Domain X may represent a viable outreach opportunity
```

The second is a hypothesis.

It SHALL NOT overwrite the first.

---

# 3. Acquisition Strategy Taxonomy

The system SHALL maintain an explicit registry of allowed acquisition strategies.

Examples:

```text
RESOURCE_PAGE
BROKEN_LINK
UNLINKED_MENTION
COMPETITOR_LINK_GAP
EDITORIAL_PITCH
ORIGINAL_RESEARCH
DATA_ASSET
STATISTICS_PAGE
TOOL_ASSET
TEMPLATE_ASSET
GUEST_CONTRIBUTION
DIRECTORY_LISTING
PARTNER_LINK
INTEGRATION_LINK
COMMUNITY_CONTRIBUTION
JOURNALIST_REQUEST
EXPERT_COMMENTARY
CASE_STUDY
TESTIMONIAL
PODCAST_APPEARANCE
ROUNDUP
LINK_RECLAMATION
CONTENT_REFRESH
```

Each strategy MUST have:

```text
strategy_id
version
allowed_actions
prohibited_actions
eligibility_conditions
required_evidence
approval_requirements
risk_class
expected_cost
```

---

# 4. Prohibited Acquisition Patterns

The system MUST explicitly detect and reject high-risk tactics.

Examples:

```text
MASS_COMMENT_SPAM
FORUM_SPAM
AUTOMATED_ACCOUNT_CREATION
PBN_PLACEMENT
HIDDEN_LINKS
LINK_INJECTION
COMPROMISED_SITE_PLACEMENT
FAKE_REVIEWS
FAKE_TESTIMONIALS
FAKE_PERSONAS
IMPERSONATION
FABRICATED_RELATIONSHIPS
UNAUTHORIZED_WIKI_EDITING
UNDISCLOSED_PAID_LINK
RECIPROCAL_LINK_SCHEME
LOW_QUALITY_DIRECTORY_BLAST
ARTICLE_SPINNING
MASS_GUEST_POST_NETWORK
SCRAPED_CONTENT_PLACEMENT
```

Any detected prohibited pattern MUST fail closed.

---

# 5. Opportunity Discovery

The system SHALL discover backlink opportunities from multiple independent sources.

Potential inputs:

* competitor backlink profiles
* industry resource pages
* search results
* publisher sites
* news publications
* blogs
* directories
* association websites
* academic resources
* government resources
* community sites
* podcast databases
* conference websites
* expert roundups
* newsletters
* unlinked brand mentions
* citation references
* broken links
* existing relationships
* customer/vendor ecosystems

Each discovered opportunity MUST retain its source.

---

# 6. Opportunity Evidence Model

Every opportunity SHALL have a persistent evidence record.

Example:

```text
opportunity_id
discovery_source
discovered_at
target_domain
target_url
referenced_competitor
referenced_content
candidate_strategy
raw_evidence
evidence_hash
collector_version
```

The system MUST preserve:

```text
what was observed
when it was observed
how it was observed
which collector found it
```

---

# 7. Domain Qualification

Every candidate domain SHALL undergo qualification before outreach.

Required dimensions SHOULD include:

```text
topical_relevance
audience_relevance
editorial_quality
organic_visibility
estimated_traffic
publishing_frequency
linking_behavior
domain_age
content_quality
spam_indicators
outbound_link_density
ownership_transparency
contactability
language
geography
```

Third-party authority metrics MAY be ingested.

Examples:

```text
DR
DA
Authority Score
Trust Flow
Citation Flow
```

But these SHALL NOT become canonical truth.

They MUST retain:

```text
provider
metric
value
retrieved_at
provider_methodology_version_if_known
```

---

# 8. Page-Level Qualification

Domain authority alone SHALL NOT qualify a backlink opportunity.

The linking page MUST be separately evaluated.

Required factors:

```text
page_topic
page_quality
page_age
page_traffic
page_indexability
page_search_visibility
content_depth
link_context
outbound_link_count
editorial_role
page_type
```

A high-authority domain with a low-quality links page SHALL NOT automatically be considered high-value.

---

# 9. Topical Relevance

The system SHOULD calculate relevance between:

```text
target_site
target_page
candidate_domain
candidate_page
link_context
```

Relevance SHALL NOT be based solely on keyword overlap.

Possible inputs:

* semantic similarity
* entity overlap
* industry taxonomy
* intent alignment
* audience overlap
* topic graph distance

The algorithm MUST be versioned.

---

# 10. Link-Type Classification

Observed links SHALL be classified.

Possible values:

```text
EDITORIAL
RESOURCE
NAVIGATION
AUTHOR_BIO
FOOTER
SIDEBAR
DIRECTORY
SPONSORED
AFFILIATE
UGC
COMMENT
FORUM
PROFILE
REFERENCE
CITATION
PARTNER
UNKNOWN
```

The system MUST support:

```text
UNKNOWN
```

rather than forcing classification.

---

# 11. Link Attribute Detection

The system SHALL record:

```text
follow
nofollow
sponsored
ugc
other_rel
```

No-follow or sponsored links SHALL NOT automatically be considered worthless.

Their value MAY exist through:

* referral traffic
* discovery
* brand exposure
* entity association
* audience access
* indirect acquisition

---

# 12. Placement Context

Every acquired link SHOULD capture context.

Example:

```text
surrounding_text
anchor_text
paragraph_position
section_heading
link_position
page_position
link_type
editorial_context
```

Anchor text SHOULD be observed, not aggressively controlled.

The system MUST NOT optimize toward unnatural exact-match anchor distributions.

---

# 13. Backlink Graph

The system SHOULD construct a graph of:

```text
domain
page
entity
brand
topic
link
mention
competitor
```

Example:

```text
Publisher
   ↓
Article
   ↓
Mentions Topic
   ↓
Links Competitor
```

This allows discovery of opportunity networks rather than isolated domains.

---

# 14. Competitor Link-Gap Analysis

The system SHALL support comparisons between:

```text
owned_domain
competitor_A
competitor_B
competitor_C
```

It SHOULD identify:

```text
domains linking to competitors but not us
pages linking to multiple competitors
recurring industry citation sources
resource pages
directories
journalists
authors
newsletters
communities
```

Multiple-competitor references SHOULD be weighted higher than isolated links where relevant.

---

# 15. Link Intersections

The system SHOULD identify domains linking to:

```text
2+
3+
N competitors
```

These can indicate legitimate sector reference sources.

But link intersection SHALL NOT itself establish qualification.

---

# 16. Unlinked Mention Detection

The system SHALL discover references to:

```text
company name
brand
product
domain
executives
original research
statistics
tools
named concepts
```

without hyperlinks.

Candidate mention records SHOULD contain:

```text
source_url
mention_text
entity
context
publisher
publication_date
link_present
canonical_target
```

---

# 17. Broken Link Acquisition

The system SHOULD detect:

```text
external_dead_links
redirected_links
retired_resources
obsolete_resources
```

The system MAY recommend a replacement only if the owned resource is genuinely relevant.

It MUST NOT recommend unrelated substitution merely because a broken URL exists.

---

# 18. Content Asset Inventory

The system MUST know which owned assets are available for acquisition.

Examples:

```text
research
statistics
benchmark
tool
calculator
template
guide
documentation
dataset
case_study
survey
report
reference_page
glossary
interactive_asset
```

Each asset SHOULD include:

```text
asset_id
canonical_url
topic
audience
intent
evidence_quality
originality
last_verified
```

---

# 19. Linkability Evaluation

The system SHOULD determine whether an asset is genuinely link-worthy.

Signals MAY include:

```text
original_data
unique_research
novel_tool
reference_value
visual_asset
citation_value
utility
freshness
authority
```

The system MUST be allowed to conclude:

```text
NO_LINKABLE_ASSET
```

This is preferable to fabricating an outreach angle.

---

# 20. Asset Gap Detection

When an attractive backlink opportunity exists but no suitable asset exists, the system SHOULD generate:

```text
ASSET_GAP
```

Example:

```text
Publishers repeatedly reference current industry statistics,
but the site has no authoritative statistics resource.
```

That finding MAY produce a content recommendation.

---

# 21. Contact Discovery

The system MAY identify public professional contact routes.

Examples:

```text
editorial_contact
author_contact
newsroom
contact_form
partnerships
press_contact
general_business_contact
```

All contact evidence SHALL retain its source.

The system MUST NOT infer or fabricate private contact data.

---

# 22. Contact Identity Resolution

Contact records SHOULD distinguish:

```text
person
role
organization
publication
contact_method
confidence
source
last_verified
```

The system MUST avoid contacting clearly irrelevant roles.

Example:

A billing support address SHALL NOT be repurposed as an editorial contact.

---

# 23. Outreach Eligibility

No outreach SHALL occur until eligibility is established.

Minimum:

```text
qualified_target
valid_strategy
relevant_asset
permitted_contact_method
risk_check_passed
suppression_check_passed
frequency_check_passed
```

---

# 24. Outreach Personalization

Generated outreach SHALL be based on verified evidence.

Allowed personalization:

```text
specific article
specific broken link
specific cited statistic
specific resource page
specific competitor reference
specific topic overlap
```

Not allowed:

```text
fabricated compliment
fake familiarity
invented relationship
unsupported claim
pretended readership
fake customer status
```

---

# 25. Outreach Message Provenance

Every generated message MUST retain:

```text
message_id
opportunity_id
contact_id
strategy_id
template_version
model
model_version
prompt_version
evidence_ids
generated_at
approved_at
sent_at
```

---

# 26. Human Approval

The system SHOULD support multiple execution modes:

```text
RESEARCH_ONLY
DRAFT_ONLY
APPROVAL_REQUIRED
BOUNDED_AUTONOMOUS
```

High-risk strategies SHOULD require human approval.

Autonomy SHOULD be granted by strategy and risk category, not globally.

---

# 27. Sending Controls

The sending system MUST enforce:

```text
daily_sender_limit
domain_frequency_limit
contact_frequency_limit
campaign_limit
cooldown_period
followup_limit
```

The system MUST reject attempts to bypass these controls.

---

# 28. Suppression Registry

The system SHALL maintain a durable suppression registry.

Examples:

```text
DO_NOT_CONTACT
UNSUBSCRIBED
BOUNCED
COMPLAINT
LEGAL_SUPPRESSION
PREVIOUSLY_REJECTED
DOMAIN_BLOCKED
PERSON_BLOCKED
```

Suppression MUST override campaign logic.

---

# 29. Follow-Up Policy

Follow-ups MUST be bounded.

Required:

```text
maximum_followups
minimum_interval
maximum_campaign_duration
```

No-response MUST eventually terminate outreach.

The system MUST NOT endlessly retry.

---

# 30. Response Classification

Inbound responses SHOULD be classified into:

```text
INTERESTED
REQUEST_INFO
DECLINED
NOT_RELEVANT
OUT_OF_OFFICE
BOUNCE
UNSUBSCRIBE
SPAM_COMPLAINT
PAID_PLACEMENT_OFFER
LINK_EXCHANGE_REQUEST
PARTNERSHIP_PROPOSAL
UNKNOWN
```

Classification MUST retain the original response.

---

# 31. Paid Placement Detection

If a publisher requests compensation, the opportunity SHALL transition to:

```text
PAID_PLACEMENT
```

rather than remaining `EDITORIAL`.

The system MUST retain:

```text
price
currency
terms
disclosure_requirement
link_attribute
publication_conditions
```

Payment MUST NOT be automatically authorized.

---

# 32. Reciprocal Link Detection

If a target asks for a reciprocal link, the system SHALL classify:

```text
RECIPROCAL_REQUEST
```

This SHOULD trigger risk review.

It MUST NOT be silently accepted.

---

# 33. Link Verification

Acquired backlinks SHALL be independently verified.

Required:

```text
target_url
source_url
observed_anchor
rel_attributes
first_seen
last_seen
http_status
page_indexability
link_present
```

Publisher confirmation alone SHALL NOT count as verification.

---

# 34. Link Lifecycle

Links SHALL have explicit lifecycle states.

Example:

```text
DISCOVERED
OUTREACH_PENDING
CONTACTED
RESPONDED
AGREED
PLACED
VERIFIED
LOST
CHANGED
REMOVED
BROKEN
UNKNOWN
```

---

# 35. Continuous Verification

Acquired links SHOULD be periodically rechecked.

The scheduler SHOULD detect:

```text
link_removed
page_removed
nofollow_added
sponsored_added
anchor_changed
target_changed
redirect_added
page_deindexed
```

---

# 36. Historical Integrity

Link history MUST remain immutable.

If:

```text
follow → nofollow
```

the system SHALL preserve both observations.

Do not overwrite the original state.

---

# 37. Value Measurement

The system SHOULD evaluate acquired links across multiple dimensions.

Examples:

```text
referral_sessions
qualified_sessions
conversions
revenue
search_visibility_change
brand_mentions
assisted_conversions
crawler_discovery
citation_growth
```

The system MUST NOT assume that ranking improvement was caused by an acquired backlink.

---

# 38. Acquisition Economics

Every opportunity SHOULD expose:

```text
research_cost
content_cost
outreach_cost
placement_cost
human_review_cost
tooling_cost
```

Derived:

```text
cost_per_acquired_link
cost_per_referring_domain
cost_per_qualified_referral
cost_per_conversion
```

---

# 39. Strategy Performance

Performance MUST be attributable to acquisition strategy.

Example:

```text
strategy
opportunities
contacts
responses
positive_responses
placements
verified_links
retained_links
referral_sessions
conversions
cost
```

This allows the system to learn that a tactic is ineffective rather than blindly scaling it.

---

# 40. Funnel Model

The system SHOULD maintain a backlink acquisition funnel:

```text
DISCOVERED
↓
QUALIFIED
↓
CONTACTABLE
↓
CONTACTED
↓
RESPONDED
↓
AGREED
↓
PLACED
↓
VERIFIED
↓
RETAINED
```

Drop-off MUST be measurable at each stage.

---

# 41. Attribution Window

Acquisition outcomes SHALL operate under explicit attribution windows.

For example:

```text
outreach_response_window
placement_window
verification_window
traffic_evaluation_window
search_evaluation_window
```

These MUST be versioned and configurable.

---

# 42. Link Quality Determination

The system SHOULD derive a multidimensional assessment.

Example:

```text
topical_relevance
editorial_quality
placement_quality
domain_quality
traffic_quality
risk
durability
```

Avoid collapsing everything into a single opaque:

```text
LINK_SCORE = 87
```

If a composite metric exists, its components and weights MUST remain visible.

---

# 43. Risk Classification

Each opportunity SHALL carry risk dimensions.

Possible factors:

```text
spam_risk
brand_risk
legal_risk
reputation_risk
search_policy_risk
deliverability_risk
data_protection_risk
publisher_quality_risk
```

---

# 44. Content Authenticity

AI-generated content SHALL NOT invent:

* statistics
* case studies
* customer claims
* expertise
* experiments
* company history
* relationships
* quotations
* personal experience

Any factual statement used in outreach MUST be traceable to evidence.

---

# 45. Sender Identity

The system MUST NOT impersonate nonexistent people.

Automated outreach SHALL originate from:

```text
real organization
real authorized sender
approved service identity
```

Sender identity MUST be attributable.

---

# 46. Regulatory and Jurisdictional Controls

The system SHOULD support jurisdiction-aware communication controls.

Required concepts:

```text
recipient_jurisdiction
sender_jurisdiction
commercial_message_classification
consent_basis
relationship_basis
unsubscribe_requirement
retention_rule
```

These rules SHALL be configurable and versioned.

---

# 47. Deliverability Controls

The system SHOULD monitor:

```text
bounce_rate
complaint_rate
unsubscribe_rate
sender_reputation
domain_reputation
authentication_status
```

Required email authentication monitoring:

```text
SPF
DKIM
DMARC
```

Degraded sender reputation SHOULD automatically reduce or suspend outreach.

---

# 48. Reputation Circuit Breaker

A campaign MUST stop automatically when thresholds are breached.

Examples:

```text
spam complaints
bounce rate
unsubscribe rate
negative response rate
provider warnings
domain reputation decline
```

Circuit breakers SHALL require explicit reauthorization before resuming.

---

# 49. Opportunity Deduplication

The system MUST prevent duplicate outreach.

Deduplication SHOULD occur across:

```text
contact
domain
URL
publication
campaign
strategy
```

Two agents MUST NOT independently contact the same editor for the same opportunity.

---

# 50. Relationship Memory

The system SHOULD maintain relationship history.

Example:

```text
first_contact
previous_requests
previous_replies
placements
declines
preferences
restrictions
```

Relationship memory SHALL inform future interactions but SHALL NOT authorize contact by itself.

---

# 51. Publisher Preferences

Known publisher requirements SHOULD be respected.

Examples:

```text
no_guest_posts
no_product_pitches
press_only
specific_submission_form
editorial_guidelines
paid_only
```

These SHOULD become machine-enforceable constraints.

---

# 52. Campaign Model

Every acquisition initiative SHALL be a versioned campaign.

Example:

```text
campaign_id
objective
target_asset
target_topics
strategies
geography
language
budget
start
end
approval_policy
```

Changes create a new campaign version.

---

# 53. Agent Architecture

Specialist agents MAY include:

```text
Discovery Agent
Qualification Agent
Research Agent
Contact Resolution Agent
Outreach Drafting Agent
Response Triage Agent
Verification Agent
Analytics Agent
Risk Agent
```

Agents SHALL NOT possess unrestricted authority.

Each SHALL operate within explicit scopes.

---

# 54. Execution Boundary

The system MUST distinguish:

```text
recommendation
draft
authorization
execution
```

Generating outreach SHALL NOT authorize sending it.

Identifying a publisher SHALL NOT authorize contacting them.

Negotiating placement SHALL NOT authorize payment.

---

# 55. Budget Controls

Budgets SHALL exist at:

```text
organization
campaign
strategy
publisher
opportunity
```

Possible limits:

```text
research spend
API spend
email spend
content spend
placement spend
human review spend
```

Budget exhaustion MUST fail closed.

---

# 56. Provider Abstraction

External sources SHOULD be consumed through adapters.

Architecture:

```text
Ahrefs
Semrush
Majestic
Search
Crawler
CRM
Email
Analytics
        ↓
Provider Adapters
        ↓
Canonical Backlink Schema
```

No external vendor schema SHALL become canonical.

---

# 57. Canonical Entity Registry

The system SHOULD maintain normalized identities for:

```text
domains
organizations
publications
authors
contacts
pages
assets
campaigns
competitors
```

Entity resolution MUST retain confidence and evidence.

---

# 58. Raw Evidence Store

Important external observations SHOULD be persisted.

Examples:

```text
crawler response
page snapshot
link observation
search result
publisher guideline
contact page
provider response
```

Evidence SHOULD be hashed.

---

# 59. Replayability

Historical observations SHOULD be replayable through newer classifiers.

Example:

A domain originally classified as:

```text
GOOD_PROSPECT
```

may later be reclassified using a better spam detector.

The old classification remains.

The new classification becomes a separate determination.

---

# 60. Versioning

At minimum, version:

```text
strategy definitions
qualification models
risk models
templates
prompts
classifiers
entity rules
canonical schemas
campaigns
agents
metrics
```

---

# 61. Deterministic Decisions

Where objective data exists, deterministic logic SHOULD govern.

Examples:

```text
suppressed contact
budget exceeded
link missing
HTTP 404
nofollow present
campaign expired
```

AI SHALL NOT override deterministic enforcement.

---

# 62. AI Responsibilities

AI MAY assist with:

* semantic relevance
* opportunity classification
* content analysis
* personalization
* outreach drafting
* response classification
* strategy proposals
* topic clustering

AI output SHALL include:

```text
model
model_version
prompt_version
evidence_ids
timestamp
```

---

# 63. Confidence

Derived classifications SHOULD include confidence.

Confidence SHOULD reflect:

```text
evidence completeness
source agreement
classification certainty
data freshness
identity certainty
```

Low confidence MUST be visible.

---

# 64. Findings Model

The system SHOULD create findings such as:

```text
COMPETITOR_LINK_GAP
BROKEN_LINK_OPPORTUNITY
UNLINKED_BRAND_MENTION
HIGH_VALUE_RESOURCE_PAGE
LINKABLE_ASSET_GAP
OUTREACH_UNDERPERFORMANCE
LINK_LOSS
PUBLISHER_RISK
```

Every finding MUST reference its evidence.

---

# 65. Hypothesis Model

Findings MAY generate hypotheses.

Example:

```text
Finding:
23 relevant publishers link to competitor research.

Hypothesis:
Publishing equivalent or stronger original research may create a viable acquisition path.
```

Hypotheses MUST NOT be represented as facts.

---

# 66. Recommendations

A recommendation SHOULD include:

```text
recommendation_id
finding_ids
strategy
target
asset
proposed_action
expected_mechanism
risk
estimated_cost
confidence
```

Recommendation is not authorization.

---

# 67. Experimentation

Acquisition strategies SHOULD operate as experiments.

Lifecycle:

```text
HYPOTHESIS
BASELINE
CAMPAIGN
OBSERVATION
EVALUATION
OUTCOME
```

Example outcomes:

```text
SUPPORTED
NOT_SUPPORTED
INCONCLUSIVE
INSUFFICIENT_SAMPLE
CONFOUNDED
```

---

# 68. Adaptive Learning

The system SHOULD learn from:

```text
response rate
placement rate
link retention
traffic
conversion
negative feedback
cost
```

But learning SHALL modify recommendations or candidate policies.

It SHALL NOT silently rewrite active execution rules.

---

# 69. Strategy Promotion

New strategies SHOULD move through controlled stages:

```text
RESEARCH
SIMULATION
HUMAN_REVIEW
LIMITED_TRIAL
VALIDATED
PRODUCTION
DEPRECATED
```

No newly generated AI acquisition strategy SHOULD immediately become autonomous.

---

# 70. Audit Trail

Every significant event SHOULD be append-only.

Examples:

```text
opportunity discovered
qualification changed
contact discovered
message generated
message approved
message sent
response received
placement agreed
link observed
link changed
link lost
```

---

# 71. Reproducibility

For every decision, the system SHOULD be capable of answering:

```text
Why did we pursue this publisher?
Why did we contact this person?
What evidence was used?
Which strategy version applied?
Which model generated the message?
Who authorized sending?
What happened afterward?
```

---

# 72. System Observability

The backlink system SHALL observe itself.

Required metrics:

```text
discovery volume
qualification rate
contactability rate
outreach rate
response rate
positive response rate
placement rate
verification rate
retention rate
cost
spam complaints
bounce rate
suppression rate
risk rejection rate
```

---

# 73. Operational Failure Modes

The system MUST detect:

```text
crawler failures
provider degradation
email API failures
stale contact data
duplicate outreach
template loops
agent retries
runaway campaign expansion
budget exhaustion
high complaint rates
classification drift
```

---

# 74. Kill Switches

Execution MUST be stoppable at:

```text
organization
sender
campaign
strategy
agent
domain
```

A global execution stop MUST override all running workflows.

---

# 75. Acceptance Criteria

A production-grade implementation SHALL prove that it can:

1. Discover backlink opportunities from multiple sources.
2. Preserve the evidence that caused each opportunity to exist.
3. Distinguish domain quality from page quality.
4. Detect topical relevance.
5. Identify competitor link gaps.
6. Detect unlinked mentions.
7. Detect broken-link opportunities.
8. Determine when no suitable asset exists.
9. Resolve appropriate public contact channels.
10. Prevent outreach to suppressed contacts.
11. Prevent duplicate outreach.
12. Bound follow-ups.
13. Detect paid-placement requests.
14. Detect reciprocal-link requests.
15. Preserve every generated outreach message and its evidence.
16. Require authorization where policy demands it.
17. Independently verify acquired backlinks.
18. Detect link loss or modification.
19. Measure referral and commercial outcomes.
20. Preserve acquisition cost.
21. Detect sender reputation deterioration.
22. Stop campaigns through circuit breakers.
23. Reproduce historical classifications.
24. Replay old evidence through newer models.
25. Trace every recommendation to evidence.
26. Distinguish observation from hypothesis.
27. Distinguish recommendation from authorization.
28. Fail closed when required evidence is absent.
29. Represent uncertainty explicitly.
30. Operate without optimizing itself into spam.

---

# 76. Recommended Architecture

```text
                ┌───────────────────────┐
                │ Opportunity Discovery │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Raw Evidence Store    │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Normalization         │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Entity Resolution     │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Qualification         │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Risk / Eligibility    │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Strategy Selection    │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Asset Matching        │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Contact Resolution    │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Outreach Generation   │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Authorization         │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Delivery              │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Response Processing   │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Link Verification     │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Outcome Measurement   │
                └───────────┬───────────┘
                            ↓
                ┌───────────────────────┐
                │ Learning              │
                └───────────────────────┘
```

Across the entire pipeline:

```text
Evidence
Governance
Budget
Audit
Versioning
Observability
Risk
```

must operate as cross-cutting control layers.

---

# 77. Canonical Decision Chain

The most important invariant should be:

```text
Observation
    ↓
Determination
    ↓
Finding
    ↓
Hypothesis
    ↓
Opportunity
    ↓
Recommendation
    ↓
Authorization
    ↓
Execution
    ↓
Verification
    ↓
Outcome
    ↓
Learning
```

No layer should be skipped.

In particular:

```text
AI found domain
    ≠ permission to contact

AI generated email
    ≠ permission to send

Publisher requested payment
    ≠ permission to purchase

Link appeared
    ≠ proof campaign succeeded

Ranking increased
    ≠ proof backlink caused it
```

---

# 78. Core System Invariant

The system SHALL optimize for:

> sustainable acquisition of legitimate third-party references under measurable cost, quality, reputational, and execution constraints.

It SHALL NOT optimize for:

> maximum number of links obtainable by any available means.

That distinction is foundational.
