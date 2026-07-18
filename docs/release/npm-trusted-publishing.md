# npm Trusted Publishing

Citable publishes to npm as `citable`.

Trusted publishing uses GitHub Actions OIDC instead of a long-lived npm publish
token. The repository workflow is `.github/workflows/npm-publish.yml`.

## First Publish

npm trusted publisher configuration is package-scoped. If `citable` does not
exist on npm yet, publish the first version manually with an npm account that has
2FA enabled:

```bash
npm publish --access public --otp=<current-otp>
```

After the package exists, configure trusted publishing for future releases.

## npm Settings

Open:

```text
https://www.npmjs.com/package/citable/access
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
git tag v0.1.1
git push origin v0.1.1
```

Or dispatch the workflow manually and enter the package version from
`package.json`.

The workflow fails closed if:

- the requested version does not match `package.json`
- the version already exists on npm
- tests fail
- the package dry-run fails
- GitHub cannot mint an OIDC token for npm

## CLI Alternative

After the package exists, npm CLI 11.15.0+ can configure the publisher:

```bash
npm trust github citable \
  --repo mikeholownych/citable \
  --file npm-publish.yml \
  --env npm-publish \
  --allow-publish
```

The command requires package write access and account-level 2FA.
