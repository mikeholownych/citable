import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../evidence/run.js';
import { loadRegistries, checkReferentialIntegrity } from '../registries/index.js';
import { readJson, sha256, parseRefDate } from '../shared/io.js';

function recordHash(value) {
  return sha256(JSON.stringify(value));
}

function assigned(exception, role) {
  return exception.reviewer_assignments.filter((item) => item.role === role).map((item) => item.reviewer_id);
}

function reviewerCanAct(reviewer, role, finding) {
  if (!reviewer || reviewer.status !== 'active' || !reviewer.roles.includes(role)) return false;
  const scopes = reviewer.authorized_scopes || [];
  return scopes.includes('*') || scopes.includes(finding.detector_id) || scopes.includes(finding.subject.identifier);
}

function exceptionProblems(exception, policy, reviewers, findings, evidence, refDate) {
  const problems = [];
  if (!policy || policy.status !== 'active') problems.push('review policy is missing or inactive');
  if (exception.status !== 'approved') problems.push(`exception status is ${exception.status}`);
  if (exception.residual_risk !== 'documented') problems.push('residual risk is not documented');
  if (new Date(exception.expires_at) < refDate) problems.push('exception is expired');
  if (exception.renewal_count > exception.renewal_limit) problems.push('exception renewal limit exceeded');
  if (policy && exception.renewal_limit > policy.max_renewals) problems.push('exception renewal limit exceeds policy');
  if (policy && new Date(exception.expires_at) - new Date(exception.created_at) > policy.max_exception_days * 86400000) problems.push('exception duration exceeds policy');
  if (policy && recordHash(policy) !== exception.policy_hash) problems.push('policy changed since approval');
  if (exception.superseded_by_exception_id) problems.push('exception is superseded');
  const owner = reviewers.get(exception.owner_reviewer_id);
  if (!owner || owner.status !== 'active') problems.push('exception owner is missing or inactive');

  for (const findingId of exception.finding_ids) {
    const finding = findings.get(findingId);
    if (!finding) problems.push(`source finding ${findingId} is unavailable`);
    else if (recordHash(finding) !== exception.finding_hashes[findingId]) problems.push(`source finding ${findingId} changed since approval`);
  }
  for (const evidenceId of exception.evidence_ids) {
    const item = evidence.get(evidenceId);
    if (!item) problems.push(`evidence ${evidenceId} is unavailable`);
    else if (recordHash(item) !== exception.evidence_hashes[evidenceId]) problems.push(`evidence ${evidenceId} changed since approval`);
  }

  if (policy) {
    for (const role of policy.required_roles) {
      const actors = assigned(exception, role);
      if (actors.length === 0) problems.push(`required role ${role} is unassigned`);
      for (const actor of actors) {
        const reviewer = reviewers.get(actor);
        const scoped = exception.finding_ids.every((id) => findings.has(id) && reviewerCanAct(reviewer, role, findings.get(id)));
        if (!scoped) problems.push(`${actor} is not active and authorized for role ${role} across the exception scope`);
      }
    }
    const authors = new Set(assigned(exception, 'content_author'));
    const implementers = new Set(assigned(exception, 'remediation_implementer'));
    const verifiers = new Set([...assigned(exception, 'technical_reviewer'), ...assigned(exception, 'subject_matter_reviewer'), ...assigned(exception, 'independent_reviewer')]);
    if (policy.separation_rules.includes('author_cannot_verify_own_claim') && [...authors].some((id) => verifiers.has(id))) problems.push('content author also verifies the scoped finding');
    if (policy.separation_rules.includes('implementer_cannot_solely_verify') && verifiers.size === 1 && [...implementers].some((id) => verifiers.has(id))) problems.push('remediation implementer is the sole verifier');
    if (policy.separation_rules.includes('commercial_owner_requires_independent_benefit_review') && exception.reviewer_independence !== 'established') problems.push('independent review is not established');
    if (policy.separation_rules.includes('risk_acceptor_must_be_authorized') && assigned(exception, 'risk_acceptor').length === 0) problems.push('authorized risk acceptor is missing');
  }
  for (const assignment of exception.reviewer_assignments) {
    const reviewer = reviewers.get(assignment.reviewer_id);
    if (!reviewer) continue;
    if (reviewer.status !== 'active' || !reviewer.roles.includes(assignment.role)) problems.push(`${reviewer.reviewer_id} is not active in assigned role ${assignment.role}`);
    if ((reviewer.conflicts || []).some((scope) => exception.finding_ids.some((id) => findings.get(id)?.subject.identifier === scope))) problems.push(`${reviewer.reviewer_id} has a declared conflict with the exception scope`);
  }
  return [...new Set(problems)];
}

export function validateGovernance(root, { refDate } = {}) {
  const { registries, problems: schemaProblems } = loadRegistries(root);
  const problems = [...schemaProblems, ...checkReferentialIntegrity(registries)];
  const reference = parseRefDate(refDate);
  const reviewers = new Map(registries.reviewers.entries.map((item) => [item.reviewer_id, item]));
  const policies = new Map(registries.review_policies.entries.map((item) => [item.policy_id, item]));
  const evidence = new Map(registries.evidence.entries.map((item) => [item.evidence_id, item]));
  const activeByFinding = new Map();
  for (const exception of registries.exceptions.entries) {
    const file = path.join(root, '.citable', 'runs', exception.source_run_id, 'findings.json');
    const findings = new Map(fs.existsSync(file) ? readJson(file).map((item) => [item.finding_id, item]) : []);
    const exceptionIssues = exceptionProblems(exception, policies.get(exception.policy_id), reviewers, findings, evidence, reference);
    problems.push(...exceptionIssues.map((problem) => `exceptions/${exception.exception_id}: ${problem}`));
    if (exceptionIssues.length === 0) {
      for (const findingId of exception.finding_ids) {
        const key = `${exception.source_run_id}:${findingId}`;
        activeByFinding.set(key, [...(activeByFinding.get(key) || []), exception.exception_id]);
      }
    }
  }
  for (const [scope, exceptionIds] of activeByFinding) {
    if (exceptionIds.length > 1) problems.push(`ambiguous active exceptions for ${scope}: ${exceptionIds.join(', ')}`);
  }
  return { ok: problems.length === 0, problems, counts: { reviewers: reviewers.size, policies: policies.size, exceptions: registries.exceptions.entries.length } };
}

export function evaluateDispositions(root, { runId, refDate } = {}) {
  if (!runId) throw new Error('source run id is required');
  const findingsFile = path.join(root, '.citable', 'runs', runId, 'findings.json');
  if (!fs.existsSync(findingsFile)) throw new Error(`source findings not found for run ${runId}`);
  const sourceBytes = fs.readFileSync(findingsFile);
  const sourceFindings = JSON.parse(sourceBytes);
  const findings = new Map(sourceFindings.map((item) => [item.finding_id, item]));
  const { registries, problems } = loadRegistries(root);
  const integrity = checkReferentialIntegrity(registries);
  if (problems.length || integrity.length) throw new Error(`registry validation failed: ${[...problems, ...integrity].join('; ')}`);
  const reviewers = new Map(registries.reviewers.entries.map((item) => [item.reviewer_id, item]));
  const policies = new Map(registries.review_policies.entries.map((item) => [item.policy_id, item]));
  const evidence = new Map(registries.evidence.entries.map((item) => [item.evidence_id, item]));
  const reference = parseRefDate(refDate);
  const applicable = registries.exceptions.entries.filter((item) => item.source_run_id === runId);
  const evaluations = applicable.map((exception) => {
    const exceptionProblemsList = exceptionProblems(exception, policies.get(exception.policy_id), reviewers, findings, evidence, reference);
    return { exception, validity: exceptionProblemsList.length ? 'invalid' : 'active', problems: exceptionProblemsList };
  });
  const dispositions = sourceFindings.map((finding) => {
    const matches = evaluations.filter((item) => item.exception.finding_ids.includes(finding.finding_id));
    const active = matches.filter((item) => item.validity === 'active');
    return {
      finding_id: finding.finding_id,
      detector_id: finding.detector_id,
      subject: finding.subject,
      technical_state: 'failed',
      enforcement_disposition: active.length === 1 ? 'accepted_exception' : active.length > 1 ? 'blocked_ambiguous_exception' : 'enforce',
      exception_validity: active.length === 1 ? 'active' : matches.length ? (active.length > 1 ? 'ambiguous' : 'invalid') : 'not_applicable',
      exception_id: active.length === 1 ? active[0].exception.exception_id : null,
      residual_risk: active.length === 1 ? active[0].exception.residual_risk : 'not_documented',
      problems: matches.flatMap((item) => item.problems),
    };
  });
  const run = createRun(root, { command: 'governance evaluate', argv: [runId], target: { kind: 'registries', location: findingsFile } });
  run.addInput('source-findings', sourceBytes);
  run.addInput('exceptions', registries.exceptions);
  run.addInput('review-policies', registries.review_policies);
  run.writeArtifact('dispositions.json', dispositions);
  run.writeArtifact('exception-evaluations.json', evaluations.map(({ exception, ...evaluation }) => ({ exception_id: exception.exception_id, ...evaluation })));
  run.manifest.warnings.push('Accepted exceptions alter enforcement disposition only; source findings remain failed and immutable.');
  run.finalize(dispositions.some((item) => item.enforcement_disposition === 'blocked_ambiguous_exception') ? 'incomplete' : 'completed_with_warnings');
  return { runId: run.runId, dir: run.dir, source_run_id: runId, dispositions, exception_evaluations: evaluations.length };
}

export { recordHash };
