---
command: /citable report dashboard [--last N] [--since <run-id>]
purpose: Fold the summary each audit run already recorded into a cross-run Markdown table and self-contained HTML page without deriving new findings, scores, or causal explanations.
preconditions: [at least one finalized audit run under .citable/runs/ with a summary.json]
failure_behaviour: fewer than two audit runs -> explicit insufficient-history state, not a trend; unreadable summary or manifest -> run reported under skipped runs; non-integer --last -> fail
artifacts_created: [.citable/reports/dashboard.md, .citable/reports/dashboard.html]
---

# Cross-run evidence reporting

1. Run `citable report dashboard` to read severity counts, retrieval
   eligibility, source extraction and support, and observed citation presence
   rate across run history. Every value is copied from a run's own
   `summary.json`. The command runs no detector, opens no network connection,
   and never edits an immutable run package.
2. Treat the output as derived, not canonical. It is written to
   `.citable/reports/`, alongside `monitor` and `action-plan` derived
   artifacts. The evidence of record remains `.citable/runs/<run-id>/`.
3. Window the history with `--since <run-id>` (keeps that run and everything
   after it) and `--last N` (keeps the final N runs). Run IDs sort
   chronologically, so both filters are deterministic.
4. Read fewer than two runs as no trend. With zero or one run the dashboard
   states insufficient history explicitly instead of drawing a line through a
   single point. Direction, rate of change, and improvement are not established
   by one observation.
5. Read skipped runs as a gap in the series, not as absence of a problem. A run
   whose `summary.json` or `manifest.json` cannot be parsed, and an observation
   run whose summary records no severity or posture, is listed with its reason
   rather than counted as zero findings.
6. Read a falling count as an observed difference between runs, not as proof
   that a condition was fixed. Use `citable compare-snapshots` to establish
   whether two runs are comparable at all — detector set, configuration,
   observation method, and tool version all change what a count means.

# Refusal boundary

Do not present the dashboard as an AI visibility score, a ranking forecast, or
a measure of citation likelihood. The three posture dimensions are reported
separately and are never combined into a single number. Do not interpolate,
estimate, or carry forward a missing value: a run with no evidenced citation
presence rate is omitted from that trend line, not filled in. Do not attribute
any observed change to a specific intervention.

# Share of voice and competitor reporting

1. Run `citable report share-of-voice [--last N] [--since <run-id>]` to evaluate
   first-party and competitor citation presence and share across recorded
   `observe citation` runs.
2. Contested competitor domains are loaded from `.citable/competitors.yaml`.
   Citations whose canonical URL matches declared competitor domains are joined
   into per-prompt and aggregate shares.
3. Competitor share is calculated strictly from evidenced observations; missing
   observations or unevaluated prompts are never filled with fabricated zeros or
   interpolated estimates.
4. Outputs are written to `.citable/reports/share-of-voice.md` and
   `.citable/reports/share-of-voice.html`.

# Canonical discovery consensus reporting

1. Run `citable report consensus [--last N] [--since <run-id>]` to evaluate
   alignment across observed publisher canonical signals (HTML `rel="canonical"`,
   Open Graph URL, sitemaps, HTTP Link headers) and external engine-observed
   canonical URLs recorded in `observe consensus` / `canonical_freshness` runs.
2. The consensus matrix maps target URLs against publisher declarations and
   engine selections (Google, Bing, Perplexity, etc.) to expose divergences and
   unresolved canonical conflicts (e.g. `TECH-019`).
3. Outputs are written to `.citable/reports/consensus.md` and
   `.citable/reports/consensus.html`.
4. Refusal boundary: Never guarantee crawling, indexing, or ranking outcomes.
   Publisher canonical declarations are treated as advisory hints to engines, not
   authoritative index guarantees. Divergences are reported as factual observations,
   never fabricated or interpolated.

# Enterprise Search Intelligence Briefing (`citable report search`)

1. Run `citable report search [--target <dir|url>] [--run <id>] [--format md|html|json] [--output <file>]`
   to generate the 19-pillar Executive Search Intelligence Briefing.
2. Synthesizes technical crawlability, indexation, Core Web Vitals readiness,
   AEO answer-extractability, GEO citation frequency, knowledge graph schema
   architecture, and competitor SERP landscape into an executive document.
3. Every recommendation binds to a verified finding in the Evidence Register.
4. Facts and inferences are strictly segregated: deterministic observations are
   reported in green data panels; strategic hypotheses and inferences are explicitly
   labeled with confidence ratings.
5. Refusal boundary: Never promises rankings, algorithmic immunity, or indexing
   guarantees.

# Enterprise CRO & Customer Journey Briefing (`citable report cro`)

1. Run `citable report cro [--target <dir|url>] [--input <file>] [--format md|html|json] [--output <file>]`
   to generate the 25-pillar Executive Conversion & Customer Journey Briefing.
2. Covers end-to-end conversion paths: above-the-fold clarity, message-match
   scoring, cognitive load, checkout friction, trust and objection analysis, offer
   architecture, and prioritized A/B experiment blueprints.
3. Strictly adheres to the **Observation vs Hypothesis vs Causation** taxonomy:
   - **Observations**: Verbatim DOM defects (e.g. missing autocomplete, undersized touch targets).
   - **Hypotheses**: Falsifiable experiment statements with measurable primary metrics and guardrails.
   - **Causation**: Statistical lift attribution requiring concluded, SRM-clean A/B experiments.
4. Refusal boundary: Revenue lift, conversion percentage improvements, and visual
   saliency scores are modeled heuristic indices, never observed behavior or guaranteed revenue.

