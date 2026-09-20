import fs from 'node:fs';
import path from 'node:path';
import { contextDir, loadRegistryFile } from '../registries/index.js';
import { readJson, writeJson } from '../shared/io.js';
import { buildStrategicRoadmap, formatRoadmapMarkdown } from '../analysis/strategicRoadmap.js';
import { loadVerifiedRun } from '../shared/verifiedRunLoader.js';

/**
 * `citable roadmap [generate|show]` — generate or view the 30/90/180-day strategic roadmap.
 */
export async function roadmapCommand(root, { runId, target, write = true } = {}) {
  let findings = [];
  let initiatives = [];

  // 1. Load findings from specified or latest run
  const runsDir = path.join(root, '.citable', 'runs');
  let sourceRun = runId;
  if (!sourceRun && fs.existsSync(runsDir)) {
    const runs = fs.readdirSync(runsDir).filter((r) => fs.existsSync(path.join(runsDir, r, 'findings.json'))).sort();
    if (runs.length) sourceRun = runs.at(-1);
  }

  if (sourceRun) {
    findings = loadVerifiedRun(path.join(runsDir, sourceRun), { requireCompletedExecution: false, allowLegacy: true, requireCoverage: false }).findings;
  }

  // 2. Load initiatives if present
  const initFile = path.join(contextDir(root), 'initiatives.yaml');
  if (fs.existsSync(initFile)) {
    try {
      const data = loadRegistryFile(initFile, 'initiatives');
      initiatives = data.entries || [];
    } catch {
      // Ignore non-fatal registry load problems
    }
  }

  // Target domain resolution
  let domain = target || 'nebulacomponents.com';
  if (sourceRun) {
    const manifestFile = path.join(runsDir, sourceRun, 'manifest.json');
    if (fs.existsSync(manifestFile)) {
      try {
        const manifest = readJson(manifestFile);
        if (manifest.target?.location) domain = manifest.target.location;
      } catch {}
    }
  }

  const roadmap = buildStrategicRoadmap({ findings, initiatives, targetDomain: domain });
  const markdown = formatRoadmapMarkdown(roadmap);

  let artifactPath = null;
  if (write) {
    const outDir = path.join(root, '.citable', 'roadmap');
    fs.mkdirSync(outDir, { recursive: true });
    artifactPath = path.join(outDir, 'strategic-roadmap.md');
    fs.writeFileSync(artifactPath, markdown, 'utf8');
    writeJson(path.join(outDir, 'strategic-roadmap.json'), roadmap);
  }

  return {
    ...roadmap,
    markdown,
    artifact_path: artifactPath,
  };
}
