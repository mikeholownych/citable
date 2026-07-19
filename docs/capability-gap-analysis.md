# Citable capability gap analysis

Target state: defensible separation of retrieval eligibility, source extraction
and support suitability, and observed citation behavior. Statuses describe the
current repository as of 2026-07-19; they are not outcome scores.

| Capability | Current state | Gap | Priority | Closure evidence |
| --- | --- | --- | --- | --- |
| Separate top-level states | Implemented | None | complete | Audit summary/report exposes three independent states |
| Policy-level crawler decisions | Implemented | No edge proof | P0 | Per-crawler purpose registry plus effective robots rule |
| Per-agent synthetic edge probes | Partial | One audit UA; no crawler matrix, WAF/challenge classification, region matrix, or IP pinning | P0 | Timestamped probe artifacts for each declared agent, clearly labelled simulated |
| Verified crawler identity | Contract implemented | Authentic production evidence remains owner supplied; no managed range retriever | P0 | Staged UA/IP/range-source/DNS/edge/origin record with contradiction handling |
| Production crawler access | JSON/CSV import implemented | Multi-region collection remains external | P1 | Validated server/CDN events separated from policy, simulation, and absent evidence |
| Search-index presence | Partial | Google API/import and Bing owner exports implemented; Bing AI dashboard has no captured API contract | P0 | Engine, canonical selected, crawl date, indexed/rendered evidence, timestamp |
| Rendered extraction parity | Partial | Optional desktop/mobile/JavaScript-disabled Chromium capture and bounded interaction inventory; no cross-browser detector matrix or application-specific journeys | P0 | Raw HTML, rendered DOM, main-content diff, interaction-hidden inventory |
| Passage extraction | Partial | Candidate corpus/noise ratios implemented; semantic review remains | P1 | Versioned question-to-passage records with dependency findings |
| Claim/evidence support | Partial | Registry linkage and methodology checks; no automated passage-to-source entailment | P1 | Claim, adjacent passage, source passage, reviewer, support status, checksum |
| Canonical consensus matrix | Partial | Static matrix implemented; engine-selected canonical requires index observation | P1 | One table per URL covering redirects, HTML, sitemap, OG, links, engine observation |
| Content-to-noise extraction | Partial | Ratio implemented; repeated-region classification remains | P1 | Raw/extracted byte and token ratios plus identified repeated regions |
| Source identity chain | Partial | Entity/owner/reviewer controls; limited author-affiliation/correction checks | P1 | Organization, author, reviewer, publisher, evidence owner, correction path |
| Freshness integrity | Partial | Lifecycle and date checks; no HTTP/sitemap/visible/content-diff consensus | P1 | Date consensus matrix linked to content snapshot hashes |
| Structured entity graph | Partial | JSON-LD capture and consistency detectors; no normalized graph artifact | P1 | Source JSON-LD plus normalized nodes/edges and visible-content support mapping |
| Regional technical reliability | Not implemented | No multi-region/network runner | P2 | Repeated DNS/TLS/status/latency/cache results by region and UA |
| External corroboration signals | Partial | Registry and detectors; no backlink/mention adapter | P2 | Observable source records labelled independently owned or controlled |
| Controlled citation testing | Import/custom adapter implemented | First-party consumer-product adapters remain | P0 | Versioned prompt corpus, repeated runs, full answers/citations/context/checksums |
| Citation correctness | Review artifact implemented | Automated prioritization cannot confirm support | P1 | Citation URL, canonical URL, answer claim, source passage, support verdict/reviewer |
| Competitive retrieval set | Partial | Cited domains reported; format/depth/freshness comparison remains | P2 | Per-prompt cited-domain set with format/depth/freshness/evidence comparison |

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
