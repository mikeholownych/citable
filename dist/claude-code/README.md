# Citable for Claude Code

Install: copy `skills/citable/` into `.claude/skills/` (project) or `~/.claude/skills/` (user),
and ensure the citable CLI is on PATH (`npm install -g` from the repo root, or `npx citable`).

Invocation: Claude loads the skill automatically for SEO/AEO/GEO tasks, or explicitly via /citable.
Requires: Node >= 20. Permissions: file read/write in the project, optional network for URL audits.
