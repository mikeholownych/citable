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
