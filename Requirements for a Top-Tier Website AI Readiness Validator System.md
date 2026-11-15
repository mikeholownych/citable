# Website AI Readiness Validator

## 1. Purpose

The system SHALL determine how effectively a website can be discovered, interpreted, navigated, and operated by AI agents.

The system SHALL evaluate:

```text
DISCOVERABILITY
READABILITY
SEMANTIC_CLARITY
STRUCTURED_DATA
CONTENT_GROUNDING
AGENT_CONTROL
CAPABILITY_DISCOVERY
AUTHENTICATION
INTERACTION
TRANSACTION
SAFETY
RELIABILITY
OBSERVABILITY
```

The validator SHALL NOT reduce AI readiness to the presence of files, headers, or emerging protocols.

---

# 2. Core Question

The system must answer:

> Can an AI agent correctly determine what this site represents, what it offers, what it is permitted to access, what actions it can perform, how those actions work, and whether the resulting state can be verified?

The system SHALL separately answer:

```text
Can agents find it?
Can agents read it?
Can agents understand it?
Can agents trust the representation?
Can agents navigate it?
Can agents use it?
Can agents authenticate?
Can agents transact?
Can site owners control agent behaviour?
Can actions be safely verified?
```

These are different properties.

---

# 3. Site Classification

Before assessment, the validator MUST classify the site.

Supported types SHOULD include:

```text
CONTENT
MARKETING
SAAS
API
ECOMMERCE
MARKETPLACE
DOCUMENTATION
NEWS
COMMUNITY
DIRECTORY
LOCAL_BUSINESS
WEB_APPLICATION
HYBRID
UNKNOWN
```

Multiple classifications SHALL be permitted.

Example:

```text
MARKETING + SAAS + API
```

The applicable validation suite MUST depend on site capabilities.

An informational blog SHALL NOT lose readiness merely because it does not expose OAuth or MCP.

---

# 4. Applicability Model

Every condition SHALL support:

```text
PASS
FAIL
WARNING
INDETERMINATE
NOT_APPLICABLE
NOT_TESTED
```

`NOT_APPLICABLE` MUST NOT negatively affect the result.

Example:

```text
x402 commerce support

Content-only blog:
NOT_APPLICABLE

Agentic marketplace:
APPLICABLE
```

---

# 5. Evidence First

Every determination MUST originate from observable evidence.

Required lineage:

```text
Observation
→ Condition
→ Determination
→ Finding
→ Recommendation
```

No recommendation SHALL exist without its supporting observations.

---

# 6. Observation Integrity

Every observation SHALL contain:

```text
observation_id
target
requested_url
resolved_url
timestamp
collector
collector_version
request_headers
response_status
response_headers
response_body_hash
redirect_chain
duration
```

Where appropriate:

```text
raw_response
DOM_snapshot
screenshot
rendered_text
network_trace
```

Raw evidence SHOULD be immutable.

---

# 7. Scan Reproducibility

A scan SHALL produce:

```text
scan_id
site
started_at
completed_at
validator_version
condition_registry_version
collector_version
browser_version
configuration
```

Given the same preserved evidence and rule versions, historical determinations MUST be reproducible.

---

# 8. Discoverability

Baseline checks SHALL include the Cloudflare-style discovery layer:

```text
robots.txt
sitemap.xml
sitemap indexes
HTTP Link headers
DNS-AID
```

Cloudflare currently includes these within its Discoverability checks.

But the validator SHOULD go further.

---

# 9. robots.txt Validation

Validate:

```text
existence
HTTP status
syntax
crawlability
sitemap declarations
user-agent targeting
AI-agent rules
conflicting rules
unexpected global blocks
```

The system MUST distinguish:

```text
missing
valid
invalid
unreachable
redirected
contradictory
```

---

# 10. AI Crawler Policy Analysis

The validator SHOULD inspect rules targeting known AI crawler identities.

It SHOULD identify:

```text
explicit_allow
explicit_block
implicit_allow
conflicting_policy
unknown_policy
```

Policy support SHOULD include configurable bot registries rather than hard-coded names.

The bot registry MUST be versioned.

---

# 11. Sitemap Validation

Evaluate:

```text
presence
accessibility
valid XML
declared URLs
canonical consistency
HTTP status
lastmod validity
nested sitemap indexes
orphan URLs
unexpected URLs
```

The validator SHOULD sample sitemap URLs and compare them against actual responses.

---

# 12. Discovery Completeness

The system SHOULD determine whether major machine-readable resources are discoverable from:

```text
homepage
robots.txt
Link headers
well-known resources
DNS
sitemap
HTML metadata
```

A resource existing at an obscure URL SHALL NOT automatically count as discoverable.

---

# 13. Link Header Validation

Validate HTTP `Link` headers for:

```text
syntax
target existence
relationship type
duplicate relationships
invalid targets
redirect behaviour
```

Presence alone is insufficient.

---

# 14. Content Accessibility

The Cloudflare reference tests Markdown content negotiation.

The enhanced validator SHALL evaluate multiple content retrieval strategies.

---

# 15. HTML Without JavaScript

Fetch pages without executing JavaScript.

Determine whether the response contains meaningful:

```text
title
headings
main content
navigation
links
product information
pricing
calls to action
```

The validator SHOULD flag:

```text
JS_ONLY_CONTENT
EMPTY_APP_SHELL
CRITICAL_CONTENT_HIDDEN_BEHIND_JS
```

---

# 16. Rendered Browser Comparison

The validator SHOULD compare:

```text
raw HTML
vs
rendered DOM
```

and calculate material content divergence.

Important divergence examples:

```text
pricing only appears after JavaScript
links injected dynamically
content hidden behind hydration
form fields created client-side
structured data injected late
```

---

# 17. Markdown Negotiation

Test:

```http
Accept: text/markdown
```

Where Markdown is supported, validate:

```text
Content-Type
status
canonical identity
content completeness
link preservation
heading hierarchy
semantic equivalence
```

A `200 OK` returning broken Markdown SHALL NOT pass.

---

# 18. Markdown Equivalence

The system SHOULD compare HTML and Markdown representations.

Check whether material facts differ:

```text
product names
pricing
features
availability
policy
contact information
links
```

Semantic divergence SHOULD generate a finding.

---

# 19. Text Extraction Quality

The system SHALL assess whether an agent can distinguish:

```text
main content
navigation
advertising
footer
boilerplate
legal text
related content
user-generated content
```

The validator SHOULD flag excessive extraction noise.

---

# 20. Semantic HTML

Evaluate appropriate use of:

```text
main
nav
article
section
aside
header
footer
form
button
label
table
```

Incorrect semantics SHOULD be reported where they materially affect machine understanding.

---

# 21. Heading Structure

Validate:

```text
H1 presence
heading hierarchy
duplicate H1
empty headings
visual heading without semantic heading
```

Do NOT require arbitrary stylistic conventions where no machine-readability impact exists.

---

# 22. Accessible Naming

Interactive controls SHOULD expose machine-readable names through:

```text
visible labels
label elements
aria-label
aria-labelledby
```

Flag controls whose purpose cannot be determined.

---

# 23. Structured Data

The validator SHALL discover and parse:

```text
JSON-LD
Microdata
RDFa
```

Schema.org types SHOULD be identified.

---

# 24. Structured Data Validation

Check:

```text
syntax
schema validity
required/recommended properties
URL consistency
entity relationships
duplicate/conflicting entities
```

Important types MAY include:

```text
Organization
WebSite
WebPage
Product
Offer
Service
LocalBusiness
Article
Person
FAQPage
BreadcrumbList
SoftwareApplication
Event
Review
```

---

# 25. Structured Data Truthfulness

The validator SHOULD compare structured representation against visible content.

Example:

```text
JSON-LD price = $49
visible price = $79
```

Result:

```text
STRUCTURED_DATA_CONFLICT
```

This should be treated substantially more seriously than missing markup.

---

# 26. Entity Identity

The system SHOULD evaluate whether the site clearly establishes:

```text
organization identity
brand
products
services
people
locations
canonical URLs
```

Entity references SHOULD be internally consistent.

---

# 27. Business Understanding

An AI readiness validator should test whether the site communicates basic business facts unambiguously.

Examples:

```text
What does this organization do?
Who is the product for?
What does the product cost?
What geographic markets are served?
How is the company contacted?
What is the primary conversion action?
```

Failure to determine these SHOULD produce explicit findings.

---

# 28. Factual Extraction Tests

The validator SHOULD define deterministic or constrained extraction questions.

Example:

```text
QUESTION:
What is the cheapest paid plan?

EXPECTED SOURCE:
pricing page

OBSERVED ANSWER:
$97

SOURCE EVIDENCE:
URL + text span
```

The objective is not to grade an LLM's eloquence.

It is to determine whether the website provides sufficient evidence to answer reliably.

---

# 29. Cross-Page Consistency

The validator SHOULD test important facts across:

```text
homepage
pricing
product pages
FAQ
documentation
structured data
Markdown
API metadata
```

Detect:

```text
CONTRADICTORY_PRICE
CONTRADICTORY_PRODUCT_NAME
CONTRADICTORY_FEATURE
CONTRADICTORY_POLICY
```

---

# 30. Content Provenance

Where feasible, the validator SHOULD identify:

```text
author
publisher
publication date
updated date
canonical URL
citations
source references
```

Missing provenance SHOULD be differentiated from inaccurate provenance.

---

# 31. Freshness

Check machine-readable and visible freshness signals.

Examples:

```text
datePublished
dateModified
sitemap lastmod
HTTP Last-Modified
```

Conflicting freshness signals SHOULD be reported.

---

# 32. Canonicalization

Validate:

```text
rel=canonical
redirect destination
sitemap URL
OpenGraph URL
structured-data URL
hreflang URL
```

Conflicting canonical identities reduce machine confidence.

---

# 33. Duplicate Content

The validator SHOULD identify materially duplicated content under different URLs.

Distinguish legitimate variants from accidental duplication.

---

# 34. Language

Validate:

```text
HTML lang
Content-Language
hreflang
content language
structured-data language
```

Report contradictions.

---

# 35. Navigation Readiness

An agent SHOULD be capable of traversing major site functions.

Validate:

```text
real anchor links
crawlable navigation
meaningful link text
navigation hierarchy
breadcrumbs
pagination
```

---

# 36. Link Purpose

Flag ambiguous high-value navigation such as repeated:

```text
Click here
Learn more
Read more
```

where machine context cannot reliably differentiate destination purpose.

---

# 37. Orphan Detection

Identify important pages present in sitemaps or internal inventories but unreachable through normal navigation.

---

# 38. Interactive Controls

The validator SHALL inventory:

```text
links
buttons
forms
dialogs
menus
tabs
search
filters
selectors
checkout controls
```

Each SHOULD have an identifiable purpose.

---

# 39. Form Readiness

Forms SHOULD be evaluated for:

```text
labels
field names
input types
required state
autocomplete
validation
errors
submission target
success state
```

An agent should be capable of determining what values belong in each field.

---

# 40. Form Safety

The validator MUST distinguish:

```text
read-only interaction
reversible action
state mutation
financial action
destructive action
```

Example:

```text
search = READ_ONLY

newsletter signup = STATE_MUTATION

purchase = FINANCIAL

delete account = DESTRUCTIVE
```

---

# 41. Confirmation Semantics

High-impact actions SHOULD have machine-detectable confirmation boundaries.

The validator SHOULD determine whether an agent can distinguish:

```text
preview
review
confirm
execute
success
```

A purchase button whose consequence is ambiguous SHOULD generate a warning.

---

# 42. Action Outcome Verification

After an action, the site SHOULD expose a verifiable outcome.

Examples:

```text
order ID
booking ID
success status
updated state
receipt
confirmation page
API response
```

The agent MUST NOT have to infer success solely because the UI changed.

---

# 43. Error Semantics

Validate whether errors expose meaningful information.

Bad:

```text
Something went wrong.
```

Better machine-readable states include:

```text
invalid_input
authentication_required
insufficient_permission
out_of_stock
rate_limited
payment_failed
```

---

# 44. Authentication Discovery

Where applicable, validate:

```text
OAuth metadata
OAuth Protected Resource metadata
Auth.md
```

These are among the protocol-discovery checks used by isitagentready.com.

---

# 45. Authentication Correctness

Presence SHALL NOT equal readiness.

The validator SHOULD verify:

```text
valid JSON
required properties
issuer consistency
endpoint reachability
HTTPS
scope declaration
resource identity
```

---

# 46. Authorization Semantics

Where APIs or agent interfaces expose actions, the validator SHOULD determine whether permissions are identifiable.

Examples:

```text
READ_PROFILE
READ_ORDER
CREATE_ORDER
CANCEL_ORDER
ADMIN
```

Ambiguous unrestricted capabilities SHOULD be flagged.

---

# 47. Capability Discovery

Check applicable discovery mechanisms including:

```text
API Catalog
MCP Server Card
A2A Agent Card
Agent Skills
WebMCP
ARD
```

Cloudflare currently includes these protocols within its protocol discovery category.

---

# 48. API Catalog

Validate API catalog metadata where present.

Check:

```text
syntax
API description links
OpenAPI references
availability
versioning
authentication references
```

---

# 49. MCP Discovery

Where an MCP Server Card exists, validate:

```text
schema
endpoint
transport
server identity
capabilities
authentication
```

The system SHOULD optionally perform a controlled connection test.

Cloudflare's own reference site exposes a stateless MCP endpoint and publishes Agent Skills as part of demonstrating its own agent readiness.

---

# 50. MCP Capability Validation

A deeper validator SHOULD NOT stop at MCP discovery.

It SHOULD inspect:

```text
tools
resources
prompts
input schemas
descriptions
authorization requirements
```

Malformed, misleading, or dangerous tool definitions SHOULD generate findings.

---

# 51. Tool Semantics

Every machine-exposed tool SHOULD clearly describe:

```text
purpose
inputs
required inputs
side effects
result
errors
authorization
```

---

# 52. Side-Effect Classification

MCP, WebMCP, API, or A2A operations SHOULD be categorized by effect:

```text
READ
CREATE
UPDATE
DELETE
FINANCIAL
COMMUNICATION
PRIVILEGE_CHANGE
```

---

# 53. Idempotency

State-mutating operations SHOULD expose appropriate idempotency semantics.

Duplicate agent retries MUST NOT unintentionally:

```text
place duplicate orders
submit duplicate forms
send duplicate messages
create duplicate accounts
```

---

# 54. Agent Skills Validation

Where Agent Skills are exposed, validate:

```text
index
skill existence
metadata
instructions
referenced endpoints
input descriptions
output descriptions
```

Skill documentation MUST correspond to actual site behaviour.

---

# 55. A2A Validation

Where Agent-to-Agent discovery exists, validate:

```text
agent identity
capabilities
endpoint
authentication
supported tasks
```

A declared capability that cannot actually be invoked SHOULD fail validation.

---

# 56. WebMCP

Where WebMCP is exposed, inspect browser-side tools.

Validate:

```text
tool registration
tool names
descriptions
input schemas
side effects
availability
```

Browser-only capability MUST be identified as such.

---

# 57. ARD

Where Agentic Resource Discovery metadata exists, validate:

```text
schema
resources
relationships
URLs
availability
```

---

# 58. Bot Access Control

Validate:

```text
AI crawler rules
Content Signals
Web Bot Auth
```

These correspond to the current Cloudflare reference scanner's bot-control layer.

---

# 59. Policy Consistency

The validator MUST check for contradictions.

Example:

```text
robots.txt:
Allow: /

Content Signals:
train=no

Web Bot Auth:
authenticated clients only
```

These may represent different policy dimensions.

The system SHOULD explain rather than collapse them into one pass/fail state.

---

# 60. Authenticated Bot Identity

Where Web Bot Auth exists, validate:

```text
credential discovery
key validation
identity verification
failure behaviour
```

---

# 61. Rate-Limit Behaviour

Test reasonable request patterns.

Detect:

```text
429 responses
Retry-After
silent connection termination
WAF challenge
CAPTCHA
block pages
```

Agent readiness is degraded when legitimate machine traffic cannot determine how to recover.

---

# 62. WAF / Anti-Bot Compatibility

Determine whether automated clients encounter:

```text
CAPTCHA
JavaScript challenges
browser integrity checks
cookie challenges
geo blocks
```

The validator SHOULD differentiate intentional access denial from accidental incompatibility.

---

# 63. Commerce Applicability

Commerce tests SHALL only apply to sites with commercial transaction functionality.

The Cloudflare reference currently checks protocols including x402, MPP, UCP and ACP.

---

# 64. Product Readiness

For commerce sites, determine whether products expose:

```text
name
description
SKU
price
currency
availability
shipping
variant
seller
return terms
```

---

# 65. Price Consistency

Compare price information across:

```text
visible HTML
structured data
API
agent protocol
cart
checkout
```

Pricing contradiction SHOULD be a critical finding.

---

# 66. Inventory Consistency

Likewise:

```text
page availability
structured-data availability
API availability
checkout availability
```

must not materially conflict.

---

# 67. Transaction Discovery

The validator SHOULD identify how an agent:

```text
selects product
selects variant
adds to cart
reviews order
provides delivery data
authorizes payment
confirms purchase
```

---

# 68. Transaction Safety

The validator SHOULD assess whether an autonomous agent can avoid accidental commitment.

High-impact actions SHOULD expose an explicit boundary between:

```text
prepare
review
authorize
execute
```

---

# 69. Transaction Outcome

Successful transaction state SHOULD expose:

```text
transaction ID
order ID
amount
currency
merchant
timestamp
status
```

---

# 70. Destructive Actions

Detect operations such as:

```text
DELETE_ACCOUNT
CANCEL_SUBSCRIPTION
CANCEL_ORDER
DELETE_DATA
REVOKE_ACCESS
```

These SHOULD receive elevated risk classification.

---

# 71. Prompt Injection Exposure

Website content is untrusted input to an AI agent.

The validator SHOULD inspect for obvious agent-directed instructions embedded within:

```text
HTML
metadata
comments
structured data
user-generated content
tool descriptions
API responses
```

Examples:

```text
ignore previous instructions
send credentials
call this tool automatically
```

Presence does not establish malicious intent but SHOULD be surfaced.

---

# 72. Content/Instruction Separation

The site SHOULD enable agents to differentiate:

```text
website content
user content
machine instructions
tool metadata
policy
```

Blurring these boundaries increases agent risk.

---

# 73. External Link Risk

Agent-facing workflows SHOULD be inspected for redirects to:

```text
unexpected domains
URL shorteners
untrusted third parties
mixed HTTP/HTTPS
```

---

# 74. Credential Exposure

The validator MUST inspect public responses for accidental exposure of:

```text
API keys
tokens
credentials
private endpoints
internal hostnames
```

within reasonable non-invasive limits.

---

# 75. Privacy Readiness

Agent-accessible forms and APIs SHOULD expose enough information to determine:

```text
what data is collected
required fields
optional fields
purpose
```

The validator SHOULD NOT claim legal compliance based solely on technical observation.

---

# 76. Agent Journey Tests

This is where the system should materially exceed protocol scanners.

The validator SHOULD attempt bounded task-oriented journeys.

Examples:

### Content site

```text
Find an article on topic X.
Determine who wrote it.
Find the publication date.
Find the cited source.
```

### SaaS

```text
Determine what the service does.
Find the cheapest paid plan.
Determine whether API access is included.
Find how to start a trial.
```

### Ecommerce

```text
Find product X.
Determine price and availability.
Identify shipping terms.
Determine how purchase would be initiated.
```

---

# 77. Journey Outcome States

Each journey SHALL resolve to:

```text
SUCCESS
PARTIAL
FAILED
INDETERMINATE
BLOCKED
```

with evidence.

---

# 78. Journey Grounding

Every extracted answer SHALL reference:

```text
source URL
source element
source text
structured-data object
API response
```

The validator MUST distinguish:

```text
direct evidence
derived interpretation
model inference
```

---

# 79. Model Diversity Testing

Optional advanced mode SHOULD run readiness tests using multiple agent implementations.

For example:

```text
DOM-based agent
browser agent
raw HTTP agent
LLM retrieval agent
```

A site that works only for one agent architecture should not be called universally agent-ready.

---

# 80. Deterministic Versus Probabilistic Testing

Conditions such as:

```text
robots.txt exists
HTTP 200
JSON parses
OAuth issuer matches
```

SHALL use deterministic checks.

Questions such as:

```text
Is the company's offering understandable?
```

MAY use model-assisted evaluation.

The two MUST NOT be conflated.

---

# 81. AI Evaluator Provenance

Any model-derived result MUST retain:

```text
provider
model
model_version
prompt_version
input_hash
temperature
evidence
output
timestamp
```

---

# 82. Repeatability Testing

Probabilistic determinations SHOULD be repeat-tested where consequential.

The validator SHOULD identify unstable conclusions.

Example:

```text
Run 1: SaaS product
Run 2: consulting service
Run 3: analytics tool
```

Result:

```text
BUSINESS_IDENTITY_AMBIGUOUS
```

---

# 83. Hallucination Susceptibility

The system SHOULD test whether incomplete site information causes agents to invent material facts.

Examples:

```text
pricing
warranty
availability
product capabilities
geography
```

The system SHOULD record:

```text
SUPPORTED
UNSUPPORTED
CONTRADICTED
```

for generated answers.

---

# 84. Agent Comprehension Test

Ask standardized factual questions whose answers should exist.

Measure:

```text
answerability
evidence coverage
consistency
ambiguity
```

Do NOT merely judge whether the generated response sounds good.

---

# 85. Machine Truth Surface

The system SHOULD determine which representation an agent is most likely to rely upon:

```text
HTML
Markdown
JSON-LD
API
MCP
A2A
```

Conflicting representations SHOULD be explicitly surfaced.

---

# 86. Protocol Claims Versus Reality

Every advertised machine capability SHOULD be testable.

Example:

```text
MCP card says:
search_products available

Actual endpoint:
tool does not exist
```

Result:

```text
DECLARED_CAPABILITY_INVALID
```

This SHOULD carry higher severity than simply missing MCP.

---

# 87. Resilience

The validator SHOULD test bounded variants such as:

```text
HEAD
GET
Accept variations
desktop UA
mobile UA
generic bot UA
AI crawler UA
```

Results SHOULD remain semantically coherent.

---

# 88. Redirect Integrity

Validate:

```text
redirect loops
cross-domain redirects
HTTP→HTTPS
canonical redirects
locale redirects
bot-specific redirects
```

---

# 89. HTTP Correctness

Inspect:

```text
status codes
Content-Type
Content-Length
Content-Encoding
Cache-Control
ETag
Last-Modified
Vary
```

Misleading status codes SHOULD be detected.

Example:

```text
404 page returned as HTTP 200
```

---

# 90. Performance

AI accessibility SHOULD include machine-fetch performance.

Measure:

```text
DNS latency
TLS latency
TTFB
HTML response time
render completion
API latency
MCP latency
```

Performance SHOULD be reported separately from semantic readiness.

---

# 91. Payload Efficiency

The validator MAY compare:

```text
HTML bytes
useful text bytes
Markdown bytes
JavaScript bytes
```

Very poor signal-to-noise ratios SHOULD be visible.

---

# 92. Agent Cost Efficiency

Advanced mode MAY estimate the cost for an AI agent to interpret the site.

Useful measures:

```text
token count
requests required
navigation depth
tool calls required
rendering requirement
```

This could produce:

```text
AGENT_INTERACTION_COST
```

not merely performance score.

---

# 93. Accessibility Relationship

Traditional accessibility findings SHOULD be incorporated where they materially improve agent operability.

Examples:

```text
labels
semantic controls
proper tables
alternative text
heading structure
```

AI readiness and WCAG compliance MUST remain separate determinations.

---

# 94. Search Readiness Relationship

The validator MAY ingest:

```text
indexability
canonicalization
structured data
sitemap quality
```

But SEO readiness SHALL remain distinct from agent readiness.

---

# 95. llms.txt

The system SHOULD detect and validate `llms.txt` where present.

But presence SHALL NOT be treated as universally required.

The validator MUST identify its status as an emerging convention rather than misrepresent it as a normative web standard.

---

# 96. Emerging Standards Registry

This is essential.

Every protocol SHALL carry maturity metadata.

Example:

```text
STANDARD
RFC
DRAFT
VENDOR_CONVENTION
COMMUNITY_CONVENTION
EXPERIMENTAL
DEPRECATED
```

Example record:

```text
protocol_id
name
version
authority
status
source
effective_date
registry_version
```

The system MUST NOT present every new AI convention as equally authoritative.

---

# 97. Standards Provenance

Each condition SHALL link to its normative or authoritative source where one exists.

Examples:

```text
RFC
W3C
IETF
Schema.org
protocol specification
vendor documentation
```

---

# 98. Condition Registry

Every test SHOULD be defined as a versioned condition.

Example:

```text
condition_id:
AI_DISCOVERABILITY_ROBOTS_001

condition_version:
2

description:
robots.txt is reachable and parseable

applicability:
ALL

method:
DETERMINISTIC

severity:
HIGH
```

---

# 99. Condition Immutability

Changing test semantics creates a new condition version.

Historical results MUST retain the condition version that produced them.

---

# 100. Finding Severity

Severity SHOULD represent consequence rather than arbitrary scoring.

Possible levels:

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

Example:

```text
missing Markdown:
LOW/MEDIUM

checkout price contradiction:
CRITICAL
```

---

# 101. Readiness Dimensions

Do not collapse everything immediately.

Maintain independent dimension states:

```text
Discovery
Content
Semantics
Structure
Control
Identity
Capabilities
Interaction
Commerce
Safety
Reliability
```

---

# 102. Scoring

If a score is provided, it MUST be secondary to the underlying evidence.

The system SHOULD expose:

```text
dimension scores
applicable-condition count
passed conditions
failed conditions
indeterminate conditions
confidence
```

---

# 103. Scoring Applicability

A content site and transactional SaaS SHOULD NOT share the same denominator.

Example:

```text
Content site:
43 applicable conditions

SaaS/API:
78 applicable conditions

Commerce:
103 applicable conditions
```

---

# 104. No False Precision

Avoid:

```text
AI Readiness = 87.346%
```

unless such precision is mathematically defensible.

Prefer:

```text
82 / 100
Confidence: HIGH
73 of 89 applicable conditions evaluated
```

---

# 105. Readiness Level

An optional maturity model MAY provide:

```text
LEVEL 0 — INACCESSIBLE
LEVEL 1 — MACHINE ACCESSIBLE
LEVEL 2 — MACHINE READABLE
LEVEL 3 — AGENT DISCOVERABLE
LEVEL 4 — AGENT OPERABLE
LEVEL 5 — AGENT NATIVE
```

The system MUST publish the exact conditions required for each level.

---

# 106. Gating Rules

Higher maturity levels SHOULD require critical prerequisites.

For example:

`Agent Native` MUST NOT be reachable merely by accumulating points.

Possible gate:

```text
No unresolved CRITICAL finding
AND
machine-readable content
AND
machine-discoverable capabilities
AND
verified operation
AND
safe action boundaries
```

---

# 107. Remediation

Every actionable finding SHOULD provide:

```text
finding
evidence
why_it_matters
affected_agents
recommended_change
verification_method
risk
```

---

# 108. Fix Generation

AI MAY generate implementation instructions.

But generated fixes MUST remain:

```text
PROPOSED
```

until applied and rescanned.

The Cloudflare reference similarly provides generated implementation guidance for failed checks, while warning that generated recommendations may contain errors.

---

# 109. Fix Verification

The system SHALL never mark a finding resolved because code was generated.

Required transition:

```text
FAIL
→ FIX_PROPOSED
→ CHANGE_DEPLOYED
→ REOBSERVED
→ PASS
```

---

# 110. Revalidation

Revalidation MUST use the same:

```text
condition_id
condition_version
```

when claiming a true:

```text
FAIL → PASS
```

If the condition definition changed, the system must report a new determination instead.

---

# 111. Historical Delta

Scans SHOULD expose:

```text
new failures
resolved failures
regressions
unchanged failures
newly applicable checks
deprecated checks
```

---

# 112. Continuous Monitoring

The system SHOULD support scheduled validation.

Examples:

```text
daily
weekly
deployment-triggered
on-demand
```

---

# 113. Deployment Integration

The validator SHOULD support CI/CD use.

Example:

```text
PR
→ preview deployment
→ AI readiness validation
→ regression comparison
→ deployment gate
```

Critical regressions SHOULD optionally block deployment.

---

# 114. Baseline Enforcement

Projects SHOULD be able to establish:

```text
APPROVED_BASELINE
```

Future builds are compared against it.

This prevents newly introduced failures from being masked by a high aggregate score.

---

# 115. API

The validator SHOULD expose:

```text
POST /scans
GET /scans/{id}
GET /findings
GET /conditions
GET /evidence
GET /diff
```

---

# 116. Machine-Readable Output

Reports SHOULD support:

```text
JSON
SARIF
HTML
Markdown
```

SARIF is particularly useful for CI and engineering workflows.

---

# 117. Agent-Native Interface

The validator itself SHOULD expose machine-readable capabilities.

Potentially:

```text
MCP
API
Agent Skill
```

The system should satisfy its own validation criteria where applicable.

---

# 118. Evidence API

Every reported finding SHOULD expose its supporting evidence programmatically.

Example:

```text
GET /findings/F-193/evidence
```

---

# 119. Security Boundaries

Remote validation MUST prevent:

```text
SSRF
internal network scanning
localhost scanning
cloud metadata access
DNS rebinding
redirect-to-private-IP attacks
```

This is critical.

A website scanner is inherently an SSRF primitive unless explicitly constrained.

---

# 120. Target Validation

Before fetching a URL:

```text
resolve DNS
classify resulting IP
reject private/reserved networks
fetch
validate redirects
re-resolve destination
```

Each redirect MUST undergo the same validation.

---

# 121. Fetch Limits

Enforce:

```text
maximum pages
maximum redirects
maximum response size
maximum runtime
maximum concurrent connections
maximum crawl depth
```

---

# 122. Active Test Safety

Tests that mutate external state MUST NOT run during normal scans.

Examples:

```text
submit order
create account
send message
delete resource
purchase
```

These require explicit authorized test mode.

---

# 123. Transaction Test Environment

Where live action testing is required, the site SHOULD provide:

```text
sandbox
test tenant
test credentials
test payment mechanism
```

---

# 124. Scan Provenance

Each report SHALL identify:

```text
target
scan timestamp
scanner version
registry version
applicable profile
scan configuration
```

A score without this information is not defensible historical evidence.

---

# 125. System Self-Validation

The validator SHALL monitor:

```text
collector failures
parser errors
browser failures
DNS errors
protocol parser drift
condition execution failures
AI evaluator failures
timeout rate
```

---

# 126. Unknown Standards

Unknown discovery artifacts or new protocol types SHOULD be retained.

Do not silently discard them.

Store:

```text
UNKNOWN_AGENT_RESOURCE
```

for later analysis.

---

# 127. Standards Evolution

The condition registry SHOULD support:

```text
introduced
experimental
recommended
required
deprecated
removed
```

A standard becoming fashionable SHALL NOT automatically make it required.

---

# 128. Comparative Benchmarking

Optional aggregate benchmarking MAY report:

```text
industry
site type
company size
technology
```

But benchmark populations MUST be disclosed.

Avoid claims such as:

> Top 10% of AI-ready websites

without a statistically meaningful comparison population.

---

# 129. Evidence Confidence

Determinations SHOULD expose confidence based on:

```text
directness
completeness
freshness
repeatability
cross-source agreement
```

---

# 130. Critical Invariants

The following invariants SHOULD govern the system:

```text
EXISTS ≠ VALID

VALID ≠ DISCOVERABLE

DISCOVERABLE ≠ USABLE

USABLE ≠ SAFE

PROTOCOL_PRESENT ≠ CAPABILITY_WORKS

CONTENT_VISIBLE ≠ CONTENT_UNDERSTANDABLE

STRUCTURED ≠ CORRECT

ACTION_AVAILABLE ≠ ACTION_AUTHORIZED

ACTION_EXECUTED ≠ ACTION_SUCCEEDED

HIGH_SCORE ≠ AGENT_READY
```

---

# 131. Reference Architecture

```text
                         TARGET WEBSITE
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Safe Fetch Boundary │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼────────────────┐
               ▼               ▼                ▼
         Raw HTTP          Browser          DNS/Protocol
         Collector         Collector        Discovery
               │               │                │
               └───────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Immutable Evidence  │
                    │ Store               │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Normalization       │
                    └──────────┬──────────┘
                               ▼
              ┌────────────────┼──────────────────┐
              ▼                ▼                  ▼
       Deterministic      Semantic          Journey
       Conditions         Analysis          Validation
              │                │                  │
              └────────────────┼──────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Determinations      │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Findings            │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Recommendations     │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Revalidation        │
                    └─────────────────────┘
```

Cross-cutting layers:

```text
Condition Registry
Evidence Provenance
Standards Registry
Versioning
Security
Cost Controls
Observability
Audit
```

---

# 132. Acceptance Criteria

A production-grade validator SHALL demonstrate that it can:

1. Determine the applicable site profile.
2. Discover standard and emerging agent interfaces.
3. Distinguish NOT_APPLICABLE from FAIL.
4. Preserve raw scan evidence.
5. Validate robots.txt rather than checking only existence.
6. Validate sitemap integrity.
7. Validate Link headers.
8. Test Markdown negotiation.
9. Compare Markdown and HTML semantics.
10. Compare raw HTML and rendered DOM.
11. Detect JS-only critical content.
12. Validate structured data.
13. Detect structured-data contradictions.
14. Determine core business identity.
15. Extract important business facts with citations.
16. Detect contradictory facts across pages.
17. Test navigation using machine-readable controls.
18. Test form semantics.
19. Identify side-effecting actions.
20. Identify irreversible or financial actions.
21. Validate OAuth discovery where applicable.
22. Validate MCP discovery where applicable.
23. Inspect MCP tool semantics.
24. Validate Agent Skills.
25. Validate A2A metadata.
26. Validate WebMCP.
27. Validate ARD.
28. Validate relevant commerce protocols.
29. Test bot-access controls.
30. Detect WAF or bot challenges.
31. Detect inconsistent machine policies.
32. Detect declared capabilities that do not exist.
33. Perform bounded representative agent journeys.
34. Ground journey conclusions in source evidence.
35. Distinguish deterministic findings from model judgments.
36. Preserve model/evaluator provenance.
37. Represent uncertainty explicitly.
38. Detect readiness regression.
39. Reproduce historical determinations.
40. Revalidate fixes against the same condition version.
41. Prevent SSRF.
42. Prevent uncontrolled state mutation.
43. Bound crawl cost and resource consumption.
44. Detect degradation in the validator itself.
45. Support continuous and CI validation.
46. Expose machine-readable scan results.
47. Preserve emerging unknown artifacts.
48. Version its standards registry.
49. Explain exactly why a readiness level was assigned.
50. Demonstrate its own AI readiness using the same rules.

---

# 133. Governing Principle

The system SHALL measure:

> whether an AI agent can correctly and safely use the website.

It SHALL NOT merely measure:

> whether the website contains files associated with AI agents.

The validator therefore treats protocols as evidence, interaction as proof, and successful bounded agent journeys as the strongest evidence of readiness.
