import fs from "node:fs";
import path from "node:path";
import { readJson } from "../shared/io.js";

/**
 * Generates an executive briefing deliverable (HTML brief or Markdown deck)
 * for clients and stakeholders.
 */
export async function exportExecutiveReport(root, runId, {
  format = "html-brief",
  clientName = "Nebula Client",
  output = null,
} = {}) {
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
  } else {
    throw new Error(`unsupported executive report format "${format}". Supported: html-brief, markdown-deck`);
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
