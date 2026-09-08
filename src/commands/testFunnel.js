import { buildContext } from './context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors } from '../detectors/framework.js';

/**
 * `citable test funnel <funnel_id>` — synthetically test multi-step conversion funnel continuity and parameter preservation.
 */
export async function testFunnel(root, funnelId, { target, baseUrl, refDate } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate });
  if (!ctx.site) throw new Error('test funnel requires a site target (built output directory or URL)');

  const funnels = ctx.registries?.funnels?.entries || [];
  if (funnels.length === 0) {
    throw new Error('no funnels declared in registries (expected .citable/funnels.yaml)');
  }

  const targetFunnel = funnelId
    ? funnels.find((f) => f.funnel_id === funnelId || f.name.toLowerCase().includes(funnelId.toLowerCase()))
    : funnels[0];

  if (!targetFunnel) {
    throw new Error(`funnel "${funnelId}" not found in registries. Available: ${funnels.map((f) => f.funnel_id).join(', ')}`);
  }

  const stepResults = [];
  const issues = [];

  const steps = targetFunnel.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const page = ctx.site.pages.find((p) => p.url.includes(step.url_pattern) || (step.page_id && p.url === step.url_pattern));

    if (!page) {
      issues.push(`Step ${i + 1} (${step.step_id}): Page matching "${step.url_pattern}" not found in audited site`);
      stepResults.push({
        step_id: step.step_id,
        name: step.name || step.step_id,
        url_pattern: step.url_pattern,
        role: step.role,
        found: false,
        status: null,
        next_step_linked: false,
      });
      continue;
    }

    if (page.status >= 400) {
      issues.push(`Step ${i + 1} (${step.step_id}): Returns HTTP error status ${page.status}`);
    }

    let nextStepLinked = true;
    let nextStepTarget = null;
    if (i < steps.length - 1) {
      const nextStep = steps[i + 1];
      const link = (page.ctas || []).find((c) => c.target && c.target.includes(nextStep.url_pattern));
      if (!link) {
        nextStepLinked = false;
        issues.push(`Step ${i + 1} (${step.step_id}): Lacks interactive CTA pointing to next step "${nextStep.url_pattern}"`);
      } else {
        nextStepTarget = link.target;
        if (step.preserve_params && step.preserve_params.length > 0) {
          if (!link.target.includes('?') && !link.target.includes('utm_')) {
            issues.push(`Step ${i + 1} (${step.step_id}): CTA to next step does not forward parameters (${step.preserve_params.join(', ')})`);
          }
        }
      }
    }

    stepResults.push({
      step_id: step.step_id,
      name: step.name || step.step_id,
      url: page.url,
      role: step.role,
      found: true,
      status: page.status,
      cta_count: (page.ctas || []).length,
      next_step_linked: nextStepLinked,
      next_step_target: nextStepTarget,
    });
  }

  // Run CRO detectors across the funnel pages
  const { findings } = runDetectors(selectDetectors({ namespaces: ['CRO'] }), ctx);
  const funnelFindings = findings.filter((f) =>
    f.detector_id.startsWith('CRO-') &&
    (f.observation.summary.includes(targetFunnel.funnel_id) ||
     stepResults.some((s) => s.url && (f.subject.identifier === s.url || f.subject.url === s.url)))
  );

  const status = issues.length === 0 ? 'PASS' : 'FAIL';

  return {
    funnel_id: targetFunnel.funnel_id,
    name: targetFunnel.name,
    primary_goal: targetFunnel.primary_goal,
    status,
    total_steps: steps.length,
    steps_verified: stepResults.filter((s) => s.found && s.status === 200 && s.next_step_linked).length,
    steps: stepResults,
    issues,
    findings: funnelFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      summary: f.observation.summary,
    })),
  };
}
