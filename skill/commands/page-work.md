---
command: /citable create-page, answer-block, architect, interlink, consolidate, metadata
purpose: Page-construction and architecture workflows sharing optimize-page's guardrails.
---

# create-page
1. Preconditions: a registered query/prompt with no existing target (else it's
   ARCH-004 territory — consolidate instead); an assigned content owner; the
   facts the page needs (from registries and operator), never invented.
2. Compose per the generative-ready pattern: canonical answer (50–100 words) →
   definition + exclusions → why it matters (operational, not marketing) →
   mechanism → evidence → comparison → boundary conditions → implementation →
   revision metadata → related entities.
3. Claims on the page must pre-exist in the claim registry (or be added as
   candidates and pass substantiate + evidence-strength review before launch).
4. Register the page; run post-modification validation (build → audit →
   compare-snapshots).

# answer-block
Insert/repair a direct answer block on an existing page. Constraints: the block
answers the page's principal question, is self-contained (answer-extractability
rubric), includes in-passage scope, and does not displace the conversion action
(conversion-alignment rubric). Verify ANS-001/002/008 do not fire afterwards.

# architect
Propose site/topic architecture: one canonical URL per material intent,
hub-and-spoke relationships, shallow depth for priority pages, separation of
informational and transactional intents. Output is a written proposal +
page-registry changes in `draft`; it never mass-moves URLs without a migration
plan (redirect map, sitemap regeneration, canonical updates) recorded first.

# interlink
Add internal links only where a semantic relationship exists in the registries
(same topic entities, claim→evidence, spoke→hub, implementation→commercial
next step). Descriptive anchors; never bulk term-matched insertion (LINK-004).
Verify LINK-001/002/003 and ARCH-001/002/006 after.

# consolidate
For ARCH-004/005 findings: choose the survivor URL (stronger inbound links +
better intent fit), merge unique content preserving claim boundaries, 301 the
losers, update sitemap + canonicals + registry (losers → status retired with
successor recorded), rerun audit. Never delete content that is the only
publication surface of an active claim without re-homing the claim.

# metadata
Title/description work: titles identify and differentiate (PAGE-001/002),
descriptions summarize accurately and never promise absent content. Both are
derived from page substance — metadata never asserts what the page doesn't say.
