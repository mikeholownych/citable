# Rubric: intent alignment

Judges whether page content actually serves the intent declared in the page
registry and the queries/prompts mapped to it.

## Scoring dimensions

1. **Declared vs delivered** — a page targeting "vendor evaluation" must contain
   evaluation material (capabilities, limitations, pricing qualification,
   comparison), not a re-titled awareness article.
2. **Intent purity** — informational and transactional intents separated unless
   the registry deliberately combines them.
3. **Query/prompt fit** — for each mapped query_id/prompt_id, the page contains
   the expected answer components recorded in the registry.
4. **Next-step coherence** — the conversion action matches the funnel stage
   (awareness pages don't push "buy now"; selection pages don't end at a blog
   subscription).

## Posture

`strong` (all mapped queries served, next step coherent), `partial` (primary
query served, variants uncovered), `weak` (declared intent contradicted by
content), `not_established` (no registry mapping — run `/citable map-queries`
first).

## Evidence required

The registry mapping rows plus quoted page passages that do (or fail to) serve
each expected answer component.

## Counterexample

A page registered for "how to implement X" (implementation intent) whose body
is a category pitch with no steps — flagged by ANS-006 deterministically; this
rubric additionally judges whether the *substance* matches even when an ordered
list exists.

## Ambiguity → human review

- Commercial vs informational intent contested for a revenue-relevant page.
- Two registries map conflicting intents to the same URL (also ARCH-004/005).
