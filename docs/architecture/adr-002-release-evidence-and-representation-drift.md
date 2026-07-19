# ADR-002: Release evidence and representation drift

Status: accepted · Date: 2026-07-19

## Context

Citable's release state is projected across several surfaces: the Git commit and
tag, npm package, GitHub release, generated skill distributions, Nebula
Components resource page, `llms.txt`, and retrieval intermediaries outside the
publisher's control. These surfaces do not update through one transaction and
do not carry equal evidence authority.

On 2026-07-19, an AI consumer reported repository documentation that described
an older Citable capability set. Direct inspection of GitHub `main` at commit
`8dd1c551b7e76c228a0d2fdf41c2dac53cf5146c` showed the current capability
claims. Separately, a direct inspection of the publisher-controlled
`https://nebulacomponents.shop/llms.txt` showed Citable v1.3.1 and 119 detectors,
which conflicted with the current release. Requests using declared crawler user
agents also encountered edge behavior that differed from published crawler
policy.

The observations establish two different failure classes:

1. **Publisher-controlled projection drift:** a controlled publication surface
   conflicts with the canonical release manifest.
2. **Retrieval-path representation drift:** an external consumer or
   intermediary returns a representation that conflicts with the canonical
   release manifest.

The first class is publisher-remediable and can participate in release
governance. The second can be observed but cannot be certified absent across
uncontrolled caches, indexes, retrieval systems, regions, or products. The AI
consumer report is motivating evidence of the second class, not proof of the
intermediary's identity, selection process, cache state, or representativeness.

This decision applies Citable's existing evidence taxonomy: build-time
projections are control-plane evidence, deployment receipts are
owner-controlled execution evidence, and intermediary observations are
external and unverified. A checksum establishes preservation, not authenticity,
completeness, independence, or representativeness.

## Decision

### 1. Use one canonical release manifest

The release commit produces a versioned canonical manifest containing the
release version, commit, projection identifiers, expected content hashes, tool
versions, and schema version. Build-time projections must be generated from
canonical repository sources and bound to that manifest. Manually maintained
duplicates are not release authorities.

The following are build-time projections and must pass phase-one validation:

- package and lock-file versions;
- canonical skill metadata;
- generated agent distributions;
- packaged npm metadata and README;
- detector, namespace, registry, and distribution counts;
- changelog and release-note inputs;
- externally deployable resource-page and `llms.txt` projection artifacts.

A mismatch, missing projection, uncommitted generated change, or checksum that
does not derive from the release commit blocks publication. Exceptions are not
permitted for phase-one consistency failures.

### 2. Use a two-phase release state machine

External deployments necessarily occur after immutable package publication and
cannot be included in an atomic npm, GitHub, and web-host transaction. Releases
therefore use these states:

```text
candidate
  -> published_unfinalized
       -> finalized
       -> superseded
       -> withdrawn
```

Phase one moves a validated candidate to `published_unfinalized` by creating
the immutable package and release references. Phase two may move it to
`finalized` only after every required publisher-controlled surface supplies a
valid deployment receipt. The `latest` designation, public GitHub release
publication, and release announcements remain blocked until finalization.

`published_unfinalized` has a policy-defined maximum dwell time. Before that
deadline, maintainers must either remediate and finalize the release or resolve
it as `superseded` or `withdrawn`. Resolution preserves the package, tag, failed
receipts, and rationale; it never rewrites or deletes historical evidence.

Every transition records the actor, timestamp, source state, destination state,
reason, policy version, and evidence references. Invalid transitions fail
closed.

### 3. Make finalization an immutable point-in-time attestation

Finalization attests that required controlled surfaces matched the canonical
manifest at a recorded time. It is a one-way transition. Receipt expiry,
subsequent rollback, out-of-band editing, or later surface drift does not
de-finalize or reopen a release. It creates a new drift observation or finding
against the finalized release.

This prevents historical release state from flapping while preserving evidence
that the current publisher representation has changed.

### 4. Treat deployment receipts as owner-controlled execution evidence

A deployment receipt records at minimum:

- release and canonical-manifest identity;
- controlled surface and expected URL;
- expected and observed versions and content hashes;
- HTTP status, final URL, redirect chain, and relevant response headers;
- collector identity and version;
- collection method, request identity, region, and timestamp;
- authority, authenticity, and representativeness classifications;
- verification result, limitations, expiry, and receipt checksum.

Receipts are collected by or for the publisher. They are sufficient execution
evidence for the publisher's release gate, but they are not independent
attestation. Missing, expired before finalization, contradictory, malformed, or
unverifiable required receipts block finalization.

External observations may corroborate a receipt but may not substitute for a
required controlled-surface receipt or independently satisfy the release gate.

### 5. Monitor retrieval-path drift as a separate longitudinal instrument

A scheduled instrument compares the canonical manifest with observations from
defined retrieval paths. It should capture direct and cache-busted requests and
may add disclosed proxy or consumer paths where collection is permitted and
reproducible. Each observation records:

- expected release-manifest identity;
- retrieval path, request identity, region, and collection method;
- observed version, content hash, status, redirects, headers, and challenges;
- first observed divergence, continued observations, and convergence time;
- collector and adapter versions;
- raw artifact references and checksums;
- authority label `external_unverified` for uncontrolled intermediaries;
- known collection and sampling limitations.

The instrument reports observed representation lag and time-to-consistency
distributions. It does not claim that sampled paths represent all caches,
indexes, providers, products, accounts, geographies, or users. Its observations
never gate release finalization.

### 6. Make field validation part of v1.13

The v1.13 acceptance corpus covers four property classes, including Citable's
own Nebula Components publication surface and the 2026-07-19 incident. The
incident retains separate findings for publisher-controlled projection drift
and retrieval-path representation drift.

Corpus records preserve assumptions, unavailable evidence, raw artifacts,
deterministic and heuristic findings, reviewer decisions and disagreements,
exceptions, interventions, verification results, execution cost, product
defects, false positives, and discovered false negatives. Published metrics
include detector precision by namespace, false-positive and discovered
false-negative rates, reviewer agreement and adjudication, runtime and resource
consumption, remediation-verification success, run reproducibility, and
incomplete-evidence rate. Sampling and extrapolation limits remain explicit.

PR #35 merged executive reporting independently before this ADR was published.
That reporting work remains outside the v1.13 release-governance scope and does
not satisfy or replace any implementation gate in this decision. Distribution
promotion follows the gate, drift instrument, corpus, and accuracy publication.

## Alternatives considered

### Treat drift as an advisory release report

Rejected. An advisory consistency report permits publication despite known
controlled-surface contradictions and does not enforce Citable's fail-closed
governance premise.

### Publish every surface in one atomic transaction

Rejected. npm, GitHub, the website host, and uncontrolled retrieval
intermediaries do not share a transaction boundary. Claiming atomicity would
misrepresent both execution and external propagation.

### Block npm publication until external deployment receipts exist

Rejected. Controlled web deployments consume release artifacts and therefore
follow package or release-reference creation. This creates an ordering cycle.
The two-phase state makes that intermediate condition explicit instead.

### Revoke finalization when receipts expire or later drift appears

Rejected. Finalization is a historical point-in-time attestation. Reversing it
would conflate release evidence with later operational state and make immutable
release history unstable.

### Allow intermediary observations to finalize a release

Rejected. Uncontrolled observations cannot prove publisher deployment state,
source authenticity, completeness, or representativeness. They belong to the
drift instrument, not the authority path.

### Build the hosted dashboard or executive reporting first

Rejected for v1.13. Presentation must project canonical evidence and governed
state. It cannot precede the release controls and field evidence it would
present.

## Consequences

- Release automation becomes more deliberate and may leave immutable artifacts
  in the honest intermediate state `published_unfinalized`.
- Operators need a documented remediation and terminal-resolution path for
  failed controlled deployments.
- Controlled projection drift blocks finalization; uncontrolled representation
  drift remains observable and actionable without being overstated.
- Release announcements may lag package publication while receipts are
  collected.
- Publisher receipts improve operational confidence but remain explicitly
  owner-controlled evidence.
- Citable's release process uses the same evidence and authority distinctions it
  requires from audited properties.

## Implementation gates

This ADR records the accepted design; it does not establish implementation.
v1.13 cannot be described as delivering this decision until tests prove:

1. canonical manifest generation and deterministic projection checks;
2. phase-one refusal for every inconsistent build-time projection;
3. valid and invalid state transitions, maximum dwell, and terminal resolution;
4. phase-two refusal for missing, stale, contradictory, or malformed receipts;
5. immutable finalization followed by independently recorded post-release drift;
6. longitudinal observations that cannot acquire release-gating authority;
7. corpus artifact validation, reproducibility, and bounded metric calculation;
8. packed-package and Node 24 release-path behavior.
