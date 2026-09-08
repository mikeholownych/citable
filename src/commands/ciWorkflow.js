import fs from 'node:fs';
import path from 'node:path';

export function generateCiWorkflow() {
  return `name: Citable CRO Funnel Sentinel
on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

jobs:
  cro-audit:
    name: CRO Friction & Funnel Drift Sentinel
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Dependencies
        run: npm ci

      - name: Run Component Static Linter
        run: npx @nebulacomponents/citable lint components src/

      - name: Run Strict Shift-Left CRO Audit Gate
        run: npx @nebulacomponents/citable audit cro --strict
`;
}

export function formatPrReviewComment(findings = []) {
  if (findings.length === 0) {
    return '### ✅ Citable CRO Sentinel: All conversion funnels and components verified clean with zero detected friction.';
  }

  const lines = [
    '### ⚠️ Citable CRO Sentinel: Friction Detected in Pull Request',
    '',
    `Found **${findings.length}** conversion action defect(s) violating UX or funnel continuity criteria:`,
    '',
  ];

  for (const f of findings) {
    lines.push(`- **[${f.detector_id || 'CRO'}]** (${f.severity || 'medium'}): ${f.summary || f.observation?.summary}`);
    if (f.remediation) {
      lines.push(`  - *Remediation*: ${f.remediation}`);
    }
  }

  lines.push('');
  lines.push('#### Recommended 1-Click Remediation');
  lines.push('Run the following locally to patch components automatically with accessible Nebula Components:');
  lines.push('```bash');
  lines.push('npx @nebulacomponents/citable remediate --finding CRO-007 --write');
  lines.push('```');

  return lines.join('\n');
}
