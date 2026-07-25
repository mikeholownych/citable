import test from 'node:test';
import assert from 'node:assert/strict';
import { checklistItem, toLabel, toStringArray } from '../../src/shared/checklist.js';

test('checklistItem defaults satisfied=false and note=null', () => {
  assert.deepEqual(checklistItem('owner', 'accountable owner'), { id: 'owner', label: 'accountable owner', satisfied: false, note: null });
});

test('checklistItem carries an optional note', () => {
  assert.equal(checklistItem('owner', 'accountable owner', 'assign in the reviewers registry').note, 'assign in the reviewers registry');
});

test('toLabel passes plain strings through and reads .label off items', () => {
  assert.equal(toLabel('plain string'), 'plain string');
  assert.equal(toLabel(checklistItem('a', 'A label')), 'A label');
});

test('toStringArray accepts a mix of items and plain strings', () => {
  assert.deepEqual(toStringArray([checklistItem('a', 'A'), 'B']), ['A', 'B']);
});
