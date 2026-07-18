# Capability and observation boundaries

Use the narrowest supported state. Never promote evidence across rows.

| State | Current capability | Required evidence |
| --- | --- | --- |
| Allowed by policy | Implemented | Effective robots rule plus crawler-purpose registry decision |
| Synthetic fetch succeeded | Partial | Captured status, redirects, headers, body from the declared user agent; label identity simulated |
| Verified crawler reached edge | Operator supplied | Request log plus provider-published IP verification where supported |
| Observed in production logs | Operator supplied | Timestamped server/CDN log with URL, status, bytes, latency, cache result, UA, and verification result |
| Indexed | Operator supplied | Search Console/Bing Webmaster/API or timestamped engine observation |
| Returned by retrieval | Operator supplied | Provider observation containing retrieved source URL |
| Cited | Operator supplied | Complete answer observation with citation URL |
| Materially supports answer | Human review required | Answer claim mapped to a passage that entails it |
| Recommended | Operator supplied + review | Explicit recommendation, constraints, provider/mode/locale/time |

Current CLI URL mode does not prove crawler identity, WAF allowlisting,
production-log access, index presence, selected canonical, rendered DOM parity,
or provider citation behavior. Record those states as `not_evidenced` unless the
specified evidence is supplied.

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
