# Governance validation and exception evaluation

Use `citable governance validate` before relying on any accepted exception. It
validates reviewer roles and scopes, conflicts, policy requirements, separation
of duties, source bindings, expiry, renewal, and referential integrity.

Use `citable governance evaluate <run-id>` to create a new immutable evidence
package. The command never edits the source run. Every source finding retains
`technical_state: failed`; a valid exception is represented only as
`enforcement_disposition: accepted_exception` with active validity and
documented residual risk.

Refuse authorization when policy, finding, or evidence hashes have changed;
the exception is expired, revoked, superseded, conflicted, unauthorized, or
over-renewed; required roles are absent; or more than one active exception
matches a finding. Reviewer records are declarations and do not independently
prove real-world identity, competence, independence, or legal authority.

## Governed exception lifecycle

Use `citable exceptions <list|renew|invalidate>` to inspect and maintain exceptions in `.citable/registries/exceptions.yaml`:

- `citable exceptions list [--expired] [--expiring-soon <days>] [--ref-date YYYY-MM-DD]`:
  Surfaces active, expiring soon, expired, and revoked exceptions with remaining days and renewal counters. Expired exceptions fail closed.
- `citable exceptions renew --id <exception-id> --until <YYYY-MM-DD> --reviewer <reviewer-id> [--evidence <id>] [--note <text>] [--write]`:
  Extends expiration under strict reviewer authority checks, policy renewal caps, and max duration limits. Appends an immutable renewal event to the exception's audit history.
- `citable exceptions invalidate --id <exception-id> --reason <text> --reviewer <reviewer-id> [--write]`:
  Revokes an active exception with mandatory justification, recording the actor and note in the audit trail.

