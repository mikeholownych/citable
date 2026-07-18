const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, informational: 4, experimental: 5 };

export function summarize(findings) {
  const bySeverity = {};
  const byNamespace = {};
  const byDiscipline = { seo: 0, aeo: 0, geo: 0 };
  let deterministic = 0;
  for (const f of findings) {
    bySeverity[f.classification.severity] = (bySeverity[f.classification.severity] || 0) + 1;
    const ns = f.detector_id.split('-')[0];
    byNamespace[ns] = (byNamespace[ns] || 0) + 1;
    for (const d of f.discipline) byDiscipline[d] = (byDiscipline[d] || 0) + 1;
    if (f.classification.deterministic) deterministic++;
  }
  return {
    total: findings.length,
    deterministic_observations: deterministic,
    semantic_or_heuristic: findings.length - deterministic,
    by_severity: bySeverity,
    by_namespace: byNamespace,
    by_discipline: byDiscipline,
  };
}

export function renderMarkdownReport({ findings, manifest, summary, detectorsSkipped = [] }) {
  const lines = [];
  lines.push(`# Citable audit report`);
  lines.push('');
  lines.push(`- Run: \`${manifest.run_id}\``);
  lines.push(`- Command: \`${manifest.command}\``);
  lines.push(`- Target: ${manifest.target?.kind} — ${manifest.target?.location}`);
  lines.push(`- Timestamp: ${manifest.timestamp}`);
  lines.push(`- Tool version: ${manifest.tool_version}; commit: ${manifest.repository_commit ?? 'n/a'} (${manifest.working_tree_state ?? 'no git'})`);
  lines.push('');
  lines.push(`> Findings describe observed conditions and probabilities. Nothing in this report guarantees crawling, indexing, ranking, citation, recommendation, or conversion outcomes.`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total findings | ${summary.total} |`);
  lines.push(`| Deterministic observations | ${summary.deterministic_observations} |`);
  lines.push(`| Heuristic / semantic findings | ${summary.semantic_or_heuristic} |`);
  for (const [sev, n] of Object.entries(summary.by_severity).sort((a, b) => SEV_ORDER[a[0]] - SEV_ORDER[b[0]])) {
    lines.push(`| ${sev} | ${n} |`);
  }
  lines.push('');
  if (detectorsSkipped.length) {
    lines.push(`## Skipped checks`);
    lines.push('');
    for (const s of detectorsSkipped) lines.push(`- \`${s.detector_id}\`: ${s.reason}`);
    lines.push('');
  }
  if (manifest.incomplete_checks?.length) {
    lines.push(`## Incomplete or untestable conditions`);
    lines.push('');
    for (const c of manifest.incomplete_checks) lines.push(`- ${c}`);
    lines.push('');
  }
  lines.push(`## Findings`);
  lines.push('');
  const sorted = [...findings].sort((a, b) => SEV_ORDER[a.classification.severity] - SEV_ORDER[b.classification.severity]);
  for (const f of sorted) {
    lines.push(`### ${f.classification.severity.toUpperCase()} · ${f.detector_id} · ${f.observation.summary}`);
    lines.push('');
    lines.push(`- Subject: \`${f.subject.identifier}\`${f.subject.source_file ? ` (${f.subject.source_file})` : ''}`);
    lines.push(`- Type: ${f.classification.finding_type}; confidence: ${f.classification.confidence}; deterministic: ${f.classification.deterministic}`);
    const impacts = Object.entries(f.classification.impact || {}).filter(([, v]) => v && v !== 'none').map(([k, v]) => `${k}:${v}`).join(', ');
    if (impacts) lines.push(`- Impact: ${impacts}`);
    lines.push(`- Evidence:`);
    for (const e of f.observation.evidence) lines.push(`  - ${e}`);
    lines.push(`- Remediation: ${f.remediation.preferred}`);
    lines.push(`- Verify: ${f.verification.method} (rerun \`${f.verification.detector_to_rerun}\`)`);
    if (f.reasoning?.limitations?.length) lines.push(`- Limitations: ${f.reasoning.limitations.join('; ')}`);
    lines.push('');
  }
  if (findings.length === 0) {
    lines.push(`No findings from the executed detectors. Absence of findings is not proof of eligibility — see skipped and incomplete checks above.`);
    lines.push('');
  }
  return lines.join('\n');
}
