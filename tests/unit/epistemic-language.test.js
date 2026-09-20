import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEpistemicLanguage,
  evidenceScopeStatement,
  findEpistemicLanguageViolations,
} from '../../src/shared/epistemicLanguage.js';
import { formatPrReviewComment } from '../../src/commands/ciWorkflow.js';
import {
  buildExecutiveSearchReport,
  renderSearchReportMarkdown,
  renderSearchReportHtml,
} from '../../src/reporting/executiveSearchReport.js';
import {
  buildExecutiveCroReport,
  renderCroReportMarkdown,
  renderCroReportHtml,
} from '../../src/reporting/executiveCroReport.js';
import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(new URL('../..', import.meta.url).pathname);

test('incomplete evidence rejects corpus-wide assurance phrases', () => {
  const context = { coverage_status: 'truncated', determination_status: 'qualified', evaluated: 217, eligible: 228 };
  assert.ok(findEpistemicLanguageViolations('All conversion pathways verified clean.', context).length > 0);
  assert.throws(() => assertEpistemicLanguage('The entire site is clean and verified.', context), /unsupported assurance language/i);
  assert.ok(findEpistemicLanguageViolations('\nOptimal\n', context).length > 0);
  assert.ok(findEpistemicLanguageViolations('<h2>Verified</h2>', context).length > 0);
});

test('qualified language names the evaluated population and limitation', () => {
  const context = { coverage_status: 'indeterminate', determination_status: 'indeterminate', evaluated: 217, eligible: 228 };
  const statement = evidenceScopeStatement(context);
  assert.match(statement, /217 evaluated/);
  assert.match(statement, /corpus-wide.*not established/i);
  assert.doesNotMatch(statement, /verified clean|100%/i);
  assert.doesNotThrow(() => assertEpistemicLanguage(statement, context));
});

test('empty, legacy, and unverified packages cannot render maximal assurance', () => {
  for (const context of [
    { coverage_status: 'complete', determination_status: 'indeterminate', evaluated: 0, eligible: 0 },
    { coverage_status: 'indeterminate', determination_status: 'indeterminate', evaluated: 12, eligible: 12, legacy: true },
    { coverage_status: 'complete', determination_status: 'supported', evaluated: 12, eligible: 12, package_verified: false },
  ]) {
    assert.ok(findEpistemicLanguageViolations('100% clean; no issues site-wide.', context).length > 0);
    assert.match(evidenceScopeStatement(context), /No determination|Coverage is/i);
  }
});

test('supported evidence permits explicitly scoped assurance language', () => {
  const context = { coverage_status: 'complete', determination_status: 'supported', evaluated: 12, eligible: 12, package_verified: true };
  assert.deepEqual(findEpistemicLanguageViolations('All 12 evaluated resources passed the declared detector.', context), []);
  assert.doesNotThrow(() => assertEpistemicLanguage('The package is complete and checksum-verified.', context));
});

test('CI empty findings remain a qualified observation, never verified-clean assurance', () => {
  const output = formatPrReviewComment([], { coverage_status: 'truncated', determination_status: 'indeterminate' });
  assert.match(output, /no determination.*insufficient evidence/i);
  assert.doesNotMatch(output, /all .* verified clean|100%|site-wide.*clean/i);
});

test('user-facing templates do not contain known unqualified assurance phrases', () => {
  const files = [
    'src/reporting/report.js',
    'src/reporting/executiveExport.js',
    'src/reporting/executiveSearchReport.js',
    'src/reporting/executiveCroReport.js',
    'src/commands/ciWorkflow.js',
    'src/analysis/croRoadmap.js',
    'src/analysis/strategicRoadmap.js',
  ];
  const forbidden = /all conversion pathways verified clean|verified[- ]clean|100% conversion funnel|site[- ]wide clean claim|no issues site[- ]wide/i;
  for (const relative of files) {
    const source = fs.readFileSync(path.join(workspace, relative), 'utf8');
    assert.doesNotMatch(source, forbidden, relative);
  }
});

test('search and CRO Markdown/HTML renderers qualify incomplete, legacy, empty, and tampered contexts', async () => {
  const root = path.resolve(new URL('../..', import.meta.url).pathname);
  const [search, cro] = await Promise.all([
    buildExecutiveSearchReport(root, { sample: true }),
    buildExecutiveCroReport(root, { sample: true }),
  ]);
  const contexts = [
    { coverage_status: 'truncated', determination_status: 'qualified', evaluated: 8, eligible: 10, package_verified: true },
    { coverage_status: 'indeterminate', determination_status: 'indeterminate', evaluated: 8, eligible: 10, package_verified: false, legacy: true },
    { coverage_status: 'complete', determination_status: 'supported', evaluated: 8, eligible: 8, package_verified: false, integrity_mode: 'tampered' },
    { coverage_status: 'complete', determination_status: 'indeterminate', evaluated: 0, eligible: 0, package_verified: false },
  ];
  for (const context of contexts) {
    for (const output of [
      renderSearchReportMarkdown(search, context),
      renderSearchReportHtml(search, context),
      renderCroReportMarkdown(cro, context),
      renderCroReportHtml(cro, context),
    ]) {
      assert.match(output, /scope-limited|not established|unknown|unresolved/i);
      assert.doesNotMatch(output, /100% conversion funnel|verified[- ]clean|site[- ]wide clean claim/i);
    }
  }
});
