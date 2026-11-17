import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKeystrokeEffort,
  simulateAutofillCompatibility,
  analyzeInlineValidationErgonomics,
  W3C_AUTOCOMPLETE_TOKENS,
} from '../../src/analysis/formFriction.js';

test('W3C_AUTOCOMPLETE_TOKENS: contains standard contact, address, and credential tokens', () => {
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('name'));
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('email'));
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('tel'));
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('street-address'));
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('postal-code'));
  assert.ok(W3C_AUTOCOMPLETE_TOKENS.has('cc-number'));
});

test('calculateKeystrokeEffort: calculates manual vs autofill mobile keystrokes and keyboard layout switches', () => {
  const formWithoutAutofill = {
    inputs: [
      { name: 'full_name', type: 'text', autocapitalize: 'none' },
      { name: 'phone_number', type: 'text' }, // missing type="tel" or inputmode="numeric" -> 2 layout switches
      { name: 'email_address', type: 'email' },
      { name: 'zip_code', type: 'text' }, // missing inputmode -> 2 layout switches
    ],
  };

  const resUnopt = calculateKeystrokeEffort([formWithoutAutofill]);
  assert.equal(resUnopt.total_fields, 4);
  assert.equal(resUnopt.fields_with_autocomplete, 0);
  assert.equal(resUnopt.autofill_coverage_pct, 0);
  assert.equal(resUnopt.keyboard_layout_switches_avoided, 4); // 2 fields * 2 switches
  assert.equal(resUnopt.shift_key_presses_modeled, 2);
  assert.ok(resUnopt.manual_keystrokes_required > 40);
  assert.equal(resUnopt.keystroke_reduction_pct, 0);
  assert.equal(resUnopt.fact_status, 'modeled_heuristic_index');

  const formWithAutofill = {
    inputs: [
      { name: 'name', type: 'text', autocomplete: 'name' },
      { name: 'tel', type: 'tel', autocomplete: 'tel', inputmode: 'numeric' },
      { name: 'email', type: 'email', autocomplete: 'email' },
      { name: 'postal-code', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric' },
    ],
  };

  const resOpt = calculateKeystrokeEffort([formWithAutofill]);
  assert.equal(resOpt.total_fields, 4);
  assert.equal(resOpt.fields_with_autocomplete, 4);
  assert.equal(resOpt.autofill_coverage_pct, 100);
  assert.equal(resOpt.keyboard_layout_switches_avoided, 0);
  assert.ok(resOpt.keystroke_reduction_pct >= 90);
});

test('simulateAutofillCompatibility: scores autofill compatibility across 5 password/credential managers', () => {
  const goodForm = {
    hasEnclosingForm: true,
    inputs: [
      { name: 'username', id: 'usr', type: 'text', autocomplete: 'username', label: 'Username' },
      { name: 'password', id: 'pwd', type: 'password', autocomplete: 'current-password', label: 'Password' },
    ],
  };

  const resGood = simulateAutofillCompatibility([goodForm]);
  assert.equal(resGood.overall_compatibility_score, 100);
  assert.equal(resGood.compatibility_breakdown.chrome, 100);
  assert.equal(resGood.compatibility_breakdown.safari, 100);
  assert.equal(resGood.compatibility_breakdown.onepassword, 100);
  assert.equal(resGood.compatibility_breakdown.bitwarden, 100);
  assert.equal(resGood.compatibility_breakdown.apple_keychain, 100);
  assert.equal(resGood.silent_failure_risks.length, 0);

  // Form with detached inputs and custom div textbox
  const brokenForm = {
    hasEnclosingForm: false, // detached from form
    inputs: [
      { type: 'text' }, // missing id, name, autocomplete, label
    ],
  };

  const resBroken = simulateAutofillCompatibility([brokenForm], '<div role="textbox">Custom input</div>');
  assert.ok(resBroken.overall_compatibility_score < 50);
  assert.ok(resBroken.silent_failure_risks.some((r) => r.risk === 'detached_input_outside_form'));
  assert.ok(resBroken.silent_failure_risks.some((r) => r.risk === 'missing_id_and_autocomplete'));
  assert.ok(resBroken.silent_failure_risks.some((r) => r.risk === 'custom_div_imitation'));
});

test('analyzeInlineValidationErgonomics: detects hostile keydown validation vs ergonomic onblur', () => {
  const hostileHtml = '<input type="email" onkeydown="validateField(this); showErrorMessage();" />';
  const hostileRes = analyzeInlineValidationErgonomics(hostileHtml);
  assert.equal(hostileRes.validation_style, 'hostile_on_keydown');
  assert.ok(hostileRes.hostile_patterns_detected.some((p) => p.pattern === 'validate_on_keydown'));
  assert.ok(hostileRes.recommendations.length > 0);

  const ergonomicHtml = '<input type="email" onblur="validateField(this);" />';
  const ergonomicRes = analyzeInlineValidationErgonomics(ergonomicHtml);
  assert.equal(ergonomicRes.validation_style, 'ergonomic_on_blur');
  assert.equal(ergonomicRes.hostile_patterns_detected.length, 0);
});
