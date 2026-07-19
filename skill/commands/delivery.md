# Scheduling, projections, and differential delivery

`citable schedules run <schedule-id>` executes the same canonical audit function
used by direct CLI calls. Schedules are version-pinned and fail closed when
paused, missing, invalid, or bound to another Citable version. The external
cron service remains responsible for triggering the command; a declared cron
does not prove execution. Schedule metadata is stored outside the finalized
audit package and binds back to its manifest checksum.

`citable project github <run-id>` creates GitHub annotation JSON as a
non-authoritative projection. It records hashes of the source manifest and
findings and never edits the run. Dashboards and check annotations must link to
these artifacts rather than maintain separate finding state.

`compare-snapshots` reports observed comparability dimensions: resource input,
evidence artifact, detector set, configuration, observation method, tool
version, and possible external-system change. These dimensions identify why
runs may not be directly comparable; they do not establish causal attribution.
