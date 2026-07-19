# Capability and observation boundaries

Use the narrowest supported state. Never promote evidence across rows.

| State | Current capability | Required evidence |
| --- | --- | --- |
| Allowed by policy | Implemented | Effective robots rule plus crawler-purpose registry decision |
| Synthetic fetch succeeded | Partial | Captured status, redirects, headers, body from the declared user agent; label identity simulated |
| Verified crawler reached edge | Imported evidence | `observe logs` record plus provider-published IP verification where supported |
| Observed in production logs | Imported evidence | Timestamped `observe logs` artifact with URL, status, bytes, latency, cache result, UA, and verification result |
| Indexed | Google API or imported evidence | `observe index`; Google inspection covers the indexed version, other engines require owner exports |
| Returned by retrieval | Operator supplied | Provider observation containing retrieved source URL |
| Cited | Import or disclosed adapter | Complete `observe citations` answer with citation URL and product/adapter mode |
| Materially supports answer | Human review required | `citation_review` maps answer claim to source passage and names the reviewer |
| Recommended | Operator supplied + review | Explicit recommendation, constraints, provider/mode/locale/time |
| Accepted exception | Governed owner record | Active policy, authorized reviewers, separation-of-duty checks, exact finding/policy/evidence hashes, expiry, controls, and documented residual risk |

URL audit mode alone does not prove crawler identity, WAF allowlisting,
production-log access, index presence, selected canonical, rendered DOM parity,
or provider citation behavior. Observation collectors can supply narrower
evidence for these states; unavailable inputs remain `not_evidenced`.

An accepted exception changes enforcement disposition only. It does not change
the source finding, prove remediation, or establish that reviewer identity,
competence, independence, or legal authority was externally authenticated.

Primary-source lineage for these boundaries:

- Perplexity documents separate `PerplexityBot` and `Perplexity-User` purposes,
  published IP lists, and UA-plus-IP verification:
  https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- Google documents `noindex` as preventing inclusion in Google Search and
  distinguishes crawl/content controls:
  https://developers.google.com/search/docs/crawling-indexing/control-what-you-share
- Bing documents citation counts as observations that do not indicate ranking,
  authority, or placement:
  https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview
- Google requires structured data to describe visible page content:
  https://developers.google.com/search/docs/appearance/structured-data/sd-policies
