# Governance

## Scope

Citable is an Apache-2.0 open-source project. Repository governance covers the
CLI, schemas, detectors, evidence contracts, local workflows, documentation,
and published distribution. It does not govern the hosted Nebula Components
dashboard or commercial service operations.

## Sources Of Authority

1. Released schemas and CLI behavior define supported machine contracts.
2. `skill/` is the canonical source for agent distributions.
3. Repository documentation defines architecture, limitations, and policy.
4. Immutable release tags and npm provenance identify released source.
5. Issues, Projects, Discussions, and the Wiki are workflow or informational
   projections; they cannot silently change a released contract.

## Decisions

- **Routine changes** use a protected pull request and required checks.
- **Detector changes** require positive and negative fixtures and requirement
  lineage.
- **Contract changes** require compatibility analysis, migration evidence, and
  a semantic-release decision.
- **Security decisions** use private vulnerability reporting until coordinated
  disclosure is appropriate.
- **Roadmap proposals** begin in Discussions. Maintainers create an Issue only
  after scope, evidence, and acceptance criteria are adequate.

Maintainers decide by documented technical judgment, evidence quality,
compatibility impact, maintenance cost, and alignment with Citable's operating
premises. Popularity alone does not establish correctness or roadmap priority.

## Roles

- **Contributor:** submits issues, research, documentation, tests, or code.
- **Triager:** classifies intake and requests missing evidence.
- **Reviewer:** reviews within an explicitly delegated area.
- **Maintainer:** can merge changes and administer project policy.
- **Release maintainer:** can approve protected release environments.

Role progression is based on sustained, accurate contributions; respectful
collaboration; demonstrated understanding of evidence boundaries; and capacity
to maintain the work. Maintainers record appointments in `MAINTAINERS.md`.

## Conflicts And Appeals

Reviewers disclose material conflicts. A contributor may request a second
maintainer review when one is available. Conduct and security reports are not
adjudicated in public threads. Governance changes use the same protected pull
request process as product changes.

## Continuity

The project currently has a single maintainer. Required approving reviews stay
at zero until a second eligible maintainer exists, because self-approval cannot
provide independent review. Succession and inactivity handling are defined in
`MAINTAINERS.md`.
