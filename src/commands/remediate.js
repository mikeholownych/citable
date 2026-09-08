import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getComponent, listComponents } from '../components/index.js';

/**
 * Production-safe patch review for generated remediations.
 *
 * Premises enforced here (skill/SKILL.md):
 * - Fail closed: a patch that cannot be validated is never written.
 * - Fact != inference: heuristic patchers carry explicit confidence, and
 *   semantic (copy) replacements are refused for automated write.
 * - A written patch is not a verified repair until the detector re-run passes
 *   (see verifyRemediation in commands/verifyRemediation.js).
 */

export const MIN_WRITE_CONFIDENCE = 0.7;

const FINDING_TO_COMPONENT = {
  'CRO-007': { component: 'frictionless-form', rationale: 'Form inputs lack W3C autocomplete tokens; swap with NebulaFrictionlessForm or add autocomplete tokens.' },
  'CRO-008': { component: 'frictionless-form', rationale: 'Disappearing placeholder-only labels; swap with NebulaFrictionlessForm for persistent floating labels.' },
  'CRO-009': { component: 'frictionless-form', rationale: 'Mobile virtual keyboard type mismatch; use inputmode and type mappings.' },
  'CRO-010': { component: 'hero-cta', rationale: 'Hero section suffers from choice overload; replace with NebulaHeroCTA single-dominant hierarchy.' },
  'CRO-011': { component: 'sticky-dock', rationale: 'Primary CTA buried on long mobile page; attach NebulaStickyMobileDock at screen bottom.' },
  'CRO-012': { component: 'hero-cta', rationale: 'Generic low-intent microcopy; replace with action-oriented benefit copy.' },
  'CRO-015': { component: 'touch-target', rationale: 'Interactive touch target under 44px; wrap with NebulaTouchTarget (48x48px).' },
  'CRO-016': { component: 'hero-cta', rationale: 'CTA font size below 12px; use NebulaHeroCTA typography scale.' },
  'CRO-019': { component: 'scent-beacon', rationale: 'AI Search referral lacks claim corroboration; dock NebulaScentBeacon with cited claim.' },
  'COMP-001': { component: 'touch-target', rationale: 'Touch target dimension violation; wrap with NebulaTouchTarget.' },
  'COMP-003': { component: 'hero-cta', rationale: 'Generic button text; use descriptive outcome-oriented copy.' },
  'COMP-005': { component: 'frictionless-form', rationale: 'Missing input label or autocomplete attribute; swap with NebulaFrictionlessForm.' },
};

/** Patchers that only add mechanical attributes/classes (safe to automate). */
const MECHANICAL_PATCHERS = new Set(['CRO-007', 'COMP-005', 'CRO-015', 'COMP-001']);
/** Patchers that rewrite human-facing copy (semantic decision, never auto-written). */
const SEMANTIC_PATCHERS = new Set(['CRO-012', 'COMP-003']);

export function remediateFinding(findingId, { format = 'react' } = {}) {
  const normId = (findingId || '').toUpperCase().trim();
  const mapping = FINDING_TO_COMPONENT[normId];
  if (!mapping) {
    return {
      ok: false,
      error: `No direct component remediation registered for finding "${findingId}". Available findings: ${Object.keys(FINDING_TO_COMPONENT).join(', ')}`,
    };
  }
  const comp = getComponent(mapping.component, format);
  const scaffoldCmd = `npx nebulacomponents add ${mapping.component} --format ${format}`;
  return {
    ok: true,
    finding_id: normId,
    recommended_component: comp.name,
    component_id: comp.id,
    rationale: mapping.rationale,
    scaffold_command: scaffoldCmd,
    format,
    code: comp.code,
  };
}

/**
 * Detect the source framework from file extension and content signals.
 * Returns { framework, confidence, signals } where framework is one of
 * 'jsx' | 'vue' | 'svelte' | 'html' | 'unknown'. Never guesses silently:
 * an unknown framework fails closed downstream.
 */
export function detectFramework(filePath, source = '') {
  const ext = path.extname(filePath || '').toLowerCase();
  const signals = [];
  let framework = 'unknown';
  let confidence = 0;

  if (ext === '.vue') { framework = 'vue'; confidence = 0.6; signals.push(`extension:${ext}`); }
  else if (ext === '.svelte') { framework = 'svelte'; confidence = 0.6; signals.push(`extension:${ext}`); }
  else if (['.html', '.htm'].includes(ext)) { framework = 'html'; confidence = 0.6; signals.push(`extension:${ext}`); }
  else if (['.jsx', '.tsx', '.js', '.ts', '.mjs'].includes(ext)) {
    framework = 'jsx'; confidence = 0.4; signals.push(`extension:${ext}`);
  }

  if (/<template[\s>][\s\S]*<\/template>/i.test(source) && /<script[\s>]/i.test(source)) {
    framework = 'vue'; confidence = Math.min(0.95, confidence + 0.35); signals.push('content:vue-sfc');
  } else if (/^\s*<svelte:|<\/script>\s*\n\s*<style/i.test(source) && ext === '.svelte') {
    framework = 'svelte'; confidence = Math.min(0.95, confidence + 0.3); signals.push('content:svelte');
  } else if (/className\s*=|<\/[A-Za-z][^>]*>\s*[,);}]|React\.|from ["']react["']/.test(source)) {
    if (framework === 'jsx' || framework === 'html') {
      const next = /className\s*=/.test(source) ? 'jsx' : framework;
      framework = next;
      confidence = Math.min(0.95, confidence + 0.3);
      signals.push('content:jsx-className');
    }
  } else if (framework === 'jsx' && /<[a-z]+[^>]*>[\s\S]*<\/[a-z]+>/i.test(source) && !/className\s*=/.test(source)) {
    framework = 'html'; confidence = 0.5; signals.push('content:html-tags-no-jsx');
  }

  if (confidence < 0.4) { framework = 'unknown'; }
  return { framework, confidence: Number(confidence.toFixed(2)), signals };
}

/**
 * Apply one finding's patch and report what happened. Idempotent by design:
 * running the patcher on its own output is a fixed point (changed=false).
 * Returns { patched, changed, idempotent, matchCount, patcherClass }.
 */
export function applyPatchDetailed(sourceCode, findingId) {
  const normId = (findingId || '').toUpperCase().trim();
  const patched = applyAstPatch(sourceCode, normId);
  const changed = patched !== sourceCode;
  const secondPass = changed ? applyAstPatch(patched, normId) : patched;
  const idempotent = secondPass === patched;
  const matchCount = changed ? countPatchMatches(sourceCode, normId) : 0;
  const patcherClass = MECHANICAL_PATCHERS.has(normId) ? 'mechanical-attribute'
    : SEMANTIC_PATCHERS.has(normId) ? 'semantic-copy'
    : 'structural';
  return { patched, changed, idempotent, matchCount, patcherClass };
}

function countPatchMatches(source, findingId) {
  const normId = (findingId || '').toUpperCase().trim();
  if (normId === 'CRO-007' || normId === 'COMP-005') {
    let count = 0;
    for (const tag of source.match(/<input[^>]*>/gi) || []) {
      if (!/autocomplete\s*=/i.test(tag)) count++;
    }
    return count;
  }
  if (normId === 'CRO-015' || normId === 'COMP-001') {
    return (source.match(/<button[^>]*className=["'](?![^"']*min-h-)[^"']*["'][^>]*>/gi) || []).length;
  }
  if (normId === 'CRO-012' || normId === 'COMP-003') {
    return (source.match(/>\s*(Submit|Click Here|Learn More|Read More)\s*</gi) || []).length;
  }
  return 0;
}

/** Back-compat string API. Prefer applyPatchDetailed for safety metadata. */
export function applyAstPatch(sourceCode, findingId) {
  const normId = (findingId || '').toUpperCase().trim();
  let patched = sourceCode;

  if (normId === 'CRO-007' || normId === 'COMP-005') {
    patched = patched.replace(/<input([^>]*?)(\/>|>)/gi, (match, attrs, close) => {
      if (/autocomplete\s*=/i.test(match)) return match;
      let type = 'text';
      const typeMatch = match.match(/type=["']([^"']+)["']/i);
      if (typeMatch) type = typeMatch[1].toLowerCase();
      let auto = 'on';
      if (type === 'email') auto = 'email';
      else if (type === 'tel') auto = 'tel';
      else if (/name/i.test(match)) auto = 'name';
      const attrsClean = attrs.replace(/\s+$/, '');
      const normClose = close === '/>' ? ' />' : '>';
      return `<input${attrsClean} autoComplete="${auto}"${normClose}`;
    });
  } else if (normId === 'CRO-015' || normId === 'COMP-001') {
    patched = patched.replace(/<button([^>]*?)className=["']([^"']*)["']([^>]*)>/gi, (match, pre, cls, post) => {
      if (!cls.includes('min-h-') && !cls.includes('h-')) {
        return `<button${pre}className="${cls} min-h-[48px] min-w-[48px]"${post}>`;
      }
      return match;
    });
  } else if (normId === 'CRO-012' || normId === 'COMP-003') {
    patched = patched.replace(/>\s*(Submit|Click Here|Learn More|Read More)\s*</gi, '>Get Started Free<');
  }

  return patched;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const TAG_RX = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;

function tagBalanceReport(src) {
  const stack = [];
  let error = null;
  let previous;
  let cleaned = src;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  } while (cleaned !== previous);
  let m;
  TAG_RX.lastIndex = 0;
  while ((m = TAG_RX.exec(cleaned)) !== null) {
    const closing = Boolean(m[1]);
    const tagName = m[2];
    const selfClose = Boolean(m[4]);
    const lower = tagName.toLowerCase();
    if (closing) {
      if (stack[stack.length - 1] === lower) stack.pop();
      else {
        error = stack.includes(lower)
          ? `closing </${tagName}> crosses unclosed <${stack[stack.length - 1]}>`
          : `closing </${tagName}> has no matching open tag`;
        break;
      }
    } else if (!selfClose && !VOID_TAGS.has(lower)) {
      stack.push(lower);
    }
  }
  if (!error && stack.length > 0) error = `unclosed tag(s): ${stack.join(', ')}`;
  return { error };
}

function balanceCounts(src, open, close) {
  return {
    open: (src.match(new RegExp(`\\${open}`, 'g')) || []).length,
    close: (src.match(new RegExp(`\\${close}`, 'g')) || []).length,
  };
}

/**
 * Heuristic static syntax review of a patch. The safety property validated
 * here is precise: the patch must not disturb the source's structural
 * balance (tags, braces, parens, brackets). Pre-existing quirks in the
 * original are reported, not punished — Citable never rewrites code it did
 * not touch. Unknown frameworks fail closed because no check can run.
 * This is NOT a compiler: a passing result never replaces the project's own
 * build; a failed result blocks any write.
 */
export function validatePatchedSource(patched, framework, original = null) {
  const checks = [];
  const push = (check_id, passed, detail) => checks.push({ check_id, passed, detail });

  if (framework === 'unknown') {
    push('framework-known', false, 'framework could not be detected; no syntax check can run, refusing to write (fail closed)');
    return { ok: false, checks, reason: 'unknown framework; refusing to write' };
  }
  push('framework-known', true, `framework: ${framework}`);

  if (!patched || !patched.trim()) {
    push('non-empty-output', false, 'patched output is empty');
    return { ok: false, checks, reason: 'empty patched output' };
  }
  push('non-empty-output', true, `${patched.length} chars`);

  for (const [name, open, close] of [['brace', '{', '}'], ['paren', '(', ')'], ['bracket', '[', ']']]) {
    const after = balanceCounts(patched, open, close);
    const before = original !== null ? balanceCounts(original, open, close) : after;
    const disturbed = original !== null && (before.open !== after.open || before.close !== after.close);
    push(`balanced-${name}s`, !disturbed,
      original !== null
        ? disturbed ? `patch changed ${name} balance (${before.open}/${before.close} → ${after.open}/${after.close})` : `balance unchanged (${after.open}/${after.close})`
        : `open: ${after.open}, close: ${after.close}`);
  }

  const patchedTags = tagBalanceReport(patched);
  if (original !== null) {
    const originalTags = tagBalanceReport(original);
    if (patchedTags.error && !originalTags.error) {
      push('tag-structure-preserved', false, `patch introduced tag structure error: ${patchedTags.error}`);
    } else if (patchedTags.error && patchedTags.error === originalTags.error) {
      push('tag-structure-preserved', true, `pre-existing tag structure quirk unchanged by patch: ${patchedTags.error}`);
    } else if (patchedTags.error) {
      push('tag-structure-preserved', false, `patch altered tag structure: ${patchedTags.error} (original: ${originalTags.error || 'balanced'})`);
    } else {
      push('tag-structure-preserved', true, originalTags.error ? `structure balanced; original quirk resolved: ${originalTags.error}` : 'tag structure preserved');
    }
  } else {
    push('balanced-tags', !patchedTags.error, patchedTags.error || 'all tags balanced');
  }

  const ok = checks.every((c) => c.passed);
  return {
    ok,
    checks,
    reason: ok ? null : (checks.find((c) => !c.passed)?.detail || 'validation failed'),
    methodology: 'heuristic static review (structural balance of the patch only); does not replace the project compiler — run the repository build before shipping',
  };
}

/** Unified diff (LCS line diff, 3 lines of context). */
export function unifiedDiff(original, patched, filename = 'target') {
  const a = original.split('\n');
  const b = patched.split('\n');
  const n = a.length, m2 = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m2 + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m2 - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m2) {
    if (a[i] === b[j]) { ops.push(['ctx', a[i]]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push(['del', a[i]]); i++; }
    else { ops.push(['add', b[j]]); j++; }
  }
  while (i < n) { ops.push(['del', a[i]]); i++; }
  while (j < m2) { ops.push(['add', b[j]]); j++; }
  if (!ops.some(([t]) => t !== 'ctx')) return null;

  const lines = [`--- a/${filename}`, `+++ b/${filename}`];
  const CONTEXT = 3;
  let idx = 0;
  while (idx < ops.length) {
    if (ops[idx][0] === 'ctx') { idx++; continue; }
    let start = idx;
    let end = idx;
    while (end + 1 < ops.length) {
      let k = end + 1;
      while (k < ops.length && ops[k][0] === 'ctx') k++;
      if (k < ops.length && k - (end + 1) <= CONTEXT * 2) { end = k; } else { break; }
    }
    const hunkStart = Math.max(0, start - CONTEXT);
    const hunkEnd = Math.min(ops.length, end + 1 + CONTEXT);
    let aStart = 1, bStart = 1;
    for (let k = 0; k < hunkStart; k++) {
      if (ops[k][0] !== 'add') aStart++;
      if (ops[k][0] !== 'del') bStart++;
    }
    let aCount = 0, bCount = 0;
    const body = [];
    for (let k = hunkStart; k < hunkEnd; k++) {
      const [t, line] = ops[k];
      if (t === 'ctx') { body.push(' ' + line); aCount++; bCount++; }
      else if (t === 'del') { body.push('-' + line); aCount++; }
      else { body.push('+' + line); bCount++; }
    }
    lines.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`, ...body);
    idx = hunkEnd + 1;
  }
  return lines.join('\n') + '\n';
}

/**
 * Explicit, fact-based confidence score for an automated write. Every factor
 * is recorded; nothing is hidden behind a single number.
 */
export function computeConfidence({ frameworkInfo, patch, validation }) {
  const factors = [];
  const add = (factor, weight, detail) => factors.push({ factor, weight, detail });

  const frameworkKnown = frameworkInfo.framework !== 'unknown';
  add('framework-identified', frameworkKnown ? 0.35 : 0, `${frameworkInfo.framework} (${frameworkInfo.signals.join(', ') || 'no signals'})`);
  add('patcher-matched-target', patch.matchCount > 0 ? 0.3 : 0, `${patch.matchCount} match(es)`);
  add('static-validation-passed', validation.ok ? 0.25 : 0, validation.ok ? 'all balance checks passed' : validation.reason);
  add('idempotency-verified', patch.idempotent ? 0.1 : 0, patch.idempotent ? 'second application is a no-op' : 'repeated application would mutate output again');

  let score = factors.reduce((s, f) => s + f.weight, 0);
  let cap = null;
  let capReason = null;
  if (patch.patcherClass === 'semantic-copy') {
    cap = 0.6;
    capReason = 'semantic microcopy replacement requires a human editorial decision and is refused for automated write (fact != inference)';
  }
  if (cap !== null && score > cap) score = cap;
  return { score: Number(score.toFixed(2)), factors, cap, cap_reason: capReason };
}

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function createRollbackSnapshot(root, targetPath, originalContent, meta) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapDir = path.join(root, '.citable', 'remediation', 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const base = path.basename(targetPath);
  const snapFile = path.join(snapDir, `${stamp}-${base}`);
  fs.writeFileSync(snapFile, originalContent, 'utf8');
  const manifest = {
    created_at: new Date().toISOString(),
    target: path.relative(root, targetPath),
    snapshot_file: path.relative(root, snapFile),
    original_sha256: sha256(originalContent),
    ...meta,
  };
  const manifestFile = `${snapFile}.manifest.json`;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { snapshot_file: path.relative(root, snapFile), manifest_file: path.relative(root, manifestFile), restore_hint: `cp "${path.relative(root, snapFile)}" "${path.relative(root, targetPath)}"` };
}

/**
 * Remediation command. Dry run by default: returns framework detection,
 * unified diff, static validation, and confidence without touching disk.
 * `write: true` is gated on validation success and confidence threshold and
 * always creates a rollback snapshot first. Low confidence or failed
 * validation refuses the write (fail closed).
 */
export async function remediateCommand(root, options = {}) {
  const { finding, component, target, format = 'react', write = false } = options;

  if (finding) {
    const res = remediateFinding(finding, { format });
    if (!res.ok) throw new Error(res.error);

    if (target) {
      const fullPath = path.resolve(root, target);
      if (!fs.existsSync(fullPath)) {
        return { ...res, target, error: `target file not found: ${target}`, written: false, write_refused: true, refusal_reason: 'target file not found' };
      }
      const original = fs.readFileSync(fullPath, 'utf8');
      const patch = applyPatchDetailed(original, finding);
      const frameworkInfo = detectFramework(fullPath, original);
      const validation = validatePatchedSource(patch.patched, frameworkInfo.framework, original);
      const confidence = computeConfidence({ frameworkInfo, patch, validation });
      const diff = patch.changed ? unifiedDiff(original, patch.patched, target) : null;

      const refusal = { write_refused: true, refusal_reason: null };
      if (!patch.changed) refusal.refusal_reason = 'no patch match; file appears already remediated or finding does not apply to this file';
      else if (!patch.idempotent) refusal.refusal_reason = 'patcher is not idempotent on this source; refusing automated write';
      else if (!validation.ok) refusal.refusal_reason = `static validation failed: ${validation.reason}`;
      else if (confidence.score < MIN_WRITE_CONFIDENCE) {
        refusal.refusal_reason = `confidence ${confidence.score} below write threshold ${MIN_WRITE_CONFIDENCE}`
          + (confidence.cap_reason ? ` (${confidence.cap_reason})` : '');
      } else {
        refusal.write_refused = false;
      }

      const result = {
        ...res,
        target,
        written: false,
        changed: patch.changed,
        patcher_class: patch.patcherClass,
        idempotent: patch.idempotent,
        match_count: patch.matchCount,
        framework: frameworkInfo,
        validation,
        confidence,
        diff,
        write_policy: {
          min_confidence: MIN_WRITE_CONFIDENCE,
          note: 'a written patch is a candidate change, not a verified repair; run citable verify remediation <run-id> to re-run the detector',
        },
        ...refusal,
      };

      if (write && !refusal.write_refused) {
        const snapshot = createRollbackSnapshot(root, fullPath, original, {
          finding_id: res.finding_id,
          patched_sha256: sha256(patch.patched),
          confidence: confidence.score,
        });
        fs.writeFileSync(fullPath, patch.patched, 'utf8');
        return { ...result, written: true, rollback: snapshot };
      }
      return result;
    }
    return res;
  }

  if (component) {
    const comp = getComponent(component, format);
    if (!comp) throw new Error(`Unknown component "${component}". Available: ${listComponents().map((c) => c.id).join(', ')}`);
    return {
      ok: true,
      component: comp.name,
      scaffold_command: `npx nebulacomponents add ${component} --format ${format}`,
      code: comp.code,
    };
  }

  return {
    ok: true,
    available_components: listComponents(),
    supported_findings: Object.keys(FINDING_TO_COMPONENT),
  };
}
