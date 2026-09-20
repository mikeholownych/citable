# Semantic Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure no Citable determination, comparison, score, summary, plan, or claim expresses greater certainty or scope than its underlying evidence population.

**Architecture:** Build versioned coverage, determination, connector-collection, and package-integrity contracts first. Make the crawler and connectors produce those contracts, then migrate every downstream consumer to a single verified loader and requirement evaluator. Close with a 257-page adversarial property that proves collection, comparison, remediation, reporting, and language behavior across deliberately incomplete runs.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, AJV JSON Schema draft-07, `node-html-parser`, existing Citable evidence-package and detector framework.

**Design source:** `docs/superpowers/specs/2026-09-19-audit-coverage-contract-design.md` at commit `a28e89f`.

---

## File Structure

### New contract and state modules

- `schemas/audit-coverage.schema.json` — versioned URL-population, budget, identity, and reconciliation contract.
- `schemas/collection-result.schema.json` — provider-neutral pagination and collection-completeness contract.
- `src/evidence/coverage.js` — coverage ledger, deterministic state transitions, reconciliation, and final coverage status.
- `src/evidence/determination.js` — coverage-requirement declarations and satisfaction evaluation.
- `src/shared/verifiedRunLoader.js` — the only supported downstream loader for sealed run packages.
- `src/crawler/sitemapCollector.js` — bounded recursive sitemap/index collection, gzip decoding, and child failure accounting.
- `src/crawler/resourceValidity.js` — conservative classification of transport responses as valid, invalid, or indeterminate resources.
- `src/crawler/urlIdentity.js` — versioned URL normalization and requested/effective/canonical identity records.
- `src/connectors/collectionResult.js` — connector result builder and reconciliation validator.
- `tests/fixtures/site-257/fixture.js` — deterministic 257-resource adversarial HTTP fixture definition.

### Existing modules changed by gate

- Gate 1: `schemas/config.schema.json`, `schemas/run.schema.json`, `schemas/finding.schema.json`, `src/cli/index.js`, `src/commands/context.js`, `src/commands/audit.js`, `src/extractor/site.js`, `src/crawler/fetch.js`, `src/crawler/sitemap.js`, `src/evidence/run.js`, `src/reporting/report.js`.
- Gate 2: `src/detectors/framework.js`, `src/detectors/tech.js`, `src/commands/compareSnapshots.js`, `src/commands/actionPlan.js`, `src/commands/verifyRemediation.js`, `src/commands/sweep.js`, `src/commands/croSuite.js`, `src/reporting/executiveExport.js`, `src/commands/ciWorkflow.js`.
- Gate 3: `src/connectors/wordpress.js`, `src/connectors/webflow.js`, `src/connectors/gsc.js`, `src/connectors/ga4.js`, `src/commands/connect.js`.
- Gate 4: `src/extractor/page.js`, `src/shared/runPackageVerifier.js`, `src/acceptance/reproducibility.js`, `src/artifacts/interchange.js`.
- Gate 5: `README.md`, `CHANGELOG.md`, `skill/SKILL.md`, generated `dist/`, CLI help, and relevant MCP/agent descriptions found by the language audit.

## Gate 1 — Collection Completeness Contracts

### Task 1: Add status and coverage schemas

**Files:**
- Create: `schemas/audit-coverage.schema.json`
- Create: `schemas/collection-result.schema.json`
- Modify: `schemas/run.schema.json`
- Modify: `schemas/finding.schema.json`
- Test: `tests/unit/semantic-contracts.test.js`

- [ ] **Step 1: Write failing schema tests for the three independent statuses and population reconciliation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainst } from '../../src/shared/schemaValidator.js';

const coverage = {
  schema_version: 1,
  normalization_version: 'url-identity-v1',
  requested_scope: { start_url: 'https://fixture.test/', origin: 'https://fixture.test', max_pages: 500, time_budget_seconds: 1800 },
  discovery: { status: 'complete', methods: ['start_url', 'links', 'sitemaps'], limitations: [] },
  populations: {
    discovered: 3, eligible: 2, excluded: 1, attempted: 2, retrieved: 2,
    valid_resource: 1, evaluated: 1, valid_but_unevaluated: 0,
    failed: 0, indeterminate: 1, unvisited: 0,
  },
  resources: [],
  stop_reason: 'frontier_exhausted',
  coverage_status: 'indeterminate',
  reconciliation: { valid: true, errors: [] },
  limitations: ['one retrieved resource could not be classified'],
};

test('audit coverage accepts independent execution and evidence states', () => {
  assert.equal(validateAgainst('audit-coverage.schema.json', coverage).valid, true);
});

test('audit coverage rejects impossible population totals', () => {
  const invalid = structuredClone(coverage);
  invalid.populations.discovered = 9;
  assert.equal(validateAgainst('audit-coverage.schema.json', invalid).valid, false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-concurrency=1 --test-name-pattern='audit coverage' tests/unit/semantic-contracts.test.js`

Expected: FAIL because `audit-coverage.schema.json` is not registered.

- [ ] **Step 3: Add the schemas and explicit run status fields**

Define these exact enums:

```json
{
  "execution_status": ["completed", "completed_with_warnings", "failed"],
  "coverage_status": ["complete", "truncated", "indeterminate", "not_applicable"],
  "determination_status": ["supported", "qualified", "indeterminate", "not_applicable"]
}
```

In `run.schema.json`, retain legacy `status` during migration but require `execution_status` and `coverage_status` for newly created version-2 manifests. In `finding.schema.json`, add a required `evidence_scope` object for version-2 findings containing `requirement`, `satisfaction`, `resource_ids`, and `coverage_ref`. Reject unknown enum values and contradictory count relationships with schema `const`/conditional rules where JSON Schema can express them; leave cross-field arithmetic to `coverage.js`.

- [ ] **Step 4: Run contract tests and schema validation**

Run: `node --test --test-concurrency=1 --test-name-pattern='audit coverage|collection result|independent status' tests/unit/semantic-contracts.test.js && npm run validate:schemas`

Expected: PASS, with every schema compiling.

- [ ] **Step 5: Commit Gate 1 contracts**

```bash
git add schemas/audit-coverage.schema.json schemas/collection-result.schema.json schemas/run.schema.json schemas/finding.schema.json tests/unit/semantic-contracts.test.js
git commit -m "feat(evidence): add semantic completeness contracts"
```

### Task 2: Implement the deterministic coverage ledger

**Files:**
- Create: `src/evidence/coverage.js`
- Test: `tests/unit/coverage-ledger.test.js`

- [ ] **Step 1: Write failing transition and reconciliation tests**

```js
test('coverage ledger reconciles discovered resources into one terminal state', () => {
  const ledger = createCoverageLedger({ startUrl: ORIGIN, maxPages: 500, timeBudgetSeconds: 1800 });
  ledger.discover(`${ORIGIN}/a`, 'link');
  ledger.discover(`${ORIGIN}/b`, 'sitemap');
  ledger.exclude(`${ORIGIN}/b`, 'policy_excluded');
  ledger.attempt(`${ORIGIN}/a`, { attempt: 1 });
  ledger.retrieve(`${ORIGIN}/a`, { status: 200 });
  ledger.classify(`${ORIGIN}/a`, { state: 'valid_resource' });
  ledger.evaluate(`${ORIGIN}/a`, { evaluator_ids: ['TECH-001'] });
  const coverage = ledger.finalize('frontier_exhausted');
  assert.deepEqual(coverage.populations, {
    discovered: 2, eligible: 1, excluded: 1, attempted: 1, retrieved: 1,
    valid_resource: 1, evaluated: 1, valid_but_unevaluated: 0,
    failed: 0, indeterminate: 0, unvisited: 0,
  });
  assert.equal(coverage.coverage_status, 'complete');
});

test('budget exhaustion is truncated and retains unvisited resources', () => {
  const ledger = createCoverageLedger({ startUrl: ORIGIN, maxPages: 1, timeBudgetSeconds: 1800 });
  ledger.discover(`${ORIGIN}/a`, 'link');
  ledger.discover(`${ORIGIN}/b`, 'link');
  ledger.attempt(`${ORIGIN}/a`, { attempt: 1 });
  ledger.retrieve(`${ORIGIN}/a`, { status: 200 });
  ledger.classify(`${ORIGIN}/a`, { state: 'valid_resource' });
  ledger.evaluate(`${ORIGIN}/a`, { evaluator_ids: [] });
  assert.equal(ledger.finalize('page_budget_exhausted').coverage_status, 'truncated');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/unit/coverage-ledger.test.js`

Expected: FAIL with missing `src/evidence/coverage.js`.

- [ ] **Step 3: Implement explicit state transitions**

Export:

```js
export const COVERAGE_SCHEMA_VERSION = 1;
export function createCoverageLedger({ startUrl, maxPages, timeBudgetSeconds, normalizationVersion = 'url-identity-v1' }) { /* stateful ledger */ }
export function reconcileCoverage(coverage) { /* { valid, errors } */ }
export function coverageStatusFor({ stopReason, discoveryStatus, populations }) { /* complete|truncated|indeterminate */ }
```

Reject invalid transitions such as `evaluated` before `retrieved`, duplicate terminal states, and finalization with unreconciled counts. Preserve all discovery sources per normalized resource without double-counting.

- [ ] **Step 4: Run ledger tests**

Run: `node --test --test-concurrency=1 tests/unit/coverage-ledger.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the ledger**

```bash
git add src/evidence/coverage.js tests/unit/coverage-ledger.test.js
git commit -m "feat(evidence): implement reconciled coverage ledger"
```

### Task 3: Expose bounded page and time budgets

**Files:**
- Modify: `schemas/config.schema.json`
- Modify: `src/cli/index.js`
- Modify: `src/commands/context.js`
- Modify: `src/commands/audit.js`
- Modify: `src/extractor/site.js`
- Test: `tests/integration/audit-budgets.test.js`
- Test: `tests/unit/cli.test.js`

- [ ] **Step 1: Write failing tests for defaults, precedence, and pre-fetch validation**

```js
test('URL audit resolves CLI over config over bounded defaults', async () => {
  assert.deepEqual(resolveAuditBudgets({}, {}), { maxPages: 500, timeBudgetSeconds: 1800 });
  assert.deepEqual(resolveAuditBudgets({ audit: { max_pages: 700, time_budget_seconds: 2400 } }, {}), { maxPages: 700, timeBudgetSeconds: 2400 });
  assert.deepEqual(resolveAuditBudgets({ audit: { max_pages: 700 } }, { maxPages: 800 }), { maxPages: 800, timeBudgetSeconds: 1800 });
});

for (const value of [0, -1, 1.5, 10001, 'many']) {
  test(`max-pages ${value} fails before fetch`, async () => {
    let fetched = false;
    await assert.rejects(() => buildContext(ROOT, { target: ORIGIN, maxPages: value, fetcher: async () => { fetched = true; } }), /max-pages/);
    assert.equal(fetched, false);
  });
}
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/audit-budgets.test.js tests/unit/cli.test.js`

Expected: FAIL because budget options and `resolveAuditBudgets` do not exist.

- [ ] **Step 3: Implement validated resolution and CLI wiring**

Add config fields:

```json
"max_pages": { "type": "integer", "minimum": 1, "maximum": 10000 },
"time_budget_seconds": { "type": "integer", "minimum": 1, "maximum": 86400 }
```

Export from `context.js`:

```js
export function resolveAuditBudgets(config, options) {
  return {
    maxPages: boundedInteger(options.maxPages ?? config.audit?.max_pages ?? 500, 'max-pages', 1, 10000),
    timeBudgetSeconds: boundedInteger(options.timeBudgetSeconds ?? config.audit?.time_budget_seconds ?? 1800, 'time-budget-seconds', 1, 86400),
  };
}
```

Pass resolved values through `audit` → `buildContext` → `buildSiteFromUrl`. Add help for `--max-pages` and `--time-budget-seconds`. Record resolved budgets in coverage evidence, never only in argv.

- [ ] **Step 4: Run budget tests**

Run: `node --test --test-concurrency=1 tests/integration/audit-budgets.test.js tests/unit/cli.test.js`

Expected: PASS.

- [ ] **Step 5: Commit explicit budgets**

```bash
git add schemas/config.schema.json src/cli/index.js src/commands/context.js src/commands/audit.js src/extractor/site.js tests/integration/audit-budgets.test.js tests/unit/cli.test.js
git commit -m "feat(audit): expose bounded crawl budgets"
```

### Task 4: Implement sitemap topology collection

**Files:**
- Create: `src/crawler/sitemapCollector.js`
- Modify: `src/crawler/sitemap.js`
- Modify: `src/extractor/site.js`
- Test: `tests/integration/sitemap-topology.test.js`
- Fixture: `tests/fixtures/sitemaps/`

- [ ] **Step 1: Write failing tests for indexes, gzip, duplicates, malformed entries, and failed children**

```js
test('nested sitemap collection records partial child failure without losing successful URLs', async () => {
  const result = await collectSitemapTopology(`${ORIGIN}/index.xml`, {
    fetcher: sitemapFixtureFetcher({ gzip: true, failedChild: '/child-b.xml.gz' }),
    maxDepth: 4,
    maxDocuments: 1000,
  });
  assert.deepEqual(result.urls.map((x) => x.url).sort(), [`${ORIGIN}/a`, `${ORIGIN}/b`]);
  assert.equal(result.documents.find((x) => x.url.endsWith('/child-b.xml.gz')).status, 'failed');
  assert.equal(result.status, 'indeterminate');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/sitemap-topology.test.js`

Expected: FAIL because sitemap indexes are not traversed.

- [ ] **Step 3: Implement the bounded collector**

Export:

```js
export async function collectSitemapTopology(entryUrls, {
  fetcher,
  maxDepth = 4,
  maxDocuments = 1000,
  maxUncompressedBytes = 20 * 1024 * 1024,
  origin,
}) { /* queue documents, gunzip by magic bytes/content-encoding, parse, dedupe, account failures */ }
```

Each sitemap document records requested URL, effective URL, depth, parent, HTTP status, compression, parse errors, URL count, child count, and terminal status. Same-origin enforcement applies to every child. Depth/document/decompression limits produce observable `truncated` or `indeterminate` status.

- [ ] **Step 4: Put sitemap URLs into the crawl frontier before page collection completes**

Fetch robots and declared/default sitemap entry points first, collect their topology, and call `ledger.discover(url, 'sitemap')` for every valid same-origin URL. Merge link discoveries into the same normalized frontier. Child failure must affect discovery status even when other child sitemaps succeed.

- [ ] **Step 5: Run sitemap tests**

Run: `node --test --test-concurrency=1 tests/integration/sitemap-topology.test.js tests/unit/extractor.test.js tests/integration/url-crawl-boundaries.test.js`

Expected: PASS.

- [ ] **Step 6: Commit sitemap topology support**

```bash
git add src/crawler/sitemapCollector.js src/crawler/sitemap.js src/extractor/site.js tests/integration/sitemap-topology.test.js tests/fixtures/sitemaps
git commit -m "feat(crawler): collect bounded sitemap topology"
```

### Task 5: Classify resource validity and preserve transport provenance

**Files:**
- Create: `src/crawler/resourceValidity.js`
- Create: `src/crawler/urlIdentity.js`
- Modify: `src/crawler/fetch.js`
- Modify: `src/extractor/site.js`
- Test: `tests/unit/resource-validity.test.js`
- Test: `tests/unit/url-identity.test.js`
- Test: `tests/unit/extractor.test.js`

- [ ] **Step 1: Write failing validity and retry-provenance tests**

```js
for (const specimen of [empty200, soft404, cloudflareChallenge, loginPage, unexpectedMime, truncatedBody]) {
  test(`${specimen.name} is not silently evaluated as a valid HTML resource`, () => {
    const result = classifyResource(specimen.response);
    assert.notEqual(result.state, 'valid_resource');
    assert.ok(result.reason_codes.length > 0);
  });
}

test('eventual success preserves failed attempts', async () => {
  const result = await fetchUrl(ORIGIN, { fetchImpl: failTwiceThenSucceed, retryDelayMs: 0, lookup: publicLookup });
  assert.equal(result.attempts.length, 3);
  assert.equal(result.attempts[0].outcome, 'error');
  assert.equal(result.attempts[2].outcome, 'response');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/unit/resource-validity.test.js tests/unit/url-identity.test.js tests/unit/extractor.test.js`

Expected: FAIL because classifiers, versioned normalization, and attempt records do not exist.

- [ ] **Step 3: Implement conservative classification and identity**

```js
export function classifyResource({ status, headers, body, bodyComplete = true }) {
  if (!bodyComplete) return { state: 'indeterminate', reason_codes: ['body_truncated'] };
  if (status !== 200) return { state: 'invalid_resource', reason_codes: [`http_${status}`] };
  if (!isHtmlMime(headers['content-type'])) return { state: 'invalid_resource', reason_codes: ['unexpected_mime'] };
  if (!body.trim()) return { state: 'indeterminate', reason_codes: ['empty_body'] };
  if (challengeSignals(body)) return { state: 'indeterminate', reason_codes: ['challenge_or_access_wall'] };
  if (soft404Signals(body)) return { state: 'indeterminate', reason_codes: ['possible_soft_404'] };
  return { state: 'valid_resource', reason_codes: [] };
}
```

`urlIdentity.js` must preserve `requested_url`, `effective_url`, `redirect_chain`, `declared_canonical_url`, `resource_id`, and `normalization_version`. Normalization removes fragments and normalizes default ports without collapsing scheme, host aliases, path case, query strings, or trailing slash.

- [ ] **Step 4: Make timeouts retryable within the declared retry contract**

Record attempt number, start/end time, outcome, status/error code, and retry decision. Retry timeouts and retryable 5xx responses up to the configured bound. Do not duplicate a successfully retrieved resource in the ledger.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-concurrency=1 tests/unit/resource-validity.test.js tests/unit/url-identity.test.js tests/unit/extractor.test.js`

Expected: PASS.

- [ ] **Step 6: Commit resource validity and identity**

```bash
git add src/crawler/resourceValidity.js src/crawler/urlIdentity.js src/crawler/fetch.js src/extractor/site.js tests/unit/resource-validity.test.js tests/unit/url-identity.test.js tests/unit/extractor.test.js
git commit -m "feat(crawler): preserve resource validity and retrieval provenance"
```

### Task 6: Persist coverage before deriving run and report states

**Files:**
- Modify: `src/commands/audit.js`
- Modify: `src/evidence/run.js`
- Modify: `src/reporting/report.js`
- Modify: `src/detectors/framework.js`
- Modify: `src/detectors/tech.js`
- Test: `tests/integration/audit-coverage.test.js`

- [ ] **Step 1: Write failing package-level coverage tests**

```js
test('execution may complete while coverage and corpus determination remain incomplete', async () => {
  const run = await audit(root, { target: ORIGIN, maxPages: 50, fetcher: fixture257.fetcher });
  const coverage = readJson(path.join(run.dir, 'coverage.json'));
  assert.equal(run.manifest.execution_status, 'completed');
  assert.equal(coverage.coverage_status, 'truncated');
  assert.equal(run.summary.posture.retrieval_eligibility.result, 'qualified');
  assert.match(run.report, /Coverage status: truncated/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/audit-coverage.test.js`

Expected: FAIL because `coverage.json` and independent statuses are absent.

- [ ] **Step 3: Persist and validate `coverage.json` before findings summaries**

Call `reconcileCoverage`, validate against `audit-coverage.schema.json`, then `run.writeArtifact('coverage.json', coverage)`. A reconciliation/schema error finalizes execution as failed. Derive manifest coverage status from the artifact. Fetch failures are coverage consequences, not merely warnings.

- [ ] **Step 4: Replace TECH-010's truncation special case with requirement evaluation**

TECH-010 may assert a sitemap URL error only when that resource was attempted and its result supports the assertion. Unvisited sitemap resources produce no absence finding and remain represented in coverage. Sitemap child failures produce an indeterminate sitemap determination.

- [ ] **Step 5: Run audit coverage tests**

Run: `node --test --test-concurrency=1 tests/integration/audit-coverage.test.js tests/integration/url-crawl-boundaries.test.js tests/unit/detectors.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Gate 1 integration**

```bash
git add src/commands/audit.js src/evidence/run.js src/reporting/report.js src/detectors/framework.js src/detectors/tech.js tests/integration/audit-coverage.test.js
git commit -m "feat(audit): persist coverage as evidence"
```

**Gate 1 proof:** A >50-page test crosses page 50; every resource reconciles; budgets and sitemap limits are explicit; resource failures cannot yield complete coverage; `coverage.json`, manifest, JSON output, and Markdown agree.

## Gate 2 — Epistemic Propagation

### Task 7: Add determination-specific coverage requirements

**Files:**
- Create: `src/evidence/determination.js`
- Modify: `src/detectors/framework.js`
- Modify: detector definitions under `src/detectors/`
- Test: `tests/unit/determination-coverage.test.js`

- [ ] **Step 1: Write failing requirement-satisfaction tests**

```js
test('local positive evidence survives incomplete corpus coverage', () => {
  assert.equal(evaluateRequirement(PAGE_RESOURCE, incompleteCoverageWithPage17).status, 'supported');
});

test('site-wide absence is indeterminate without exhaustive applicable coverage', () => {
  assert.equal(evaluateRequirement(EXHAUSTIVE_SCOPE, truncatedCoverage).status, 'indeterminate');
});

test('sample determination is qualified with its denominator', () => {
  assert.deepEqual(evaluateRequirement(DECLARED_SAMPLE, sampledCoverage), {
    status: 'qualified', population: 'evaluated_subset', numerator: 9, denominator: 10,
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/unit/determination-coverage.test.js`

Expected: FAIL because requirement evaluation does not exist.

- [ ] **Step 3: Implement named requirements and evaluation**

```js
export const REQUIREMENTS = Object.freeze({
  PAGE_RESOURCE: 'page_resource',
  EVALUATED_SUBSET: 'evaluated_subset',
  DECLARED_SAMPLE: 'declared_sample',
  EXHAUSTIVE_SCOPE: 'exhaustive_requested_scope',
  RENDERED_RESOURCE: 'rendered_resource',
  PROVIDER_BOUNDED: 'provider_bounded',
});

export function evaluateRequirement(requirement, coverage, subject) { /* supported|qualified|indeterminate|not_applicable */ }
```

Add each detector's requirement explicitly. Site-level negative detectors use exhaustive scope; page findings use page-resource scope; raw-versus-rendered detectors state their method requirement.

- [ ] **Step 4: Run detector and requirement tests**

Run: `node --test --test-concurrency=1 tests/unit/determination-coverage.test.js tests/unit/detectors.test.js`

Expected: PASS with no finding schema violations.

- [ ] **Step 5: Commit determination requirements**

```bash
git add src/evidence/determination.js src/detectors tests/unit/determination-coverage.test.js
git commit -m "feat(evidence): gate determinations by required coverage"
```

### Task 8: Make comparisons evidence-aware

**Files:**
- Modify: `src/commands/compareSnapshots.js`
- Modify: `schemas/remediation-verification.schema.json`
- Modify: `src/commands/verifyRemediation.js`
- Test: `tests/integration/coverage-comparison.test.js`
- Test: `tests/integration/remediation-verification.test.js`

- [ ] **Step 1: Write failing `not_reobserved` tests**

```js
test('missing resource in B is not resolved', () => {
  const result = compareSnapshots(root, { runA: completeWithFindingE, runB: page200Failed });
  assert.equal(result.not_reobserved.length, 1);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.not_reobserved[0].subject.identifier, `${ORIGIN}/200`);
});

test('remediation remains indeterminate when subject cannot be reobserved', async () => {
  const result = await verifyRemediation(root, { run: sourceRun, finding: 'TECH-X', recheckTarget: failingPage200 });
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.verdict.resolved, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/coverage-comparison.test.js tests/integration/remediation-verification.test.js`

Expected: FAIL because absence is currently interpreted as resolution.

- [ ] **Step 3: Implement comparison states**

Emit `persisted`, `resolved`, `new`, `changed`, `not_comparable`, `not_reobserved`, and `indeterminate`. Resolution requires matching resource identity, comparable evaluator/tool version and method, and coverage satisfying the original finding's evidence scope.

- [ ] **Step 4: Apply the same predicate to remediation verification**

Replace `afterMatches.length === 0` as the resolution predicate. First require successful reobservation of the subject under a comparable method, then permit `resolved`; otherwise emit `not_reobserved`/`indeterminate` and preserve the original finding.

- [ ] **Step 5: Run comparison tests**

Run: `node --test --test-concurrency=1 tests/integration/coverage-comparison.test.js tests/integration/remediation-verification.test.js tests/integration/commands.test.js`

Expected: PASS.

- [ ] **Step 6: Commit comparison semantics**

```bash
git add src/commands/compareSnapshots.js schemas/remediation-verification.schema.json src/commands/verifyRemediation.js tests/integration/coverage-comparison.test.js tests/integration/remediation-verification.test.js
git commit -m "fix(evidence): require reobservation before resolution"
```

### Task 9: Propagate coverage into plans, sweeps, CRO, executive, and CI outputs

**Files:**
- Modify: `src/commands/actionPlan.js`
- Modify: `schemas/action-plan.schema.json`
- Modify: `src/commands/sweep.js`
- Modify: `src/commands/croSuite.js`
- Modify: `src/reporting/executiveExport.js`
- Modify: `src/commands/ciWorkflow.js`
- Test: `tests/integration/downstream-coverage.test.js`
- Test: `tests/unit/executive-reporting.test.js`

- [ ] **Step 1: Write failing empty/incomplete evidence language tests**

```js
test('empty findings do not become verified-clean assurance', () => {
  assert.doesNotMatch(formatPrReviewComment([], { determination_status: 'indeterminate' }), /all .* verified clean/i);
  assert.match(formatPrReviewComment([], { determination_status: 'indeterminate' }), /no determination.*insufficient evidence/i);
});

test('sweep over a truncated corpus is qualified and has no empty-set 100 percent', async () => {
  const result = await sweepTechnical(root, truncatedOptions);
  assert.equal(result.determination_status, 'qualified');
  assert.equal(result.core_web_vitals.summary.image_dimension_coverage_pct, null);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/downstream-coverage.test.js tests/unit/executive-reporting.test.js`

Expected: FAIL on current `optimal`, `100%`, and `verified clean` language.

- [ ] **Step 3: Carry source coverage and requirements through every consumer**

Action plans record source package hash, source coverage reference/status, and each action's evidence scope. Sweeps and CRO reports label denominators as evaluated subsets and return `null` plus `not_evidenced` for empty populations. Executive and CI renderers require determination metadata; an empty array alone cannot produce success language.

- [ ] **Step 4: Run downstream tests**

Run: `node --test --test-concurrency=1 tests/integration/downstream-coverage.test.js tests/unit/executive-reporting.test.js tests/unit/cro-suite.test.js tests/unit/sweep.test.js`

Expected: PASS.

- [ ] **Step 5: Commit downstream propagation**

```bash
git add src/commands/actionPlan.js schemas/action-plan.schema.json src/commands/sweep.js src/commands/croSuite.js src/reporting/executiveExport.js src/commands/ciWorkflow.js tests/integration/downstream-coverage.test.js tests/unit/executive-reporting.test.js
git commit -m "fix(reporting): prevent evidence scope widening"
```

**Gate 2 proof:** Page-local positives survive incomplete runs; corpus-wide negatives become indeterminate; missing B observations never become resolved; all named downstream consumers preserve coverage and denominator semantics.

## Gate 3 — Connector Completeness

### Task 10: Add and adopt the connector collection contract

**Files:**
- Create: `src/connectors/collectionResult.js`
- Modify: `src/connectors/wordpress.js`
- Modify: `src/connectors/webflow.js`
- Modify: `src/connectors/gsc.js`
- Modify: `src/connectors/ga4.js`
- Modify: `src/commands/connect.js`
- Test: `tests/unit/connector-pagination.test.js`
- Test: `tests/unit/connectors.test.js`

- [ ] **Step 1: Write failing multi-page connector tests**

```js
test('WordPress follows X-WP-TotalPages and reports retrieved totals', async () => {
  const result = await wordpressConnector.sync(connection, metrics, wordpressThreePageContext);
  assert.equal(result.collection.coverage_status, 'complete');
  assert.equal(result.collection.provider_reported_total, 205);
  assert.equal(result.collection.retrieved_total, 205);
});

test('Webflow continuation is incomplete when the configured boundary stops pagination', async () => {
  const result = await webflowConnector.sync(connection, metrics, webflowBoundaryContext);
  assert.equal(result.collection.coverage_status, 'truncated');
  assert.ok(result.collection.continuation_state);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/unit/connector-pagination.test.js tests/unit/connectors.test.js`

Expected: FAIL because WordPress/Webflow currently stop at their first page.

- [ ] **Step 3: Implement a validated collection-result builder**

```js
export function collectionResult({ items, paginationState, providerReportedTotal = null,
  continuationState = null, limitations = [], errors = [], providerCompleteness = 'declared' }) {
  const retrievedTotal = items.length;
  const coverageStatus = errors.length ? 'indeterminate'
    : continuationState ? 'truncated'
      : providerCompleteness === 'unknown' ? 'provider_bounded' : 'complete';
  return { schema_version: 1, items, pagination_state: paginationState,
    provider_reported_total: providerReportedTotal, retrieved_total: retrievedTotal,
    coverage_status: coverageStatus, continuation_state: continuationState, limitations, errors };
}
```

- [ ] **Step 4: Migrate every connector**

WordPress follows `X-WP-TotalPages`; Webflow follows offset/cursor metadata for sites, pages, collections, and items; GA4 maps offset/rowCount into the shared contract; GSC reports provider-bounded coverage even after API pagination because top-row behavior remains possible. `connect sync` persists the collection contract with metric observations.

- [ ] **Step 5: Run connector tests**

Run: `node --test --test-concurrency=1 tests/unit/connector-pagination.test.js tests/unit/connectors.test.js tests/integration/connectors.test.js`

Expected: PASS.

- [ ] **Step 6: Commit connector completeness**

```bash
git add src/connectors/collectionResult.js src/connectors/wordpress.js src/connectors/webflow.js src/connectors/gsc.js src/connectors/ga4.js src/commands/connect.js tests/unit/connector-pagination.test.js tests/unit/connectors.test.js
git commit -m "feat(connectors): enforce pagination coverage contracts"
```

**Gate 3 proof:** No connector can return bare items as if exhaustive; pagination exhaustion, continuation, provider totals, retrieved totals, limitations, and errors are persisted and schema-validated.

## Gate 4 — Evidence Identity and Integrity

### Task 11: Persist layered hashes and resource identity

**Files:**
- Modify: `src/extractor/page.js`
- Modify: `src/commands/audit.js`
- Modify: `schemas/audit-coverage.schema.json`
- Test: `tests/integration/evidence-identity.test.js`

- [ ] **Step 1: Write failing hash-boundary tests**

```js
test('same extracted text with changed JSON-LD changes only the appropriate hashes', async () => {
  const a = await capturePage(pageWithJsonLd('v1'));
  const b = await capturePage(pageWithJsonLd('v2'));
  assert.equal(a.extracted_text_hash, b.extracted_text_hash);
  assert.notEqual(a.response_body_hash, b.response_body_hash);
  assert.notEqual(a.structured_data_hash, b.structured_data_hash);
});

test('requested, effective, canonical, and resource identity are all persisted', async () => {
  const page = await captureRedirectedPage();
  assert.equal(page.requested_url, `${ORIGIN}/old`);
  assert.equal(page.effective_url, `${ORIGIN}/new`);
  assert.equal(page.declared_canonical_url, `${ORIGIN}/canonical`);
  assert.ok(page.resource_id);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/evidence-identity.test.js`

Expected: FAIL because only extracted-text `contentHash` is persisted.

- [ ] **Step 3: Persist explicitly named hash layers**

Write `response_body_hash`, `extracted_text_hash`, `structured_data_hash`, and `evidence_hash`; write `rendered_dom_hash` only for browser observations. Remove ambiguous new uses of `contentHash`. Retain legacy snapshot fields only with an explicit `hash_semantics: extracted_text_v1` marker during migration.

- [ ] **Step 4: Run identity tests**

Run: `node --test --test-concurrency=1 tests/integration/evidence-identity.test.js tests/integration/commands.test.js`

Expected: PASS.

- [ ] **Step 5: Commit layered identity evidence**

```bash
git add src/extractor/page.js src/commands/audit.js schemas/audit-coverage.schema.json tests/integration/evidence-identity.test.js
git commit -m "feat(evidence): bind named resource and hash identities"
```

### Task 12: Seal packages and require one verified loader

**Files:**
- Create: `src/shared/verifiedRunLoader.js`
- Modify: `src/shared/runPackageVerifier.js`
- Modify: `src/evidence/run.js`
- Modify: `src/acceptance/reproducibility.js`
- Modify: `src/artifacts/interchange.js`
- Modify: downstream run consumers found with `rg "readJson\(.*runs|findings\.json|manifest\.json" src`
- Test: `tests/integration/sealed-run-package.test.js`
- Test: `tests/integration/artifact-interchange.test.js`

- [ ] **Step 1: Write failing sealed-package and partial-write tests**

```js
test('unexpected artifact invalidates a sealed package', () => {
  const run = completeRunFixture();
  fs.writeFileSync(path.join(run.dir, 'undeclared.json'), '{}');
  assert.throws(() => loadVerifiedRun(run.dir), /unexpected artifact/i);
});

test('completed manifest without durable seal is not consumable', () => {
  const run = partialRunFixture({ manifestStatus: 'completed', checksums: false });
  assert.throws(() => loadVerifiedRun(run.dir), /seal|checksums/i);
});

test('finding schema is verified during package load', () => {
  const run = completeRunFixture({ invalidFinding: true });
  assert.throws(() => loadVerifiedRun(run.dir), /finding.*schema/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/sealed-run-package.test.js tests/integration/artifact-interchange.test.js`

Expected: FAIL because extra files are ignored and downstream loaders bypass verification.

- [ ] **Step 3: Make finalization atomic and closed-world**

Write artifacts to a staging directory, write the final manifest, generate the complete checksum index, fsync/close files where available, then atomically rename the staging directory into the run location. Package verification compares the recursive file set against the checksum index and rejects missing, tampered, and unexpected members. It validates every finding and `coverage.json` against their declared schema versions.

- [ ] **Step 4: Implement the only supported downstream loader**

```js
export function loadVerifiedRun(runDir, { requireCompletedExecution = true } = {}) {
  const verification = verifyRunPackage(runDir, { requireFindings: true, requireChecksums: true });
  const coverage = readJson(path.join(runDir, 'coverage.json'));
  assertSupportedSchemaVersion(coverage.schema_version, [1], 'audit coverage');
  return { ...verification, coverage, summary: readJson(path.join(runDir, 'summary.json')) };
}
```

Migrate comparisons, action plans, remediation verification, exports, receipts, dashboards, and kits. Historical packages without coverage are loadable only through an explicit legacy mode that returns `coverage_status: indeterminate` and forbids scope-widening determinations; it must not invent complete coverage.

- [ ] **Step 5: Run integrity tests**

Run: `node --test --test-concurrency=1 tests/integration/sealed-run-package.test.js tests/integration/artifact-interchange.test.js tests/integration/acceptance-reproducibility.test.js`

Expected: PASS.

- [ ] **Step 6: Commit package integrity**

```bash
git add src/shared/verifiedRunLoader.js src/shared/runPackageVerifier.js src/evidence/run.js src/acceptance/reproducibility.js src/artifacts/interchange.js src/commands src/reporting tests/integration/sealed-run-package.test.js tests/integration/artifact-interchange.test.js
git commit -m "feat(evidence): seal and verify downstream run packages"
```

**Gate 4 proof:** Resource identity and hash semantics are explicit; unexpected, missing, tampered, partial, unsupported-version, and schema-invalid packages are rejected; every downstream consumer uses the verified loader.

## Gate 5 — Adversarial Proof and Language Audit

### Task 13: Build the 257-page adversarial fixture

**Files:**
- Create: `tests/fixtures/site-257/fixture.js`
- Create: `tests/integration/semantic-completeness-257.test.js`

- [ ] **Step 1: Define the deterministic fixture and expected events**

```js
export const SPECIAL = Object.freeze({
  49: 'finding-a', 50: 'finding-b', 51: 'finding-c', 99: 'redirect',
  100: 'finding-d', 101: 'soft-404', 149: 'timeout-then-success',
  150: 'permanent-timeout', 199: 'unexpected-mime', 200: 'finding-e',
  201: 'child-sitemap-only', 249: 'canonical-duplicate',
  256: 'bot-challenge', 257: 'finding-f',
});

export function createSite257({ failChildSitemap = true, failPage200 = false } = {}) {
  return { origin: 'https://site-257.test', fetcher: deterministicFetcher(/* SPECIAL */), expected: expectedCoverage(/* options */) };
}
```

- [ ] **Step 2: Write failing matrix tests for budgets 50, 100, 256, 257, and 500**

```js
for (const maxPages of [50, 100, 256, 257, 500]) {
  test(`257-page property reconciles at budget ${maxPages}`, async () => {
    const run = await audit(root, { target: fixture.origin, maxPages, fetcher: fixture.fetcher });
    assertCoverageMatches(run.coverage, fixture.expected[maxPages]);
    assert.equal(run.coverage.reconciliation.valid, true);
  });
}
```

- [ ] **Step 3: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/integration/semantic-completeness-257.test.js`

Expected: FAIL until all gates integrate correctly.

- [ ] **Step 4: Add chain-level assertions**

Assert page 200's finding is `not_reobserved` when run B fails retrieval; action plans retain source coverage; sweep/CRO scores are qualified; executive/CI outputs avoid maximal language; child sitemap failure remains visible; page 201 is discovered only through the child sitemap; page 149 records retry recovery; pages 101, 199, and 256 remain indeterminate/invalid rather than silently evaluated.

- [ ] **Step 5: Run the adversarial suite repeatedly and with reversed discovery order**

Run: `node --test --test-concurrency=1 tests/integration/semantic-completeness-257.test.js && CITABLE_FIXTURE_ORDER=reverse node --test --test-concurrency=1 tests/integration/semantic-completeness-257.test.js`

Expected: PASS with equivalent normalized coverage and determinations; only recorded ordering metadata may differ.

- [ ] **Step 6: Commit the adversarial proof**

```bash
git add tests/fixtures/site-257/fixture.js tests/integration/semantic-completeness-257.test.js
git commit -m "test: prove semantic completeness across 257 resources"
```

### Task 14: Audit epistemically absolute language

**Files:**
- Modify: every justified source/document found by the search below
- Test: `tests/unit/epistemic-language.test.js`

- [ ] **Step 1: Add a failing allowlist-based language test**

Search command:

```bash
rg -n -i --glob '*.{js,json,md,yaml,yml}' '\b(all|none|clean|verified|complete|resolved|optimal|site-wide|entire|no issues|100%|passed)\b' src schemas skill README.md
```

The test loads user-facing templates and requires each absolute phrase to be either removed, qualified with its evidence population, or listed in a narrow allowlist containing file, phrase, and justification. Do not allow a repository-wide regex suppression.

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-concurrency=1 tests/unit/epistemic-language.test.js`

Expected: FAIL on current empty-finding and unqualified assurance phrases.

- [ ] **Step 3: Replace or qualify unsupported language**

Use formulations such as:

```text
No findings were produced for the 217 successfully evaluated resources.
Coverage was incomplete; corpus-wide absence is not established.
The named detector did not reproduce for the reobserved subject.
No determination is available because the eligible population was empty.
```

Retain absolute terms only when the associated contract proves their exact population and method.

- [ ] **Step 4: Run language tests**

Run: `node --test --test-concurrency=1 tests/unit/epistemic-language.test.js tests/unit/executive-reporting.test.js tests/integration/downstream-coverage.test.js`

Expected: PASS.

- [ ] **Step 5: Commit language corrections**

```bash
git add src schemas skill README.md tests/unit/epistemic-language.test.js
git commit -m "fix(language): qualify conclusions by evidence scope"
```

### Task 15: Document contracts, build distributions, and verify the repository

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `skill/SKILL.md`
- Modify: generated `dist/` via `npm run build:dist`
- Modify: relevant command/reference docs found during the language audit

- [ ] **Step 1: Document invocation and evidence semantics**

Document:

```text
--max-pages 1..10000 (default 500)
--time-budget-seconds 1..86400 (default 1800)
CLI > .citable/config.yaml > defaults
execution_status != coverage_status != determination_status
coverage.json population meanings and reconciliation
comparison states, connector coverage states, layered hashes, and sealed-package rules
```

Include migration guidance stating that legacy run packages have indeterminate coverage unless their historical contract independently proves scope; never backfill complete coverage.

- [ ] **Step 2: Add CHANGELOG entries for every changed contract**

List audit coverage schema, run/finding schema evolution, comparison states, remediation verification, action-plan provenance, connector result contract, package sealing, CLI options, and language changes. Identify migrations required for fixtures and external consumers.

- [ ] **Step 3: Install dependencies on the controlled test surface**

Run: `npm ci`

Expected: successful lockfile-faithful install with no source changes.

- [ ] **Step 4: Run schema validation and focused gate suites**

Run:

```bash
npm run validate:schemas
node --test --test-concurrency=1 tests/unit/semantic-contracts.test.js tests/unit/coverage-ledger.test.js tests/integration/audit-coverage.test.js
node --test --test-concurrency=1 tests/unit/determination-coverage.test.js tests/integration/coverage-comparison.test.js tests/integration/downstream-coverage.test.js
node --test --test-concurrency=1 tests/unit/connector-pagination.test.js tests/integration/evidence-identity.test.js tests/integration/sealed-run-package.test.js
node --test --test-concurrency=1 tests/integration/semantic-completeness-257.test.js tests/unit/epistemic-language.test.js
```

Expected: every command exits 0.

- [ ] **Step 5: Run the full repository suite**

Run: `npm test`

Expected: exit 0 with all configured tests passing, including the repository-required baseline and new semantic-completeness tests.

- [ ] **Step 6: Build canonical distributions and prove they are current**

Run: `npm run build:dist && git diff --check && npm test`

Expected: distribution generation succeeds, `dist/` reflects canonical `skill/`, diff check passes, and the full suite remains green.

- [ ] **Step 7: Inspect the final change and contract surface**

Run:

```bash
git status --short
git diff --stat a28e89f..HEAD
rg -n "maxPages = 50|per_page=100.*published|limit=100.*items|All conversion pathways verified clean" src tests README.md skill
```

Expected: only intended files are changed; removed defect patterns return no matches except explicit historical regression fixtures.

- [ ] **Step 8: Commit documentation and generated distributions**

```bash
git add README.md CHANGELOG.md skill dist docs tests
git commit -m "docs: publish semantic completeness contracts"
```

**Gate 5 proof:** The 257-page matrix explains every difference from declared evidence boundaries, reversed ordering does not change normalized results, language cannot turn empty/incomplete evidence into assurance, schemas validate, distributions are regenerated from canonical sources, and the full `npm test` suite passes.

## Final Completion Checklist

- [ ] Every requested/discovered/eligible/excluded/attempted/retrieved/valid/evaluated/failed/indeterminate/unvisited population reconciles.
- [ ] Execution, coverage, and determination status are separately persisted and rendered.
- [ ] Every detector and downstream determination declares a coverage requirement.
- [ ] Missing evidence cannot become absence, resolution, pass, optimal, clean, or 100%.
- [ ] Snapshot and remediation comparison require comparable reobservation.
- [ ] Every connector returns the shared pagination/coverage contract.
- [ ] Requested, effective, canonical, and evaluated-resource identities remain distinct.
- [ ] Hash names state exactly which representation they bind.
- [ ] Sealed packages reject missing, tampered, unexpected, partial, invalid-schema, and unsupported-version content.
- [ ] Every downstream consumer uses `loadVerifiedRun`.
- [ ] The 257-page adversarial suite passes for budgets 50, 100, 256, 257, and 500.
- [ ] `npm run validate:schemas`, `npm run build:dist`, and full `npm test` pass.
