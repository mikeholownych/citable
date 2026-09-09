import { safePath } from '../detectors/framework.js';

/**
 * Perform End-to-End Funnel and Conversion-Path Analysis across site pages.
 */
export function analyzeConversionFunnel(sitePages = [], declaredFunnel = null) {
  let steps = [];

  if (declaredFunnel?.steps?.length) {
    steps = declaredFunnel.steps;
  } else {
    // Auto-discover standard conversion path from site pages
    const roleOrder = ['landing', 'product', 'pricing', 'checkout', 'confirmation'];
    const discovered = [];

    for (const role of roleOrder) {
      const p = sitePages.find((page) => {
        const u = (page.url || '').toLowerCase();
        if (role === 'landing' && (u.endsWith('/') || u.includes('home') || u.includes('landing'))) return true;
        if (role === 'product' && (u.includes('product') || u.includes('feature') || u.includes('solution'))) return true;
        if (role === 'pricing' && (u.includes('pricing') || u.includes('plan'))) return true;
        if (role === 'checkout' && (u.includes('checkout') || u.includes('signup') || u.includes('demo') || u.includes('contact'))) return true;
        if (role === 'confirmation' && (u.includes('thank-you') || u.includes('success') || u.includes('confirmed'))) return true;
        return false;
      });
      if (p) {
        discovered.push({
          step_id: `STEP-${role.toUpperCase()}`,
          name: `${role[0].toUpperCase()}${role.slice(1)} Page`,
          url_pattern: p.url,
          role,
        });
      }
    }
    steps = discovered.length >= 2 ? discovered : [];
  }

  if (steps.length === 0) {
    return {
      funnel_id: declaredFunnel?.funnel_id || 'AUTO-DISCOVERED',
      funnel_name: declaredFunnel?.name || 'Conversion Funnel',
      status: 'insufficient_steps',
      message: 'Could not establish conversion funnel: declare steps in .citable/funnels.yaml or provide multi-step pages.',
      steps: [],
      funnel_health_score: 0,
      leaks: [],
    };
  }

  const stepEvaluations = [];
  const leaks = [];
  let continuityScore = 100;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const page = sitePages.find((p) => (p.url || '').includes(step.url_pattern) || safePath(p.url) === safePath(step.url_pattern));

    if (!page) {
      continuityScore -= 25;
      leaks.push({
        step_id: step.step_id,
        severity: 'critical',
        type: 'missing_page',
        description: `Funnel step page matching "${step.url_pattern}" was not found in audited site output`,
      });
      stepEvaluations.push({
        step: i + 1,
        step_id: step.step_id,
        name: step.name,
        url: step.url_pattern,
        role: step.role,
        status_code: null,
        continuity_intact: false,
        drop_off_risk: 'critical',
      });
      continue;
    }

    const ctas = page.ctas || [];
    const forms = page.forms || [];
    let nextStepLinked = true;
    let nextStepTarget = null;
    let paramPreserved = true;

    if (i < steps.length - 1) {
      const nextStep = steps[i + 1];
      const linkToNext = ctas.find((c) => c.target && c.target.includes(nextStep.url_pattern));
      if (!linkToNext) {
        nextStepLinked = false;
        continuityScore -= 20;
        leaks.push({
          step_id: step.step_id,
          severity: 'high',
          type: 'missing_next_step_cta',
          description: `Step ${i + 1} (${step.name}) has no interactive CTA linking directly to step ${i + 2} (${nextStep.name})`,
        });
      } else {
        nextStepTarget = linkToNext.target;
        // Check attribution parameter preservation
        if (linkToNext.target.includes('?') && !linkToNext.target.includes('utm_')) {
          paramPreserved = false;
          continuityScore -= 10;
          leaks.push({
            step_id: step.step_id,
            severity: 'medium',
            type: 'attribution_parameter_loss',
            description: `CTA link to "${nextStepTarget}" strips campaign attribution query parameters`,
          });
        }
      }
    }

    // Post-conversion confirmation page indexing check
    if (step.role === 'confirmation' || i === steps.length - 1) {
      const robots = Array.from(page.robotsDirectives || []);
      const hasNoindex = robots.some((r) => r.includes('noindex'));
      if (!hasNoindex && (step.role === 'confirmation' || page.url.includes('thank-you') || page.url.includes('success'))) {
        continuityScore -= 10;
        leaks.push({
          step_id: step.step_id,
          severity: 'medium',
          type: 'unprotected_conversion_page',
          description: 'Post-conversion thank-you page lacks a noindex directive, risking conversion goal contamination in analytics',
        });
      }
    }

    // Distraction leaks on checkout / high-intent steps
    if (['checkout', 'pricing', 'signup'].includes(step.role) && (page.navLinksCount || 0) > 12) {
      continuityScore -= 15;
      leaks.push({
        step_id: step.step_id,
        severity: 'medium',
        type: 'enclosed_checkout_leak',
        description: `Conversion step "${step.name}" contains ${page.navLinksCount} header/footer links, leaking visitors out of the funnel`,
      });
    }

    // Drop-off risk assessment
    let dropOffRisk = 'low';
    if (!nextStepLinked || page.status >= 400) dropOffRisk = 'critical';
    else if (forms.some((f) => f.fieldCount > 6)) dropOffRisk = 'high';
    else if ((page.navLinksCount || 0) > 12) dropOffRisk = 'moderate';

    stepEvaluations.push({
      step: i + 1,
      step_id: step.step_id,
      name: step.name,
      url: page.url,
      role: step.role,
      status_code: page.status,
      continuity_intact: nextStepLinked && page.status === 200,
      next_step_target: nextStepTarget,
      drop_off_risk: dropOffRisk,
      form_count: forms.length,
      cta_count: ctas.length,
    });
  }

  const finalScore = Math.min(100, Math.max(0, continuityScore));

  return {
    funnel_id: declaredFunnel?.funnel_id || 'DISCOVERED-FUNNEL',
    funnel_name: declaredFunnel?.name || 'Primary Conversion Path',
    funnel_health_score: finalScore,
    status: finalScore >= 80 ? 'healthy' : finalScore >= 50 ? 'needs_optimization' : 'critical_leaks',
    steps: stepEvaluations,
    total_steps: steps.length,
    leaks,
  };
}
