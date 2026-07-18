# npm Trusted Publishing

Citable publishes to npm as `@nebulacomponents/citable`.

Trusted publishing uses GitHub Actions OIDC instead of a long-lived npm publish
token. The repository workflow is `.github/workflows/npm-publish.yml`.

The package is published. Releases use the tag-triggered workflow and the
package-scoped trusted-publisher binding described below; maintainers should not
add a long-lived npm token to repository or environment secrets.

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
   tests, and the packed artifact before creating the tag and GitHub release.
6. The `vX.Y.Z` tag triggers `.github/workflows/npm-publish.yml`, which verifies
   the tag is based on `main`, refuses duplicate versions, tests again, and
   publishes with npm OIDC provenance.
7. Verify the GitHub release, npm version, provenance, and install from the
   registry. Record workflow URLs and the released commit SHA in release notes
   or the release issue.

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
  tag. Fix the publishing path and rerun the failed tag workflow for the same
  immutable source version.
- Published npm versions are immutable. Any package defect requires a new patch
  release; deprecate the defective version when appropriate.

## Manual Fallback

The normal release path is the two-workflow process above. The commands below
are emergency-only and still require every release check and repository
protection:

Publish from a version tag:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The npm publish workflow can also be dispatched manually with the exact version
from `package.json`, but this does not create a tag or GitHub release and should
only recover an already-reviewed release.

The workflow fails closed if:

- the requested version does not match `package.json`
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
