# Citable capability gap analysis

Target state: defensible separation of retrieval eligibility, source extraction
and support suitability, and observed citation behavior. Statuses describe the
current repository as of 2026-07-18; they are not outcome scores.

| Capability | Current state | Gap | Priority | Closure evidence |
| --- | --- | --- | --- | --- |
| Separate top-level states | Implemented | None | complete | Audit summary/report exposes three independent states |
| Policy-level crawler decisions | Implemented | No edge proof | P0 | Per-crawler purpose registry plus effective robots rule |
| Per-agent synthetic edge probes | Partial | One audit UA; no crawler matrix, WAF/challenge classification, region matrix, or IP pinning | P0 | Timestamped probe artifacts for each declared agent, clearly labelled simulated |
| Verified crawler identity | Not implemented | No provider IP-range verifier | P0 | UA plus current provider-published IP validation and source checksum |
| Production crawler access | Operator supplied | No log ingestion command | P0 | Validated server/CDN log observations separated from policy and simulation |
| Search-index presence | Not implemented | No Google/Bing adapters or import contract | P0 | Engine, canonical selected, crawl date, indexed/rendered evidence, timestamp |
| Rendered extraction parity | Specified | No bundled browser renderer | P0 | Raw HTML, rendered DOM, main-content diff, interaction-hidden inventory |
| Passage extraction | Partial | Paragraph heuristics; no 100-300-word question/passage corpus or integrity model | P1 | Versioned question-to-passage records with dependency findings |
| Claim/evidence support | Partial | Registry linkage and methodology checks; no automated passage-to-source entailment | P1 | Claim, adjacent passage, source passage, reviewer, support status, checksum |
| Canonical consensus matrix | Partial | Individual canonical/redirect/sitemap/link detectors; no unified per-URL matrix or engine-selected canonical | P1 | One table per URL covering redirects, HTML, sitemap, OG, links, engine observation |
| Content-to-noise extraction | Not implemented | No main-content/boilerplate segmentation | P1 | Raw/extracted byte and token ratios plus identified repeated regions |
| Source identity chain | Partial | Entity/owner/reviewer controls; limited author-affiliation/correction checks | P1 | Organization, author, reviewer, publisher, evidence owner, correction path |
| Freshness integrity | Partial | Lifecycle and date checks; no HTTP/sitemap/visible/content-diff consensus | P1 | Date consensus matrix linked to content snapshot hashes |
| Structured entity graph | Partial | JSON-LD capture and consistency detectors; no normalized graph artifact | P1 | Source JSON-LD plus normalized nodes/edges and visible-content support mapping |
| Regional technical reliability | Not implemented | No multi-region/network runner | P2 | Repeated DNS/TLS/status/latency/cache results by region and UA |
| External corroboration signals | Partial | Registry and detectors; no backlink/mention adapter | P2 | Observable source records labelled independently owned or controlled |
| Controlled citation testing | Operator supplied | Schema/workflow exists; no provider adapters | P0 | Versioned prompt corpus, repeated runs, full answers/citations/context/checksums |
| Citation correctness | Human workflow | No claim-to-cited-passage evaluator artifact | P0 | Citation URL, canonical URL, answer claim, source passage, support verdict/reviewer |
| Competitive retrieval set | Operator supplied | No comparison report | P2 | Per-prompt cited-domain set with format/depth/freshness/evidence comparison |

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
