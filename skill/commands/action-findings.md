---
command: /citable action-plan [run-id]
purpose: Convert observed findings into ordered remediation work without changing the immutable audit package or inventing implementation facts.
preconditions: [completed audit run with findings.json and manifest.json]
artifacts_created: [.citable/actions/<run-id>/action-plan.json, .citable/actions/<run-id>/action-plan.md]
failure_behaviour: missing or invalid source run -> fail; review-required action without owner -> blocked with required_input
---

# Detection-to-action workflow

1. Generate the plan with `citable action-plan <run-id>`. Confirm the stored
   `source_findings_hash` still matches the source audit before acting.
2. Triage in generated phase order: unblock, governance, content, optimization.
   Do not skip an earlier phase when it invalidates later evidence or rendering.
3. Assign owners. Resolve each blocked action's exact required input. Missing
   facts, evidence, legal review, or semantic review are blockers, not drafting
   opportunities.
4. Capture a before state for each subject. Use the finding's evidence,
   preferred remediation, unsafe shortcuts, and detector lineage as the change
   boundary.
5. Apply the semantic gates listed on the action using the named rubrics. Store
   quoted passages and registry records supporting the posture decision.
6. Implement the smallest defensible change in canonical source. Registry
   writes use the loader/saver and retain history. Content claims remain equal
   to or narrower than their registered scope.
7. Build and test the target repository. Run the generated verification
   command, then compare the new audit to the source run.
8. Close only with evidence: resolved detector/subject pair, before/after run
   IDs, diff, reviewer, and residual risk. Mark blocked, accepted risk, and
   false positive explicitly; do not silently drop findings.

# Execution boundary

`action-plan` plans and records work; it does not automatically rewrite a site.
Source mutation remains agent/operator work because arbitrary repositories need
their own build architecture, review authority, and rollback path. Follow
`optimize-page.md` or `page-work.md` when the action requires page changes.
