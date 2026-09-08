import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nowIso } from '../shared/io.js';

const PKG_VERSION = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

export const VIEWPORT_CLASSES = [
  { id: 'mobile', width: 375, height: 667 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1280, height: 800 },
];

export const VARIANT_CLASSES = [
  { id: 'default' },
  { id: 'keyboard-focus', note: 'tab to first interactive element; visible focus indicator required' },
  { id: 'reduced-motion', note: 'emulate prefers-reduced-motion: reduce; no animation may run' },
  { id: 'text-zoom-200', note: 'browser text zoom 200%; layout must wrap, not clip' },
  { id: 'long-translation', note: 'substitute longest German strings; layout must wrap, not overflow' },
  { id: 'narrow-mobile', viewport: 'mobile', width: 320, note: '320px width; split view must collapse to one column' },
  { id: 'dark', note: 'emulate prefers-color-scheme: dark' },
  { id: 'light', note: 'emulate prefers-color-scheme: light' },
];

/**
 * Deterministic layout-contract checks over the preview HTML (or any exported
 * preview artifact). These always run — no browser required — and lock in the
 * properties the screenshot matrix would otherwise only observe.
 */
export function visualContractChecks(html) {
  const checks = [];
  const push = (check_id, passed, detail) => checks.push({ check_id, passed, detail });

  push('viewport-meta', /<meta[^>]*name="viewport"[^>]*>/i.test(html), 'mobile viewport meta present');
  push(
    'three-viewport-classes',
    /375px/.test(html) && /768px/.test(html) && /Desktop/i.test(html),
    'Mobile (375px), Tablet (768px), and Desktop toggles declared'
  );
  push('keyboard-focus-visible', /:focus-visible/i.test(html), 'visible :focus-visible outline defined for interactive elements');
  push('reduced-motion', /prefers-reduced-motion\s*:\s*reduce/i.test(html), 'prefers-reduced-motion: reduce disables transitions and animations');
  push('narrow-mobile-collapse', /max-width:\s*480px[^}]*\{[^}]*grid-template-columns:\s*1fr/i.test(html) || /max-width:\s*480px[\s\S]{0,200}1fr/.test(html), 'split view collapses to one column at narrow mobile widths');
  push('text-zoom-wrap', /overflow-wrap\s*:\s*break-word/.test(html), 'long words wrap instead of clipping (text zoom / translations)');
  push('touch-targets', /min-height:\s*48px/.test(html), 'remediated side declares >= 48px touch targets');
  push('dark-light-preference', /prefers-color-scheme/i.test(html), 'preview chrome adapts to prefers-color-scheme');
  push('viewport-buttons-labelled', /aria-pressed/.test(html), 'viewport toggle state exposed via aria-pressed');
  push('font-size-legible', !/font-size:\s*(?:[0-9]|1[01])px\s*;?\s*[^}]*background:\s*#16a34a/.test(html) && /font-size:\s*16px/.test(html), 'remediated CTAs use 16px baseline');

  return { ok: checks.every((c) => c.passed), checks };
}

function playwrightImportable() {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', "await import('playwright')"], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20000,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Visual regression runner over the preview artifact.
 *
 * The deterministic contract checks always run. Screenshots run only when
 * playwright is importable AND a browser launches; otherwise the run is
 * recorded as `skipped` with the exact required input — never silently
 * skipped. Screenshots are recorded (hash + bytes); cross-platform pixel
 * comparison is intentionally NOT claimed because rendering is not
 * byte-deterministic across machines.
 */
export async function runVisualRegression(root, { previewHtml = null, output = null } = {}) {
  let html = previewHtml;
  if (!html) {
    const { generateCroPreviewHtml } = await import('./previewCro.js');
    html = generateCroPreviewHtml({});
  }

  const contract = visualContractChecks(html);
  const cells = [];
  for (const vp of VIEWPORT_CLASSES) {
    for (const variant of VARIANT_CLASSES) {
      if (variant.viewport && variant.viewport !== vp.id) continue;
      cells.push({ viewport: vp.id, width: vp.width, height: vp.height, variant: variant.id, note: variant.note || null });
    }
  }

  const result = {
    timestamp: nowIso(),
    tool_version: PKG_VERSION,
    contract,
    matrix_cells: cells,
    screenshots: { status: 'skipped', captured: [], required_input: null },
    limitations: [
      'Layout-contract checks are deterministic string checks; they do not observe actual rendering.',
      'Screenshots are recorded per cell with hashes; no cross-machine pixel comparison is claimed.',
      'A skipped screenshot run is an explicit, recorded state — it never implies the matrix passed.',
    ],
    output_dir: null,
  };

  if (!playwrightImportable()) {
    result.screenshots.required_input = 'optional peer dependency playwright >= 1.50 with a Chromium install';
    if (output) writeReport(root, output, result);
    return result;
  }

  const outDir = output ? path.resolve(root, output) : path.join(root, '.citable', 'visual', nowIso().replace(/\D/g, '').slice(0, 14));
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const tmp = path.join(outDir, 'preview.html');
      fs.writeFileSync(tmp, html, 'utf8');
      for (const cell of cells) {
        const context = await browser.newContext({
          viewport: { width: cell.width, height: cell.height },
          reducedMotion: cell.variant === 'reduced-motion' ? 'reduce' : 'no-preference',
          colorScheme: cell.variant === 'dark' ? 'dark' : cell.variant === 'light' ? 'light' : 'no-preference',
        });
        const page = await context.newPage();
        await page.goto(`file://${tmp}`);
        if (cell.variant === 'keyboard-focus') await page.keyboard.press('Tab');
        if (cell.variant === 'text-zoom-200') {
          await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        }
        if (cell.variant === 'long-translation') {
          await page.evaluate(() => {
            const apply = (el, t) => { if (el) el.textContent = t; };
            apply(document.querySelector('h2'), 'Skalieren Sie Ihre Unternehmensarchitektur mit unprecedented Geschwindigkeit');
            const btn = document.querySelector('.btn-mock.btn-nebula');
            if (btn) btn.textContent = 'Jetzt kostenlos testen und sofort durchstarten';
          });
        }
        if (cell.variant === 'narrow-mobile') await page.setViewportSize({ width: 320, height: 667 });
        const file = path.join(outDir, `${cell.viewport}-${cell.variant}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const { sha256File } = await import('../shared/io.js');
        result.screenshots.captured.push({ cell: `${cell.viewport}/${cell.variant}`, file: path.relative(root, file), sha256: sha256File(file), bytes: fs.statSync(file).size });
        await context.close();
      }
      result.screenshots.status = 'captured';
    } finally {
      await browser.close();
    }
  } catch (err) {
    result.screenshots.status = 'skipped';
    result.screenshots.required_input = `browser launch failed: ${err.message}`;
  }
  if (output || result.screenshots.status === 'captured') writeReport(root, output || path.relative(root, outDir), result);
  return result;
}

function writeReport(root, output, result) {
  const outFull = path.resolve(root, output, 'visual-regression.json');
  fs.mkdirSync(path.dirname(outFull), { recursive: true });
  fs.writeFileSync(outFull, JSON.stringify(result, null, 2) + '\n', 'utf8');
  result.output_dir = path.dirname(outFull);
}
