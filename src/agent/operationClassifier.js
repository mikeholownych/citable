/**
 * Operation and Side-Effect Classifier for Machine-Exposed Actions.
 *
 * Implements requirement B-062:
 * - Machine-exposed operations classify as:
 *   READ | CREATE | UPDATE | DELETE | FINANCIAL | COMMUNICATION | PRIVILEGE_CHANGE.
 * - Identifies destructive operations (DELETE_ACCOUNT, CANCEL_SUBSCRIPTION, CANCEL_ORDER,
 *   DELETE_DATA, REVOKE_ACCESS) carrying elevated risk.
 * - Verifies whether destructive operations expose confirmation boundaries, idempotency,
 *   and appropriate authorization guards.
 */

export const OPERATION_CATEGORIES = [
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'FINANCIAL',
  'COMMUNICATION',
  'PRIVILEGE_CHANGE',
];

export const DESTRUCTIVE_ACTION_PATTERNS = [
  { type: 'DELETE_ACCOUNT', rx: /\b(?:delete|close|terminate|wipe|remove)[_\s-]*(?:account|profile|user)\b/i },
  { type: 'CANCEL_SUBSCRIPTION', rx: /\b(?:cancel|terminate|end)[_\s-]*(?:subscription|membership|plan|recurring)\b/i },
  { type: 'CANCEL_ORDER', rx: /\b(?:cancel|abort)[_\s-]*(?:order|booking|reservation)\b/i },
  { type: 'DELETE_DATA', rx: /\b(?:delete|drop|purge|erase|destroy|wipe)[_\s-]*(?:data|records|database|table|history|all)\b/i },
  { type: 'REVOKE_ACCESS', rx: /\b(?:revoke|remove|deprecate)[_\s-]*(?:access|key|token|credential|permission)\b/i },
];

/**
 * Classify a machine-exposed operation (tool, API endpoint, or skill)
 * into one of the 7 standardized side-effect categories.
 */
export function classifyOperation(op) {
  const name = String(op.name || op.id || op.task || '').trim();
  const desc = String(op.description || '').trim();
  const method = String(op.method || '').toUpperCase();
  const path = String(op.path || op.endpoint || '').toLowerCase();

  const normName = name.replace(/[_-]+/g, ' ');
  const normDesc = desc.replace(/[_-]+/g, ' ');
  const normPath = path.replace(/[_-]+/g, ' ');
  const text = `${normName} ${normDesc} ${normPath}`.toLowerCase();

  // Check explicit declaration if tool specifies its own side-effect / category
  if (op.side_effects && typeof op.side_effects === 'string') {
    const declaredUpper = op.side_effects.toUpperCase();
    if (OPERATION_CATEGORIES.includes(declaredUpper)) {
      return buildClassification(op, declaredUpper, normName, normDesc);
    }
  }

  // 1. FINANCIAL check (takes precedence over generic create/update)
  if (
    /\b(?:buy|purchase|checkout|pay|payment|charge|order|refund|transfer|tip|deposit|withdraw|billing|invoice|subscribe|renew)\b/i.test(text) ||
    op.financial === true
  ) {
    return buildClassification(op, 'FINANCIAL', normName, normDesc);
  }

  // 2. PRIVILEGE_CHANGE check
  if (
    /\b(?:grant|revoke|promote|demote|authorize|permission|role|admin|transfer_ownership|access_token|api_key)\b/i.test(text)
  ) {
    return buildClassification(op, 'PRIVILEGE_CHANGE', normName, normDesc);
  }

  // 3. COMMUNICATION check
  if (
    /\b(?:send|email|message|sms|notify|notification|broadcast|publish post|post comment|chat|contact support)\b/i.test(text)
  ) {
    return buildClassification(op, 'COMMUNICATION', normName, normDesc);
  }

  // 4. DELETE check (HTTP DELETE, or delete-like verbs)
  if (
    method === 'DELETE' ||
    /\b(?:delete|destroy|drop|remove|purge|erase|cancel|unlink|deactivate|uninstall)\b/i.test(normName) ||
    /\b(?:deletes|removes|purges|destroys)\b/i.test(normDesc)
  ) {
    return buildClassification(op, 'DELETE', normName, normDesc);
  }

  // 5. CREATE check
  if (
    /\b(?:create|add|insert|register|new|compose|generate|upload|import|post|build)\b/i.test(normName) ||
    (/\b(?:creates|adds|inserts|registers)\b/i.test(normDesc) && !/\b(?:query|find|search|get)\b/i.test(normName))
  ) {
    return buildClassification(op, 'CREATE', normName, normDesc);
  }

  // 6. UPDATE check
  if (
    method === 'PATCH' || method === 'PUT' ||
    /\b(?:update|edit|modify|patch|set|change|alter|toggle|save|replace|rename|sync)\b/i.test(normName) ||
    /\b(?:updates|edits|modifies|sets)\b/i.test(normDesc)
  ) {
    return buildClassification(op, 'UPDATE', normName, normDesc);
  }

  // 7. READ check (default for queries, lookups, GET)
  return buildClassification(op, 'READ', normName, normDesc);
}

function buildClassification(op, category, name, desc) {
  const combined = `${name} ${desc} ${op.path || ''}`.replace(/[_-]+/g, ' ');
  let isDestructive = false;
  let destructiveType = null;

  for (const { type, rx } of DESTRUCTIVE_ACTION_PATTERNS) {
    if (rx.test(combined)) {
      isDestructive = true;
      destructiveType = type;
      break;
    }
  }

  // In addition, any DELETE operation without specific targets is high risk
  if (category === 'DELETE' && !destructiveType) {
    if (/\b(?:account|data|all|system|workspace|project|team)\b/i.test(combined)) {
      isDestructive = true;
      destructiveType = 'DELETE_DATA';
    }
  }

  const riskLevel = isDestructive ? 'elevated' : (category === 'FINANCIAL' || category === 'PRIVILEGE_CHANGE' ? 'elevated' : 'normal');

  return {
    category,
    isDestructive,
    destructiveType,
    riskLevel,
  };
}

/**
 * Check whether a high-risk / destructive operation declares appropriate
 * safety guards (confirmation requirement, idempotency, authorization).
 */
export function checkOperationSafetyGuards(op, classification) {
  const missingGuards = [];

  const hasConfirmation = Boolean(
    op.requires_confirmation === true ||
    op.confirmation === true ||
    op.confirmation_required === true ||
    /\b(?:confirm|confirmation|preview|prompt_user|approval)\b/i.test(op.description || '')
  );

  const hasIdempotency = Boolean(
    op.idempotent === true ||
    op.idempotency_key === true ||
    /\bidempotent\b/i.test(op.description || '') ||
    (op.inputSchema?.properties && ('idempotency_key' in op.inputSchema.properties || 'requestId' in op.inputSchema.properties))
  );

  const hasAuthGuard = Boolean(
    op.authorization ||
    op.auth_required === true ||
    op.scope ||
    op.scopes?.length > 0 ||
    /\b(?:auth|authorized|api_key|token|credential)\b/i.test(op.description || '')
  );

  if (classification.isDestructive) {
    if (!hasConfirmation) {
      missingGuards.push(`Missing confirmation requirement for elevated-risk action (${classification.destructiveType || 'DESTRUCTIVE'})`);
    }
    if (!hasIdempotency && classification.category !== 'READ') {
      missingGuards.push('Missing idempotency declaration to prevent accidental repeated execution');
    }
  }

  if ((classification.category === 'FINANCIAL' || classification.category === 'PRIVILEGE_CHANGE') && !hasAuthGuard) {
    missingGuards.push(`Missing explicit authorization/scope requirement for ${classification.category} operation`);
  }

  return {
    safe: missingGuards.length === 0,
    hasConfirmation,
    hasIdempotency,
    hasAuthGuard,
    missingGuards,
  };
}
