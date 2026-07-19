import fs from 'node:fs';
import path from 'node:path';
import { writeYaml, readJson, nowIso, listFiles } from '../shared/io.js';
import { REGISTRY_SPECS, emptyRegistry, contextDir } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const DEFAULT_CRAWLERS = [
  ['CRAWLER-GOOGLEBOT', 'Googlebot', 'Google', 'search_indexing'],
  ['CRAWLER-BINGBOT', 'Bingbot', 'Microsoft', 'search_indexing'],
  ['CRAWLER-OAI-SEARCHBOT', 'OAI-SearchBot', 'OpenAI', 'ai_search_discovery'],
  ['CRAWLER-GPTBOT', 'GPTBot', 'OpenAI', 'model_training'],
  ['CRAWLER-CHATGPT-USER', 'ChatGPT-User', 'OpenAI', 'user_initiated_retrieval'],
  ['CRAWLER-PERPLEXITYBOT', 'PerplexityBot', 'Perplexity', 'ai_search_discovery'],
  ['CRAWLER-PERPLEXITY-USER', 'Perplexity-User', 'Perplexity', 'user_initiated_retrieval'],
  ['CRAWLER-CLAUDEBOT', 'ClaudeBot', 'Anthropic', 'model_training'],
];

function hasSchemaSignal(text) {
  if (/application\/ld\+json/i.test(text)) return true;
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    try {
      const hostname = new URL(match[0]).hostname.toLowerCase();
      if (hostname === 'schema.org' || hostname === 'www.schema.org') return true;
    } catch {
      // Ignore malformed URL-like source text during best-effort project discovery.
    }
  }
  return false;
}

function detectFramework(root) {
  const detected = {
    framework: null, rendering_model: null, package_manager: null,
    build_commands: [], test_commands: [], robots_files: [], sitemap_sources: [],
    schema_sources: [], metadata_systems: [], analytics: [], content_collections: [],
  };
  const unresolved = [];
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const pkg = readJson(pkgFile);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) { detected.framework = 'next.js'; detected.rendering_model = 'hybrid'; }
    else if (deps.astro) { detected.framework = 'astro'; detected.rendering_model = 'static'; }
    else if (deps.nuxt) { detected.framework = 'nuxt'; detected.rendering_model = 'hybrid'; }
    else if (deps['@sveltejs/kit']) { detected.framework = 'sveltekit'; detected.rendering_model = 'hybrid'; }
    else if (deps.gatsby) { detected.framework = 'gatsby'; detected.rendering_model = 'static'; }
    else if (deps.react || deps.vue) { detected.framework = 'spa'; detected.rendering_model = 'csr'; }
    if (pkg.scripts?.build) detected.build_commands.push(`npm run build`);
    if (pkg.scripts?.test) detected.test_commands.push(`npm test`);
    detected.package_manager = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm'
      : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn'
      : fs.existsSync(path.join(root, 'bun.lockb')) ? 'bun' : 'npm';
  } else if (fs.existsSync(path.join(root, 'pyproject.toml'))) {
    detected.framework = 'python';
    unresolved.push('Python project detected; rendering model and build pipeline need manual confirmation.');
  } else {
    unresolved.push('No package manifest found; framework, build, and test commands unknown.');
  }
  for (const f of listFiles(root, (p) => /robots\.txt$/.test(p))) detected.robots_files.push(path.relative(root, f));
  for (const f of listFiles(root, (p) => /sitemap.*\.(xml|ts|js|mjs)$/.test(p))) detected.sitemap_sources.push(path.relative(root, f));
  for (const f of listFiles(root, (p) => /\.(html|jsx?|tsx?|astro|vue|svelte)$/.test(p)).slice(0, 400)) {
    const text = fs.readFileSync(f, 'utf8');
    if (hasSchemaSignal(text)) detected.schema_sources.push(path.relative(root, f));
    if (/gtag\(|googletagmanager|plausible|posthog|umami|matomo/i.test(text)) detected.analytics.push(path.relative(root, f));
  }
  if (detected.rendering_model === null) unresolved.push('Rendering model could not be determined from manifests.');
  return { detected, unresolved };
}

/** `citable init` — inspect the repo and create .citable/ without overwriting anything user-maintained. */
export function init(root, { force = false } = {}) {
  const dir = contextDir(root);
  const created = [];
  const skipped = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of ['policies', 'findings', 'snapshots', 'reports', 'runs']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const { detected, unresolved } = detectFramework(root);

  const configFile = path.join(dir, 'config.yaml');
  if (!fs.existsSync(configFile) || force) {
    const config = {
      version: 1,
      site: { base_url: null, built_output_dir: null, source_dirs: [], default_locale: 'en', default_jurisdiction: null },
      framework: {
        name: detected.framework, rendering_model: detected.rendering_model,
        package_manager: detected.package_manager,
        build_command: detected.build_commands[0] ?? null, test_command: detected.test_commands[0] ?? null,
      },
      audit: { index_target_default: true, max_crawl_depth: 4, thin_content_words: 120, fetch_external: false },
    };
    const { valid, errors } = validateAgainst('config.schema.json', config);
    if (!valid) throw new Error(`generated config invalid: ${errors.join('; ')}`);
    writeYaml(configFile, config);
    created.push('config.yaml');
  } else skipped.push('config.yaml (exists)');

  const projectFile = path.join(dir, 'project.yaml');
  if (!fs.existsSync(projectFile) || force) {
    const project = { version: 1, initialized_at: nowIso(), repository_root: root, detected, unresolved_assumptions: unresolved };
    const { valid, errors } = validateAgainst('project.schema.json', project);
    if (!valid) throw new Error(`generated project profile invalid: ${errors.join('; ')}`);
    writeYaml(projectFile, project);
    created.push('project.yaml');
  } else skipped.push('project.yaml (exists)');

  for (const spec of REGISTRY_SPECS) {
    const file = path.join(dir, spec.file);
    if (fs.existsSync(file)) { skipped.push(`${spec.file} (exists)`); continue; }
    const reg = emptyRegistry(spec.kind);
    if (spec.kind === 'crawlers') {
      reg.entries = DEFAULT_CRAWLERS.map(([id, ua, vendor, purpose]) => ({
        crawler_id: id, user_agent: ua, vendor, purpose,
        decision: 'undecided', status: 'active',
      }));
    }
    const { valid, errors } = validateAgainst(spec.schema, reg);
    if (!valid) throw new Error(`generated ${spec.file} invalid: ${errors.join('; ')}`);
    writeYaml(file, reg);
    created.push(spec.file);
  }
  return { created, skipped, detected, unresolved };
}
