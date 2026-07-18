---
command: /citable validate-render
purpose: Confirm answer-bearing content exists in served HTML, not only after client-side rendering.
preconditions: [build command known, built output or deployed URL available]
failure_behaviour: build/render failure → preserve command, exit code, stderr; status incomplete, never success
---

# Workflow

1. Build with the project's recorded build command. Non-zero exit → stop,
   report failure evidence.
2. Run `citable audit technical --target <built-output>`; TECH-011
   (render-dependent primary content) is the primary detector here.
3. For each index-target page, compare extracted text of the initial HTML with
   the intended primary content (title, H1, canonical answer, claims). Content
   present only in JS payloads, accordions requiring interaction, images,
   PDFs, or canvas → finding with the specific missing passages.
4. If a headless browser is available in the environment, render and diff
   initial vs rendered text to quantify the gap; if not, record
   `incomplete_checks: rendered comparison unavailable in this environment` —
   do not extrapolate.
5. Verdict per page: `server_rendered | hybrid_acceptable | render_dependent |
   not_determined`. Never report site-wide success while any check is
   not_determined without listing it.
