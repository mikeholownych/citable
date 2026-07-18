# Agent instructions for this repository

This repo builds the Citable skill. When working here:

1. Read `skill/SKILL.md` first — its premises govern all output, including
   this repo's own docs (no guarantees; fact/inference separation; fail closed).
2. Run `npm test` before claiming anything works. 33 tests must pass.
3. Detector changes require fixture updates in `tests/fixtures/` proving both
   detection and non-detection.
4. `skill/` is the canonical source for all distributions — never edit
   `dist/` by hand; run `npm run build:dist`.
5. Registry schemas in `schemas/` are contracts; breaking changes need
   CHANGELOG entries and fixture migrations.
