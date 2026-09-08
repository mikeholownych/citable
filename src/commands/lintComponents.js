import fs from "node:fs";
import path from "node:path";

function findComponentFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
        findComponentFiles(fullPath, fileList);
      }
    } else if (/\.(jsx|tsx|vue|svelte|html)$/i.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Statically lints React/JSX/TSX/Vue UI component source code for SEO/AEO/CRO anti-patterns.
 */
export async function lintComponents(targetDir) {
  const resolvedDir = path.resolve(process.cwd(), targetDir || "src/components");
  const files = findComponentFiles(resolvedDir);

  const findings = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    const relPath = path.relative(process.cwd(), file);

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];

      // COMP-001: Touch target < 44px
      if (/<(button|a)\b[^>]*\b(h-[6-9]|h-10|height:\s*(?:2|3)\dpx)[^>]*>/i.test(line)) {
        findings.push({
          rule_id: "COMP-001",
          name: "Interactive component explicitly styled below 44px touch target",
          file: relPath,
          line: lineNum,
          severity: "low",
          snippet: line.trim(),
          remediation: "Ensure interactive buttons declare a minimum height of 44px (min-h-11 or min-h-12 in Tailwind).",
        });
      }

      // COMP-002: Unlabelled icon button
      if (/<button\b(?![^>]*(aria-label|aria-labelledby|title))[^>]*>\s*<(svg|i|Icon)\b/i.test(line)) {
        findings.push({
          rule_id: "COMP-002",
          name: "Icon-only button lacking accessible name or aria-label",
          file: relPath,
          line: lineNum,
          severity: "medium",
          snippet: line.trim(),
          remediation: "Add aria-label or accessible text to the button so screen readers and search crawlers can determine its purpose.",
        });
      }

      // COMP-003: Generic CTA text
      if (/<button\b[^>]*>(?:\s|&nbsp;)*(Click here|Submit|Read more|Learn more)(?:\s|&nbsp;)*<\/button>/i.test(line)) {
        findings.push({
          rule_id: "COMP-003",
          name: "Generic low-intent microcopy on conversion CTA",
          file: relPath,
          line: lineNum,
          severity: "low",
          snippet: line.trim(),
          remediation: 'Replace generic text with action-oriented, value-aligned verbs (e.g. "Explore Components", "Start Free Trial").',
        });
      }

      // COMP-004: Missing input label or aria-label
      if (/<input\b(?![^>]*(aria-label|aria-labelledby|id=[^\s>]+|type=["']hidden["']))[^>]*>/i.test(line)) {
        findings.push({
          rule_id: "COMP-004",
          name: "Form input lacking visible label association or aria-label",
          file: relPath,
          line: lineNum,
          severity: "medium",
          snippet: line.trim(),
          remediation: "Associate an id with a <label htmlFor=...> or declare an aria-label attribute.",
        });
      }

      // COMP-005: Contact input missing autocomplete
      if (/<input\b[^>]*\b(name=["'](email|phone|tel|name)["']|type=["']email["'])(?![^>]*autocomplete)[^>]*>/i.test(line)) {
        findings.push({
          rule_id: "COMP-005",
          name: "Contact input field missing HTML5 autocomplete attribute",
          file: relPath,
          line: lineNum,
          severity: "low",
          snippet: line.trim(),
          remediation: 'Declare standard autocomplete (e.g. autocomplete="email" or autocomplete="tel").',
        });
      }

      // COMP-006: Image missing alt or dimensions
      if (/<img\b(?![^>]*(alt=[^\s>]+))[^>]*>/i.test(line)) {
        findings.push({
          rule_id: "COMP-006",
          name: "Image element missing required alt text attribute",
          file: relPath,
          line: lineNum,
          severity: "medium",
          snippet: line.trim(),
          remediation: 'Provide meaningful alt text for content images or alt="" for purely decorative graphics.',
        });
      }
    }
  }

  return {
    scanned_directory: relPathOrDir(resolvedDir),
    total_files_scanned: files.length,
    total_findings: findings.length,
    findings,
    status: findings.length === 0 ? "clean" : "issues_detected",
  };
}

function relPathOrDir(p) {
  try {
    return path.relative(process.cwd(), p) || ".";
  } catch {
    return p;
  }
}
