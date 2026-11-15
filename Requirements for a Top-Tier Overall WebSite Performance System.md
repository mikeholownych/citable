# Website Effectiveness Validation Platform

## 1. Purpose

The Website Effectiveness Validation Platform SHALL continuously observe, measure, validate, explain, and revalidate the factors that determine whether a website can effectively:

* be discovered;
* be crawled and indexed;
* appear in search and AI discovery surfaces;
* load and operate reliably;
* communicate clearly;
* be understood by humans and machines;
* establish trust;
* support accessible interaction;
* convert qualified visitors;
* preserve attribution;
* execute business journeys correctly;
* withstand operational failure;
* demonstrate whether remediation actually improved an observed condition.

The platform SHALL NOT be implemented as a collection of disconnected audit tools.

It SHALL operate from a shared evidence and observation substrate.

---

# 2. Primary Objective

The platform SHALL answer:

> What objectively prevents this website from achieving greater reach, visibility, comprehension, interaction, conversion, and measurable business performance?

And subsequently:

> Which observed defects were changed, and can we prove that the original condition improved?

The platform SHALL distinguish:

```text
OBSERVATION
DETERMINATION
FINDING
HYPOTHESIS
RECOMMENDATION
AUTHORIZATION
CHANGE
REOBSERVATION
OUTCOME
```

These concepts MUST NOT be collapsed.

---

# 3. Governing Invariants

The following SHALL be fundamental platform invariants:

```text
OBSERVED ≠ INFERRED

AVAILABLE ≠ ACCESSIBLE

ACCESSIBLE ≠ DISCOVERABLE

DISCOVERABLE ≠ INDEXED

INDEXED ≠ VISIBLE

VISIBLE ≠ UNDERSTOOD

UNDERSTOOD ≠ TRUSTED

TRUSTED ≠ CONVERTING

EVENT_FIRED ≠ EVENT_CORRECT

CHANGE_DEPLOYED ≠ DEFECT_RESOLVED

CORRELATION ≠ CAUSATION

PASS_ONCE ≠ CONTINUOUSLY_HEALTHY

PROTOCOL_PRESENT ≠ CAPABILITY_WORKS

STRUCTURED_DATA_PRESENT ≠ STRUCTURED_DATA_TRUE

HTTP_200 ≠ FUNCTIONAL

HIGH_SCORE ≠ EFFECTIVE_WEBSITE
```

---

# 4. Platform Validation Domains

The initial canonical domain registry SHOULD contain:

```text
PERF        Technical Performance
CRAWL       Crawlability
INDEX       Indexability
SERP        Search Visibility
AI          AI / Agent Readiness
CONTENT     Content Quality
IA          Information Architecture
SCHEMA      Structured Data
ENTITY      Entity Identity
A11Y        Accessibility
CRO         Conversion
JOURNEY     User Journey Integrity
ANALYTICS   Measurement Integrity
ATTR        Attribution Integrity
AUTHORITY   Backlinks / Authority
SEC         Security Posture
PRIV        Privacy / Consent
REL         Reliability
MOBILE      Mobile Experience
SOCIAL      Social Distribution
LOCAL       Local Visibility
I18N        Internationalization
COMMERCE    Commerce Integrity
MEDIA       Media Optimization
DEPENDENCY  Third-Party Dependencies
EXPERIMENT  Experimentation Integrity
CHANGE      Change Impact
REPUTATION  Brand / Reputation
```

Domains MUST be independently applicable.

A site SHALL NOT fail because a domain is irrelevant.

---

# 5. Site Profile

Before full validation, the system SHALL determine a site profile.

Supported classifications SHOULD include:

```text
CONTENT
MARKETING
SAAS
ECOMMERCE
MARKETPLACE
LOCAL_BUSINESS
DOCUMENTATION
NEWS
COMMUNITY
API
WEB_APPLICATION
PORTFOLIO
NONPROFIT
HYBRID
UNKNOWN
```

Multiple profiles MUST be permitted.

Example:

```text
SAAS + MARKETING + API
```

Profile determination SHALL influence applicability but SHALL NOT rewrite observations.

---

# 6. Applicability

Every condition MUST resolve applicability independently.

Supported applicability states:

```text
APPLICABLE
NOT_APPLICABLE
UNKNOWN
```

Determination states SHALL include:

```text
PASS
FAIL
WARNING
INDETERMINATE
NOT_APPLICABLE
NOT_TESTED
ERROR
```

`NOT_APPLICABLE` SHALL NOT count negatively.

`ERROR` SHALL NOT be treated as `FAIL`.

---

# 7. Common Evidence Architecture

All validators SHOULD consume common observations whenever possible.

Example:

```text
HTTP FETCH
   │
   ├── Performance
   ├── SEO
   ├── Security
   ├── Structured Data
   ├── AI Readiness
   ├── Accessibility
   └── Content
```

The platform SHALL NOT independently fetch the same URL once for every validation domain unless materially different collection conditions are required.

---

# 8. Observation Model

Every observation SHALL contain:

```text
observation_id
scan_id
target_id
resource_id
observation_type
requested_at
observed_at
collector_id
collector_version
configuration_version
status
raw_evidence_reference
evidence_hash
created_at
```

Context-specific metadata SHALL be attached without changing the observation identity.

---

# 9. HTTP Observation

HTTP observations SHOULD include:

```text
requested_url
resolved_url
HTTP_method
request_headers
status_code
response_headers
response_size
content_type
redirect_chain
DNS_resolution
TLS_metadata
TTFB
download_time
body_hash
```

---

# 10. Browser Observation

Rendered observations SHOULD include:

```text
viewport
device_profile
user_agent
browser_version
DOM_snapshot
accessibility_tree
screenshot
network_waterfall
console_events
performance_entries
rendered_text
interactive_elements
```

---

# 11. Evidence Immutability

Raw evidence SHALL be immutable after collection.

Corrections SHALL create:

```text
new observation
new parser output
new determination
```

rather than mutate historical evidence.

---

# 12. Evidence Integrity

Evidence SHOULD be cryptographically hashed.

At minimum:

```text
SHA-256
```

SHOULD be stored for:

```text
HTTP body
DOM snapshot
screenshot
API response
normalized representation
```

---

# 13. Evidence Provenance

Every observation SHALL answer:

```text
What was observed?
When?
From where?
Using what collector?
Using which version?
Under what request conditions?
Against which target?
```

---

# 14. Canonical Resource Identity

The system SHALL distinguish:

```text
requested_url
observed_url
redirected_url
canonical_url
normalized_url
resource_id
```

These SHALL NOT automatically be assumed equivalent.

---

# 15. Target Registry

A target SHALL represent a website or logical web property.

Required:

```text
target_id
primary_domain
site_profile
environment
ownership_status
created_at
retired_at
```

Optional:

```text
known_subdomains
country
language
business_type
conversion_goals
competitors
analytics_sources
```

---

# 16. Environment Classification

Targets SHOULD support:

```text
PRODUCTION
STAGING
PREVIEW
DEVELOPMENT
SANDBOX
UNKNOWN
```

The platform SHALL prevent destructive tests against production unless specifically authorized.

---

# 17. Scan Model

Each execution SHALL generate a scan record.

Required:

```text
scan_id
target_id
started_at
completed_at
scan_profile
platform_version
condition_registry_version
collector_versions
requested_domains
status
```

---

# 18. Scan Types

Support:

```text
FULL
TARGETED
PAGE
DOMAIN
REGRESSION
REVALIDATION
CI
CONTINUOUS
JOURNEY
DIAGNOSTIC
```

---

# 19. Condition Registry

Every validation check SHALL exist as a versioned condition.

Required fields:

```text
condition_id
condition_version
domain
name
description
applicability_rule
observation_requirements
evaluation_method
severity_rule
confidence_method
normative_sources
introduced_at
deprecated_at
```

---

# 20. Condition Identity

Example:

```text
PERF-LCP-001
CRAWL-ROBOTS-001
SCHEMA-PRODUCT-004
CRO-CTA-003
AI-MARKDOWN-002
ANALYTICS-PURCHASE-007
```

Changing condition semantics MUST produce a new condition version.

---

# 21. Evaluation Types

Conditions SHALL explicitly declare one of:

```text
DETERMINISTIC
STATISTICAL
HEURISTIC
MODEL_ASSISTED
HUMAN_REVIEW
HYBRID
```

The UI MUST expose this distinction.

---

# 22. Normative Source Registry

The system SHALL maintain a registry of authoritative references.

Source classes:

```text
STANDARD
REGULATION
SPECIFICATION
VENDOR_REQUIREMENT
VENDOR_GUIDANCE
COMMUNITY_CONVENTION
RESEARCH
HEURISTIC
INTERNAL_RULE
```

A heuristic SHALL NOT be presented as a standard.

---

# 23. Source Maturity

Emerging technology requirements SHOULD additionally identify:

```text
STABLE
RECOMMENDED
DRAFT
EXPERIMENTAL
DEPRECATED
UNKNOWN
```

---

# 24. Determination Model

A determination SHALL contain:

```text
determination_id
condition_id
condition_version
scan_id
target_resource
state
severity
confidence
observation_ids
evaluated_at
evaluator_version
```

---

# 25. Findings

A finding SHALL represent a meaningful condition requiring interpretation or action.

Required:

```text
finding_id
determination_ids
title
description
business_effect
technical_effect
severity
confidence
first_seen
last_seen
state
```

---

# 26. Finding Lifecycle

Supported states:

```text
OPEN
ACKNOWLEDGED
REMEDIATION_PROPOSED
CHANGE_PENDING
REVALIDATION_PENDING
RESOLVED
REGRESSED
ACCEPTED
NOT_APPLICABLE
```

---

# 27. Finding Deduplication

The platform MUST avoid recreating the same finding every scan.

A persistent finding identity SHOULD survive repeated observation.

---

# 28. First-Seen / Last-Seen

Every persistent defect SHALL record:

```text
first_seen
last_seen
occurrence_count
```

This enables differentiation between:

```text
TRANSIENT
RECURRENT
PERSISTENT
```

---

# 29. Hypothesis Model

A hypothesis MAY explain why an observed condition matters.

Example:

```text
Observation:
74% checkout abandonment.

Finding:
Abandonment materially exceeds historical baseline.

Hypothesis:
Unexpected shipping cost may contribute.
```

The hypothesis MUST NOT become a fact without evidence.

---

# 30. Recommendation Model

Recommendations SHALL reference findings.

Required:

```text
recommendation_id
finding_ids
recommended_change
target
expected_mechanism
expected_observable
risk
effort
confidence
created_by
```

Recommendations MUST NOT claim guaranteed performance improvement.

---

# 31. Remediation Verification

A recommendation SHALL NOT be marked successful because the recommended code was deployed.

Required lifecycle:

```text
FAIL
↓
REMEDIATION_PROPOSED
↓
CHANGE_DEPLOYED
↓
REOBSERVED
↓
PASS / FAIL / INDETERMINATE
```

---

# 32. Same-Condition Revalidation

A verified:

```text
FAIL → PASS
```

MUST use:

```text
same condition_id
same condition_version
```

Otherwise it SHALL be reported as:

```text
new condition evaluation
```

---

# 33. Regression Detection

The system SHALL compare scans and identify:

```text
NEW_FAILURE
RESOLVED_FAILURE
REGRESSION
UNCHANGED_FAILURE
NEWLY_APPLICABLE
NO_LONGER_APPLICABLE
CONDITION_CHANGED
```

---

# 34. Baseline

A target MAY establish an approved baseline.

Future scans SHALL identify deviations from it.

This prevents aggregate scores from hiding regressions.

---

# 35. Technical Performance Domain

The platform SHOULD collect and validate:

```text
DNS latency
TCP connection
TLS negotiation
TTFB
FCP
LCP
INP
CLS
TBT
render duration
main-thread blocking
long tasks
JavaScript cost
CSS cost
font loading
image loading
resource waterfall
```

Lab and field observations MUST remain separate.

---

# 36. Performance Context

Performance MUST retain:

```text
device
network
geography
browser
viewport
CPU profile
cache state
```

Performance from one context SHALL NOT silently represent another.

---

# 37. Performance Budgets

Targets SHOULD support enforceable budgets.

Examples:

```text
maximum JS bytes
maximum total transfer
maximum third-party transfer
maximum LCP
maximum TTFB
maximum long-task duration
```

---

# 38. Field Versus Synthetic

Support:

```text
SYNTHETIC
RUM
FIELD_AGGREGATE
```

These MUST NOT be mixed.

---

# 39. Crawlability Domain

Validate:

```text
robots.txt
robots meta
X-Robots-Tag
HTTP status
redirects
link crawlability
JS navigation
sitemap reachability
crawl traps
```

---

# 40. Indexability Domain

Evaluate:

```text
noindex
canonicalization
duplicate resources
soft 404s
index eligibility
sitemap consistency
canonical conflicts
```

Where external index evidence exists, distinguish:

```text
ELIGIBLE_FOR_INDEXING
OBSERVED_INDEXED
OBSERVED_NOT_INDEXED
UNKNOWN
```

---

# 41. Search Visibility Domain

Ingest independent SERP observations.

Context MUST include:

```text
query
engine
surface
location
language
device
timestamp
```

---

# 42. SERP Elements

Track:

```text
organic
paid
AI overview
AI mode
featured snippet
local pack
image
video
news
shopping
PAA
knowledge panel
other
```

---

# 43. Search Performance

Search Console or equivalent first-party data SHOULD remain separate from independently observed rankings.

Metrics:

```text
impressions
clicks
CTR
average_position
```

---

# 44. AI Readiness Domain

Validate:

```text
machine discoverability
raw HTML usability
rendered content
Markdown negotiation
structured data
agent protocols
capability discovery
machine policies
bot access
journey execution
```

Protocol presence SHALL NOT establish readiness.

---

# 45. AI Journey Validation

Representative tasks SHOULD be executed in a bounded environment.

Examples:

```text
determine what company does
identify product
find price
find documentation
locate CTA
understand signup requirements
```

---

# 46. Machine Representation Consistency

Compare:

```text
HTML
rendered DOM
JSON-LD
Markdown
API
MCP
agent metadata
```

Material factual conflicts MUST generate findings.

---

# 47. Content Domain

Evaluate:

```text
intent alignment
factual support
completeness
freshness
citations
originality
duplication
clarity
topic coverage
authors
dates
```

---

# 48. Claim Registry

Material claims MAY be extracted into:

```text
claim_id
claim_text
source
evidence
verification_state
freshness
```

Supported states:

```text
SUPPORTED
UNSUPPORTED
CONTRADICTED
INDETERMINATE
```

---

# 49. Information Architecture

Evaluate:

```text
navigation hierarchy
crawl depth
breadcrumbs
content clusters
orphan content
taxonomy
internal links
hub completeness
category duplication
```

---

# 50. Internal Link Graph

Maintain a directed graph:

```text
Page A → Page B
```

With attributes:

```text
anchor
context
placement
follow state
discovery source
```

---

# 51. Structured Data Domain

Discover:

```text
JSON-LD
Microdata
RDFa
```

Validate:

```text
syntax
schema type
properties
relationships
URLs
visible-content consistency
```

Google currently describes structured data as a standardized representation for helping systems understand page content and explicitly recommends validating deployed markup.

---

# 52. Structured Data Truthfulness

The validator SHALL compare structured information with visible representations.

Examples:

```text
price
availability
product name
organization
rating
author
date
```

A valid schema with contradictory facts SHALL fail the consistency condition.

---

# 53. Entity Domain

Determine whether the website establishes consistent identity for:

```text
organization
brand
products
services
people
locations
social identities
```

---

# 54. Entity Ambiguity

Detect materially conflicting:

```text
names
logos
domains
organization types
addresses
social identities
```

---

# 55. Accessibility Domain

The platform SHOULD support WCAG 2.2 conditions and clearly differentiate automated, semi-automated, and human-required evaluation.

WCAG 2.2 remains a W3C Recommendation and organizes requirements under perceivable, operable, understandable, and robust principles.

---

# 56. Accessibility Test Provenance

Accessibility conditions SHOULD indicate:

```text
normative_success_criterion
conformance_level
automatable
test_method
```

---

# 57. Accessibility Automation Boundary

The system SHALL NOT claim complete WCAG conformance based solely on automated tests.

Results SHOULD instead state:

```text
AUTOMATED_FAILURE
AUTOMATED_PASS
MANUAL_REVIEW_REQUIRED
NOT_TESTED
```

---

# 58. Conversion Domain

Evaluate observable conversion mechanics:

```text
value proposition
CTA
pricing
form friction
choice overload
trust evidence
objection handling
navigation
mobile conversion
```

Recommendations SHALL remain hypotheses unless supported by experiment evidence.

---

# 59. Viewport Testing

Conversion-relevant elements SHOULD be measured at multiple viewport sizes.

Examples:

```text
CTA visible without interaction
pricing visible
navigation obstruction
sticky overlay obstruction
```

---

# 60. Journey Domain

Define business journeys.

Example:

```text
Landing
→ Product
→ Pricing
→ Signup
→ Confirmation
```

A journey SHALL contain expected transitions.

---

# 61. Journey Step

Each step SHOULD specify:

```text
starting_state
action
expected_destination
expected_state_change
side_effect
timeout
```

---

# 62. Journey Result

Supported results:

```text
SUCCESS
PARTIAL
FAILED
BLOCKED
INDETERMINATE
```

---

# 63. Business-Critical Journeys

Targets SHOULD designate critical journeys.

Examples:

```text
SIGNUP
PURCHASE
CONTACT
BOOK
AUDIT_START
DEMO_REQUEST
PASSWORD_RESET
```

Failure of a critical journey SHOULD outrank cosmetic defects.

---

# 64. Analytics Domain

Validate implementation rather than merely presence.

Check:

```text
pageviews
events
session continuity
identity
source
campaign
forms
checkout
purchase
revenue
currency
transaction IDs
```

---

# 65. Event Registry

Analytics SHOULD be validated against a canonical event registry.

Required:

```text
event_id
event_name
version
business_definition
trigger_definition
required_fields
optional_fields
```

---

# 66. Semantic Event Validation

Example:

```text
audit_started
```

MUST only fire when the business-defined audit-start condition occurs.

Page load SHALL NOT count unless explicitly defined that way.

---

# 67. Duplicate Event Detection

Detect:

```text
duplicate pageviews
duplicate purchases
double form events
SPA re-fire
tag-manager duplication
```

---

# 68. Attribution Domain

Validate continuity:

```text
acquisition
→ landing
→ session
→ journey
→ conversion
→ revenue
```

---

# 69. Attribution Preservation

Check:

```text
UTMs
referrer
click IDs
cross-domain state
subdomain transition
checkout provider return
redirects
```

---

# 70. Authority / Backlink Domain

Track:

```text
referring domains
links
mentions
link context
anchor
attributes
page quality
relevance
link changes
```

Do not equate all links.

---

# 71. Backlink Provenance

Every backlink observation SHOULD include:

```text
source URL
target URL
anchor
attributes
first seen
last seen
observation source
```

---

# 72. Security Domain

External security posture SHOULD include non-invasive checks such as:

```text
TLS
HSTS
CSP
cookie flags
CORS
mixed content
security headers
exposed secrets
sensitive files
```

The platform MUST NOT present external validation as equivalent to penetration testing.

---

# 73. Remote Scanner SSRF Protection

All remote fetch infrastructure MUST prevent SSRF.

At minimum:

```text
allow HTTP/HTTPS only
resolve DNS before connection
reject private/reserved addresses
revalidate after redirects
re-resolve DNS
prevent alternative IP encodings
block localhost
block cloud metadata destinations
enforce outbound network policy
```

OWASP identifies applications that fetch user-supplied URLs as a classic SSRF risk pattern.

---

# 74. Fetch Isolation

Remote crawling SHOULD execute inside isolated workers with:

```text
restricted egress
no internal-network access
no cloud metadata access
resource limits
execution timeout
```

---

# 75. Privacy Domain

Observe:

```text
cookies
trackers
consent state
third-party requests
form collection
policy links
consent withdrawal
```

The platform SHALL distinguish:

```text
TECHNICAL_OBSERVATION
```

from:

```text
LEGAL_COMPLIANCE_DETERMINATION
```

unless an explicitly qualified legal ruleset exists.

---

# 76. Consent Testing

Compare network activity:

```text
before consent
after reject
after accept
after withdrawal
```

This allows detection of technical contradictions.

---

# 77. Reliability Domain

Measure:

```text
availability
HTTP failures
DNS failures
TLS failures
timeouts
API failures
dependency failures
```

---

# 78. Multi-Region Observation

Where required, run availability from multiple regions.

Regional failure SHALL not be generalized globally without evidence.

---

# 79. Synthetic Monitoring

Critical journeys SHOULD support recurring synthetic execution.

Examples:

```text
homepage loads
pricing loads
signup works
audit completes
checkout reachable
```

---

# 80. Degraded Mode Validation

Where safe, simulate:

```text
third-party unavailable
analytics unavailable
JavaScript disabled
cookie rejected
API timeout
image failure
```

Record resulting functionality.

---

# 81. Mobile Domain

Validate mobile independently.

Check:

```text
layout
viewport
touch targets
forms
keyboard behavior
navigation
sticky elements
horizontal overflow
performance
```

Desktop results SHALL NOT substitute for mobile observations.

---

# 82. Social Distribution Domain

Validate:

```text
Open Graph
X/Twitter metadata
preview image
title
description
canonical identity
image fetchability
```

---

# 83. Local Domain

For applicable sites:

```text
business name
address
phone
hours
local schema
location pages
local search visibility
```

---

# 84. Internationalization

Validate:

```text
lang
hreflang
canonical relationships
translations
currency
locale
country variants
language navigation
```

---

# 85. Commerce Domain

For transactional sites, validate:

```text
product
price
currency
inventory
variant
shipping
returns
cart
checkout
payment
confirmation
```

---

# 86. Commerce Consistency

Compare commercial facts across:

```text
visible page
schema
API
cart
checkout
```

Price contradictions SHOULD generally be high severity.

---

# 87. Transaction Boundary

The system SHOULD identify:

```text
PREVIEW
REVIEW
AUTHORIZE
EXECUTE
CONFIRM
```

for high-impact transactions.

---

# 88. Active Test Safety

Production scans SHALL NOT automatically:

```text
purchase
delete
cancel
send
publish
create externally visible content
```

without explicit test authorization.

---

# 89. Media Domain

Validate images for:

```text
format
compression
dimensions
responsive variants
alt text
loading strategy
intrinsic sizing
```

Validate video for:

```text
captions
poster
transcript
preload
structured metadata
```

---

# 90. Third-Party Dependency Domain

Inventory dependencies such as:

```text
analytics
advertising
chat
payments
identity
fonts
widgets
CDNs
tag managers
```

---

# 91. Dependency Graph

Model:

```text
Website
→ Dependency
→ External Provider
```

Store:

```text
purpose
blocking state
performance cost
failure effect
privacy effect
```

---

# 92. Experimentation Domain

Validate experiments for:

```text
assignment
exposure
sample ratio
duration
instrumentation
variant persistence
metric definition
concurrent experiments
```

---

# 93. Experiment State

Use:

```text
PLANNED
RUNNING
COMPLETED
INVALID
INCONCLUSIVE
```

---

# 94. Experiment Causality

The platform SHALL NOT infer:

```text
change happened before improvement
=
change caused improvement
```

Experiment design and confounders MUST be considered.

---

# 95. Change Impact Domain

The system SHOULD correlate deployment events with subsequent observations.

Inputs MAY include:

```text
release
commit
deployment
content change
configuration change
```

---

# 96. Change Diff

After deployment:

```text
BASELINE
→ DEPLOY
→ REOBSERVE
→ COMPARE
```

Validate:

```text
performance
crawlability
schema
accessibility
analytics
conversion
AI readiness
```

---

# 97. Reputation Domain

Track observable:

```text
brand mentions
reviews
linked mentions
unlinked mentions
media references
community discussion
```

Sentiment SHALL be explicitly probabilistic where model-derived.

---

# 98. Competitive Context

Competitors SHOULD exist in a versioned registry.

Comparison domains MAY include:

```text
SERPs
content
backlinks
performance
schema
AI citations
pricing
site structure
```

---

# 99. Competitive Observation

Valid finding:

> 8 of 10 observed competitors expose dedicated comparison pages.

Invalid automatic conclusion:

> Target must create comparison pages.

The latter is a hypothesis.

---

# 100. Severity Model

Severity SHOULD represent consequence.

Recommended:

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

Severity SHOULD consider:

```text
business impact
scope
reproducibility
user impact
visibility impact
revenue impact
risk
```

---

# 101. Priority

Priority SHALL remain separate from severity.

Example:

```text
HIGH severity
LOW immediate priority
```

may be legitimate if the affected function is unused.

---

# 102. Confidence

Every non-trivial determination SHOULD carry confidence.

Inputs MAY include:

```text
observation completeness
repeatability
sample size
data freshness
source agreement
classifier confidence
```

---

# 103. Confidence States

Recommended:

```text
HIGH
MEDIUM
LOW
INDETERMINATE
```

Avoid meaningless false precision.

---

# 104. Scoring

Aggregate scoring MAY exist for usability.

It SHALL NOT be canonical.

The primary representation SHALL remain:

```text
applicable conditions
passes
failures
warnings
indeterminate
not tested
```

---

# 105. Domain Scores

If scores exist:

```text
Performance
Search
Conversion
Accessibility
etc.
```

SHALL remain independently visible.

---

# 106. Scoring Transparency

Every score MUST expose:

```text
input conditions
weights
formula
score_version
applicability denominator
```

No opaque scores.

---

# 107. Score Versioning

Changing scoring logic SHALL create a new:

```text
score_version
```

Historical scores SHALL remain reproducible.

---

# 108. No Universal Denominator

Different website profiles SHALL have different applicable condition counts.

Example:

```text
Blog: 124 applicable
SaaS: 181 applicable
Ecommerce: 247 applicable
```

A missing commerce protocol SHALL not penalize a blog.

---

# 109. Condition Dependencies

Conditions MAY depend on other conditions.

Example:

```text
PRODUCT_PRICE_CONSISTENCY
```

requires:

```text
PRODUCT_PAGE_PRESENT
```

---

# 110. Evidence Graph

The preferred model SHOULD support relationships such as:

```text
Target
 ↓
Resource
 ↓
Observation
 ↓
Determination
 ↓
Finding
 ↓
Hypothesis
 ↓
Recommendation
 ↓
Change
 ↓
Reobservation
 ↓
Outcome
```

---

# 111. Business Outcome Layer

The platform SHOULD ingest business metrics where available.

Examples:

```text
sessions
leads
signups
orders
revenue
retention
```

These SHALL remain observations rather than proof of causality.

---

# 112. Outcome Evaluation

A remediation MAY produce:

```text
TECHNICAL_SUCCESS
BUSINESS_IMPROVEMENT
NO_OBSERVED_CHANGE
NEGATIVE_OUTCOME
INSUFFICIENT_EVIDENCE
CONFOUNDED
```

Technical success and business success SHALL remain distinct.

---

# 113. Discovery Planner

The platform SHALL determine what resources to crawl.

Inputs MAY include:

```text
homepage
sitemap
internal links
known routes
Search Console
analytics
user-provided URLs
```

---

# 114. Crawl Scope

Scans MUST support hard limits:

```text
maximum pages
maximum depth
maximum duration
maximum bytes
maximum requests
maximum concurrency
```

---

# 115. Crawl Prioritization

Priority SHOULD consider:

```text
business importance
traffic
conversion role
search visibility
change recency
historical defects
```

---

# 116. Adaptive Scanning

The platform MAY increase observation frequency when:

```text
regression detected
active experiment
recent deployment
major visibility change
business-critical failure
```

Budgets MUST constrain adaptive behaviour.

---

# 117. Cost Accounting

All external operations SHOULD have attributable cost.

Track by:

```text
target
scan
domain
collector
provider
condition
```

---

# 118. Budget Enforcement

Support:

```text
daily
monthly
per-site
per-domain
per-provider
```

budgets.

Hard limits SHOULD fail closed.

---

# 119. AI Evaluation Governance

Models MAY perform:

```text
content classification
semantic comparison
intent analysis
journey interpretation
recommendation drafting
```

AI SHALL NOT override deterministic conditions.

---

# 120. Model Provenance

Each AI result MUST include:

```text
provider
model
model_version
prompt_version
input evidence
configuration
timestamp
```

---

# 121. AI Reproducibility

Where exact deterministic replay is impossible, the platform SHALL preserve enough information to reconstruct:

```text
input
prompt
model
configuration
output
```

---

# 122. Model Disagreement

High-impact semantic determinations SHOULD optionally support repeated or multi-model evaluation.

Disagreement SHOULD decrease confidence.

---

# 123. AI Output Status

AI-generated conclusions SHOULD be distinguishable from deterministic facts.

Example:

```text
MODEL_DETERMINATION
```

rather than:

```text
FACT
```

---

# 124. User-Defined Conditions

Advanced users SHOULD be able to define organization-specific conditions.

These MUST remain namespace-separated from canonical conditions.

Example:

```text
CUSTOM-NEBULA-001
```

---

# 125. CI Integration

The platform SHOULD expose validation through CI/CD.

Workflow:

```text
build
→ deploy preview
→ validate
→ compare baseline
→ evaluate gates
→ release
```

---

# 126. CI Gates

Projects MAY define:

```text
no new critical failures
no new high failures
performance budget not exceeded
analytics journey still valid
critical conversion journey passes
```

---

# 127. Gate Determinism

Release gates SHOULD use deterministic conditions where possible.

Model judgment SHOULD NOT normally be the sole blocker for production deployment.

---

# 128. API

Canonical endpoints SHOULD include:

```text
/targets
/scans
/resources
/observations
/conditions
/determinations
/findings
/recommendations
/journeys
/evidence
/diffs
/outcomes
```

---

# 129. Historical API

Historical state MUST support explicit:

```text
as_of
```

semantics.

---

# 130. Output Formats

Support:

```text
JSON
HTML
Markdown
SARIF
CSV
```

where applicable.

---

# 131. Webhook / Event Integration

Emit events for:

```text
scan.completed
finding.opened
finding.regressed
finding.resolved
critical.detected
journey.failed
baseline.changed
```

---

# 132. Audit Log

Significant platform actions SHALL produce append-only audit events.

Examples:

```text
scan requested
baseline approved
condition updated
finding accepted
recommendation approved
suppression applied
```

---

# 133. Tenant Isolation

The platform MUST enforce tenant isolation across:

```text
targets
evidence
credentials
integrations
reports
users
```

---

# 134. Credential Handling

Connected systems MAY require:

```text
Search Console
GA4
analytics
CDN
CI
CMS
```

Credentials SHALL be:

```text
encrypted
scoped
rotatable
auditable
```

---

# 135. Authorization

Support role and capability-based authorization.

Example permissions:

```text
READ_SCAN
RUN_SCAN
MANAGE_TARGET
VIEW_EVIDENCE
APPROVE_BASELINE
MANAGE_CREDENTIALS
AUTHORIZE_ACTIVE_TEST
```

---

# 136. Active Capability Boundary

Observation authority SHALL NOT automatically confer mutation authority.

Scanning a site MUST NOT imply permission to:

```text
submit forms
create accounts
modify data
place orders
```

---

# 137. Data Retention

Define independent retention for:

```text
raw HTML
screenshots
DOM
network traces
normalized observations
findings
reports
audit logs
```

---

# 138. Data Rights

The system SHALL distinguish between:

```text
publicly accessible
retrievable
storable
redistributable
licensed
```

These MUST NOT be treated synonymously.

---

# 139. Provider Licensing

Third-party data providers SHALL retain:

```text
source
license constraints
retention constraints
redistribution constraints
```

---

# 140. Platform Observability

The validator itself SHALL expose:

```text
scan success
queue latency
collector errors
browser failures
condition errors
provider failures
model failures
storage growth
cost
```

---

# 141. Condition Health

Track:

```text
execution_count
error_rate
unknown_rate
failure_rate
runtime
```

for each condition.

This can identify broken validators.

---

# 142. Parser Drift

The system SHOULD detect sudden changes in:

```text
unknown DOM structures
unknown schema types
unknown protocols
parser errors
```

---

# 143. Historical Replay

Preserved raw evidence SHOULD be replayable against:

```text
new parsers
new condition versions
new classifiers
```

without pretending that the historical observation itself changed.

---

# 144. Replay Semantics

Replay SHALL produce:

```text
NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE
```

not:

```text
NEW_OBSERVATION
```

---

# 145. Evidence Sampling

The system SHOULD periodically compare:

```text
raw evidence
normalized evidence
determination
```

for integrity.

---

# 146. Failure Handling

Collector failure MUST be represented explicitly.

Examples:

```text
DNS_FAILED
TLS_FAILED
TIMEOUT
BLOCKED
CAPTCHA
RATE_LIMITED
PARSER_FAILED
PROVIDER_FAILED
```

None SHALL silently become condition failure.

---

# 147. Unknowns

The platform MUST support:

```text
UNKNOWN
INDETERMINATE
UNSUPPORTED
```

as first-class states.

Forced certainty is prohibited.

---

# 148. Primary UI Views

The platform SHOULD expose:

### Executive View

Business-level material findings and trends.

### Engineering View

Conditions, evidence, resources, regressions.

### Growth View

Visibility, acquisition, conversion, attribution.

### Resource View

Complete state of a URL/resource.

### Journey View

End-to-end business flow.

### Evidence View

Underlying observations.

### Change View

Before/after validation.

---

# 149. Finding Presentation

Every finding SHOULD clearly answer:

```text
What was observed?
What condition failed?
Where?
Why does it matter?
How certain are we?
What evidence proves it?
How could it be corrected?
How will correction be verified?
```

---

# 150. No Generic Advice

Recommendations SHOULD reference the actual resource and condition.

Avoid:

> Improve page speed.

Prefer:

> `/pricing` has an observed mobile LCP regression from 2.1s to 4.3s. The LCP element is the hero image and began after release X.

---

# 151. Claim Discipline

The platform MUST avoid unsupported statements such as:

```text
This will improve rankings.
This will increase conversion.
Google penalizes this.
AI systems prefer this.
```

unless demonstrable evidence or authoritative requirements support the statement.

---

# 152. Improvement Attribution

When an intervention is followed by improvement:

```text
TEMPORAL_ASSOCIATION
```

SHALL be distinguished from:

```text
CAUSALLY_SUPPORTED
```

---

# 153. Platform Success Metrics

Measure platform effectiveness through:

```text
findings verified
false-positive rate
revalidation rate
regressions detected
critical journeys protected
time-to-detection
time-to-resolution
condition coverage
evidence completeness
```

Do not optimize for number of findings.

---

# 154. Anti-Goal

The platform SHALL NOT optimize for:

```text
maximum issues generated
maximum recommendations
highest apparent complexity
highest aggregate score
```

---

# 155. Acceptance Test: Evidence

Given any finding, the system MUST be able to traverse:

```text
Finding
→ Determination
→ Condition version
→ Observation
→ Raw evidence
→ Collector configuration
```

---

# 156. Acceptance Test: Reproduction

Given preserved evidence plus evaluator versions, the system MUST reproduce deterministic historical determinations.

---

# 157. Acceptance Test: Applicability

A content-only website MUST NOT lose score or readiness because ecommerce-specific conditions are `NOT_APPLICABLE`.

---

# 158. Acceptance Test: Failure Isolation

A failed browser collector MUST NOT cause:

```text
PAGE_MISSING
```

unless independent evidence proves the page is missing.

---

# 159. Acceptance Test: Revalidation

When a defect is corrected, the platform MUST:

1. reobserve the target;
2. execute the same condition version;
3. compare against the predecessor determination;
4. establish PASS or FAIL;
5. preserve both observations.

---

# 160. Acceptance Test: Regression

If a previously passing condition fails after a deployment, the platform MUST identify the regression independently of the aggregate website score.

---

# 161. Acceptance Test: Contradiction

If structured data says:

```text
price = $49
```

and visible content says:

```text
price = $99
```

the system MUST identify the contradiction even though both representations are syntactically valid.

---

# 162. Acceptance Test: Analytics

If a purchase event fires twice for one transaction, the platform MUST distinguish:

```text
tracking implementation works
```

from:

```text
measurement semantics are invalid
```

---

# 163. Acceptance Test: Journey

A website returning HTTP 200 for every page MUST still fail a business journey when the user cannot successfully complete the intended action.

---

# 164. Acceptance Test: AI

A machine protocol that advertises an unavailable capability MUST fail capability validation even if its discovery document is valid.

---

# 165. Acceptance Test: Security

A scanner target resolving to a private or reserved IP MUST be refused before connection.

Redirects to prohibited networks MUST also be refused.

---

# 166. Acceptance Test: Uncertainty

When required evidence cannot be obtained, the platform MUST emit:

```text
INDETERMINATE
```

or:

```text
NOT_TESTED
```

rather than fabricate a result.

---

# 167. Platform Architecture

Recommended logical architecture:

```text
                     ┌─────────────────────────┐
                     │      Target Registry    │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │    Observation Planner  │
                     └────────────┬────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       HTTP Collectors      Browser Collectors   External Sources
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │ Immutable Evidence Store│
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │     Normalization       │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │ Canonical Observation   │
                     │        Graph            │
                     └────────────┬────────────┘
                                  │
        ┌─────────────┬───────────┼────────────┬─────────────┐
        ▼             ▼           ▼            ▼             ▼
 Performance       Search        AI          Journey       Security
        │             │           │            │             │
        └─────────────┴───────────┼────────────┴─────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │     Determinations      │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │        Findings         │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │       Hypotheses        │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │    Recommendations      │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │    Change / Experiment  │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │      Reobservation      │
                     └────────────┬────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │        Outcomes         │
                     └─────────────────────────┘
```

Cross-cutting subsystems:

```text
Condition Registry
Standards Registry
Evidence Provenance
Versioning
Audit
Authentication
Authorization
Tenant Isolation
Budget Enforcement
Observability
Provider Abstraction
Lifecycle Management
```

---

# 168. Canonical Decision Chain

The platform SHALL enforce:

```text
OBSERVE
   ↓
NORMALIZE
   ↓
EVALUATE
   ↓
DETERMINE
   ↓
FIND
   ↓
HYPOTHESIZE
   ↓
RECOMMEND
   ↓
AUTHORIZE
   ↓
CHANGE
   ↓
REOBSERVE
   ↓
VERIFY
   ↓
LEARN
```

No AI or workflow component SHOULD bypass these boundaries.

---

# 169. Product Boundary

The platform is not:

```text
an SEO checker
a Lighthouse clone
an accessibility scanner
a CRO score
an AI readiness quiz
a backlink checker
```

Those are validation domains.

The product is:

> A continuous evidence-backed system for establishing whether a website can be discovered, understood, used, trusted, converted through, measured, and improved, with every determination traceable to reproducible evidence.

---

# 170. Recommended Initial Production Scope

A practical first production release SHOULD prioritize:

```text
1. Shared Evidence Acquisition
2. Condition Registry
3. Crawl / Indexability
4. Technical Performance
5. Structured Data
6. Accessibility
7. AI Readiness
8. Conversion
9. Journey Validation
10. Analytics Integrity
11. Search / SERP Visibility
12. Revalidation / Regression
```

Authority, reputation, internationalization, local visibility, experimentation, and deeper commerce validation can then build on the same substrate.

The crucial constraint is:

> No domain should be implemented in a way that requires rebuilding the evidence architecture later.
