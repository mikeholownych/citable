# Rubric: information gain

Judges whether a page contributes information not available elsewhere — the
difference between a citable source and a summary of other sources.

## Scoring dimensions

1. **Original artifact presence** — at least one of: original data, benchmark,
   controlled experiment, incident analysis, reference architecture,
   proprietary taxonomy (defined, not just named), survey, reproducible
   methodology, first-party operational observation, reusable tool.
2. **Non-derivability** — could a competent writer produce this page from the
   current top results alone? If yes, gain is synthetic.
3. **Specificity** — concrete versions, numbers-with-methodology, named failure
   modes; not abstract advice.
4. **Reproducibility** — methods described well enough to re-run or falsify.

## Posture

`strong` (dimension 1 + 2 hold), `partial` (original framing, no original
artifact), `weak` (restatement of existing sources), `not_established`
(gain claimed from internal data that is not published — publish it or drop
the claim of originality).

## Counterexample

"10 best practices for AI governance" synthesized from existing articles, with
an LLM paraphrase pass — scores `weak` regardless of length or formatting.

## Ambiguity → human review

- Gain rests on unpublished internal data (publication/licensing decision).
- Original data involves customers or regulated metrics.
