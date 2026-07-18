# Citable anti-pattern library

Canonical reference used by all commands. When a requested change matches an
entry, name it, state the risk, and offer the defensible alternative. Entries
marked ⛔ must be refused outright (premise 3.6), not merely discouraged.

## Content anti-patterns

| Anti-pattern | Risk | Defensible alternative |
| --- | --- | --- |
| Generic AI introductions ("In today's rapidly evolving landscape…") | Suppresses answer extraction; signals commodity content (ANS-001) | Direct answer in the first 50–100 words |
| Excessive preamble before the answer | Passage extraction pulls filler instead of the claim | Lead with the canonical answer block |
| Keyword stuffing | Spam-policy exposure; unreadable prose (PAGE-009) | Semantic coverage driven by explanation needs |
| Synthetic information gain (rewriting top results) | No citation reason; no durable differentiation | Original data, experience, taxonomy, benchmarks |
| Repeated conclusions / decorative FAQs | Dilutes extractable claims; FAQ schema risk (SCHEMA-007) | One canonical answer location per question |
| ⛔ False precision / unsupported statistics | Legal + reputational; CLAIM-004/ANS-005 | Publish numbers only with methodology and period |
| Circular definitions | Engine cannot anchor the concept (ANS-003) | Genus–differentia definition plus exclusions |
| ⛔ Fake comparisons / unbounded superlatives | Deceptive-claim exposure (CLAIM-007) | Explicit comparison set, criteria, and evidence |
| ⛔ Invented expertise / anonymous substantive content | E-E-A-T failure; regulatory exposure | Real named authors with verifiable profiles |
| Hidden commercial bias | Undisclosed endorsement liability | Disclose commercial relationships |
| Duplicated programmatic prose | Index bloat, quality dilution | Programmatic pages only with unique data + owner |

## Technical anti-patterns

| Anti-pattern | Risk | Defensible alternative |
| --- | --- | --- |
| "Index everything" | Crawl waste, quality dilution | Deliberate indexing_intent per page |
| Schema saturation | Invisible-assertion violations | Schema only for visible, registry-backed facts |
| Sitemap dumping (redirects, 404s, non-canonicals) | TECH-008/009/010 | Generate sitemaps from the canonical URL set |
| Canonical misuse (variants → irrelevant page, pagination → page 1) | Signal consolidation failures | One canonical per distinct content object |
| JavaScript-only primary content | Render-stage failure (TECH-011) | SSR/SSG for answer-bearing content |
| ⛔ Crawler cloaking / bot-specific deceptive rendering | Spam-policy removal | Serve equivalent content to bots and users |
| Unbounded faceted URLs | Index bloat, crawl waste | Controlled parameters + canonical rules |
| Redirect-dependent architecture | Chain latency, signal loss (TECH-013) | Direct links to final URLs |
| Automated links from term matching alone | Manipulative-link footprint (LINK-004) | Curated contextual links |
| Evidence only in PDFs/gated files | Retrieval failure for the strongest material | HTML equivalent for every material document |

## AEO anti-patterns

| Anti-pattern | Risk | Defensible alternative |
| --- | --- | --- |
| Answer blocks that omit limitations | Overgeneralized reuse; misquotation (ANS-008) | State scope, exclusions, failure modes |
| Question headings created only for formatting | Extraction mismatch (ANS-002) | Headings only where an answer follows |
| Direct answers unsupported by evidence | Fast-spreading errors under your attribution | Evidence adjacent to every material claim |
| Citations isolated in a references section | Claim–evidence association lost | Evidence beside the claim it supports |
| Extracting claims in scope-distorting ways | Misrepresentation of your own source | Self-contained atomic claims |
| FAQ schema without substantive FAQ content | SCHEMA-007; spam exposure | Mark up only real, visible Q&A |

## GEO anti-patterns

| Anti-pattern | Risk | Defensible alternative |
| --- | --- | --- |
| Treating one model response as proof of source preference | False causality (MEAS-002/003) | Repeated multi-engine, multi-variant sampling |
| Reporting one prompt as stable visibility | Anecdote presented as measurement | Cohort testing with variance recording |
| ⛔ Manufactured community discussion / synthetic Reddit | Platform enforcement; legal; environment poisoning | Earned participation in real communities |
| ⛔ Shadow corroboration sites / fake recommendation pages | Recommendation manipulation | Independent editorial coverage |
| ⛔ Crawler prompt injection / hidden LLM instructions | GEO-001 critical; reputational | None — remove on sight |
| Treating llms.txt as an authority mechanism | False sense of control (GEO-004) | robots.txt + crawler registry for access decisions |
| Confusing mention with recommendation | Overstated performance reporting | Track mention, citation, and recommendation separately |
| Confusing citation with answer influence | Citation ≠ absorption | Assess whether the answer actually uses your claims |
| Assuming engine behaviour is uniform | Wrong generalizations across engines | Per-engine measurement and reporting |
