---
command: /citable plan-audit --target <dir|url>
purpose: Inspect observable target signals and propose an evidence-bounded audit and collector plan without creating a run or treating inferred business profiles as facts.
preconditions: [readable built output directory or permitted public URL]
artifacts_created: []
failure_behaviour: missing or unreadable target -> fail; fewer than two supporting signals -> no profile established; unavailable optional prerequisite -> collector blocked
---

# Profile-aware audit planning

1. Run `citable plan-audit --target <dir|url>` before choosing optional
   collectors. The command builds the same bounded site model used by audit but
   does not create an audit, observation, snapshot, or remediation artifact.
2. Treat every returned profile as `probabilistic_inference`. Preserve its
   confidence and evidence list. A profile changes semantic emphasis only; it
   does not suppress detectors or establish the target's business model.
3. Use the proposed full audit as the deterministic baseline. Do not translate
   an inferred profile into a reduced audit that could hide cross-discipline
   findings.
4. Read collector states independently. `available` means the prerequisite is
   present, not that browser launch, authorization, property access, quota, or
   collection will succeed. `blocked` lists the missing input and remains
   unresolved until the relevant collector produces evidence.
5. Keep profile-specific emphasis bounded:
   SaaS focuses review on pricing, capability claims, and product identity;
   e-commerce on product/offer support; local on identity/NAP and review
   evidence; publisher on authorship/freshness; multilingual on hreflang and
   parity; API/docs on machine interfaces and authentication claims.

# Refusal boundary

Do not invent an industry, customer segment, locale strategy, product catalog,
local presence, or API capability to complete the plan. If no profile reaches
the two-signal threshold, report that none is established and run the full
audit without profile-specific emphasis.
