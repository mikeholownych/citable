/**
 * Form Safety and Confirmation Boundary Classifier.
 *
 * Implements requirement B-063:
 * - Forms classify as:
 *   read-only | reversible | state-mutating | financial | destructive.
 * - Detects confirmation boundaries (preview, review, confirm, execute, modal/dialog).
 * - Identifies high-impact controls whose consequence is machine-ambiguous.
 */

export const FORM_CLASSES = [
  'read-only',
  'reversible',
  'state-mutating',
  'financial',
  'destructive',
];

const FINANCIAL_FORM_RX = /\b(?:card|credit|cvv|expir|billing|payment|checkout|stripe|paypal|donate|donation|purchase|subscription|invoice|card-number)\b/i;
const DESTRUCTIVE_FORM_RX = /\b(?:delete[-_]?account|close[-_]?account|cancel[-_]?sub|terminate|destroy|purge|wipe|drop[-_]?table|delete[-_]?data)\b/i;
const REVERSIBLE_FORM_RX = /\b(?:save[-_]?draft|toggle|bookmark|star|favorite|filter|preview|draft)\b/i;
const SEARCH_FORM_RX = /\b(?:search|query|filter|find|lookup|q)\b/i;

const AMBIGUOUS_SUBMIT_LABELS = new Set([
  'submit',
  'go',
  'ok',
  'click',
  'click here',
  'continue',
  'send',
  'proceed',
  'next',
  'apply',
  'execute',
]);

/**
 * Classify a form into one of the 5 safety categories:
 * read-only, reversible, state-mutating, financial, or destructive.
 */
export function classifyForm(form, page = {}) {
  const method = String(form.method || 'GET').toUpperCase();
  const action = String(form.action || '').toLowerCase();
  const inputs = form.inputs || [];
  const submitText = String(form.submitText || '').toLowerCase().trim();
  const formHtml = String(form.outerHtml || '').toLowerCase();

  const inputNames = inputs.map((i) => String(i.name || i.id || '').toLowerCase()).join(' ');

  // 1. Destructive check
  if (
    DESTRUCTIVE_FORM_RX.test(action) ||
    DESTRUCTIVE_FORM_RX.test(inputNames) ||
    DESTRUCTIVE_FORM_RX.test(submitText) ||
    DESTRUCTIVE_FORM_RX.test(formHtml)
  ) {
    return 'destructive';
  }

  // 2. Financial check
  if (
    FINANCIAL_FORM_RX.test(action) ||
    FINANCIAL_FORM_RX.test(inputNames) ||
    FINANCIAL_FORM_RX.test(submitText) ||
    FINANCIAL_FORM_RX.test(page.path || '')
  ) {
    return 'financial';
  }

  // 3. Read-only check: GET forms with search/query inputs or method GET without state changes
  if (method === 'GET') {
    if (SEARCH_FORM_RX.test(action) || SEARCH_FORM_RX.test(inputNames) || inputs.some((i) => i.type === 'search')) {
      return 'read-only';
    }
    // Most standard GET forms without financial/destructive patterns are read-only
    return 'read-only';
  }

  // 4. Reversible check
  if (REVERSIBLE_FORM_RX.test(action) || REVERSIBLE_FORM_RX.test(inputNames) || REVERSIBLE_FORM_RX.test(submitText)) {
    return 'reversible';
  }

  // 5. State-mutating check (default for POST forms like contact, newsletter, profile updates)
  return 'state-mutating';
}

/**
 * Inspect a form for machine-detectable confirmation boundaries.
 * High-impact actions (financial, destructive) MUST provide:
 * - multi-step indicator / preview / review phase
 * - clear unambiguous action label explaining consequences
 * - or explicit confirmation dialog / warning notice.
 */
export function evaluateConfirmationBoundary(form, formClass, pageHtml = '') {
  const submitText = String(form.submitText || '').toLowerCase().trim();
  const formHtml = String(form.outerHtml || '').toLowerCase();
  // Strip HTML comments so developer notes or commented code do not count as user UI
  const htmlContext = (formHtml + ' ' + pageHtml.slice(0, 5000)).replace(/<!--[\s\S]*?-->/g, '').toLowerCase();

  const isHighImpact = formClass === 'destructive' || formClass === 'financial';
  if (!isHighImpact) {
    return {
      isHighImpact: false,
      hasConfirmationBoundary: true,
      isMachineAmbiguous: false,
      reasons: [],
    };
  }

  const reasons = [];

  // Check 1: Multi-step or preview/review indicator
  const hasStepIndicator = /\b(?:step\s*[1-9]|wizard|order[-_ ]preview|preview[-_ ]step|review[-_ ]order|confirm[-_ ]order|review[-_ ]changes|confirmation[-_ ]step)\b/i.test(htmlContext);

  // Check 2: Confirmation dialog or warning indicator
  const hasConfirmationNotice = (
    /\b(?:cannot\s*be\s*undone|irreversible|permanent|are\s*you\s*sure|please\s*confirm|warning:)\b/i.test(htmlContext) ||
    /\b(?:data-confirm|confirm\(|data-modal|dialog)\b/i.test(formHtml)
  );

  // Check 3: Specific, unambiguous button label
  const hasUnambiguousLabel = Boolean(
    submitText &&
    !AMBIGUOUS_SUBMIT_LABELS.has(submitText) &&
    /\b(?:delete|cancel|pay|place order|subscribe|purchase|confirm|permanently)\b/i.test(submitText)
  );

  const hasConfirmationBoundary = hasStepIndicator || hasConfirmationNotice;

  let isMachineAmbiguous = false;
  if (!hasConfirmationBoundary) {
    if (!hasUnambiguousLabel || AMBIGUOUS_SUBMIT_LABELS.has(submitText)) {
      isMachineAmbiguous = true;
      reasons.push(
        `High-impact (${formClass}) control has ambiguous action label "${form.submitText || 'unlabeled'}" without confirmation boundary or consequences warning`
      );
    } else {
      // Even with a specific label, destructive actions without confirmation boundary are ambiguous/risky
      if (formClass === 'destructive') {
        isMachineAmbiguous = true;
        reasons.push(`Destructive action executes immediately without two-step confirmation boundary or warning`);
      }
    }
  }

  return {
    isHighImpact: true,
    hasConfirmationBoundary,
    hasStepIndicator,
    hasConfirmationNotice,
    hasUnambiguousLabel,
    isMachineAmbiguous,
    reasons,
  };
}
