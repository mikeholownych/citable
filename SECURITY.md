# Security policy

Report vulnerabilities privately via repository issues marked confidential or
to the maintainer. Do not include live credentials or customer data in
registries or evidence packages; `.citable/` is project-local state and should
be reviewed before committing to shared repositories.

Citable never executes fetched page content. URL-mode audits perform plain
HTTP GETs with a declared user agent; run them only against sites you are
authorized to audit. The GEO-001 detector reports crawler prompt-injection
content; Citable must never be used to create such content.
