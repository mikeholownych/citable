# Citable audit report

- Run: `20260718T081949-audit-xg2j`
- Command: `audit`
- Target: built_output — ./site
- Timestamp: 2026-07-18T08:19:49.862Z
- Tool version: 0.1.0; commit: 379de92e11864083cec04839ba8fe51634f7d6ef (dirty)

> Findings describe observed conditions and probabilities. Nothing in this report guarantees crawling, indexing, ranking, citation, recommendation, or conversion outcomes.

## Summary

| Metric | Value |
| --- | --- |
| Total findings | 4 |
| Deterministic observations | 1 |
| Heuristic / semantic findings | 3 |
| medium | 4 |

## Skipped checks

- `LIFE-006`: missing context: snapshots
- `MEAS-001`: missing context: promptResults

## Findings

### MEDIUM · CRAWL-002 · Vendor "Google" has search-crawler access allowed but no recorded model-training decision

- Subject: `Google`
- Type: deterministic_observation; confidence: confirmed; deterministic: true
- Impact: legal:high, representation:low
- Evidence:
  - crawlers registry contains no purpose=model_training entry for vendor Google
- Remediation: Record an explicit allow/block decision, owner, and legal rationale for each training-purpose crawler of vendors whose search crawlers are allowed.
- Verify: Confirm a crawler registry entry with purpose model_training exists for the vendor. (rerun `CRAWL-002`)

### MEDIUM · PAGE-008 · Index-target page has only ~64 words (threshold 120)

- Subject: `https://example.test/` (site/index.html)
- Type: probabilistic_inference; confidence: high; deterministic: false
- Impact: ranking:medium, citation:medium
- Evidence:
  - extracted word count: 64
- Remediation: Either add substantive content for the intent or remove the page from the index target set.
- Verify: Re-measure extracted word count after revision. (rerun `PAGE-008`)
- Limitations: heuristic detection; verify manually before acting

### MEDIUM · PAGE-008 · Index-target page has only ~41 words (threshold 120)

- Subject: `https://example.test/pricing/` (site/pricing/index.html)
- Type: probabilistic_inference; confidence: high; deterministic: false
- Impact: ranking:medium, citation:medium
- Evidence:
  - extracted word count: 41
- Remediation: Either add substantive content for the intent or remove the page from the index target set.
- Verify: Re-measure extracted word count after revision. (rerun `PAGE-008`)
- Limitations: heuristic detection; verify manually before acting

### MEDIUM · PAGE-008 · Index-target page has only ~115 words (threshold 120)

- Subject: `https://example.test/products/gatekeeper/` (site/products/gatekeeper/index.html)
- Type: probabilistic_inference; confidence: high; deterministic: false
- Impact: ranking:medium, citation:medium
- Evidence:
  - extracted word count: 115
- Remediation: Either add substantive content for the intent or remove the page from the index target set.
- Verify: Re-measure extracted word count after revision. (rerun `PAGE-008`)
- Limitations: heuristic detection; verify manually before acting
