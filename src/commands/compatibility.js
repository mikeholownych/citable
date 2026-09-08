import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readJson, nowIso } from '../shared/io.js';
import { buildContext } from './context.js';
import { runDetectors } from '../detectors/framework.js';
import { selectDetectors, ALL_DETECTORS } from '../detectors/index.js';

const PKG = readJson(new URL('../../package.json', import.meta.url));
const SCHEMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

function checkModule(name) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import('${name}')`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    return { present: true, importable: true };
  } catch (err) {
    const notFound = /Cannot find (package|module)/.test(String(err.stderr || err.message));
    return { present: !notFound, importable: false, note: notFound ? 'not installed (optional peer dependency)' : 'installed but failed to import — adapter mismatch' };
  }
}

function engineSatisfied(range, actual) {
  const m = range.match(/>=\s*(\d+)/);
  if (!m) return { satisfied: true, note: `unrecognized range "${range}"` };
  const major = Number.parseInt(actual.split('.')[0], 10);
  return { satisfied: major >= Number(m[1]), note: `requires Node >= ${m[1]}, found ${actual}` };
}

/**
 * `citable compatibility` — pre-flight diagnosis of environment, optional
 * adapters, project framework, registry freshness, and generated-code
 * constraints. Every check states its evidence; absence of an optional
 * adapter is reported, never assumed.
 */
export async function compatibilityCommand(root, options = {}) {
  const checks = [];

  const engine = engineSatisfied(PKG.engines?.node || '>=0', process.versions.node);
  checks.push({
    check_id: 'NODE-ENGINE',
    passed: engine.satisfied,
    severity: engine.satisfied ? 'pass' : 'blocker',
    detail: engine.note,
  });

  const peers = ['playwright', 'lighthouse', 'chrome-launcher', 'tesseract.js'];
  const adapterResults = {};
  for (const name of peers) {
    const declared = Boolean(PKG.peerDependencies?.[name]);
    const res = checkModule(name);
    adapterResults[name] = { declared_optional_peer: declared, ...res };
    checks.push({
      check_id: `ADAPTER-${name.toUpperCase().replace('.', '-')}`,
      passed: true, // absence of an optional adapter is a report, not a failure
      severity: res.importable ? 'pass' : 'advisory',
      detail: res.importable ? `${name} importable` : `${name}: ${res.note}`,
    });
  }

  // Browser dependency: presence of a Chrome executable is only verified when
  // chrome-launcher is importable; otherwise reported as unknown (fail open in
  // reporting, fail closed in any feature that needs it).
  if (adapterResults['chrome-launcher']?.importable) {
    let browser = 'unknown';
    try {
      const mod = await import('chrome-launcher');
      browser = mod.getChromePath?.() ? 'found' : 'not found';
    } catch { browser = 'lookup failed'; }
    checks.push({
      check_id: 'BROWSER-CHROME',
      passed: browser === 'found',
      severity: browser === 'found' ? 'pass' : 'advisory',
      detail: `Chrome executable: ${browser} (required for observe render / preview evidence; presence does not prove a successful launch)`,
    });
  }

  // Project framework detection (for remediation format matching)
  let frameworks = [];
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    try {
      const deps = { ...readJson(pkgFile).dependencies, ...readJson(pkgFile).devDependencies };
      if (deps.next) frameworks.push('next');
      if (deps.react) frameworks.push('react');
      if (deps.vue || deps.nuxt) frameworks.push('vue');
      if (deps.svelte || deps['@sveltejs/kit']) frameworks.push('svelte');
    } catch { /* unreadable package.json reported below */ }
  }
  checks.push({
    check_id: 'PROJECT-FRAMEWORK',
    passed: true,
    severity: 'pass',
    detail: frameworks.length ? `detected: ${frameworks.join(', ')}; remediation templates available: react, vue, html` : 'no framework dependencies detected; component templates remain available as standalone HTML',
  });

  // Registry freshness
  const citableDir = path.join(root, '.citable');
  if (!fs.existsSync(citableDir)) {
    checks.push({ check_id: 'REGISTRIES-PRESENT', passed: false, severity: 'advisory', detail: '.citable/ not found — run citable init' });
  } else {
    const yamlFiles = fs.readdirSync(citableDir).filter((f) => f.endsWith('.yaml'));
    checks.push({ check_id: 'REGISTRIES-PRESENT', passed: true, severity: 'pass', detail: `${yamlFiles.length} registry/config YAML file(s) found; run citable validate registries for full referential validation` });
    const registrySchemas = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'));
    checks.push({
      check_id: 'SCHEMA-CONTRACTS',
      passed: true,
      severity: 'pass',
      detail: `${registrySchemas.length} schema contracts shipped by citable ${PKG.version}; registries validated against them by citable validate registries`,
    });
  }

  // Generated-code constraints (advisory, documented limits)
  const edgeDir = path.join(root, '.citable', 'edge');
  if (fs.existsSync(edgeDir)) {
    for (const f of fs.readdirSync(edgeDir)) {
      const size = fs.statSync(path.join(edgeDir, f)).size;
      const limit = 1024 * 1024;
      checks.push({
        check_id: `EDGE-SIZE-${f}`,
        passed: size <= limit,
        severity: size <= limit ? 'pass' : 'blocker',
        detail: `${f}: ${(size / 1024).toFixed(1)} KiB — Cloudflare Workers free plan limits the worker to ~1 MiB before compression (verify against your plan; this is a documented platform limit, not a measurement)`,
      });
    }
  }

  const blockers = checks.filter((c) => c.severity === 'blocker' && !c.passed);
  return {
    ok: blockers.length === 0,
    timestamp: nowIso(),
    tool_version: PKG.version,
    node: process.versions.node,
    engines: PKG.engines?.node || null,
    framework: frameworks,
    adapters: adapterResults,
    checks,
    blocker_count: blockers.length,
    note: 'compatibility reports current environment facts; it cannot prove that a browser launch, API authorization, or collection will succeed',
  };
}

/**
 * `citable verify page <page>` — run the full deterministic detector set
 * scoped to one page subject and return a posture verdict.
 * pass = no detector currently reports this page; never an outcome guarantee.
 */
export async function verifyPage(root, pageRef, { target, baseUrl, refDate, viewport = null } = {}) {
  const ctx = await buildContext(root, { target, baseUrl, refDate, viewport });
  if (!ctx.site) throw new Error('verify page requires a site target (built output directory or URL)');
  const norm = (s) => String(s || '').replace(/\/+$/, '');
  const candidates = [pageRef, pageRef.replace(/\/index\.html?$/i, '/'), pageRef.replace(/^\/+/, '')];
  const wanted = pageRef.startsWith('/') ? `${norm(ctx.site.baseUrl)}${pageRef}` : pageRef;
  const page = ctx.site.pages.find((p) => {
    if (norm(p.url) === norm(wanted) || p.sourceFile === pageRef) return true;
    if (candidates.some((c) => norm(p.url) === norm(pageRef.startsWith('/') ? `${norm(ctx.site.baseUrl)}${c}` : c))) return true;
    if (norm(p.url).endsWith(norm(wanted))) return true;
    return false;
  });
  if (!page) {
    throw new Error(`page not found in audited output: ${pageRef}`);
  }

  const { findings, detectorsRun, detectorsSkipped, errors } = runDetectors(
    selectDetectors({ namespaces: ALL_DETECTORS.map((d) => d.namespace).filter((v, i, a) => a.indexOf(v) === i) }),
    { ...ctx, site: { ...ctx.site, pages: [page] } }
  );
  const pageFindings = findings.filter((f) => (f.subject?.url === page.url) || (f.subject?.identifier === page.url) || (f.subject?.source_file && f.subject.source_file === page.sourceFile));

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of pageFindings) {
    const s = f.classification?.severity;
    if (s in bySeverity) bySeverity[s]++;
  }
  const status = errors.length ? 'blocked' : (bySeverity.critical > 0 || bySeverity.high > 0) ? 'attention' : pageFindings.length ? 'attention' : 'pass';

  return {
    page: page.url,
    source_file: page.sourceFile,
    status,
    finding_count: pageFindings.length,
    by_severity: bySeverity,
    findings: pageFindings.map((f) => ({
      detector_id: f.detector_id,
      severity: f.classification.severity,
      confidence: f.classification.confidence,
      summary: f.observation.summary,
      provenance: f.provenance,
    })),
    provenance: {
      command: 'verify page',
      timestamp: nowIso(),
      tool_version: PKG.version,
      viewport: ctx.viewport ?? null,
      detectors_run: detectorsRun,
      detectors_skipped: detectorsSkipped,
      errors,
      definition: 'pass means no detector currently reports this page; it is not a guarantee of crawling, indexing, ranking, citation, or conversion',
    },
  };
}
