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

The workflow uses this environment, so npm can bind publishing authority to the
same environment name.

## Release

Publish from a version tag:

```bash
git tag -a v1.3.1 -m "v1.3.1"
git push origin v1.3.1
```

Or dispatch the workflow manually and enter the package version from
`package.json`.

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
