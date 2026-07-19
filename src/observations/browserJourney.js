import { envelope, observationRun, readInput } from './common.js';
import { fetchUrl } from '../crawler/fetch.js';
import { sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

async function executeStep(page, step) {
  const locator = step.locator ? page.locator(step.locator).first() : null;
  if (step.action === 'navigate') await page.goto(step.url, { waitUntil: 'networkidle' });
  else if (step.action === 'click') await locator.click();
  else if (step.action === 'fill') {
    const value = process.env[step.value_env];
    if (value == null) throw new Error(`environment input ${step.value_env} is unavailable`);
    await locator.fill(value);
  } else if (step.action === 'select_option') {
    const value = process.env[step.value_env];
    if (value == null) throw new Error(`environment input ${step.value_env} is unavailable`);
    await locator.selectOption(value);
  } else if (step.action === 'check') await locator.check();
  else if (step.action === 'press') await locator.press(step.key);
  else if (step.action === 'wait_for') await locator.waitFor({ state: 'visible' });
  else if (step.action === 'assert_visible' && !(await locator.isVisible())) throw new Error(`locator is not visible: ${step.locator}`);
  else if (step.action === 'scroll') await locator.scrollIntoViewIfNeeded();
}

async function playwrightCapture(profile, plan, playwright) {
  if (profile.authentication_state !== 'anonymous') throw new Error(`authentication state ${profile.authentication_state} requires a disclosed custom adapter`);
  const browserType = playwright[profile.browser.engine];
  if (!browserType) throw new Error(`Playwright engine ${profile.browser.engine} is unavailable`);
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: profile.device.viewport,
      isMobile: profile.device.is_mobile,
      javaScriptEnabled: profile.javascript_enabled,
      locale: profile.locale,
    });
    try {
      const page = await context.newPage();
      const consoleErrors = [], networkFailures = [], steps = [], stepScreenshots = {};
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('requestfailed', (request) => networkFailures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
      const response = await page.goto(plan.target, { waitUntil: 'networkidle' });
      for (const step of profile.steps) {
        const record = { step_id: step.step_id, action: step.action, status: 'completed', failure: null, screenshot_ref: null };
        try {
          await executeStep(page, step);
          if (step.capture_screenshot) {
            record.screenshot_ref = `journeys/${profile.profile_id}/steps/${step.step_id}.png`;
            stepScreenshots[record.screenshot_ref] = await page.screenshot({ fullPage: true });
          }
        } catch (error) {
          record.status = 'failed';
          record.failure = error.message;
          steps.push(record);
          if (step.required) throw Object.assign(new Error(`required step ${step.step_id} failed: ${error.message}`), { steps, stepScreenshots });
          continue;
        }
        steps.push(record);
      }
      const dom = await page.content();
      const text = await page.locator('body').innerText();
      const accessibilityTree = typeof page.locator('body').ariaSnapshot === 'function' ? await page.locator('body').ariaSnapshot() : null;
      return {
        final_url: page.url(), status: response?.status() ?? null, browser_version: browser.version(),
        dom, text, accessibility_tree: accessibilityTree, screenshot: await page.screenshot({ fullPage: true }),
        console_errors: consoleErrors, network_failures: networkFailures, steps, step_screenshots: stepScreenshots,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export async function observeBrowserPlan(root, options) {
  const input = readInput(options.input);
  const plan = input.value;
  const check = validateAgainst('browser-evidence-plan.schema.json', plan);
  if (!check.valid) throw new Error(`browser evidence plan violates contract: ${check.errors.join('; ')}`);
  if (options.target && options.target !== plan.target) throw new Error('browser evidence target differs from the plan target');
  const profileIds = plan.profiles.map((item) => item.profile_id);
  if (new Set(profileIds).size !== profileIds.length) throw new Error('browser evidence plan contains duplicate profile ids');
  const targetOrigin = new URL(plan.target).origin;
  for (const profile of plan.profiles) {
    const stepIds = profile.steps.map((item) => item.step_id);
    if (new Set(stepIds).size !== stepIds.length) throw new Error(`${profile.profile_id}: duplicate journey step ids`);
    for (const step of profile.steps) {
      if (step.action === 'navigate') {
        if (!step.url) throw new Error(`${profile.profile_id}/${step.step_id}: navigate requires url`);
        if (new URL(step.url).origin !== targetOrigin) throw new Error(`${profile.profile_id}/${step.step_id}: cross-origin navigation is not allowed`);
      } else if (!step.locator) throw new Error(`${profile.profile_id}/${step.step_id}: ${step.action} requires locator`);
      if (['fill', 'select_option'].includes(step.action) && !step.value_env) throw new Error(`${profile.profile_id}/${step.step_id}: ${step.action} requires value_env`);
      if (step.action === 'press' && !step.key) throw new Error(`${profile.profile_id}/${step.step_id}: press requires key`);
    }
  }

  let playwright = options.playwright;
  if (!options.captureJourney && !playwright) {
    try { playwright = await import('playwright'); } catch {
      const item = envelope('browser_journey', { plan_id: plan.plan_id, target: plan.target }, { method: 'browser', source: 'playwright', state: 'not_evidenced', confidence: 'unknown', limitations: ['Optional Playwright dependency is not installed.'] });
      return observationRun(root, 'observe render', plan.target, [item], { rawInputs: { browser_evidence_plan: input.raw }, incomplete: ['Cross-browser journey collection unavailable: install Playwright and browser engines.'] });
    }
  }

  const initial = await (options.fetchUrl || fetchUrl)(plan.target, { maxRetries: 1 });
  const observations = [], incomplete = [], artifacts = {
    'initial/response.html': initial.body,
    'initial/headers.json': initial.headers || {},
  };
  for (const profile of plan.profiles) {
    const prefix = `journeys/${profile.profile_id}`;
    try {
      const capture = options.captureJourney
        ? await options.captureJourney(profile, plan)
        : await playwrightCapture(profile, plan, playwright);
      if (!capture || typeof capture.dom !== 'string' || typeof capture.text !== 'string' || typeof capture.browser_version !== 'string' || capture.screenshot == null) {
        throw new Error('browser adapter returned an incomplete capture contract');
      }
      const refs = {
        raw_response: 'initial/response.html',
        rendered_dom: `${prefix}/dom.html`,
        rendered_text: `${prefix}/text.txt`,
        accessibility_tree: capture.accessibility_tree == null ? null : `${prefix}/accessibility-tree.txt`,
        screenshot: `${prefix}/final.png`,
        failures: `${prefix}/failures.json`,
        interactions: `${prefix}/steps.json`,
      };
      artifacts[refs.rendered_dom] = capture.dom;
      artifacts[refs.rendered_text] = capture.text;
      if (refs.accessibility_tree) artifacts[refs.accessibility_tree] = capture.accessibility_tree;
      artifacts[refs.screenshot] = capture.screenshot;
      artifacts[refs.failures] = { console_errors: capture.console_errors || [], network_failures: capture.network_failures || [] };
      artifacts[refs.interactions] = capture.steps || [];
      for (const [name, value] of Object.entries(capture.step_screenshots || {})) {
        if (!name.startsWith(`${prefix}/steps/`) || name.includes('..')) throw new Error(`browser adapter returned unsafe artifact path: ${name}`);
        artifacts[name] = value;
      }
      const versionMatches = profile.browser.expected_version == null || profile.browser.expected_version === capture.browser_version;
      const data = {
        plan_id: plan.plan_id, target: plan.target, profile_id: profile.profile_id,
        browser: { ...profile.browser, observed_version: capture.browser_version, version_matches_expectation: versionMatches },
        device: profile.device, javascript_enabled: profile.javascript_enabled, locale: profile.locale,
        consent_state: profile.consent_state, authentication_state: profile.authentication_state,
        final_url: capture.final_url, status: capture.status, dom_hash: sha256(capture.dom), text_hash: sha256(capture.text),
        steps: capture.steps || [], artifact_refs: refs,
        interpretation_boundary: 'Observed differences do not establish semantic, retrieval, citation, ranking, or business impact.',
      };
      const limitations = [...plan.limitations, ...profile.limitations];
      if (!versionMatches) limitations.push('Observed browser version differs from the planned version.');
      observations.push(envelope('browser_journey', data, { method: 'browser', source: `playwright/${profile.browser.engine}`, raw: capture.dom, limitations }));
    } catch (error) {
      incomplete.push(`${profile.profile_id}: ${error.message}`);
      const failureRef = `${prefix}/failure.json`;
      artifacts[failureRef] = { profile_id: profile.profile_id, error: error.message, completed_steps: error.steps || [] };
      for (const [name, value] of Object.entries(error.stepScreenshots || {})) artifacts[name] = value;
      observations.push(envelope('browser_journey', {
        plan_id: plan.plan_id, target: plan.target, profile_id: profile.profile_id, browser: profile.browser,
        device: profile.device, javascript_enabled: profile.javascript_enabled, locale: profile.locale,
        consent_state: profile.consent_state, authentication_state: profile.authentication_state,
        steps: error.steps || [], artifact_refs: { failure: failureRef },
        interpretation_boundary: 'Profile failure does not invalidate successful profiles or establish semantic impact.',
      }, { method: 'browser', source: `playwright/${profile.browser.engine}`, state: 'failed', confidence: 'confirmed', raw: error.message, limitations: [...plan.limitations, ...profile.limitations, error.message] }));
    }
  }
  return observationRun(root, 'observe render', plan.target, observations, { rawInputs: { browser_evidence_plan: input.raw }, incomplete, artifacts });
}
