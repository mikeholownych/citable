# Example: Citable audit of a small governed site

`site/` is a four-page statically built site (home, product, definition,
pricing) with a governed `.citable/` context: registered entities, one
evidenced claim, page ownership/lifecycle, and per-purpose crawler decisions.

Reproduce:

```bash
node ../../src/cli/index.js audit --target ./site --base-url https://example.test --ref-date 2026-07-18
node ../../src/cli/index.js substantiate --ref-date 2026-07-18
node ../../src/cli/index.js schema --target ./site --base-url https://example.test
```

The committed run under `.citable/runs/` is a real evidence package. Its four
medium findings are genuine: three thin-content heuristics (the demo pages are
deliberately short) and one crawler-governance gap — Google's search crawler is
allowed but no model-training decision is recorded for the vendor (CRAWL-002),
exactly the public-vs-training separation the system enforces.
