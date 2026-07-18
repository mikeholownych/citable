# Crawler policy template

Access is decided **per crawler and per purpose**. Search-crawler allowance is
never permission for model training (premise 3.3). Every decision needs an
owner, business rationale, legal rationale, and review date in
`.citable/crawlers.yaml`; robots.txt is generated to match (CRAWL-001 verifies
the two agree).

| Crawler | Vendor | Purpose | Decision defaults to |
| --- | --- | --- | --- |
| Googlebot | Google | search_indexing (also gates AI features eligibility) | undecided → usually allow |
| Bingbot | Microsoft | search_indexing (also Copilot surfaces) | undecided |
| OAI-SearchBot | OpenAI | ai_search_discovery (ChatGPT search citation) | undecided |
| GPTBot | OpenAI | model_training | undecided — separate decision, legal owner |
| ChatGPT-User | OpenAI | user_initiated_retrieval | undecided — separate decision |
| PerplexityBot | Perplexity | ai_search_discovery | undecided |
| Perplexity-User | Perplexity | user_initiated_retrieval | undecided |
| ClaudeBot | Anthropic | model_training (verify current vendor docs) | undecided |

Rules:

1. `undecided` is a temporary state; CRAWL-006 flags it. A decision requires
   decision_owner + rationale.
2. Allowing a vendor's search crawler without recording a training-crawler
   decision for the same vendor is flagged (CRAWL-002).
3. Vendor documentation URLs and IP-validation methods are recorded per entry;
   user-agent strings are spoofable and must not be the sole trust basis.
4. Robots semantics: robots.txt controls crawling, not indexing. Use `noindex`
   when removal from search results is the objective (TECH-003 remediation).
5. Blocked-crawler decisions must state whether the block covers licensed or
   partner access paths too, or only public crawling.

Example generated robots.txt for: search allowed, OpenAI search allowed,
training blocked:

```text
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```
