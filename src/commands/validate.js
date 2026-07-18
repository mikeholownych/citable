import { loadRegistries, checkReferentialIntegrity } from '../registries/index.js';
import { audit } from './audit.js';

/**
 * `citable validate` — schema-validate all registries plus referential integrity.
 * `citable validate-claims|validate-evidence|validate-schema|validate-links` narrow to the
 * relevant detector scope (these require a site target for page-level checks).
 */
export async function validate(root, { mode = 'registries', target, baseUrl, refDate } = {}) {
  const { problems } = loadRegistries(root);
  const { registries } = loadRegistries(root);
  const integrity = checkReferentialIntegrity(registries);
  const structural = [...problems, ...integrity];

  if (mode === 'registries') {
    return { ok: structural.length === 0, problems: structural, findings: [] };
  }
  const scopeMap = { claims: 'claims', evidence: 'evidence', schema: 'schema', links: 'technical', regression: null };
  const result = await audit(root, { target, scope: scopeMap[mode] ?? undefined, baseUrl, refDate });
  return {
    ok: structural.length === 0 && result.findings.filter((f) => ['critical', 'high'].includes(f.classification.severity)).length === 0,
    problems: structural,
    findings: result.findings,
    runId: result.runId,
    dir: result.dir,
  };
}
