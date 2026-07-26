# Citable capability gap analysis

Target state: defensible separation of retrieval eligibility, source extraction
and support suitability, and observed citation behavior. Statuses describe the
current repository as of 2026-07-19; they are not outcome scores.

| Capability | Current state | Gap | Priority | Closure evidence |
| --- | --- | --- | --- | --- |
| Separate top-level states | Implemented | None | complete | Audit summary/report exposes three independent states |
| Policy-level crawler decisions | Contract implemented | Actual edge treatment requires synthetic probes or production logs | external evidence | Per-crawler purpose registry plus effective robots rule |
| Per-agent synthetic edge probes | Contract implemented | Managed geographic execution and connection IP pinning remain infrastructure concerns | external infrastructure | Timestamped probe artifacts for each declared agent, clearly labelled simulated |
| Verified crawler identity | Contract implemented | Authentic production evidence remains owner supplied; no managed range retriever | external authority | Staged UA/IP/range-source/DNS/edge/origin record with contradiction handling |
| Production crawler access | Import contract implemented | Collection remains an owner/CDN responsibility | external evidence | Validated server/CDN events separated from policy, simulation, and absent evidence |
| Search-index presence | Contract implemented | Google API/import and Bing owner exports are supported; no undocumented Bing AI API is presumed | provider evidence | Engine, canonical selected, crawl date, indexed/rendered evidence, timestamp |
| Rendered extraction parity | Contract implemented | Cross-browser plans, main-content parity, and review policy implemented; reusable application-specific journeys remain property-specific | complete | Raw HTML, rendered DOM, accessibility snapshot, screenshots, step/failure artifacts, main-content diff |
| Passage extraction | Contract implemented | Question-to-passage suitability remains mandatory human semantic review | complete | Versioned question-to-passage records with dependency findings |
| Claim/evidence support | Governed review implemented | Material entailment remains human semantic judgment | human review | Claim, adjacent passage, source passage, reviewer, support status, checksum |
| Canonical consensus matrix | Implemented | Engine-selected canonical remains imported/provider evidence and is never inferred from static signals | complete | One table per URL covering redirects, HTML, sitemap, OG, links, engine observation |
| Content-to-noise extraction | Implemented | Exact repeated-region classification is descriptive, not semantic quality evaluation | complete | Raw/extracted byte and token ratios plus identified repeated regions |
| Source identity chain | Contract implemented | Declared registry linkage does not prove visible, current, or independent disclosures | complete | Organization, author, reviewer, publisher, evidence owner, correction path |
| Freshness integrity | Contract implemented | External publication-history attestation remains publisher/provider evidence | external evidence | Date consensus matrix linked to content snapshot hashes |
| Structured entity graph | Implemented | Literal visible support is not semantic validation or engine recognition | complete | Source JSON-LD plus normalized nodes/edges and visible-content support mapping |
| Regional technical reliability | Import contract implemented | Collection still requires an owner or third-party multi-region runner | complete | Repeated DNS/TLS/status/latency/cache results by region and UA |
| External corroboration signals | Import contract implemented | Live collection requires an authorized backlink/mention provider | external provider | Observable source records labelled independently owned or controlled |
| Controlled citation testing | Adapter contract implemented | Consumer-product access remains provider-authorized and product-specific | external provider | Versioned prompt corpus, repeated runs, full answers/citations/context/checksums |
| Citation correctness | Governed review implemented | Automated prioritization cannot confirm semantic support | human review | Citation URL, canonical URL, answer claim, source passage, support verdict/reviewer |
| Competitive retrieval set | Implemented for declared profiles | Format/depth/freshness metadata remains owner/provider supplied unless separately observed | complete | Per-prompt cited-domain set with format/depth/freshness/evidence comparison |

## Closure sequence

1. Build observation contracts first: crawler probe/log, index presence,
   rendered extraction, passage, and citation review. Missing fields must fail
   closed before adapters are added.
2. Add per-agent synthetic probes with explicit simulation labels and immutable
   raw responses. Do not infer verified identity from a spoofed user agent.
3. Add importers for owner-supplied logs and webmaster exports before live
   provider automation. This produces auditable evidence without depending on
   brittle UI automation.
4. Add rendered extraction and canonical/date consensus artifacts.
5. Add citation correctness and competitive retrieval reporting after the
   observation cohort and reviewer contracts are stable.

## Primary-source checks

- Perplexity recommends combining user-agent matching with IP verification and
  distinguishes crawler purposes.
- Google states that `noindex` prevents indexing and requires structured data to
  match visible content.
- Bing says accurate sitemap `lastmod` should reflect content change, while
  `changefreq` and `priority` are ignored.
- Bing's AI Performance reporting explicitly says citation counts do not imply
  ranking, authority, placement, or page importance.

Source URLs are retained in `skill/references/capability-boundaries.md`.

## Terminal external and human boundaries

The repository contracts above are complete where marked. The following cannot
be closed by adding local code without inventing authority or evidence:

- production crawler identity, edge access, and publication history require
  authentic owner/provider records;
- geographic execution requires real runners, networks, and disclosed coverage;
- backlink, mention, index, and consumer citation collection requires
  authorized provider access or owner exports;
- passage suitability, claim entailment, citation correctness, and rendered
  semantic impact require governed human review.

Missing external or human evidence must remain incomplete, `review_required`,
or not evidenced. It must never be converted into a successful observation from
static analysis, a spoofed user agent, or an undocumented provider interface.
