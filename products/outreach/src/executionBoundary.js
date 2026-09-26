import { sha256 } from "./utils.js";

/**
 * Execution Boundary and Authorization Guard (B-086).
 *
 * Invariants:
 * 1. Generating a message does NOT authorize sending it.
 * 2. Identifying a publisher does NOT authorize contact.
 * 3. A payment request does NOT authorize purchase.
 * 4. Budget exhaustion fails closed.
 */
export function authorizeOutreachExecution(request = {}, context = {}) {
  const nowIso = new Date().toISOString();
  const actionType = request.action_type || "SEND_OUTREACH_MESSAGE";
  const targetId = request.target_resource_id || request.message_id || "res_unspecified";

  const explicitHumanApproval = Boolean(request.explicit_human_approval || request.approved_by);
  const approverIdentity = request.approved_by || (request.explicit_human_approval ? "authorized_operator" : null);

  const suppressionCheckPassed = !Boolean(context.is_suppressed || request.is_suppressed);
  const circuitBreakerClear = !Boolean(context.circuit_breaker_tripped || request.circuit_breaker_tripped);

  const estimatedCost = Number(request.requested_cost_minor_units ?? 0);
  const availableBudget = Number(context.remaining_project_budget_minor_units ?? 10000);
  const budgetAvailable = availableBudget >= estimatedCost;

  let status = "AUTHORIZED";
  let refusalReason = null;

  if (!explicitHumanApproval) {
    status = "REFUSED_NOT_AUTHORIZED";
    refusalReason = `Action "${actionType}" refused: Recommendation does not authorize execution; requires explicit human authorization`;
  } else if (!suppressionCheckPassed) {
    status = "REFUSED_SUPPRESSED";
    refusalReason = `Action "${actionType}" refused: Target recipient/domain is active in the suppression registry`;
  } else if (!circuitBreakerClear) {
    status = "REFUSED_CIRCUIT_BREAKER_ACTIVE";
    refusalReason = `Action "${actionType}" refused: Campaign circuit breaker is tripped; requires explicit reauthorization`;
  } else if (!budgetAvailable) {
    status = "REFUSED_BUDGET_EXHAUSTED";
    refusalReason = `Action "${actionType}" refused: Cost (${estimatedCost} minor units) exceeds available project budget (${availableBudget} minor units)`;
  }

  const seed = `${actionType}|${targetId}|${status}|${nowIso}`;
  const authorizationId = `auth_bnd_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    authorization_id: authorizationId,
    action_type: actionType,
    target_resource_id: targetId,
    status,
    boundary_checks: {
      explicit_human_approval: explicitHumanApproval,
      approver_identity: approverIdentity,
      suppression_check_passed: suppressionCheckPassed,
      circuit_breaker_clear: circuitBreakerClear,
    },
    budget_enforcement: {
      budget_available: budgetAvailable,
      authorized_minor_units: status === "AUTHORIZED" ? estimatedCost : 0,
      remaining_project_budget_minor_units: Math.max(0, availableBudget - (status === "AUTHORIZED" ? estimatedCost : 0)),
    },
    refusal_reason: refusalReason,
    evaluated_at: nowIso,
  };
}
