## Summary

<!-- What changed and why? Keep claims bounded to what this PR demonstrates. -->

## Validation

<!-- List exact commands and outcomes. Use "not run" with a reason where needed. -->

- [ ] `npm test`
- [ ] `npm run build:dist` when `skill/` or distribution inputs changed
- [ ] Packed-artifact install tested when packaging or installer behavior changed

## Release impact

<!-- Choose one and explain any compatibility or migration impact. -->

- [ ] Patch: backward-compatible fix or hardening
- [ ] Minor: backward-compatible feature
- [ ] Major: breaking contract or behavior
- [ ] None: documentation, tests, or internal-only change

## Evidence and risk

<!-- Link findings/issues and state residual risk, limitations, and rollback. -->

- [ ] User-facing changes are recorded under `CHANGELOG.md` `Unreleased`
- [ ] Schema contract changes include fixture migrations and migration notes
- [ ] Detector changes include detection and non-detection fixtures
