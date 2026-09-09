import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { auditBacklinkProfile } from '../analysis/offpage.js';

/**
 * `citable audit backlinks` — audit off-page authority and identify toxic domains.
 */
export async function auditBacklinks(root, { input, target, minSeverity } = {}) {
  let backlinks = [];

  if (input) {
    const filePath = path.resolve(root, input);
    if (!fs.existsSync(filePath)) throw new Error(`input file not found: ${input}`);
    const raw = fs.readFileSync(filePath, 'utf8');

    if (filePath.endsWith('.csv')) {
      const records = parseCsv(raw, { columns: true, skip_empty_lines: true });
      backlinks = records.map((r) => ({
        source_url: r.source_url || r.Source || r.url || r.URL,
        target_url: r.target_url || r.Target || r.target,
        anchor_text: r.anchor_text || r.Anchor || r.anchor || '',
        rel: r.rel || r.Rel || r.type || '',
        source_ip: r.source_ip || r.IP || r.ip || null,
      }));
    } else {
      const parsed = JSON.parse(raw);
      backlinks = Array.isArray(parsed) ? parsed : (parsed.backlinks || []);
    }
  } else {
    // Check if there is a competitor or backlink import in .citable/
    const defaultFile = path.join(root, '.citable', 'backlinks.json');
    if (fs.existsSync(defaultFile)) {
      const parsed = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
      backlinks = Array.isArray(parsed) ? parsed : (parsed.backlinks || []);
    } else {
      throw new Error('audit backlinks requires --input <backlinks.json|csv> or .citable/backlinks.json');
    }
  }

  const result = auditBacklinkProfile(backlinks, { targetDomain: target });
  return result;
}

/**
 * Format terminal output for `citable audit backlinks`
 */
export function formatBacklinksOutput(r) {
  const lines = [
    `Off-Page Authority & Toxic Domain Audit`,
    `=======================================`,
    `Profile Health: ${r.profile_health.toUpperCase()}`,
    `Total Backlinks: ${r.summary.total_backlinks} across ${r.summary.total_referring_domains} referring domain(s)`,
    `Dofollow: ${r.summary.dofollow_count} | Nofollow: ${r.summary.nofollow_count} | UGC: ${r.summary.ugc_count} | Sponsored: ${r.summary.sponsored_count}`,
    `Deep Link Ratio: ${r.summary.deep_link_ratio_pct}%`,
    ``,
    `ANCHOR TEXT PROFILE:`,
    `  Branded Anchors: ${r.anchor_profile.branded_pct}%`,
    `  Commercial Exact Match: ${r.anchor_profile.commercial_exact_match_pct}% (Risk: ${r.anchor_profile.over_optimization_risk.toUpperCase()})`,
    ``,
    `TOXIC DOMAIN IDENTIFICATION:`,
    `  Flagged Toxic Domains: ${r.summary.toxic_domains_count} (Critical: ${r.summary.critical_risk_domains}, High: ${r.summary.high_risk_domains})`,
  ];

  if (r.toxic_domains.length) {
    lines.push(``, `Flagged Risk Candidates:`);
    for (const d of r.toxic_domains.slice(0, 15)) {
      lines.push(`  [${d.risk_tier.toUpperCase()}] ${d.domain}`);
      for (const reason of d.reasons) lines.push(`    - ${reason}`);
      if (d.anchors.length) lines.push(`    - Sample anchors: "${d.anchors.join('", "')}"`);
    }
    lines.push(``, `Google Search Console Disavow Syntax Preview:`);
    lines.push(r.disavow_export.split('\n').slice(0, 10).join('\n'));
  } else {
    lines.push(`  No toxic domain risk patterns detected in profile.`);
  }

  return lines.join('\n');
}
