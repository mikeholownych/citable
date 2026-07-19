# npm Trusted Publishing

Citable publishes to npm as `@nebulacomponents/citable`.

Trusted publishing uses GitHub Actions OIDC instead of a long-lived npm publish
token. The repository workflow is `.github/workflows/npm-publish.yml`.

The package is published. Releases use package-scoped trusted publishing and a
two-phase finalization process; maintainers should not add a long-lived npm
token to repository or environment secrets.

## npm Settings

Open:

```text
https://www.npmjs.com/package/@nebulacomponents/citable/access
```

In the trusted publisher settings, choose GitHub Actions and use:

```text
Organization or user: mikeholownych
Repository: citable
Workflow filename: npm-publish.yml
Environment name: npm-publish
Allowed actions: npm publish
```

The workflow filename must be only the filename, not
`.github/workflows/npm-publish.yml`.

## GitHub Settings

Create the `npm-publish` environment in GitHub:

```text
Repository Settings -> Environments -> New environment -> npm-publish
```

Recommended protection:

- Required reviewers: at least one maintainer.
- Deployment branches/tags: protected tags matching `v*.*.*`.

Create a second `release` environment for the tag-and-GitHub-release workflow:

- Required reviewers: at least one maintainer.
- Deployment branches: `main` only.

Protect `main` with pull requests and require these checks:

- `PR structure and release notes`
- `test`
- `lint`
- `npm package (ubuntu-latest)`
- `npm package (macos-latest)`
- `npm package (windows-latest)`

Require at least one approving code-owner review when the repository has a
second eligible maintainer. A single-maintainer repository must use zero
required approvals or every PR will deadlock because authors cannot approve
their own changes. In both cases, dismiss stale approvals, block force pushes
and deletions, require conversation resolution, and apply the same rules to
administrators. Protect tags matching `v*.*.*` from updates and deletion. These
settings are repository controls and cannot be proven by files in this checkout;
verify them in GitHub settings before relying on the process.

The workflow uses this environment, so npm can bind publishing authority to the
same environment name.

## Release Process

1. Merge ordinary feature and fix PRs with entries under `CHANGELOG.md`
   `Unreleased`. Do not bump the package version in those PRs.
2. Dispatch `Prepare release branch` on `main` with the selected stable semantic
   version. The workflow rejects malformed or non-incrementing versions, an
   empty `Unreleased` section, and an existing release branch.
3. Follow the workflow summary link and open `release/vX.Y.Z` as a pull request
   titled `release: vX.Y.Z`. A maintainer opens this PR rather than the workflow
   because GitHub suppresses ordinary PR workflow events for PRs created by the
   repository `GITHUB_TOKEN`. The branch updates `package.json`, the lock file,
   changelog, and roadmap, rebuilds distributions, and runs all tests.
4. Merge the release PR through normal protected-branch checks.
5. Dispatch `Ship release` with the same version. The protected `release`
   environment gates tagging. The workflow revalidates version consistency,
   tests, builds distributions, creates and validates the canonical release
   manifest, and creates the tag plus a **draft** GitHub release. The release is
   now a candidate; it is not finalized or latest.
6. `Ship release` explicitly dispatches `.github/workflows/npm-publish.yml` at
   the new `vX.Y.Z` tag. The publishing workflow accepts only an explicit
   dispatch at that immutable tag; direct tag pushes cannot invoke npm
   publication. It refuses duplicate versions, tests again, and publishes with
   npm OIDC provenance after the `npm-publish` environment review.
7. After npm publishes, the publishing workflow records
   `published_unfinalized` in the release-state asset. Published npm artifacts
   are immutable, but release promotion remains blocked.
8. Deploy the generated `resource-data.json` and `llms.txt` projections through
   the controlled website pipeline. That pipeline must post-fetch each live
   surface, validate the observed projection hash against the release manifest,
   and upload one `deployment-receipt-<surface>.json` asset per required surface.
   Receipts are publisher-controlled execution evidence, not independent
   attestation.
9. Dispatch `Finalize release`. It downloads the manifest, state, generated
   projections, and receipts; refuses missing, duplicate, expired,
   contradictory, malformed, or hash-mismatched evidence; then records the
   immutable `finalized` transition and publishes the draft release as latest.
10. Verify the finalized GitHub release, npm version and provenance, registry
    install, release-state asset, and controlled surfaces. Record workflow URLs
    and the released commit SHA in the release issue.

Finalization is a one-way point-in-time attestation. Later receipt expiry,
rollback, or projection drift creates a new observation or finding and never
reopens the historical release.

The controlled deployment pipeline creates each receipt from a captured
observation document:

```bash
node scripts/release-governance.js receipt \
  release-manifest.json \
  deployment-observation.json \
  deployment-receipt-nebula-llms-txt.json
```

The observation supplies the exact controlled URL, observed projection hash,
raw response hash, HTTP status/final URL/redirects/headers, collector identity
and version, request identity, region, collection and expiry timestamps, and
limitations. The command derives authority and verification status; callers
cannot promote the receipt to independent attestation.

Local preparation is available for diagnosis only:

```bash
npm run release:prepare -- X.Y.Z
npm run release:validate -- X.Y.Z
```

Do not push a locally prepared release directly to `main`; use the release PR.

## Recovery

- If the release PR fails, fix the cause on its branch and rerun all required
  checks. Do not ship from a partially validated commit.
- If tagging fails, no npm publication should occur. Correct the workflow or
  environment control and redispatch after confirming the tag is absent.
- If npm publication fails after the tag exists, do not move or recreate the
  tag. The GitHub release remains a draft candidate. Fix the publishing path and
  rerun the failed workflow for the same immutable source version.
- If the ship workflow created the tag but did not dispatch publishing,
  dispatch the npm workflow manually at that immutable tag with the exact
  version. The workflow rejects branch refs and mismatched tags.
- Published npm versions are immutable. Any package defect requires a new patch
  release; deprecate the defective version when appropriate.
- If controlled deployment cannot be verified before the configured dwell
  deadline, preserve every failed receipt and resolve the release as
  `withdrawn` or `superseded`. Never delete the tag, package, or evidence to hide
  the failed finalization. Use the protected `Resolve unfinalized release`
  workflow; it refuses resolution before the deadline and publishes the
  terminal record as non-latest prerelease evidence.

## Manual Fallback

The normal release path is the prepare, ship, publish, controlled-deployment,
and finalize workflow sequence above. Direct tag pushes are not a publishing
fallback. The npm workflow may be dispatched manually only at an immutable tag
and exact version already created by `Ship release`; it refuses branch refs and
does not replace the draft release or candidate-state requirements.

The workflow fails closed if:

- the requested version does not match `package.json`
- the workflow ref is not the exact requested release tag
- the version already exists on npm
- tests fail
- the package dry-run fails
- GitHub cannot mint an OIDC token for npm

## Configuration Audit

An authorized maintainer can inspect the active package-scoped binding with:

```bash
npm trust list @nebulacomponents/citable
```

The command requires package write access and may require an interactive npm
OTP. A successful release workflow proves that npm accepted the workflow's
OIDC identity for that publication; it does not prove that the binding will
remain unchanged for future releases.
