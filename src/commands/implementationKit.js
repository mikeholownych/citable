import fs from 'node:fs';
import path from 'node:path';
import { readJson, nowIso } from '../shared/io.js';
import { remediateCommand } from './remediate.js';

const PKG_VERSION = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

function findRenderEvidence(runDir) {
  const shots = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (IMAGE_EXTS.has(path.extname(name).toLowerCase())) shots.push(path.relative(runDir, p));
    }
  };
  if (fs.existsSync(runDir)) walk(runDir);
  return shots;
}

function acceptanceTestsFor(finding, rem) {
  const lines = [
    '## Acceptance tests',
    '',
    '### 1. Deterministic detector re-check (authoritative)',
    '```',
    `citable verify remediation --run <source-run-id> --finding ${finding.detector_id} --target <file> --apply`,
    '```',
    'Pass criterion: status `verified` — the detector no longer reports this finding for the same subject. Detector absence is not an outcome guarantee.',
    '',
  ];
  if (rem?.scaffold_command) {
    lines.push(`### 2. Component integration`, '```', rem.scaffold_command, '```', 'After scaffolding, confirm the component renders without console errors in the consuming page.');
    lines.push('');
  }
  lines.push(
    '### 3. Manual review gates',
    '- Confirm the change preserves factual accuracy, human comprehension, accessibility, and conversion function.',
    '- Run the repository build/test suite. A failed build makes "validated" an unavailable conclusion.',
    '- Capture after-change rendering evidence (screenshot) for the customer record.'
  );
  return lines.join('\n');
}

function deploymentFor(rem) {
  const fw = rem?.framework?.framework || 'unknown';
  const lines = [
    '## Deployment instructions',
    '',
    `Detected framework: **${fw}**${rem?.framework ? ` (detection confidence ${rem.framework.confidence}; signals: ${rem.framework.signals.join(', ') || 'none'})` : ''}`,
    '',
    '1. Review `patch.diff`. Apply with `citable remediate --finding <id> --target <file> --write` or by hand from the diff.',
    '2. Run your project build and test commands. The Citable static check does not replace your compiler.',
    '3. Deploy through your normal pipeline; commit the rollback snapshot path noted in the verification record.',
    '4. Frozen-CMS alternative: regenerate the edge adapter with `citable export edge --format cloudflare-cro` (Cloudflare Workers) and verify with `citable test edge`. Edge changes ship without a code deploy but remain subject to the same detector verification.',
    '',
    'Rollback: restore the snapshot recorded in `.citable/remediation/snapshots/` (see verification record `rollback_snapshot`).',
  ];
  return lines.join('\n');
}

/**
 * `citable kit export` — customer-ready implementation kit connecting audit
 * findings to Nebula's fulfillment artifact: explanation, exact changes,
 * rendering evidence, acceptance tests, deployment steps, re-audit command,
 * and explicit limitations. Screenshots are included only when real rendering
 * evidence exists in the source run; Citable never fabricates imagery.
 */
export async function exportImplementationKit(root, options = {}) {
  const { run: runId, finding, subject = null, target = null, output = null } = options;
  const runDir = path.join(root, '.citable', 'runs', runId || '');
  if (!runId || !fs.existsSync(path.join(runDir, 'findings.json'))) {
    throw new Error(`source run not found: .citable/runs/${runId || '(none)'}`);
  }
  const findings = readJson(path.join(runDir, 'findings.json'));
  const matches = findings.filter((f) =>
    (f.detector_id || '').toUpperCase() === String(finding || '').toUpperCase()
    && (!subject || (f.subject?.identifier || f.subject?.url) === subject));
  if (matches.length === 0) {
    throw new Error(`finding ${finding} not present in run ${runId}`);
  }

  const f = matches[0];
  const patch = target
    ? await remediateCommand(root, { finding: f.detector_id, target, format: options.format || 'react' })
    : await remediateCommand(root, { finding: f.detector_id, format: options.format || 'react' });

  const slug = `${f.detector_id}-${String(subject || (f.subject?.identifier || f.subject?.url || 'subject'))
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`;
  const kitDir = output ? path.resolve(root, output) : path.join(root, '.citable', 'kits', `${nowIso().replace(/\D/g, '').slice(0, 14)}-${slug}`);
  fs.mkdirSync(path.join(kitDir, 'evidence'), { recursive: true });

  // finding explanation (verbatim from the immutable run)
  fs.writeFileSync(path.join(kitDir, 'finding.json'), JSON.stringify(matches, null, 2) + '\n');

  // exact change: unified diff when a target file is known, else component code
  if (target && patch.diff) {
    fs.writeFileSync(path.join(kitDir, 'patch.diff'), patch.diff);
    fs.writeFileSync(path.join(kitDir, 'patch-metadata.json'), JSON.stringify({
      target_file: target,
      framework: patch.framework,
      patcher_class: patch.patcher_class,
      confidence: patch.confidence?.score ?? null,
      validation: patch.validation,
      write_policy: patch.write_policy,
      refusal: patch.write_refused ? patch.refusal_reason : null,
    }, null, 2) + '\n');
  }
  if (patch.code) {
    fs.writeFileSync(path.join(kitDir, `component-${patch.format || 'react'}.${patch.format === 'vue' ? 'vue' : patch.format === 'html' ? 'html' : 'jsx'}`), patch.code + '\n');
  }

  // before/after screenshots: only real rendering evidence from the run
  const shots = findRenderEvidence(runDir);
  for (const rel of shots) {
    fs.copyFileSync(path.join(runDir, rel), path.join(kitDir, 'evidence', path.basename(rel)));
  }
  fs.writeFileSync(path.join(kitDir, 'evidence', 'MANIFEST.md'), shots.length
    ? `Rendering evidence files copied from run ${runId}:\n${shots.map((s) => `- ${s}`).join('\n')}\nThese are before-state observations unless a paired post-remediation run is referenced. Citable does not fabricate imagery.\n`
    : `No rendering evidence (screenshots) was present in run ${runId}. Collect after-state evidence with \`citable observe render --target <url>\` before and after the change. No placeholder imagery is provided because Citable does not fabricate evidence.\n`);

  fs.writeFileSync(path.join(kitDir, 'acceptance-tests.md'), acceptanceTestsFor(f, patch) + '\n');
  fs.writeFileSync(path.join(kitDir, 'deployment.md'), deploymentFor(patch) + '\n');

  const ns = f.detector_id.split('-')[0].toLowerCase();
  fs.writeFileSync(path.join(kitDir, 're-audit.sh'), `#!/bin/sh
# Re-audit the affected scope after deployment and compare against the source run.
set -eu
citable audit --scope ${ns} --target <deployed-target> --base-url <base-url>
citable verify remediation --run ${runId} --finding ${f.detector_id} --target <file> --apply
citable compare-snapshots ${runId} <new-run-id>
` + '\n');
  fs.chmodSync(path.join(kitDir, 're-audit.sh'), 0o755);

  const limitations = [
    ...(f.reasoning?.limitations || []),
    'This kit contains no modeled revenue or conversion-lift estimates; impact projections are excluded by policy.',
    'Detection was performed against a snapshot; the deployed property may differ by the time this kit is applied.',
    'A verified patch resolves the detector condition only; it is not a guarantee of conversion, ranking, or citation outcomes.',
  ];
  const assumptions = f.reasoning?.assumptions || [];
  fs.writeFileSync(path.join(kitDir, 'limitations.md'), [
    '## Limitations', '', ...limitations.map((l) => `- ${l}`), '',
    '## Assumptions', '',
    ...(assumptions.length ? assumptions.map((a) => `- ${a}`) : ['- No additional assumptions recorded by the detector.']),
  ].join('\n') + '\n');

  fs.writeFileSync(path.join(kitDir, 'README.md'), [
    `# Implementation Kit — ${f.detector_id}`,
    '',
    `**Finding:** ${f.observation?.summary}`,
    `**Subject:** ${f.subject?.identifier || f.subject?.url || 'unknown'}`,
    `**Severity:** ${f.classification?.severity} | **Confidence:** ${f.classification?.confidence}`,
    `**Source run:** ${runId} | **Kit generated:** ${nowIso()} by Citable ${PKG_VERSION}`,
    '',
    '## Contents',
    '',
    '- `finding.json` — verbatim finding record from the immutable source run',
    target && patch.diff ? '- `patch.diff` — unified diff of the exact proposed change (dry-run; nothing was written)' : '- (no patch.diff: no target file supplied; component template below)',
    patch.code ? '- `component-*.jsx|vue|html` — recommended Nebula Component template' : null,
    '- `patch-metadata.json` — framework detection, confidence, validation checks (when target supplied)',
    '- `evidence/` — rendering evidence from the source run (see evidence/MANIFEST.md)',
    '- `acceptance-tests.md` — detector re-check plus manual review gates',
    '- `deployment.md` — deployment and rollback instructions',
    '- `re-audit.sh` — re-audit and verification commands',
    '- `limitations.md` — limitations and assumptions (fact vs inference separation)',
    '',
    '## Order of operations',
    '',
    '1. Review finding and diff; assign an accountable owner.',
    '2. Apply the smallest change (patch or component).',
    '3. Run acceptance tests, then deployment.',
    '4. Run `re-audit.sh`; keep the verification bundle with the customer record.',
    '',
    'Citable does not guarantee crawling, indexing, ranking, citation, recommendation, or conversion.',
  ].filter(Boolean).join('\n') + '\n');

  const files = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else files.push(path.relative(kitDir, p));
    }
  };
  walk(kitDir);

  return {
    ok: true,
    finding_id: f.finding_id,
    detector_id: f.detector_id,
    source_run_id: runId,
    kit_dir: path.relative(root, kitDir),
    files: files.sort(),
    rendering_evidence_count: shots.length,
    has_patch_diff: Boolean(target && patch.diff),
  };
}
