# Security Policy

## Supported Versions

Security fixes are applied to the latest published minor release. Older
versions may be affected even when a fix is backward compatible. Confirm the
current release on npm before reporting or validating a fix.

## Report Privately

Use GitHub private vulnerability reporting from this repository's **Security**
tab. Do not open a public issue or Discussion for a suspected vulnerability.
If GitHub private reporting is unavailable, contact
`hello@nebulacomponents.shop` with only enough information to establish a safe
private channel.

Include, when available:

- Affected Citable version and installation method
- Node.js version and operating system
- Reproduction steps or a minimal sanitized repository
- Expected and observed security boundary
- Impact and prerequisites
- Whether exploitation has been observed

Never send live credentials, customer data, private evidence packages, or
production access unless a maintainer explicitly establishes an appropriate
secure transfer method.

## Response And Disclosure

Maintainers will acknowledge receipt when practical, validate the report,
coordinate a fix and release, and credit the reporter if requested and safe.
Timelines depend on severity and reproducibility; no fixed response or release
time is guaranteed. Public disclosure should occur only after a fix is
available or a coordinated decision is documented.

## Security Boundaries

Citable does not execute fetched page scripts during plain HTTP audit mode.
Optional browser, OCR, connector, imported-log, and third-party adapter paths
have additional trust boundaries documented in the repository. Run audits only
against properties you are authorized to assess.

Outbound raw HTTP, browser targets and subresources, browser-plan navigation,
and controlled citation-adapter endpoints reject credentials in URLs and
private, loopback, link-local, reserved, documentation, benchmark, multicast,
and other configured non-public address ranges. Citation adapters require
HTTPS and refuse redirects. Browser routing permits only public HTTP(S) plus
browser-local `data:`, `blob:`, and `about:` resources; other schemes abort.

Hostname policy is checked through DNS before a request, but the current Node
and Playwright transports do not pin the validated address to the subsequent
connection. DNS rebinding between validation and connection therefore remains
a residual risk. Run untrusted remote collection inside an isolated environment
with network-level egress controls; application validation is not a substitute
for that boundary.

The GEO-001 detector reports crawler prompt-injection content. Citable must not
be used to create or distribute such content.
