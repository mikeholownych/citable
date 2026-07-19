# Portable artifact interchange

Use artifact interchange to move one sealed Citable run between local or
external workspaces without changing its canonical bytes.

```sh
citable artifacts export <run-id> --output <directory>
citable artifacts verify --input <directory>
citable artifacts import --input <directory>
```

An export contains the original run package plus
`citable-artifact.json`. The versioned envelope binds the run identity,
exporter identity, source-run versions, manifest and checksum hashes, exact
artifact inventory, byte sizes, and a canonical package hash. Verification rejects missing,
additional, modified, unsafe, or symbolic-link entries. Import verifies into a
temporary directory before atomically creating `.citable/runs/<run-id>`.

Import never rewrites the run manifest, checksums, or artifacts. An identical
existing run is `already_present`; a different package with the same run ID is
a collision and fails closed. The interchange envelope is transport metadata
and is not copied into the canonical run package.

Checksums prove preservation after export. They do not prove that the source
was authentic, that external observations were representative or complete, or
that an intervention caused an outcome. Hosted tenancy, authentication,
storage, retention, billing, scheduling, and dashboards are outside this
contract.
