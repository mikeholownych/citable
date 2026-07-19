# Known limitations

## Media evidence

- PDF collection extracts native text, basic metadata, and page anchors. It does
  not fully validate reading order, tables, footnotes, signatures, revisions,
  accessibility tags, scanned text, or visual meaning.
- Transcript collection preserves imported cues and provenance but does not
  prove speaker identity, transcription accuracy, timing accuracy, or parity
  with the original audio or video.
- Image collection relates visible `alt`, `figcaption`, and nearby figure text.
  OCR is disabled unless explicitly requested and requires optional
  `tesseract.js`; extracted text does not establish semantic equivalence.
- Media-to-claim links establish declared relationships only. Human semantic
  review remains authoritative for whether media supports a claim.

Stated plainly so nobody mistakes the MVP's coverage for the full requirement
surface.

## Not implemented (documented gaps)

- **Provider coverage is uneven.** Google URL Inspection, GSC Search Analytics,
  GA4 Data API, and CrUX have live API
  paths. Bing index evidence and consumer answer-product observations still
  require owner exports or a disclosed custom adapter. An API adapter is not
  presumed equivalent to ChatGPT, Perplexity, Copilot, or another consumer mode.
- **Verified crawler observations require owner evidence.** Citable validates a
  staged identity contract and can classify imported events as fully verified,
  contradictory, or insufficient. It does not independently operate a
  multi-region edge/origin collector or prove events absent from supplied logs.
  Imports reject credential/cookie field names, but owners remain responsible
  for minimizing and lawfully supplying URL, query, and network log data.
- **Search-index coverage is partial.** Google inspection is live; Bing and
  other engines require normalized owner exports.
- **Bing AI Performance is owner-export only.** Citable has not captured a
  supported API contract for the public-preview dashboard. Its citation counts
  do not prove ranking, authority, placement, importance, or material support.
- **Browser rendering is optional and Chromium-bounded.** `observe render`
  captures independent desktop, mobile, and JavaScript-disabled DOM, text,
  screenshot, failed-request, and parity evidence when Playwright and Chromium
  are installed. Interaction execution is limited to visible disclosure,
  inactive-tab, and load-more-like controls. Cross-browser comparison,
  authenticated journeys, consent decisions, and application-specific flows
  remain unproven.
- **Passage analysis is heuristic.** `observe passages` creates candidates and
  noise ratios, but semantic independence and support still require review.
- **Citation correctness remains human-authoritative.** Citable normalizes
  claim/passage review records and missing reviews; automated inference never
  silently becomes a confirmed support verdict.
- **Performance collection remains bounded.** CrUX field data, owner exports,
  or repeated local Lighthouse lab runs can be collected. Lighthouse and
  Chrome launcher are optional peers; local results vary by host and profile.
  CWV-001..003 remain infrastructure-readiness checks rather than proof of
  field performance.
- **Connector authentication is operator-managed.** Citable accepts existing
  OAuth access tokens through environment variables. It does not run an OAuth
  consent server, store refresh tokens, or guarantee uninterrupted access.
- **No visual or media-entailment detectors.** Bounded PDF, transcript, and
  image-context collectors preserve extraction evidence, but they do not judge
  whether visual or media content supports a claim. Video/audio decoding and
  sampled-media parity remain unimplemented.
- **Screenshots/rendered directories** are populated only for render profiles
  that complete successfully; partial failures remain explicit observations.
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
