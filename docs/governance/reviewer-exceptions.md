# Reviewer and exception governance

Citable keeps observed technical state separate from enforcement decisions. A
failed finding remains failed when an authorized risk acceptor approves a
temporary exception. The derived disposition records that enforcement is
temporarily subject to an accepted exception; it does not rewrite the source
run or imply remediation.

## Registries

- `.citable/reviewers.yaml` declares active reviewers, roles, authorized scopes,
  and conflicts.
- `.citable/review-policies.yaml` declares required roles, separation rules,
  maximum duration, and renewal limits.
- `.citable/exceptions.yaml` binds an approval to source findings, policy,
  evidence, reviewers, residual risk, controls, expiry, and audit history.

All three are optional until an exception is proposed. Empty registries remain
valid and core audit workflows do not require reviewer configuration.

## Authority and binding

Reviewer identity alone grants no authority. The selected policy determines
required roles and separation of duties; the reviewer record determines whether
the actor is active, holds that role, and is authorized for every finding in
scope. Declared conflicts invalidate the exception.

Approved exceptions store SHA-256 hashes for each source finding, the policy
record, and every referenced evidence record. A changed or unavailable binding
invalidates the approval. These hashes establish version binding and
preservation, not source authenticity or representativeness.

## Evaluation

```bash
citable governance validate --ref-date 2026-07-19
citable governance evaluate <source-run-id> --ref-date 2026-07-19
```

Evaluation writes a new evidence package containing `dispositions.json` and
`exception-evaluations.json`. It reads but never modifies the source
`findings.json`. A valid match reports:

```json
{
  "technical_state": "failed",
  "enforcement_disposition": "accepted_exception",
  "exception_validity": "active",
  "residual_risk": "documented"
}
```

Expired, revoked, superseded, stale, conflicted, unauthorized, or
over-renewed exceptions result in `enforce`. Multiple active exceptions for one
finding result in `blocked_ambiguous_exception`; Citable does not choose one.

## Limits

The contract can validate supplied reviewer and approval records. It cannot
prove a person's identity, competence, organizational independence, or legal
authority without external evidence. Organizations must define policies that
match their actual authority model and retain the supporting identity and risk
records required by their governance regime.
