import path from 'node:path';

export const PROVIDERS = Object.freeze({
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    aliases: ['claude-code', 'claudecode'],
    projectDir: '.claude',
    projectSkillsDir: '.claude/skills',
    globalHints: ['.claude'],
    globalSkillsDir: '.claude/skills',
  },
  codex: {
    id: 'codex',
    displayName: 'OpenAI Codex',
    aliases: ['openai', 'openai-codex', 'agents'],
    projectDir: '.agents',
    projectSkillsDir: '.agents/skills',
    globalHints: ['.codex', '.agents'],
    globalSkillsDir: '.agents/skills',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    aliases: [],
    projectDir: '.cursor',
    projectSkillsDir: '.cursor/skills',
    globalHints: ['.cursor'],
    globalSkillsDir: '.cursor/skills',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini CLI',
    aliases: ['gemini-cli'],
    projectDir: '.gemini',
    projectSkillsDir: '.gemini/skills',
    globalHints: ['.gemini'],
    globalSkillsDir: '.gemini/skills',
  },
  github: {
    id: 'github',
    displayName: 'GitHub Copilot',
    aliases: ['copilot', 'github-copilot'],
    projectDir: '.github',
    projectSkillsDir: '.github/skills',
    globalHints: ['.github'],
    globalSkillsDir: '.github/skills',
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    aliases: ['open-code'],
    projectDir: '.opencode',
    projectSkillsDir: '.opencode/skills',
    globalHints: ['.opencode'],
    globalSkillsDir: '.opencode/skills',
  },
  kiro: {
    id: 'kiro',
    displayName: 'Kiro',
    aliases: [],
    projectDir: '.kiro',
    projectSkillsDir: '.kiro/skills',
    globalHints: ['.kiro'],
    globalSkillsDir: '.kiro/skills',
  },
  pi: {
    id: 'pi',
    displayName: 'Pi',
    aliases: ['pi-agent'],
    projectDir: '.pi',
    projectSkillsDir: '.pi/agent/skills',
    globalHints: ['.pi'],
    globalSkillsDir: '.pi/agent/skills',
  },
  qoder: {
    id: 'qoder',
    displayName: 'Qoder',
    aliases: [],
    projectDir: '.qoder',
    projectSkillsDir: '.qoder/skills',
    globalHints: ['.qoder'],
    globalSkillsDir: '.qoder/skills',
  },
  trae: {
    id: 'trae',
    displayName: 'Trae',
    aliases: [],
    projectDir: '.trae',
    projectSkillsDir: '.trae/skills',
    globalHints: ['.trae'],
    globalSkillsDir: '.trae/skills',
  },
  'trae-cn': {
    id: 'trae-cn',
    displayName: 'Trae CN',
    aliases: ['traecn'],
    projectDir: '.trae-cn',
    projectSkillsDir: '.trae-cn/skills',
    globalHints: ['.trae-cn'],
    globalSkillsDir: '.trae-cn/skills',
  },
  rovodev: {
    id: 'rovodev',
    displayName: 'Rovo Dev',
    aliases: ['rovo', 'rovo-dev'],
    projectDir: '.rovodev',
    projectSkillsDir: '.rovodev/skills',
    globalHints: ['.rovodev'],
    globalSkillsDir: '.rovodev/skills',
  },
});

export const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

const ALIASES = new Map();
for (const provider of Object.values(PROVIDERS)) {
  ALIASES.set(provider.id, provider.id);
  for (const alias of provider.aliases) ALIASES.set(alias, provider.id);
}

export function normalizeProviderId(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  return ALIASES.get(key) ?? null;
}

export function parseProviderList(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { kind: 'explicit', providers: [], unknown: [] };
  const lowered = raw.toLowerCase();
  if (lowered === 'detected') return { kind: 'detected', providers: [], unknown: [] };
  if (lowered === 'all') return { kind: 'all', providers: PROVIDER_IDS, unknown: [] };

  const providers = [];
  const unknown = [];
  for (const part of raw.split(',')) {
    const id = normalizeProviderId(part);
    if (!id) {
      unknown.push(part.trim());
      continue;
    }
    if (!providers.includes(id)) providers.push(id);
  }
  return { kind: 'explicit', providers, unknown };
}

export function providerSkillsDir(providerId, scope, roots) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`unknown provider: ${providerId}`);
  if (scope === 'project') return path.resolve(roots.projectRoot, provider.projectSkillsDir);
  if (scope === 'global') return path.resolve(roots.home, provider.globalSkillsDir);
  throw new Error(`unknown scope: ${scope}`);
}

export function providerDestination(providerId, scope, roots) {
  return path.join(providerSkillsDir(providerId, scope, roots), 'citable');
}

export function providerBundleSkillPath(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`unknown provider: ${providerId}`);
  return path.join('dist', 'universal', provider.projectSkillsDir, 'citable');
}
