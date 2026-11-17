/**
 * Form Friction Micro-Diagnostics: Keystroke Effort Index (KEI) & Autofill Simulation
 *
 * Grounded in Citable Premise 1 (No guarantees) and Premise 2 (Fact != inference):
 * KEI and autofill compatibility metrics are modeled heuristic indices of mechanical
 * input friction, not observed user behavioral measurements or conversion guarantees.
 */

export const W3C_AUTOCOMPLETE_TOKENS = new Set([
  'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name',
  'honorific-suffix', 'nickname', 'email', 'username', 'new-password',
  'current-password', 'one-time-code', 'organization-title', 'organization',
  'street-address', 'address-line1', 'address-line2', 'address-line3',
  'address-level4', 'address-level3', 'address-level2', 'address-level1',
  'country', 'country-name', 'postal-code', 'cc-name', 'cc-given-name',
  'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
  'cc-csc', 'cc-type', 'transaction-currency', 'transaction-amount',
  'language', 'bday', 'bday-day', 'bday-month', 'bday-year', 'sex',
  'tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local',
  'tel-extension', 'impp', 'url', 'photo',
]);

const TYPICAL_FIELD_LENGTHS = {
  email: 22,
  name: 14,
  'given-name': 7,
  'family-name': 7,
  tel: 10,
  'postal-code': 5,
  'street-address': 24,
  'address-line1': 20,
  'cc-number': 16,
  'cc-csc': 3,
  'current-password': 14,
  'new-password': 14,
  default: 12,
};

/**
 * Calculates Keystroke Effort Index (KEI) across forms.
 */
export function calculateKeystrokeEffort(forms = []) {
  const normForms = Array.isArray(forms) ? forms : [forms];
  let totalFields = 0;
  let fieldsWithAutocomplete = 0;
  let manualKeystrokes = 0;
  let keyboardLayoutSwitches = 0;
  let shiftKeyPresses = 0;

  for (const form of normForms) {
    const inputs = Array.isArray(form?.inputs) ? form.inputs : [];
    for (const inp of inputs) {
      // Exclude hidden, submit, button, and reset inputs
      const type = (inp.type || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;

      totalFields++;
      const name = (inp.name || '').toLowerCase();
      const autocomplete = (inp.autocomplete || '').toLowerCase();
      const inputmode = (inp.inputmode || '').toLowerCase();

      const hasAuto = autocomplete && autocomplete !== 'off' && (autocomplete === 'on' || W3C_AUTOCOMPLETE_TOKENS.has(autocomplete));
      if (hasAuto) fieldsWithAutocomplete++;

      // Estimate character keystrokes
      const matchedKey = Object.keys(TYPICAL_FIELD_LENGTHS).find((k) => name.includes(k) || autocomplete.includes(k) || type === k);
      const charLength = TYPICAL_FIELD_LENGTHS[matchedKey] || TYPICAL_FIELD_LENGTHS.default;

      // Focus tap
      let fieldTaps = 1 + charLength;

      // Keyboard layout switches: phone, zip, or card without numeric type/inputmode
      const isNumericField = /phone|tel|zip|postal|card|cvv|csc|pin|amount|qty|quantity/i.test(name) || /tel|postal-code|cc-number|cc-csc/i.test(autocomplete);
      if (isNumericField && type !== 'tel' && type !== 'number' && inputmode !== 'numeric' && inputmode !== 'decimal') {
        // Mobile keyboards default to alpha; user must tap switch to numeric layout and back
        keyboardLayoutSwitches += 2;
        fieldTaps += 2;
      }

      // Shift key presses: proper nouns and capitalized fields without autocapitalize
      const isCapitalizedField = /name|address|city|country|state/i.test(name) || /name|address/i.test(autocomplete);
      if (isCapitalizedField && inp.autocapitalize === 'none') {
        shiftKeyPresses += 2; // User manually shifts initial caps
        fieldTaps += 2;
      }

      manualKeystrokes += fieldTaps;
    }
  }

  // Autofill keystrokes: 1 tap for autofill cluster, plus manual keystrokes for un-autofillable fields
  const unautofilledFields = totalFields - fieldsWithAutocomplete;
  const autofillKeystrokes = totalFields > 0 && fieldsWithAutocomplete > 0
    ? Math.round((unautofilledFields / totalFields) * manualKeystrokes) + 1
    : manualKeystrokes;

  const keystrokeReductionPct = manualKeystrokes > 0
    ? Math.max(0, Math.round(((manualKeystrokes - autofillKeystrokes) / manualKeystrokes) * 100))
    : 0;

  return {
    fact_status: 'modeled_heuristic_index',
    interpretation_note: 'Keystroke Effort Index (KEI) is a modeled heuristic index of mobile mechanical input friction based on field types and attributes, not measured user keystrokes.',
    total_fields: totalFields,
    fields_with_autocomplete: fieldsWithAutocomplete,
    autofill_coverage_pct: totalFields > 0 ? Math.round((fieldsWithAutocomplete / totalFields) * 100) : 100,
    manual_keystrokes_required: manualKeystrokes,
    autofill_keystrokes_required: autofillKeystrokes,
    keystroke_reduction_pct: keystrokeReductionPct,
    keyboard_layout_switches_avoided: keyboardLayoutSwitches,
    shift_key_presses_modeled: shiftKeyPresses,
  };
}

/**
 * Simulates autofill event dispatch and compatibility across 5 password/credential managers.
 */
export function simulateAutofillCompatibility(forms = [], rawHtml = '') {
  const normForms = Array.isArray(forms) ? forms : [forms];
  const silentFailureRisks = [];

  let totalInputs = 0;
  let supportedChrome = 0;
  let supportedSafari = 0;
  let supported1Password = 0;
  let supportedBitwarden = 0;
  let supportedKeychain = 0;

  for (const form of normForms) {
    const isEnclosedInForm = form?.hasEnclosingForm !== false;
    const inputs = Array.isArray(form?.inputs) ? form.inputs : [];

    for (const inp of inputs) {
      const type = (inp.type || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;

      totalInputs++;
      const name = (inp.name || '').trim();
      const id = (inp.id || '').trim();
      const autocomplete = (inp.autocomplete || '').trim().toLowerCase();
      const hasW3cAuto = autocomplete && autocomplete !== 'off' && (autocomplete === 'on' || W3C_AUTOCOMPLETE_TOKENS.has(autocomplete));
      const hasStandardNaming = Boolean(name || id);
      const hasLabel = Boolean(inp.label || inp.hasLabel || inp.ariaLabel);

      // Check for silent failure risks
      if (!isEnclosedInForm) {
        silentFailureRisks.push({
          input: name || id || type,
          risk: 'detached_input_outside_form',
          severity: 'high',
          impact: 'Safari and 1Password fail to reliably group fields detached from a <form> element',
        });
      }
      if (!hasStandardNaming && !hasW3cAuto) {
        silentFailureRisks.push({
          input: type,
          risk: 'missing_id_and_autocomplete',
          severity: 'critical',
          impact: 'Browser cannot classify field intent; autofill will fail silently',
        });
      }

      // Chrome autofill score: heuristics on name/id + W3C tokens
      if (hasW3cAuto || hasStandardNaming) supportedChrome++;
      // Safari autofill score: strictly requires <form> enclosure and W3C tokens/standard names
      if (isEnclosedInForm && (hasW3cAuto || (hasStandardNaming && hasLabel))) supportedSafari++;
      // 1Password: requires <form> or recognizable labels/autocomplete
      if (isEnclosedInForm && (hasW3cAuto || hasLabel)) supported1Password++;
      // Bitwarden: W3C tokens or standard name attributes
      if (hasW3cAuto || hasStandardNaming) supportedBitwarden++;
      // Apple Keychain: requires <form>, label association, and standard tokens
      if (isEnclosedInForm && hasLabel && (hasW3cAuto || hasStandardNaming)) supportedKeychain++;
    }
  }

  // Detect custom div inputs imitating textboxes
  if (rawHtml && /<div[^>]*role=["']textbox["']/i.test(rawHtml)) {
    silentFailureRisks.push({
      input: 'div[role="textbox"]',
      risk: 'custom_div_imitation',
      severity: 'critical',
      impact: 'Custom non-native input divs are completely invisible to browser password managers',
    });
  }

  const denom = Math.max(1, totalInputs);
  const chromePct = Math.round((supportedChrome / denom) * 100);
  const safariPct = Math.round((supportedSafari / denom) * 100);
  const onepasswordPct = Math.round((supported1Password / denom) * 100);
  const bitwardenPct = Math.round((supportedBitwarden / denom) * 100);
  const keychainPct = Math.round((supportedKeychain / denom) * 100);

  const overallScore = Math.round((chromePct + safariPct + onepasswordPct + bitwardenPct + keychainPct) / 5);

  return {
    fact_status: 'modeled_heuristic_index',
    interpretation_note: 'Autofill compatibility score simulates autofill event heuristics across five major managers; not verified live browser extension telemetry.',
    overall_compatibility_score: overallScore,
    compatibility_breakdown: {
      chrome: chromePct,
      safari: safariPct,
      onepassword: onepasswordPct,
      bitwarden: bitwardenPct,
      apple_keychain: keychainPct,
    },
    total_inputs_evaluated: totalInputs,
    silent_failure_risks: silentFailureRisks,
  };
}

/**
 * Analyzes inline validation ergonomics and flags hostile keydown error patterns.
 */
export function analyzeInlineValidationErgonomics(rawHtmlOrScripts = '') {
  const content = String(rawHtmlOrScripts || '');
  const hostilePatterns = [];
  const recommendations = [];

  // Look for inline onkeydown/onkeyup/oninput validation handlers
  if (/(?:onkeydown|onkeyup)\s*=\s*["'][^"']*(?:validate|check|error|invalid)[^"']*["']/i.test(content) ||
      /\.addEventListener\s*\(\s*["'](?:keydown|keyup)["']\s*,\s*(?:function|\([^)]*\)\s*=>)[^}]*(?:showError|invalid|addClass\(["']error["']\))/i.test(content)) {
    hostilePatterns.push({
      pattern: 'validate_on_keydown',
      severity: 'high',
      description: 'Hostile keydown validation fires red error states while the user is actively typing.',
    });
    recommendations.push('Defer validation until onBlur or onChange to allow users to complete input without premature error disruption.');
  }

  // Look for validate on blur
  const hasOnBlur = /onblur\s*=/i.test(content) || /addEventListener\s*\(\s*["']blur["']/i.test(content);
  const hasHtml5Validation = /required\s*(?:=|>)|pattern\s*=/i.test(content);

  let style = 'unspecified';
  if (hostilePatterns.length > 0) {
    style = 'hostile_on_keydown';
  } else if (hasOnBlur) {
    style = 'ergonomic_on_blur';
  } else if (hasHtml5Validation) {
    style = 'native_html5';
  }

  return {
    fact_status: 'deterministic_observation',
    validation_style: style,
    hostile_patterns_detected: hostilePatterns,
    recommendations,
  };
}
