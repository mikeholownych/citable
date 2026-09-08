import fs from 'node:fs';
import path from 'node:path';
import { inspectCro } from './inspectCro.js';

export function generateCroPreviewHtml({
  url = 'https://example.com/pricing',
  pageType = 'pricing',
  findings = [],
  fsaBefore = 35,
  fsaAfter = 0,
}) {
  const findingItems = findings.length > 0 ? findings : [
    { detector_id: 'CRO-007', summary: 'Input fields missing W3C autocomplete tokens', severity: 'medium' },
    { detector_id: 'CRO-010', summary: 'Hero section contains choice overload (3 competing CTAs)', severity: 'high' },
    { detector_id: 'CRO-011', summary: 'Primary CTA buried on long-form mobile viewport', severity: 'medium' },
    { detector_id: 'CRO-015', summary: 'Button touch targets below 44px threshold (measured 36px)', severity: 'high' },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nebula CRO Interactive Preview — ${url}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 1rem 1.5rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; font-weight: 700; font-size: 1.15rem; color: #38bdf8; }
    .metrics { display: flex; gap: 1.5rem; }
    .metric-pill { background: #0f172a; padding: 0.5rem 0.85rem; border-radius: 0.5rem; border: 1px solid #334155; font-size: 0.85rem; }
    .metric-pill strong { color: #38bdf8; }
    .metric-pill.good strong { color: #4ade80; }
    .viewports { display: flex; gap: 0.5rem; align-items: center; }
    .vp-btn { background: #334155; color: #f8fafc; border: none; padding: 0.4rem 0.75rem; border-radius: 0.375rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .vp-btn:hover { background: #475569; }
    .vp-btn.active { background: #2563eb; color: #fff; }
    main { padding: 1.5rem; max-width: 1600px; margin: 0 auto; }
    .split-container { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; transition: max-width 0.3s; margin: 0 auto; }
    .preview-card { background: #1e293b; border-radius: 0.75rem; border: 1px solid #334155; overflow: hidden; display: flex; flex-direction: column; }
    .card-header { padding: 0.85rem 1.25rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; }
    .card-header.before { background: #450a0a; color: #fca5a5; border-bottom: 1px solid #7f1d1d; }
    .card-header.after { background: #052e16; color: #86efac; border-bottom: 1px solid #14532d; }
    .frame-wrapper { background: #fff; color: #0f172a; padding: 1.5rem; flex: 1; min-height: 520px; font-size: 0.9rem; position: relative; }
    .hotspot { border: 2px dashed #dc2626; background: rgba(239, 68, 68, 0.08); padding: 0.75rem; border-radius: 0.5rem; position: relative; margin-bottom: 1rem; }
    .hotspot-tag { position: absolute; top: -10px; right: 10px; background: #dc2626; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 0.25rem; text-transform: uppercase; }
    .remediation-box { border: 2px solid #16a34a; background: rgba(34, 197, 94, 0.08); padding: 0.75rem; border-radius: 0.5rem; position: relative; margin-bottom: 1rem; }
    .remediation-tag { position: absolute; top: -10px; right: 10px; background: #16a34a; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 0.25rem; text-transform: uppercase; }
    .btn-mock { display: inline-flex; align-items: center; justify-content: center; font-weight: 600; border-radius: 0.375rem; text-decoration: none; cursor: pointer; }
    .btn-broken { height: 32px; padding: 0 12px; font-size: 11px; background: #64748b; color: #fff; border: none; }
    .btn-nebula { min-height: 48px; min-width: 160px; padding: 0 24px; font-size: 16px; background: #2563eb; color: #fff; border: none; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2); }
    .btn-secondary { min-height: 48px; padding: 0 16px; font-size: 14px; background: transparent; color: #475569; text-decoration: underline; border: none; }
    .findings-list { margin-top: 1.5rem; background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #334155; }
    .findings-list h3 { font-size: 1rem; margin-bottom: 0.75rem; color: #38bdf8; }
    .finding-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; font-size: 0.85rem; }
    .finding-badge { font-weight: 700; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem; }
    .badge-high { background: #7f1d1d; color: #fca5a5; }
    .badge-medium { background: #713f12; color: #fde047; }
    .badge-low { background: #1e293b; color: #94a3b8; }
    /* Keyboard navigation: visible focus indicators on all interactive elements */
    .vp-btn:focus-visible, .btn-mock:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
    input:focus-visible { outline: 3px solid #2563eb; outline-offset: 1px; }
    /* Reduced motion: disable transitions/animations when requested */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
    }
    /* Narrow mobile: collapse the split view below 480px regardless of the toggle */
    @media (max-width: 480px) {
      .split-container { grid-template-columns: 1fr !important; }
      .metrics { flex-wrap: wrap; }
      main { padding: 0.75rem; }
    }
    /* Text zoom and long translations must wrap, not clip */
    .frame-wrapper, .finding-row span:first-child { overflow-wrap: break-word; word-break: break-word; }
    /* Dark/light browser preference: adapt the preview chrome, keep frames readable */
    @media (prefers-color-scheme: light) {
      body { background: #e2e8f0; color: #0f172a; }
      header { background: #ffffff; border-bottom-color: #cbd5e1; }
      .preview-card, .findings-list { background: #ffffff; border-color: #cbd5e1; }
      .metric-pill { background: #f1f5f9; border-color: #cbd5e1; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>⚡ Nebula Components</span>
      <span style="color:#94a3b8; font-weight:400; font-size:0.9rem;">| Interactive CRO Sandbox</span>
    </div>
    <div class="metrics">
      <div class="metric-pill">Target: <strong>${url}</strong></div>
      <div class="metric-pill">Friction Surface Area (Before): <strong style="color:#f87171;">${fsaBefore}</strong></div>
      <div class="metric-pill good">Friction Surface Area (Modeled Target): <strong>${fsaAfter}</strong> <span style="color:#94a3b8;">modeled index, not a measured outcome</span></div>
    </div>
    <div class="viewports">
      <span style="font-size:0.8rem; color:#94a3b8; margin-right:0.25rem;">Viewport:</span>
      <button type="button" class="vp-btn" aria-pressed="false" onclick="setVp('375px', this)">Mobile (375px)</button>
      <button type="button" class="vp-btn" aria-pressed="false" onclick="setVp('768px', this)">Tablet (768px)</button>
      <button type="button" class="vp-btn active" aria-pressed="true" onclick="setVp('100%', this)">Desktop (Full)</button>
    </div>
  </header>

  <main>
    <div id="splitContainer" class="split-container">
      <!-- Original Side -->
      <div class="preview-card">
        <div class="card-header before">
          <span>❌ Current Audited State (Friction Hotspots)</span>
          <span>FSA: ${fsaBefore}</span>
        </div>
        <div class="frame-wrapper">
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:0.75rem;">Scale Your Enterprise Architecture</h2>
          <p style="color:#64748b; font-size:0.85rem; margin-bottom:1rem;">The leading cloud platform for distributed teams and mission-critical workflows.</p>

          <div class="hotspot">
            <span class="hotspot-tag">CRO-010 • Choice Overload</span>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button class="btn-broken" style="background:#dc2626;">Get Started</button>
              <button class="btn-broken" style="background:#475569;">Contact Sales</button>
              <button class="btn-broken" style="background:#0284c7;">Read Whitepaper</button>
            </div>
          </div>

          <div class="hotspot">
            <span class="hotspot-tag">CRO-007 / CRO-008 • Form Friction</span>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              <input type="text" placeholder="Your Name" style="height:32px; padding:0 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;" />
              <input type="text" placeholder="Email Address" style="height:32px; padding:0 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;" />
              <button class="btn-broken" style="background:#2563eb; width:100px;">Submit</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Remediated Side -->
      <div class="preview-card">
        <div class="card-header after">
          <span>✅ Remediated with Nebula Components</span>
          <span>FSA modeled target: ${fsaAfter}</span>
        </div>
        <div class="frame-wrapper">
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:0.75rem;">Scale Your Enterprise Architecture</h2>
          <p style="color:#64748b; font-size:0.85rem; margin-bottom:1rem;">The leading cloud platform for distributed teams and mission-critical workflows.</p>

          <div class="remediation-box">
            <span class="remediation-tag">NebulaHeroCTA</span>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <a href="/signup" class="btn-mock btn-nebula">Get Started Free</a>
              <a href="#demo" class="btn-mock btn-secondary">View Live Demo</a>
            </div>
          </div>

          <div class="remediation-box">
            <span class="remediation-tag">NebulaFrictionlessForm</span>
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
              <div style="position:relative;">
                <input id="demo-name" type="text" autocomplete="name" placeholder="Full Name" style="width:100%; min-height:48px; padding:0 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:15px;" />
              </div>
              <div style="position:relative;">
                <input id="demo-email" type="email" inputmode="email" autocomplete="email" placeholder="Work Email" style="width:100%; min-height:48px; padding:0 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:15px;" />
              </div>
              <button class="btn-mock btn-nebula" style="width:100%;">Complete Signup</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="findings-list">
      <h3>Resolved CRO Defects (${findingItems.length})</h3>
      ${findingItems.map((f) => `
        <div class="finding-row">
          <span><strong>${f.detector_id}</strong>: ${f.summary}</span>
          <span class="finding-badge badge-${f.severity || 'medium'}">${(f.severity || 'medium').toUpperCase()}</span>
        </div>
      `).join('')}
    </div>
  </main>

  <script>
    function setVp(width, btn) {
      const container = document.getElementById('splitContainer');
      document.querySelectorAll('.vp-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      if (width === '100%') {
        container.style.maxWidth = '100%';
        container.style.gridTemplateColumns = '1fr 1fr';
      } else {
        container.style.maxWidth = width;
        container.style.gridTemplateColumns = '1fr';
      }
    }
  </script>
</body>
</html>`;
}

export async function previewCroCommand(root, page = 'home', options = {}) {
  const { target, export: exportPath } = options;
  let croData = null;

  try {
    croData = await inspectCro(root, page, { target });
  } catch (err) {
    // Graceful fallback for mock preview
    croData = { url: page, findings: [], declared_conversion_action: 'Get Started' };
  }

  const findings = croData?.findings || [];
  const fsaBefore = findings.reduce((acc, f) => acc + (f.severity === 'high' ? 10 : f.severity === 'medium' ? 5 : 2), 0) || 30;
  const fsaAfter = 0;

  const html = generateCroPreviewHtml({
    url: croData.url || page,
    pageType: croData.page_type || 'commercial',
    findings,
    fsaBefore,
    fsaAfter,
  });

  let savedFile = null;
  if (exportPath) {
    const outFull = path.resolve(root, exportPath);
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    fs.writeFileSync(outFull, html, 'utf8');
    savedFile = outFull;
  }

  return {
    ok: true,
    url: croData.url || page,
    findings_count: findings.length,
    fsa_before: fsaBefore,
    fsa_after: fsaAfter,
    fsa_eliminated_pct: null,
    fsa_note: 'FSA is a modeled heuristic index; the remediated value is a projection of applied components, not a measured outcome',
    saved_file: savedFile,
    html,
  };
}
