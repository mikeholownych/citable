# Citable Outreach (@nebulacomponents/citable-outreach)

Autonomous outreach and backlink acquisition product line consuming the Citable shared evidence substrate.

## Architecture Boundary

Per `docs/BACKLOG.md` § Wave 8:
- Outreach is a separate product line with its own execution-authorization model.
- Folding outreach into Citable core would put state-changing external communication behind the same entry point as read-only observation and compromise Citable's fail-closed posture.
- This package consumes Citable's shared evidence substrate, but operates independently.
- Citable's `src/discovery/backlinks.js` preserves passive backlink observations while strictly rejecting outreach, acquisition, or link-quality judgments (ER-10).

## Capabilities (B-080 through B-089)

- `B-080`: Opportunity discovery with preserved immutable raw observation vs derived hypothesis.
- `B-081`: Separate domain and page qualification; non-canonical third-party authority metrics.
- `B-082`: Asset inventory, linkability evaluation, and NO_LINKABLE_ASSET / ASSET_GAP detection.
- `B-083`: Public contact resolution retaining crawl source; refusing inferred private data or billing addresses.
- `B-084`: Suppression registry, deduplication, and cross-agent concurrency control overriding campaign logic.
- `B-085`: Outreach drafting with full provenance; rejecting fabricated familiarity, statistics, or relationships.
- `B-086`: Execution boundary and authorization guard enforcing explicit human authorization, suppression, circuit breaker, and fail-closed budget checks.
- `B-087`: Sending controls, deliverability monitoring (SPF, DKIM, DMARC, bounce/spam), reputation circuit breaker, and 6-level kill switches.
- `B-088`: Independent link verification via direct HTML crawl observation (ignoring publisher claims alone), follow/nofollow preservation, and loss/modification detection.
- `B-089`: Strategy performance and acquisition economics; strictly prohibiting assertion of ranking causation from acquired links.
