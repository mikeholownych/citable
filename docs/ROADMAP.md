# Citable v1.0.0 Roadmap

**Goal:** Production-grade SEO/AEO/GEO governance tool suitable for npm public release with semantic versioning guarantees.

## Current State (v0.1.0)

| Metric | Value |
|--------|-------|
| Detectors | 102 across 15 namespaces |
| Tests | 46 pass |
| Registries | 9 schema-validated |
| Providers | 12 agent hosts |
| CI | ✅ tests pass, ❌ release-gates failing |
| npm | ❌ not published (trusted publisher config pending) |

## Known Gaps (from docs/known-limitations.md)

1. **No live engine adapters** — no Search Console, Bing API, ChatGPT/Perplexity automation
2. **No browser rendering** — TECH-011 is heuristic only
3. **No Core Web Vitals** — no field/lab data collection
4. **No hreflang/international** — no locale-specific checks
5. **No multimodal detectors** — no image/video evidence beyond alt text

## v1.0.0 Scope (MVP+1)

### Must Have (Release Blockers)

| # | Item | Status | Effort |
|---|------|--------|--------|
| 1 | **npm trusted publisher** — fix npm-publish workflow | ❌ failing | 1h |
| 2 | **release-gates CI** — fix Windows/macOS tests | ❌ failing | 2h |
| 3 | **Schema validation coverage** — 100% of detectors have JSON-Schema | ⚠️ partial | 4h |
| 4 | **Error boundaries** — graceful failure, not crash | ⚠️ partial | 3h |
| 5 | **Documentation audit** — README, CHANGELOG, CLAUDE.md consistent | ⚠️ partial | 2h |
| 6 | **Version stability** — API contract compatibility guarantee | ❌ missing | 2h |

**Total: ~14h**

### Should Have (Quality)

| # | Item | Status | Effort |
|---|------|--------|--------|
| 7 | **Hreflang detector** — ARCH-007, LINK-005 | ❌ missing | 4h |
| 8 | **Sitemap validation** — CRAWL-007 (strict XML validation) | ⚠️ basic | 2h |
| 9 | **Retry/backoff** — URL fetch resilience | ❌ missing | 2h |
| 10 | **Progress output** — TTY progress bars | ❌ missing | 3h |
| 11 | **Config file** — `.citable/config.yaml` support | ✅ exists | 0h |
| 12 | **Exit codes** — POSIX-compliant exit codes | ⚠️ partial | 1h |

**Total: ~12h**

### Nice to Have (v1.1+)

- **Browser rendering** — Playwright/Puppeteer integration
- **Core Web Vitals** — lighthouse CLI integration
- **Live engine adapters** — Search Console API, Bing Webmaster API
- **Multimodal detectors** — image OCR, video transcript analysis

## Release Criteria

### v1.0.0 Definition of Done

1. ✅ All tests pass on CI (Linux, macOS, Windows)
2. ✅ `npm install -g @nebulacomponents/citable` works
3. ✅ `npx @nebulacomponents/citable install` works globally
4. ✅ `npx @nebulacomponents/citable install --providers=claude` works in project
5. ✅ `npx @neculacomponents/citable audit` produces evidence package
6. ✅ CHANGELOG documents breaking changes
7. ✅ No crashing on invalid input (graceful error messages)
8. ✅ Semantic versioning: MAJOR.MINOR.PATCH
   - MAJOR: breaking API changes
   - MINOR: new detectors, new commands, backwards-compatible
   - PATCH: bug fixes, documentation

## Timeline

| Phase | Scope | Duration |
|-------|-------|----------|
| **Phase 1** | Fix CI, fix npm publish | 1 day |
| **Phase 2** | Error boundaries, exit codes, docs | 1 day |
| **Phase 3** | Schema validation, hreflang, sitemap | 2 days |
| **Phase 4** | Polish, release prep, v1.0.0 tag | 1 day |

**Total: ~5 days**

---

## Post-v1.0.0 Backlog

### v1.1.0 — Live Engine Integration

- Search Console API adapter (query performance, indexing status)
- Bing Webmaster API adapter
- GA4 integration for conversion tracking
- Real-time ranking position check (with rate limiting)

### v1.2.0 — Browser Rendering

- Playwright integration for SSR verification
- Mobile/desktop parity checks
- JavaScript execution timing
- Screenshot evidence capture

### v1.3.0 — Core Web Vitals

- Lighthouse CLI integration
- Performance budget gates in CI
- Field data integration (CrUX API)

### v2.0.0 — Multimodal

- Image OCR for text-in-image evidence
- Video transcript extraction
- Audio file transcription
- PDF evidence extraction
