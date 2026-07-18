import { buildContext } from './context.js';
import { envelope, observationRun, readInput } from '../observations/common.js';
import { sha256 } from '../shared/io.js';
import { fetchUrl } from '../crawler/fetch.js';
import net from 'node:net';

const originOf = (value) => { try { return new URL(value).origin; } catch { return null; } };
const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

function canonicalReview(raw, targetOrigin) {
  const citations = raw.citations || [];
  return citations.map((citation, index) => {
    const url = typeof citation === 'string' ? citation : citation.url;
    const canonical = typeof citation === 'object' ? citation.canonical_url || url : url;
    const supports = typeof citation === 'object' ? citation.support_status || 'review_required' : 'review_required';
    return {
      citation_url: url, canonical_url: canonical, citation_order: index + 1,
      first_party: Boolean(targetOrigin && originOf(canonical) === targetOrigin),
      support_status: supports,
      answer_claim: typeof citation === 'object' ? citation.answer_claim || null : null,
      source_passage: typeof citation === 'object' ? citation.source_passage || null : null,
      reviewer: typeof citation === 'object' ? citation.reviewer || null : null,
    };
  });
}

async function observeRender(root, options) {
  if (!options.target || !/^https?:\/\//.test(options.target)) throw new Error('render requires --target <http(s) URL>');
  let playwright;
  try { playwright = await import('playwright'); } catch {
    const item = envelope('render', { url: options.target }, { method: 'browser', source: 'playwright', state: 'not_evidenced', confidence: 'unknown', limitations: ['Optional Playwright dependency is not installed.'] });
    return observationRun(root, 'observe render', options.target, [item], { incomplete: ['Rendered DOM capture unavailable: install Playwright and a Chromium browser.'] });
  }
  const initial = await fetchUrl(options.target, { timeoutMs: options.timeout || 30000, maxRetries: 1 });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const capture = async (name, viewport, isMobile = false) => {
      const context = await browser.newContext({ viewport, isMobile });
      const page = await context.newPage();
      const failures = [];
      page.on('requestfailed', (request) => failures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
      const response = await page.goto(options.target, { waitUntil: 'networkidle', timeout: options.timeout || 30000 });
      const html = await page.content(), text = await page.locator('body').innerText(), screenshot = await page.screenshot({ fullPage: true });
      const result = { name, final_url: page.url(), status: response?.status() ?? null, viewport, html, text, screenshot, failed_requests: failures };
      await context.close();
      return result;
    };
    const desktop = await capture('desktop', { width: 1280, height: 900 });
    const mobile = await capture('mobile', { width: 390, height: 844 }, true);
    const initialText = initial.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const data = {
      url: options.target, initial: { final_url: initial.url, status: initial.status, html_hash: sha256(initial.body), text_hash: sha256(initialText), word_count: words(initialText).length, redirect_chain: initial.redirectChain },
      desktop: { final_url: desktop.final_url, status: desktop.status, html_hash: sha256(desktop.html), text_hash: sha256(desktop.text), word_count: words(desktop.text).length, failed_requests: desktop.failed_requests },
      mobile: { final_url: mobile.final_url, status: mobile.status, html_hash: sha256(mobile.html), text_hash: sha256(mobile.text), word_count: words(mobile.text).length, failed_requests: mobile.failed_requests },
      parity: { initial_to_desktop_word_ratio: words(desktop.text).length ? Number((words(initialText).length / words(desktop.text).length).toFixed(3)) : null, mobile_to_desktop_word_ratio: words(desktop.text).length ? Number((words(mobile.text).length / words(desktop.text).length).toFixed(3)) : null },
    };
    const item = envelope('render', data, { method: 'browser', source: 'playwright/chromium', raw: `${initial.body}\n${desktop.html}\n${mobile.html}` });
    return observationRun(root, 'observe render', options.target, [item], { artifacts: { 'initial/response.html': initial.body, 'rendered/desktop-dom.html': desktop.html, 'rendered/desktop-text.txt': desktop.text, 'rendered/mobile-dom.html': mobile.html, 'rendered/mobile-text.txt': mobile.text, 'screenshots/desktop.png': desktop.screenshot, 'screenshots/mobile.png': mobile.screenshot } });
  } finally { await browser.close(); }
}

async function observeIndex(root, options) {
  if (!options.input) {
    if (!options.target || !options.siteUrl) throw new Error('live index observation requires --target <URL> and --site-url <Search Console property>');
    const token = options.accessToken || process.env.GSC_ACCESS_TOKEN;
    if (!token) {
      const item = envelope('index', { engine: 'google', url: options.target }, { method: 'live_api', source: 'Google Search Console URL Inspection API', state: 'not_evidenced', confidence: 'unknown', limitations: ['GSC_ACCESS_TOKEN is not configured.'] });
      return observationRun(root, 'observe index', options.target, [item], { incomplete: ['Google index inspection unavailable: GSC_ACCESS_TOKEN is not configured.'] });
    }
    const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ inspectionUrl: options.target, siteUrl: options.siteUrl, languageCode: options.locale || 'en-US' }) });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Search Console returned ${response.status}: ${raw.slice(0, 300)}`);
    const value = JSON.parse(raw).inspectionResult?.indexStatusResult || {};
    const data = { engine: 'google', url: options.target, indexed: value.verdict === 'PASS', selected_canonical: value.googleCanonical || null, declared_canonical: value.userCanonical || null, last_crawl: value.lastCrawlTime || null, fetch_state: value.pageFetchState || null, raw_provider_result: value };
    return observationRun(root, 'observe index', options.target, [envelope('index', data, { method: 'live_api', source: 'Google Search Console URL Inspection API', raw })], { rawInputs: { gsc_response: raw } });
  }
  const input = readInput(options.input);
  const rows = Array.isArray(input.value) ? input.value : input.value.items || [input.value];
  const observations = rows.map((row) => envelope('index', {
    engine: row.engine || options.provider || 'unknown', url: row.url || row.inspectionUrl,
    indexed: row.indexed ?? row.verdict === 'PASS', selected_canonical: row.selected_canonical || row.googleCanonical || null,
    declared_canonical: row.declared_canonical || row.userCanonical || null, last_crawl: row.last_crawl || row.lastCrawlTime || null,
    fetch_state: row.fetch_state || row.pageFetchState || null, raw_provider_result: row,
  }, { method: 'owner_import', source: input.file, raw: JSON.stringify(row), confidence: 'confirmed' }));
  return observationRun(root, 'observe index', input.file, observations, { rawInputs: { index_export: input.raw } });
}

async function observeCitations(root, options) {
  const input = readInput(options.input);
  let rows = Array.isArray(input.value) ? input.value : input.value.observations || [input.value];
  let method = 'owner_import';
  if (options.endpoint) {
    const prompts = input.value.prompts || (Array.isArray(input.value) ? input.value : []);
    if (!prompts.length) throw new Error('citation runner input must contain a prompts array');
    if (!/^https:\/\//.test(options.endpoint) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(options.endpoint)) throw new Error('citation adapter endpoint must use HTTPS (loopback HTTP is allowed for testing)');
    const repeat = Number.isInteger(options.repeat) && options.repeat > 0 && options.repeat <= 20 ? options.repeat : 3;
    rows = [];
    for (const prompt of prompts) for (let runIndex = 1; runIndex <= repeat; runIndex++) {
      const response = await fetch(options.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}) }, body: JSON.stringify({ prompt_id: prompt.prompt_id, prompt_text: prompt.prompt_text, locale: prompt.locale || input.value.locale || 'en-US', run_index: runIndex, runs_in_series: repeat }) });
      const rawResponse = await response.text();
      if (!response.ok) throw new Error(`citation adapter returned ${response.status}: ${rawResponse.slice(0, 300)}`);
      const result = JSON.parse(rawResponse);
      rows.push({ ...result, prompt_id: prompt.prompt_id, prompt_text: prompt.prompt_text, locale: prompt.locale || input.value.locale || 'en-US', provider: result.provider || options.provider || 'custom-adapter', product_mode: result.product_mode || 'api-adapter', run_index: runIndex, runs_in_series: repeat });
    }
    method = 'live_api';
  }
  const targetOrigin = options.target ? originOf(options.target) : input.value.target_origin || null;
  const observations = [];
  for (const row of rows) {
    const reviews = canonicalReview(row, targetOrigin);
    observations.push(envelope('citation', {
      prompt_id: row.prompt_id, prompt_text: row.prompt_text, provider: row.provider || row.engine,
      product_mode: row.product_mode || row.interface || 'unknown', locale: row.locale || 'unknown',
      answer_text: row.answer_text || '', citations: reviews, run_index: row.run_index || 1,
      property_cited: reviews.some((r) => r.first_party),
    }, { method, source: options.endpoint || input.file, raw: JSON.stringify(row) }));
    for (const review of reviews) observations.push(envelope('citation_review', review, {
      method: review.reviewer ? 'human_review' : 'static_analysis', source: options.endpoint || input.file,
      state: review.support_status === 'review_required' ? 'review_required' : 'observed',
      confidence: review.reviewer ? 'confirmed' : 'low', raw: JSON.stringify(review),
      limitations: review.reviewer ? [] : ['Material support requires a named human reviewer.'],
    }));
  }
  return observationRun(root, 'observe citations', input.file, observations, { rawInputs: { citation_results: input.raw } });
}

function observeLogs(root, options) {
  const input = readInput(options.input);
  const rows = Array.isArray(input.value) ? input.value : input.value.requests || [];
  const ranges = input.value.provider_ranges || {};
  const verify = (row) => {
    const cidrs = ranges[row.user_agent] || [];
    if (!row.source_ip || !cidrs.length) return { verified: false, method: null };
    const family = net.isIP(row.source_ip);
    if (!family) return { verified: false, method: 'invalid source IP' };
    const block = new net.BlockList();
    for (const cidr of cidrs) {
      const [network, prefix] = cidr.split('/');
      const rangeFamily = net.isIP(network);
      if (rangeFamily === family && Number.isInteger(Number(prefix))) block.addSubnet(network, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
    }
    return { verified: block.check(row.source_ip, family === 4 ? 'ipv4' : 'ipv6'), method: `matched imported ${row.user_agent} CIDR set` };
  };
  const observations = rows.map((row) => {
    const identity = verify(row);
    return envelope('crawler_log', {
    timestamp: row.timestamp, url: row.url, user_agent: row.user_agent, source_ip: row.source_ip,
    status: row.status, bytes: row.bytes ?? null, latency_ms: row.latency_ms ?? null,
    cache_status: row.cache_status ?? null, region: row.region ?? null,
    identity_verified: identity.verified, verification_method: identity.method,
  }, { method: 'owner_import', source: input.file, raw: JSON.stringify(row), confidence: identity.verified ? 'high' : 'low', limitations: identity.verified ? ['CIDR ranges were imported with the log evidence; their provider currency must be established by source metadata.'] : ['User-agent strings alone do not verify crawler identity.'] });
  });
  return observationRun(root, 'observe logs', input.file, observations, { rawInputs: { server_logs: input.raw }, incomplete: observations.some((o) => !o.data.identity_verified) ? ['Some crawler identities are not IP-verified.'] : [] });
}

async function observePassages(root, options) {
  const ctx = await buildContext(root, options);
  if (!ctx.site) throw new Error('passages requires --target <dir|url>');
  const observations = [];
  for (const page of ctx.site.pages) {
    const rawWords = words(page.text).length;
    for (let i = 0; i < page.paragraphs.length; i++) {
      const passage = page.paragraphs.slice(i, i + 3).join(' ');
      const count = words(passage).length;
      if (count < 30) continue;
      const dependencies = [];
      if (/\b(this|that|these|those|it|they|above|below|here)\b/i.test(passage.slice(0, 100))) dependencies.push('possible external referent');
      observations.push(envelope('passage', { url: page.url, passage_index: i, text: passage, word_count: count, independently_extractable: count >= 100 && count <= 300 && dependencies.length === 0, dependencies, content_to_noise_ratio: page.rawHtml.length ? Number((page.text.length / page.rawHtml.length).toFixed(3)) : null }, { method: 'static_analysis', source: page.sourceFile || page.url, raw: passage, confidence: 'medium' }));
    }
    if (!page.paragraphs.length) observations.push(envelope('passage', { url: page.url, word_count: rawWords, independently_extractable: false, dependencies: ['no paragraph passages extracted'] }, { method: 'static_analysis', source: page.sourceFile || page.url, state: 'not_observed', confidence: 'confirmed' }));
  }
  return observationRun(root, 'observe passages', options.target, observations);
}

async function observeConsensus(root, options) {
  const ctx = await buildContext(root, options);
  if (!ctx.site) throw new Error('consensus requires --target <dir|url>');
  const sitemapRows = ctx.site.sitemaps.flatMap((s) => s.parsed?.urls || []);
  const sitemapUrls = new Set(sitemapRows.map((u) => u.loc));
  const observations = ctx.site.pages.map((page) => {
    const declared = page.canonicals[0] || null;
    const sitemapDate = sitemapRows.find((row) => row.loc === page.url)?.lastmod || null;
    const visibleDate = page.metas['article:modified_time']?.[0] || page.metas['date.modified']?.[0] || page.metas['last-modified']?.[0] || null;
    const signals = { final_url: page.url, html_canonical: declared, open_graph_url: page.ogUrl, sitemap_present: sitemapUrls.has(page.url), last_modified_header: page.headers['last-modified'] || null, sitemap_lastmod: sitemapDate, visible_or_meta_modified: visibleDate };
    const urls = [page.url, declared, page.ogUrl].filter(Boolean);
    const dates = [signals.last_modified_header, sitemapDate, visibleDate].filter(Boolean).map((value) => String(value).slice(0, 10));
    return envelope('canonical_freshness', { url: page.url, signals, canonical_consensus: new Set(urls).size <= 1, date_consensus: dates.length >= 2 ? new Set(dates).size === 1 : null, engine_selected_canonical: null }, { method: 'static_analysis', source: page.sourceFile || page.url, raw: JSON.stringify(signals), confidence: 'high', limitations: ['Engine-selected canonical and content-difference date require external observations.'] });
  });
  return observationRun(root, 'observe consensus', options.target, observations);
}

async function observePerformance(root, options) {
  if (options.input) {
    const input = readInput(options.input);
    const rows = Array.isArray(input.value) ? input.value : [input.value];
    const observations = rows.map((row) => {
      const provider = row.provider || (row.lighthouseVersion || row.categories ? 'Lighthouse' : row.record ? 'CrUX' : 'unknown');
      const evidenceType = /lighthouse/i.test(provider) ? 'lab' : /crux|chrome ux/i.test(provider) ? 'field' : 'imported_unknown';
      return envelope('performance', { ...row, provider, evidence_type: evidenceType }, { method: 'owner_import', source: input.file, raw: JSON.stringify(row), limitations: evidenceType === 'imported_unknown' ? ['Performance evidence was not identified as field or lab data.'] : [] });
    });
    return observationRun(root, 'observe performance', input.file, observations, { rawInputs: { performance_export: input.raw } });
  }
  if (!options.target) throw new Error('performance requires --target <URL> or --input <json>');
  const key = options.apiKey || process.env.CRUX_API_KEY;
  if (!key) {
    const item = envelope('performance', { url: options.target, provider: 'CrUX' }, { method: 'live_api', source: 'CrUX API', state: 'not_evidenced', confidence: 'unknown', limitations: ['CRUX_API_KEY is not configured.'] });
    return observationRun(root, 'observe performance', options.target, [item], { incomplete: ['CrUX collection unavailable: CRUX_API_KEY is not configured.'] });
  }
  const response = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: options.target }) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`CrUX API returned ${response.status}: ${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  return observationRun(root, 'observe performance', options.target, [envelope('performance', { ...data, provider: 'CrUX', evidence_type: 'field' }, { method: 'live_api', source: 'CrUX API', raw })], { rawInputs: { crux_response: raw } });
}

function observeCorroboration(root, options) {
  const input = readInput(options.input);
  const rows = Array.isArray(input.value) ? input.value : input.value.mentions || [];
  const observations = rows.map((row) => envelope('corroboration', row, { method: 'owner_import', source: input.file, raw: JSON.stringify(row), confidence: row.independent === true ? 'high' : 'low', limitations: row.independent === true ? [] : ['Source independence is not established.'] }));
  return observationRun(root, 'observe corroboration', input.file, observations, { rawInputs: { corroboration_export: input.raw } });
}

export async function observe(root, mode, options = {}) {
  switch (mode) {
    case 'render': return observeRender(root, options);
    case 'index': return observeIndex(root, options);
    case 'citations': return observeCitations(root, options);
    case 'logs': return observeLogs(root, options);
    case 'passages': return observePassages(root, options);
    case 'consensus': return observeConsensus(root, options);
    case 'performance': return observePerformance(root, options);
    case 'corroboration': return observeCorroboration(root, options);
    default: throw new Error('observe mode must be render, index, citations, logs, passages, consensus, performance, or corroboration');
  }
}
