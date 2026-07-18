# Known limitations

Stated plainly so nobody mistakes the MVP's coverage for the full requirement
surface.

## Not implemented (documented gaps)

- **No live engine adapters.** No Search Console/Bing API clients, no
  ChatGPT/Perplexity/Copilot automation. `measure`/`test-prompts` validate and
  govern operator-supplied observations; they do not collect them.
- **No browser rendering.** TECH-011 is a heuristic on initial HTML; true
  rendered-vs-initial diffing and mobile/desktop parity need a headless
  browser the CLI does not bundle. validate-render documents the manual path.
- **No Core Web Vitals measurement.** Performance budgets are governance
  items only; no field/lab data collection.
- **No hreflang/international detectors.** Multi-locale sites get no
  locale-specific checks in MVP.
- **No multimodal detectors.** Image/video/transcript evidence surfaces are
  un-audited beyond alt text (PAGE-007).
- **Screenshots/rendered directories** in the evidence package layout are
  created only when an external tool supplies content.
- **URL-mode redirects/headers** are captured live, but static-dir mode
  depends on the optional `_citable-transport.json` sidecar; without it,
  status/header detectors see defaults (recorded in audit assumptions).

## Probabilistic checks (by design)

Heuristic detectors (deterministic: false) — TECH-011/014/015, PAGE-008/009,
ANS-001/003/005/008, ENTITY-006, CLAIM-007/008, LINK-004, GEO-004, EXT rubric
work, RECO-001…006 — carry false-positive/negative conditions in their
definitions and cap confidence at high. They flag for review; they do not
convict.

## Environment-specific behaviour

- URL fetching requires network access and honors nothing beyond redirect
  limits — run against production only with permission.
- Framework detection covers the mainstream JS ecosystem (Next/Astro/Nuxt/
  SvelteKit/Gatsby); other stacks are audited via built HTML output only.

## Unresolved source conflicts

None material. The SEO document's lighter crawler treatment vs AEO/GEO
purpose-separation was resolved in favor of purpose-per-crawler (more
conservative). GEO §13 numeric scores (EVS/CAS/RQS/NFS/CGS) are exposed as
formulas in the posture/report templates rather than computed, because the
MVP lacks the observation volume to compute them honestly.
