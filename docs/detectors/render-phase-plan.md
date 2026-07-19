# Rendered-truth phase plan (RENDER namespace)

Status: **collector and browser-plan contract implemented; detector phase
pending.** `observe render` uses optional Playwright to capture desktop, mobile,
and JavaScript-disabled Chromium evidence. Schema-validated plans add explicit
Chromium, Firefox, and WebKit profiles and bounded journeys while preserving raw,
DOM, text, accessibility, screenshot, interaction, and failure artifacts. The
`RENDER` namespace remains reserved until reviewed detector inputs are complete.

## Phase objective

Establish whether the content Citable evaluates in source or initial HTML is
the content a browser, crawler, and user actually receive after rendering.
Rendering is a separate processing and failure stage (SEO source §2); the next phase
TECH-011 approximates it heuristically and acceptance criterion 6 remains
PARTIAL until this phase lands.

## Required capabilities

1. Capture initial response HTML (exists: fetch/site model).
2. Capture browser-rendered DOM (Playwright, optional peer dependency).
3. Capture visible text.
4. Capture the accessibility tree where practical.
5. Capture runtime metadata: canonical, robots directives, links, JSON-LD after execution.
6. Record network failures during render.
7. Record console errors.
8. Test desktop and mobile viewports.
9. Test JavaScript enabled and disabled.
10. Deterministic wait policies (network-idle + configurable selectors/timeouts, recorded in the run manifest).
11. Detect interaction-dependent primary content (accordion/tab/consent probes).
12. Persist screenshots and DOM snapshots into the run evidence package (`rendered/`, `screenshots/` — directories already defined).
13. Compare initial vs rendered representations.
14. Attribute differences to selectors and passages.
15. Distinguish expected hydration (identical content, framework attributes) from material content dependency.

## Planned detector set

```text
RENDER-001  Primary answer absent from initial HTML          (replaces TECH-011 heuristic)
RENDER-002  Rendered canonical differs from initial canonical
RENDER-003  Rendered robots directive differs from initial directive
RENDER-004  Structured data appears only after client execution
RENDER-005  Internal links appear only after client execution
RENDER-006  Primary content requires user interaction
RENDER-007  Mobile rendered content is materially incomplete
RENDER-008  Runtime error prevents content rendering
RENDER-009  Consent layer suppresses answer-bearing content
RENDER-010  Hydration replaces authoritative content materially
RENDER-011  Rendered page contains duplicate primary headings
RENDER-012  Browser navigation produces route-specific metadata leakage
```

All twelve are deterministic once the two representations are captured: each
compares captured initial vs rendered artifacts, so findings carry both values
as evidence. RENDER-001/002/003/004 supersede today's initial-HTML-only
verdicts; when the renderer is unavailable, RENDER detectors are skipped with
the standard `missing context` reason and the run records the incomplete check
— never a silent downgrade to the heuristic.

## Exit criteria for the phase

- TECH-011 demoted to fallback (fires only when renderer unavailable, labeled as such).
- Positive/negative fixtures: a hydration-only app (expected-clean) and a
  client-injected-content app (seeded defects) under `tests/fixtures/`.
- Acceptance criterion 6 moves PARTIAL → PASS with rendered evidence in the package.
- Wait policies and viewport matrix recorded in every render run manifest.
