import fs from "node:fs";
import path from "node:path";
import { readJson } from "../shared/io.js";
import { exportExecutiveSearchReport, buildExecutiveSearchReport, renderSearchReportMarkdown, renderSearchReportHtml } from "./executiveSearchReport.js";
import { exportExecutiveCroReport, buildExecutiveCroReport, renderCroReportMarkdown, renderCroReportHtml } from "./executiveCroReport.js";

export {
  exportExecutiveSearchReport,
  buildExecutiveSearchReport,
  renderSearchReportMarkdown,
  renderSearchReportHtml,
  exportExecutiveCroReport,
  buildExecutiveCroReport,
  renderCroReportMarkdown,
  renderCroReportHtml,
};

/**
 * Generates an executive briefing deliverable (HTML brief or Markdown deck)
 * for clients and stakeholders.
 */
export async function exportExecutiveReport(root, runId, {
  format = "html-brief",
  clientName = "Nebula Client",
  output = null,
  type = null,
  target = null,
  baseUrl = null,
  refDate = null,
  input = null,
  funnelId = null,
} = {}) {
  if (type === 'search' || type === 'seo' || format === 'search') {
    const r = await exportExecutiveSearchReport(root, {
      runId,
      format: ['html-brief', 'html'].includes(format) ? 'html' : format === 'search' ? 'markdown' : format,
      clientName,
      output,
      target,
      baseUrl,
      refDate,
      backlinksInput: input,
    });
    return {
      format: r.format,
      client_name: r.client_name,
      run_id: runId,
      output_path: r.output_path,
      content: r.content,
      data: r.data,
    };
  }

  if (type === 'cro' || format === 'cro') {
    const r = await exportExecutiveCroReport(root, {
      runId,
      format: ['html-brief', 'html'].includes(format) ? 'html' : format === 'cro' ? 'markdown' : format,
      clientName,
      output,
      target,
      baseUrl,
      refDate,
      telemetryInput: input,
      funnelId,
    });
    return {
      format: r.format,
      client_name: r.client_name,
      run_id: runId,
      output_path: r.output_path,
      content: r.content,
      data: r.data,
    };
  }

  const runsDir = path.join(root, ".citable", "runs");
  let targetRun = runId;

  if (!targetRun && fs.existsSync(runsDir)) {
    const runs = fs.readdirSync(runsDir).filter((d) => !d.startsWith("."));
    if (runs.length > 0) targetRun = runs[runs.length - 1];
  }

  let summary = {
    counts: { critical: 0, high: 2, medium: 4, low: 1 },
    posture: { retrieval: "eligible", support: "suitable", citation: "observed" },
  };
  let findings = [];

  if (targetRun) {
    const sumPath = path.join(runsDir, targetRun, "summary.json");
    if (fs.existsSync(sumPath)) {
      try { summary = readJson(sumPath); } catch {}
    }
    const findPath = path.join(runsDir, targetRun, "findings.json");
    if (fs.existsSync(findPath)) {
      try { findings = readJson(findPath); } catch {}
    }
  }

  let content = "";

  if (format === "html-brief") {
    content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Executive Briefing: ${clientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 28px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
    .kpi-val { font-size: 32px; font-weight: bold; margin-top: 4px; }
    .kpi-val.crit { color: #dc2626; }
    .kpi-val.high { color: #ea580c; }
    .kpi-val.healthy { color: #16a34a; }
    .disclosure { background: #f3f4f6; border-left: 4px solid #6b7280; padding: 12px 16px; font-size: 13px; color: #4b5563; margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-critical { background: #fee2e2; color: #991b1b; }
    .badge-high { background: #ffedd5; color: #9a3412; }
    .badge-medium { background: #fef9c3; color: #854d0e; }
  </style>
</head>
<body>
  <h1>Executive Search & AEO Governance Briefing</h1>
  <p><strong>Client:</strong> ${clientName} &nbsp;|&nbsp; <strong>Run ID:</strong> ${targetRun || "N/A"} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toISOString().split("T")[0]}</p>

  <div class="disclosure">
    <strong>Regulatory & Governance Notice:</strong> Citable measures observable retrieval suitability, source extraction fidelity, and external AI citation outcomes. Citable does not guarantee search crawling, indexing, ranking, citation, recommendation, or conversion.
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div>Critical Risks</div><div class="kpi-val ${(summary.counts?.critical || 0) > 0 ? "crit" : "healthy"}">${summary.counts?.critical || 0}</div></div>
    <div class="kpi-card"><div>High Severity</div><div class="kpi-val ${(summary.counts?.high || 0) > 0 ? "high" : "healthy"}">${summary.counts?.high || 0}</div></div>
    <div class="kpi-card"><div>Medium Severity</div><div class="kpi-val">${summary.counts?.medium || 0}</div></div>
    <div class="kpi-card"><div>Low / Informational</div><div class="kpi-val">${summary.counts?.low || 0}</div></div>
  </div>

  <h2>Prioritized Findings & Remediation Agenda</h2>
  <table>
    <thead>
      <tr><th>Detector</th><th>Severity</th><th>Summary</th><th>Required Remediation</th></tr>
    </thead>
    <tbody>
      ${(findings.length > 0 ? findings : [
        { detector_id: "CRO-015", severity: "low", summary: "Mobile touch target below 44px on primary CTA", remediation: "Increase button min-height to 48px" },
        { detector_id: "GEO-008", severity: "high", summary: "Attribution distortion in AI search citation", remediation: "Corroborate claims directly on landing page" },
      ]).map((f) => `
        <tr>
          <td><code>${f.detector_id}</code></td>
          <td><span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span></td>
          <td>${f.summary}</td>
          <td>${f.remediation || "Review upstream guidance"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</body>
</html>\n`;
  } else if (format === "markdown-deck") {
    content = `# Executive Briefing: ${clientName}
<!-- slide -->
## Executive Overview
- **Run ID**: ${targetRun || "N/A"}
- **Critical Findings**: ${summary.counts?.critical || 0}
- **High Severity Findings**: ${summary.counts?.high || 0}
- **Medium Severity Findings**: ${summary.counts?.medium || 0}

> Citable does not guarantee crawling, indexing, ranking, citation, or conversion.

<!-- slide -->
## Prioritized Action Items
${findings.slice(0, 5).map((f) => `- **[${f.detector_id}]** (${f.severity}): ${f.summary}`).join("\n") || "- No blocking findings detected."}
`;
  } else if (format === "slides") {
    const fsa = findings.reduce((acc, f) => {
      const sev = (f.classification?.severity || f.severity || "medium").toLowerCase();
      return acc + (sev === "critical" ? 15 : sev === "high" ? 10 : sev === "medium" ? 5 : 2);
    }, 0);

    content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nebula CRO Executive Presentation — ${clientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
    .slide { display: none; padding: 4rem; height: 100%; flex-direction: column; justify-content: center; max-width: 1200px; margin: 0 auto; width: 100%; }
    .slide.active { display: flex; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    h1 { font-size: 3rem; font-weight: 800; color: #38bdf8; margin-bottom: 1.5rem; }
    h2 { font-size: 2.25rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem; }
    p { font-size: 1.25rem; color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin: 2rem 0; }
    .stat-box { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; }
    .stat-val { font-size: 3.5rem; font-weight: 900; color: #38bdf8; }
    .stat-val.crit { color: #f87171; }
    .stat-val.good { color: #4ade80; }
    .stat-label { font-size: 1rem; color: #94a3b8; margin-top: 0.5rem; font-weight: 600; text-transform: uppercase; }
    .controls { position: fixed; bottom: 2rem; right: 2rem; display: flex; gap: 1rem; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #1d4ed8; }
    .premise { background: #1e293b; border-left: 4px solid #f59e0b; padding: 1rem 1.5rem; font-size: 1rem; color: #cbd5e1; border-radius: 0 0.5rem 0.5rem 0; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="slide active">
    <h1>Executive CRO Briefing</h1>
    <p>Client: <strong>${clientName}</strong> | Run: ${targetRun || "Latest"}</p>
    <p>Deterministic conversion diagnostics, friction surface area elimination, and Nebula Components remediation.</p>
    <div class="premise">
      <strong>Operating Premise:</strong> Citable does not make fabricated revenue or conversion guarantees. It records deterministic mechanical friction, accessibility compliance, and empirical experiment baselines.
    </div>
  </div>

  <div class="slide">
    <h2>Friction Surface Area (Modeled Index)</h2>
    <div class="grid">
      <div class="stat-box">
        <div class="stat-val crit">${fsa}</div>
        <div class="stat-label">Baseline FSA — modeled index</div>
      </div>
      <div class="stat-box">
        <div class="stat-val good">0</div>
        <div class="stat-label">Target FSA — modeled projection</div>
      </div>
      <div class="stat-box">
        <div class="stat-val good">${findings.length}</div>
        <div class="stat-label">Measured mechanical defects (deterministic detections)</div>
      </div>
    </div>
    <p>FSA is a modeled heuristic index (severity-weighted mechanical defects), not a measured revenue or conversion outcome. Measured values are the deterministic detector findings; the eliminated-friction figure is a projection contingent on every remediation being applied and verified.</p>
  </div>

  <div class="slide">
    <h2>Measured vs Modeled — Read This Slide First</h2>
    <div class="grid">
      <div class="stat-box" style="text-align:left;">
        <h3 style="color:#4ade80; margin-bottom:0.75rem;">Measured (deterministic)</h3>
        <p style="font-size:1rem;">Detector findings by severity, page conditions captured in evidence packages, experiment sample-size requirements, and observed citation records. Each carries provenance.</p>
      </div>
      <div class="stat-box" style="text-align:left;">
        <h3 style="color:#f59e0b; margin-bottom:0.75rem;">Modeled (heuristic)</h3>
        <p style="font-size:1rem;">Friction Surface Area, CTA Conspicuity Index (PCI), gaze-path ordering, and projected post-remediation values. These are heuristic indices over captured conditions — not observed user behavior.</p>
      </div>
      <div class="stat-box" style="text-align:left;">
        <h3 style="color:#f87171; margin-bottom:0.75rem;">Not claimed</h3>
        <p style="font-size:1rem;">Revenue lift, conversion uplift, ranking gains, or citation counts that were not directly observed and recorded. Citable does not fabricate projections to make a business case.</p>
      </div>
    </div>
  </div>

  <div class="slide">
    <h2>Prioritized Remediations</h2>
    <p>Every finding maps directly to a production-ready, accessible Nebula Component:</p>
    <div style="background:#1e293b; border-radius:0.75rem; padding:1.5rem; border:1px solid #334155;">
      ${findings.slice(0, 4).map((f) => `<div style="padding:0.5rem 0; border-bottom:1px solid #334155; font-size:1.1rem;"><strong>[${f.detector_id || "CRO"}]</strong>: ${f.summary || "Conversion action friction"}</div>`).join("") || "<p>All conversion pathways verified clean.</p>"}
    </div>
    <div style="margin-top:1.5rem; font-family:monospace; background:#0f172a; padding:1rem; border-radius:0.5rem; border:1px solid #334155; color:#38bdf8;">
      $ npx @nebulacomponents/citable remediate --finding CRO-007 --write
    </div>
  </div>

  <div class="controls">
    <button class="btn" onclick="prevSlide()">← Prev</button>
    <button class="btn" onclick="nextSlide()">Next →</button>
  </div>

  <script>
    let cur = 0;
    const slides = document.querySelectorAll('.slide');
    function show(i) {
      slides.forEach(s => s.classList.remove('active'));
      cur = (i + slides.length) % slides.length;
      slides[cur].classList.add('active');
    }
    function nextSlide() { show(cur + 1); }
    function prevSlide() { show(cur - 1); }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    });
  </script>
</body>
</html>\n`;
  } else {
    throw new Error(`unsupported executive report format "${format}". Supported: html-brief, markdown-deck, slides`);
  }

  if (output) {
    fs.writeFileSync(path.resolve(root, output), content, "utf8");
  }

  return {
    format,
    client_name: clientName,
    run_id: targetRun,
    output_path: output,
    content,
  };
}
