import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEpistemicLanguage,
  evidenceScopeStatement,
  findEpistemicLanguageViolations,
} from '../../src/shared/epistemicLanguage.js';
import { formatPrReviewComment } from '../../src/commands/ciWorkflow.js';
import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(new URL('../..', import.meta.url).pathname);

test('incomplete evidence rejects corpus-wide assurance phrases', () => {
  const context = { coverage_status: 'truncated', determination_status: 'qualified', evaluated: 217, eligible: 228 };
  assert.ok(findEpistemicLanguageViolations('All conversion pathways verified clean.', context).length > 0);
  assert.throws(() => assertEpistemicLanguage('The entire site is clean and verified.', context), /unsupported assurance language/i);
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
