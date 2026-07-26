import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../../src/commands/init.js';
import { audit } from '../../src/commands/audit.js';
import { observe } from '../../src/commands/observe.js';
import { applyRemediation } from '../../src/commands/applyRemediation.js';
import { monitor } from '../../src/commands/monitor.js';
import { readJson, sha256 } from '../../src/shared/io.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const OBS = path.join(FIX, 'observations');
const fresh = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-obs-')); init(root); return root; };
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('observation collectors normalize owner evidence and preserve boundaries', async () => {
  const root = fresh();
  const index = await observe(root, 'index', { input: path.join(OBS, 'index.json') });
  assert.equal(index.observations[0].data.indexed, true);
  assert.equal(index.observations[0].collection_method, 'owner_import');

  const citations = await observe(root, 'citations', { input: path.join(OBS, 'citations.json') });
  assert.equal(citations.summary.citation_metrics.citation_presence_rate, 1);
  assert.equal(citations.summary.citation_metrics.supported_citation_rate, 0.5);
  assert.deepEqual(citations.summary.citation_metrics.competitive_domains, ['competitor.test']);

  const logs = await observe(root, 'logs', { input: path.join(OBS, 'logs.json') });
  assert.equal(logs.manifest.status, 'incomplete');
  assert.ok(logs.observations.some((o) => o.confidence === 'confirmed'));
  assert.ok(logs.observations.some((o) => o.confidence === 'high'));
  assert.equal(logs.observations[0].data.crawler_identity.verification_status, 'fully_verified');
  assert.equal(logs.observations[1].data.crawler_identity.verification_status, 'contradictory');
  assert.equal(logs.observations[0].authority.authenticity_status, 'provider_range_verified');
  assert.equal(logs.observations[0].authority.collection_authority, 'production_log');
  const unsafeLog = path.join(root, 'unsafe-log.json');
  fs.writeFileSync(unsafeLog, JSON.stringify({ requests: [{ timestamp: '2026-07-18T00:00:00Z', url: '/', user_agent: 'Bot', status: 200, authorization: 'Bearer secret' }] }));
  await assert.rejects(observe(root, 'logs', { input: unsafeLog }), /sensitive fields/);

  const performance = await observe(root, 'performance', { input: path.join(OBS, 'performance.json') });
  assert.equal(performance.observations[0].kind, 'performance');
  assert.equal(performance.observations[0].data.evidence_type, 'field');
  const corroboration = await observe(root, 'corroboration', { input: path.join(OBS, 'corroboration.json') });
  assert.equal(corroboration.observations[0].confidence, 'high');
  assert.deepEqual(corroboration.observations[0].authority, {
    source_authority: 'independently_controlled',
    collection_authority: 'third_party_export',
    authenticity_status: 'checksum_protected_only',
    representativeness: 'convenience_sample',
  });
  assert.match(corroboration.observations[0].limitations.join(' '), /does not establish.*authority|authority.*does not establish/i);
  for (const result of [index, citations, logs, performance, corroboration]) {
    assert.ok(fs.existsSync(path.join(result.dir, 'checksums.json')));
  }
});

test('corroboration imports reject legacy independence booleans and undisclosed control', async () => {
  const root = fresh();
  const legacy = path.join(root, 'legacy-corroboration.json');
  fs.writeFileSync(legacy, JSON.stringify({
    mentions: [{
      url: 'https://publisher.example/report',
      publisher: 'Publisher',
      entity: 'Example',
      independent: true,
      observed_at: '2026-07-18T12:00:00Z',
    }],
  }));
  await assert.rejects(observe(root, 'corroboration', { input: legacy }), /contract|schema_version|source_control/i);

  const controlled = JSON.parse(fs.readFileSync(path.join(OBS, 'corroboration.json'), 'utf8'));
  controlled.mentions[0].source_control = 'owner_controlled';
  controlled.mentions[0].relationship_disclosure = 'unknown';
  const controlledFile = path.join(root, 'controlled-corroboration.json');
  fs.writeFileSync(controlledFile, JSON.stringify(controlled));
  const result = await observe(root, 'corroboration', { input: controlledFile });
  assert.equal(result.observations[0].confidence, 'low');
  assert.match(result.observations[0].limitations.join(' '), /independence is not established/i);
});

test('crawler probes exercise every declared identity without becoming production access evidence', async () => {
  const root = fresh();
  const calls = [];
  const result = await observe(root, 'probes', {
    target: 'https://example.test/important',
    region: 'local-fixture',
    lookup: publicLookup,
    fetchUrl: async (url, options) => {
      calls.push({ url, userAgent: options.userAgent });
      const challenged = options.userAgent === 'GPTBot';
      return {
        url,
        status: challenged ? 403 : 200,
        headers: challenged ? { 'content-type': 'text/html', 'cf-mitigated': 'challenge', 'set-cookie': 'secret=must-not-persist' } : { 'content-type': 'text/html' },
        body: challenged ? '<title>Attention required</title>Verify you are human' : '<title>OK</title>Public content',
        redirectChain: [],
      };
    },
  });

  assert.equal(calls.length, 8);
  assert.equal(result.observations.length, 8);
  assert.ok(result.observations.every((item) => item.kind === 'crawler_probe'));
  assert.ok(result.observations.every((item) => item.collection_method === 'synthetic_fetch'));
  assert.ok(result.observations.every((item) => item.authority.source_authority === 'synthetic'));
  assert.ok(result.observations.every((item) => item.data.identity_status === 'synthetically_observed'));
  assert.ok(result.observations.every((item) => item.data.production_access_established === false));
  assert.equal(result.observations.find((item) => item.data.user_agent === 'GPTBot').data.edge_classification, 'challenged');
  assert.ok(!JSON.stringify(result).includes('secret=must-not-persist'));
  assert.match(result.observations[0].limitations.join(' '), /spoofed|synthetic.*not.*production/i);
});

test('crawler probes preserve partial failures and reject missing registry or unsafe targets', async () => {
  const root = fresh();
  let calls = 0;
  const partial = await observe(root, 'probes', {
    target: 'https://example.test/',
    lookup: publicLookup,
    fetchUrl: async (url, options) => {
      calls++;
      if (options.userAgent === 'ClaudeBot') throw new Error('fixture timeout');
      return { url, status: 200, headers: {}, body: 'ok', redirectChain: [] };
    },
  });
  assert.equal(calls, 8);
  assert.equal(partial.manifest.status, 'incomplete');
  assert.equal(partial.observations.find((item) => item.data.user_agent === 'ClaudeBot').state, 'failed');

  const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-no-registry-'));
  await assert.rejects(observe(missing, 'probes', { target: 'https://example.test/' }), /crawlers.*registry|init/i);

  let unsafeCalls = 0;
  await assert.rejects(observe(root, 'probes', {
    target: 'http://127.0.0.1/',
    fetchUrl: async () => { unsafeCalls++; return {}; },
  }), /private|loopback|non-public/i);
  assert.equal(unsafeCalls, 0);
});

test('Bing owner exports preserve dataset boundaries and never imply ranking or causation', async () => {
  const root = fresh();
  const ai = await observe(root, 'bing', { input: path.join(OBS, 'bing-ai-performance.csv'), dataset: 'ai_performance' });
  assert.equal(ai.observations.length, 2);
  assert.equal(ai.observations[0].data.metrics.total_citations, 12);
  assert.match(ai.observations[0].data.interpretation_boundary.join(' '), /do not indicate ranking/);
  assert.equal(ai.observations[0].authority.collection_authority, 'owner_export');
  assert.equal(ai.observations[0].authority.representativeness, 'unknown');

  const search = await observe(root, 'bing', { input: path.join(OBS, 'bing-search-performance.json'), dataset: 'search_performance' });
  assert.equal(search.observations[0].data.dimensions.source, 'Web');
  assert.equal(search.observations[0].authority.representativeness, 'complete_export');
  assert.match(search.observations[0].data.interpretation_boundary.join(' '), /does not establish/);

  await assert.rejects(observe(root, 'bing', { input: path.join(OBS, 'bing-invalid.json'), dataset: 'ai_performance' }), /valid date/);
});

test('passage and consensus collectors analyze site artifacts without external claims', async () => {
  const root = fresh();
  const options = { target: path.join(FIX, 'site-clean'), baseUrl: 'https://example.test' };
  const passages = await observe(root, 'passages', options);
  assert.ok(passages.observations.length > 0);
  assert.ok(passages.observations.every((o) => o.collection_method === 'static_analysis'));
  const consensus = await observe(root, 'consensus', options);
  assert.ok(consensus.observations.some((o) => o.data.canonical_consensus === true));
  assert.ok(consensus.observations.every((o) => o.data.engine_selected_canonical === null));
});

test('freshness consensus normalizes dated signals and preserves content-change intervals', async () => {
  const root = fresh();
  const site = path.join(root, 'freshness-site');
  fs.cpSync(path.join(FIX, 'site-clean'), site, { recursive: true });
  const indexFile = path.join(site, 'index.html');
  fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace(
    '</head>',
    '<meta property="article:modified_time" content="2026-07-02T08:30:00Z"></head>',
  ));
  const pricingFile = path.join(site, 'pricing', 'index.html');
  fs.writeFileSync(pricingFile, fs.readFileSync(pricingFile, 'utf8').replace(
    '</head>',
    '<meta property="article:modified_time" content="2026-02-30"></head>',
  ));
  const snapshotDir = path.join(root, '.citable', 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, 'pages-latest.json'), JSON.stringify({
    taken_at: '2026-07-01T00:00:00Z',
    run_id: 'RUN-PRIOR',
    pages: {
      'https://example.test/': { contentHash: '0'.repeat(64), dateModified: null, status: 200 },
    },
  }));

  const result = await observe(root, 'consensus', { target: site, baseUrl: 'https://example.test' });
  const home = result.observations.find((item) => item.data.url === 'https://example.test/');
  assert.equal(home.data.date_consensus, false);
  assert.equal(home.data.freshness_assessment, 'conflicting_signals');
  assert.deepEqual(home.data.date_signals.map((item) => item.normalized_date), ['2026-07-01', '2026-07-02']);
  assert.equal(home.data.content_snapshot.changed_since_snapshot, true);
  assert.equal(home.data.content_snapshot.change_observed_after, '2026-07-01T00:00:00Z');
  assert.equal(home.data.content_snapshot.exact_change_time_established, false);

  const pricing = result.observations.find((item) => item.data.url === 'https://example.test/pricing/');
  assert.equal(pricing.data.date_consensus, null);
  assert.equal(pricing.data.freshness_assessment, 'insufficient_signals');
  assert.equal(pricing.data.date_signals.find((item) => item.source === 'visible_or_meta_modified').valid, false);
  assert.match(pricing.limitations.join(' '), /could not be parsed|excluded/i);
});

test('controlled citation runner repeats a disclosed prompt corpus through an adapter', async () => {
  const root = fresh();
  let calls = 0;
  const adapterFetch = async (_url, request) => {
    calls++;
    assert.equal(request.redirect, 'error');
    const payload = JSON.parse(request.body);
    return new Response(JSON.stringify({ provider: 'fixture-provider', answer_text: `Answer ${payload.run_index}`, citations: ['https://example.test/products/gatekeeper/'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const result = await observe(root, 'citations', {
    input: path.join(OBS, 'prompt-corpus.json'),
    endpoint: 'https://adapter.example/run',
    repeat: 3,
    target: 'https://example.test/',
    adapterFetch,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  assert.equal(calls, 3);
  assert.equal(result.summary.citation_metrics.runs, 3);
  assert.equal(result.summary.citation_metrics.citation_presence_rate, 1);
  assert.ok(result.observations.filter((o) => o.kind === 'citation').every((o) => o.collection_method === 'live_api'));
});

test('browser and citation collectors refuse private network targets before adapters execute', async () => {
  const root = fresh();
  let renderCalls = 0;
  await assert.rejects(observe(root, 'render', {
    target: 'http://127.0.0.1/internal',
    captureProfile: async () => { renderCalls++; return {}; },
    fetchUrl: async () => ({ body: '' }),
  }), /private|loopback|non-public/i);
  assert.equal(renderCalls, 0);

  let adapterCalls = 0;
  await assert.rejects(observe(root, 'citations', {
    input: path.join(OBS, 'prompt-corpus.json'),
    endpoint: 'https://169.254.169.254/latest/meta-data',
    adapterFetch: async () => { adapterCalls++; return new Response('{}'); },
  }), /private|loopback|non-public/i);
  assert.equal(adapterCalls, 0);

  const plan = readJson(path.join(OBS, 'browser-plan.json'));
  plan.target = 'http://127.0.0.1/internal';
  const planFile = path.join(root, 'private-browser-plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan));
  let journeyCalls = 0;
  await assert.rejects(observe(root, 'render', {
    input: planFile,
    captureJourney: async () => { journeyCalls++; return {}; },
    fetchUrl: async () => ({ body: '', headers: {} }),
  }), /private|loopback|non-public/i);
  assert.equal(journeyCalls, 0);
});

test('missing live credentials and browser dependency fail closed as incomplete', async () => {
  const root = fresh();
  const oldGsc = process.env.GSC_ACCESS_TOKEN, oldCrux = process.env.CRUX_API_KEY;
  delete process.env.GSC_ACCESS_TOKEN; delete process.env.CRUX_API_KEY;
  try {
    const index = await observe(root, 'index', { target: 'https://example.test/', siteUrl: 'sc-domain:example.test' });
    assert.equal(index.manifest.status, 'incomplete');
    assert.equal(index.observations[0].state, 'not_evidenced');
    const perf = await observe(root, 'performance', { target: 'https://example.test/' });
    assert.equal(perf.observations[0].state, 'not_evidenced');
    const rendered = await observe(root, 'render', { target: 'https://example.test/', lookup: publicLookup });
    assert.equal(rendered.observations[0].state, 'not_evidenced');
  } finally {
    if (oldGsc) process.env.GSC_ACCESS_TOKEN = oldGsc;
    if (oldCrux) process.env.CRUX_API_KEY = oldCrux;
  }
});

test('render profiles preserve partial failures and resume only successful immutable evidence', async () => {
  const root = fresh();
  const target = 'https://example.test/';
  const fetchUrl = async () => ({ body: '<main>Raw server rendered content for parity comparison.</main><script >hidden words must not count</script ><style >hidden styles</style >' });
  const captured = [];
  const captureProfile = async (name, viewport, settings = {}) => {
    captured.push(name);
    if (name === 'javascript_disabled') throw new Error('fixture profile failure');
    return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: `<main>${name} rendered content</main>`, text: `${name} rendered content`, screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [{ tag: 'summary', text: 'Details' }], executed: ['Details'] } };
  };
  const first = await observe(root, 'render', { target, interactions: true, captureProfile, fetchUrl, lookup: publicLookup });
    assert.equal(first.manifest.status, 'incomplete');
    assert.deepEqual(captured, ['desktop', 'mobile', 'javascript_disabled']);
    assert.equal(first.observations.find((item) => item.data.profile === 'javascript_disabled').state, 'failed');
    assert.equal(first.observations.find((item) => item.data.profile === 'desktop').data.raw_http_word_ratio, 2.333);
    assert.ok(fs.existsSync(path.join(first.dir, 'screenshots', 'mobile.png')));

    captured.length = 0;
    const resumed = await observe(root, 'render', { target, interactions: true, resumeRun: first.runId, fetchUrl, lookup: publicLookup, captureProfile: async (name, viewport, settings = {}) => {
      captured.push(name);
      return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: '<main>Server fallback content</main>', text: 'Server fallback content', screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [], executed: [] } };
    } });
    assert.deepEqual(captured, ['javascript_disabled']);
    assert.equal(resumed.manifest.status, 'completed');
    assert.equal(resumed.observations.filter((item) => item.data.profile === 'desktop').length, 1);
  assert.equal(resumed.observations.find((item) => item.data.profile === 'parity').data.resumed_from_run_id, first.runId);
  assert.match(resumed.manifest.warnings.join(' '), /reused from immutable run/);

  captured.length = 0;
  await observe(root, 'render', { target: 'https://other.example.test/', interactions: true, resumeRun: first.runId, fetchUrl, lookup: publicLookup, captureProfile: async (name, viewport, settings = {}) => {
    captured.push(name);
    return { name, final_url: target, status: 200, viewport, javaScriptEnabled: settings.javaScriptEnabled !== false, html: '<main>Other target</main>', text: 'Other target', screenshot: Buffer.from(name), failed_requests: [], interactions: { discovered: [], executed: [] } };
  } });
  assert.deepEqual(captured, ['desktop', 'mobile', 'javascript_disabled']);
});

test('browser evidence plans preserve cross-browser artifacts and partial journeys', async () => {
  const root = fresh();
  const planFile = path.join(OBS, 'browser-plan.json');
  const result = await observe(root, 'render', {
    input: planFile,
    lookup: publicLookup,
    fetchUrl: async () => ({ body: '<main>Initial response</main>', headers: { 'content-type': 'text/html' } }),
    captureJourney: async (profile) => {
      if (profile.profile_id === 'firefox-mobile') throw new Error('fixture engine unavailable');
      return {
        final_url: 'https://example.test/', status: 200, browser_version: 'fixture-chromium',
        dom: '<main>Rendered response</main>', text: 'Rendered response', accessibility_tree: '- main "Rendered response"',
        screenshot: Buffer.from('final'), console_errors: ['fixture console error'], network_failures: [],
        steps: [{ step_id: 'open-details', action: 'click', status: 'completed', failure: null, screenshot_ref: 'journeys/chromium-desktop/steps/open-details.png' }],
        step_screenshots: { 'journeys/chromium-desktop/steps/open-details.png': Buffer.from('step') },
      };
    },
  });
  assert.equal(result.manifest.status, 'incomplete');
  assert.equal(result.observations.filter((item) => item.state === 'observed').length, 1);
  assert.equal(result.observations.filter((item) => item.state === 'failed').length, 1);
  const observed = result.observations.find((item) => item.state === 'observed');
  assert.equal(observed.data.browser.engine, 'chromium');
  assert.equal(observed.data.consent_state, 'not_present');
  assert.equal(observed.data.authentication_state, 'anonymous');
  assert.match(observed.data.interpretation_boundary, /do not establish semantic/);
  for (const relative of ['initial/response.html', 'journeys/chromium-desktop/dom.html', 'journeys/chromium-desktop/accessibility-tree.txt', 'journeys/chromium-desktop/final.png', 'journeys/chromium-desktop/failures.json', 'journeys/chromium-desktop/steps.json', 'journeys/firefox-mobile/failure.json']) {
    assert.ok(fs.existsSync(path.join(result.dir, relative)), relative);
  }
});

test('browser evidence plans reject ambiguous profiles and target changes', async () => {
  const root = fresh();
  const plan = readJson(path.join(OBS, 'browser-plan.json'));
  plan.profiles[1].profile_id = plan.profiles[0].profile_id;
  const duplicateFile = path.join(root, 'duplicate-browser-plan.json');
  fs.writeFileSync(duplicateFile, JSON.stringify(plan));
  await assert.rejects(observe(root, 'render', { input: duplicateFile, captureJourney: async () => ({}), lookup: publicLookup }), /duplicate profile ids/);
  await assert.rejects(observe(root, 'render', { input: path.join(OBS, 'browser-plan.json'), target: 'https://other.test/', captureJourney: async () => ({}), lookup: publicLookup }), /differs from the plan target/);
  const crossOrigin = readJson(path.join(OBS, 'browser-plan.json'));
  crossOrigin.profiles[0].steps[0] = { step_id: 'leave-origin', action: 'navigate', locator: null, value_env: null, key: null, url: 'https://other.test/', required: true, capture_screenshot: false };
  const crossOriginFile = path.join(root, 'cross-origin-browser-plan.json');
  fs.writeFileSync(crossOriginFile, JSON.stringify(crossOrigin));
  await assert.rejects(observe(root, 'render', { input: crossOriginFile, captureJourney: async () => ({}), lookup: publicLookup }), /cross-origin navigation is not allowed/);
});

test('local Lighthouse execution preserves repeated lab runs and a median summary', async () => {
  const root = fresh();
  const scores = [0.7, 0.9, 0.8];
  const result = await observe(root, 'performance', { target: 'https://example.test/', lighthouse: true, repeat: 3, lighthouseRunner: async (_target, runIndex) => ({
    lighthouseVersion: '13.4.0', userAgent: 'Fixture Chrome/140', fetchTime: `2026-07-19T00:00:0${runIndex}Z`, finalDisplayedUrl: 'https://example.test/',
    configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate', screenEmulation: { mobile: true }, throttling: { rttMs: 150 } },
    categories: { performance: { score: scores[runIndex - 1] } },
    audits: { 'first-contentful-paint': { numericValue: 1000 + runIndex }, 'largest-contentful-paint': { numericValue: 2000 + runIndex }, 'cumulative-layout-shift': { numericValue: 0.1 * runIndex }, 'total-blocking-time': { numericValue: 100 + runIndex }, 'speed-index': { numericValue: 1500 + runIndex } },
  }) });
  assert.equal(result.manifest.status, 'completed');
  assert.equal(result.observations.length, 4);
  assert.equal(result.observations.at(-1).data.median_metrics.performance_score, 0.8);
  assert.equal(result.observations.at(-1).data.median_metrics.largest_contentful_paint_ms, 2002);
  assert.equal(result.observations[0].data.evidence_type, 'lab');
  assert.equal(result.observations[0].data.configuration.throttling_method, 'simulate');
  assert.ok(fs.existsSync(path.join(result.dir, 'lighthouse', 'run-03.json')));
});

test('guarded remediation requires source run, reviewer, exact hash, and unique match', async () => {
  const root = fresh();
  const source = path.join(root, 'page.html');
  fs.writeFileSync(source, '<title>Old title</title>');
  const auditRun = await audit(root, { target: path.join(FIX, 'site-broken'), baseUrl: 'https://broken.test' });
  const specFile = path.join(root, 'remediation.json');
  const spec = { source_run_id: auditRun.runId, operations: [{ operation_id: 'OP-1', file: 'page.html', find: 'Old title', replace: 'Bounded title', expected_file_hash: sha256(fs.readFileSync(source)), finding_ids: [auditRun.findings[0].finding_id], reviewer: 'Fixture Reviewer' }] };
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const dry = applyRemediation(root, { input: specFile });
  assert.equal(dry.operations[0].status, 'proposed');
  assert.match(fs.readFileSync(source, 'utf8'), /Old title/);
  const wet = applyRemediation(root, { input: specFile, write: true });
  assert.equal(wet.operations[0].status, 'applied');
  assert.match(fs.readFileSync(source, 'utf8'), /Bounded title/);
  assert.throws(() => applyRemediation(root, { input: specFile, write: true }), /hash changed/);
  spec.operations[0].expected_file_hash = sha256(fs.readFileSync(source));
  spec.operations[0].find = 'Bounded title';
  spec.operations[0].finding_ids = ['F-NOT-IN-SOURCE-RUN'];
  fs.writeFileSync(specFile, JSON.stringify(spec));
  assert.throws(() => applyRemediation(root, { input: specFile }), /outside source run/);
});

test('monitor reports index loss between normalized observation runs', async () => {
  const root = fresh();
  const first = await observe(root, 'index', { input: path.join(OBS, 'index.json') });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const changedFile = path.join(root, 'index-changed.json');
  const changed = readJson(path.join(OBS, 'index.json'));
  changed[0].verdict = 'FAIL';
  fs.writeFileSync(changedFile, JSON.stringify(changed));
  const second = await observe(root, 'index', { input: changedFile });
  const result = monitor(root, { runA: first.runId, runB: second.runId });
  assert.ok(result.alerts.some((a) => a.type === 'index_loss'));
  assert.ok(result.summary.critical_or_high > 0);
});
