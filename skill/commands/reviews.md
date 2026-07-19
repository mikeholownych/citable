# Semantic review queues and sampling

Use `reviews queue` to create hash-bound review work from heuristic or
review-required findings. Newly queued items expose all missing materiality
inputs and remain `insufficient_inputs`; model confidence alone never controls
priority. After authorized operators supply business importance, citation
frequency, evidence age and authority, regulatory exposure, intervention
impact, change magnitude, and disagreement history, use `reviews prioritize`.

Sampling plans support only `census` and reproducible `simple_random` methods.
Every selection records its seed, population hash, inclusion/exclusion criteria,
assignment method, and extrapolation limits. Do not present sampled review as
complete validation or generalize beyond the recorded population.

`reviews evaluate` rejects stale or unauthorized decisions. Distinct verdicts
produce `adjudication_required`; vote counting never establishes semantic truth.
Completion requires an evidence-linked, hash-bound decision from an active
independent reviewer.
