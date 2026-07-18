# Known limitations

Stated plainly so nobody mistakes the MVP's coverage for the full requirement
surface.

## Not implemented (documented gaps)

- **Provider coverage is uneven.** Google URL Inspection and CrUX have live API
  paths. Bing index evidence and consumer answer-product observations still
  require owner exports or a disclosed custom adapter. An API adapter is not
  presumed equivalent to ChatGPT, Perplexity, Copilot, or another consumer mode.
- **No verified crawler or edge matrix.** URL mode captures a synthetic request
  using Citable's audit user agent. It does not prove that a declared crawler's
  current published IP reached the edge, classify WAF/CAPTCHA decisions across
  regions, or replace production server logs.
- **Search-index coverage is partial.** Google inspection is live; Bing and
  other engines require normalized owner exports.
- **Browser rendering is optional and desktop-only.** `observe render` captures
  Chromium DOM, text, screenshot, and failed requests when Playwright and its
  browser are installed. Mobile parity, interaction exploration, and
  cross-browser comparison remain.
- **Passage analysis is heuristic.** `observe passages` creates candidates and
  noise ratios, but semantic independence and support still require review.
- **Citation correctness remains human-authoritative.** Citable normalizes
  claim/passage review records and missing reviews; automated inference never
  silently becomes a confirmed support verdict.
- **Performance collection is partial.** CrUX field data or owner exports can be
  collected. Lighthouse lab execution is not bundled; CWV-001..003 remain
  infrastructure-readiness checks.
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

- URL fetching requires network access, remains same-origin, rejects private
  destinations, and enforces redirect/time/body limits. Run against production
  only with permission; DNS policy checks reduce but do not eliminate all
  network-environment risk.
- Framework detection covers the mainstream JS ecosystem (Next/Astro/Nuxt/
  SvelteKit/Gatsby); other stacks are audited via built HTML output only.

## Unresolved source conflicts

None material. The SEO document's lighter crawler treatment vs AEO/GEO
purpose-separation was resolved in favor of purpose-per-crawler (more
conservative). GEO §13 numeric scores (EVS/CAS/RQS/NFS/CGS) are exposed as
formulas in the posture/report templates rather than computed, because the
MVP lacks the observation volume to compute them honestly.
