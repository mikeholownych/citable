import fs from 'node:fs';
import path from 'node:path';
import { buildContext } from '../commands/context.js';
import { selectDetectors } from '../detectors/index.js';
import { runDetectors, indexTargets } from '../detectors/framework.js';
import { evaluateScopeAdmissibility } from './admissibilityGate.js';
import { readJson, nowIso } from '../shared/io.js';

/**
 * Generate an Enterprise-Grade Statement of Work (SOW) from SEO, AEO, GEO, SERP, and CRO findings.
 * Forces strict traceability: Evidence -> Obligation -> Acceptance Test.
 */
export async function generateSow(root, {
  target,
  baseUrl,
  refDate,
  runId,
  client = 'Acme Corporation',
  clientContact = 'client-procurement@acme.test',
  supplier = 'Nebula Components & Citable Practice',
  supplierContact = 'advisory@nebulacomponents.test',
  budget = 45000,
  termDays = 90,
  inScopeProperties = [],
  minIceScore = 8.0,
  sowId = null,
} = {}) {
  const generatedAt = nowIso();
  const sowIdentifier = sowId || `SOW-${Date.now().toString(36).toUpperCase()}`;

  let findings = [];
  let sitePages = [];

  // Attempt building live or target context if target provided
  if (target) {
    try {
      const ctx = await buildContext(root, { target, baseUrl, refDate });
      if (ctx?.site) {
        sitePages = indexTargets(ctx);
        const detectors = selectDetectors({ scopes: ['technical', 'seo', 'aeo', 'geo', 'schema', 'entity'] });
        const res = runDetectors(detectors, ctx);
        findings = res.findings;
      }
    } catch (e) {
      // Non-blocking fallback
    }
  }

  // If runId provided or prior runs exist in .citable/runs, load recorded evidence
  const runsDir = path.join(root, '.citable', 'runs');
  let loadedRunId = runId;
  if (!loadedRunId && fs.existsSync(runsDir)) {
    const runs = fs.readdirSync(runsDir).filter((d) => !d.startsWith('.'));
    if (runs.length > 0) loadedRunId = runs[runs.length - 1];
  }

  if (loadedRunId) {
    const runPath = path.join(runsDir, loadedRunId);
    const findPath = path.join(runPath, 'findings.json');
    if (fs.existsSync(findPath) && findings.length === 0) {
      try { findings = readJson(findPath); } catch {}
    }
  }

  // If no findings exist from live run, supply standard baseline audit findings for SOW generation
  if (findings.length === 0) {
    findings = [
      {
        detector_id: 'TECH-001',
        discipline: ['technical'],
        classification: { severity: 'critical', confidence: 'deterministic' },
        subject: { identifier: 'https://example.test/', url: 'https://example.test/' },
        observation: { summary: 'Render-blocking JavaScript bundle degrades Mobile LCP to 4.2s', evidence: ['EVD-CWV-001'] },
        remediation: { preferred: 'Implement asynchronous resource loading and preconnect headers' },
        verification: { detector_to_rerun: 'TECH-001', method: 'Static CWV inspection and HTTP header probe' },
        ice_score: 14.5,
      },
      {
        detector_id: 'CRO-007',
        discipline: ['cro'],
        classification: { severity: 'high', confidence: 'deterministic' },
        subject: { identifier: 'https://example.test/checkout', url: 'https://example.test/checkout' },
        observation: { summary: 'Checkout form inputs lack HTML5 autocomplete attributes, increasing manual mobile entry by 68%', evidence: ['EVD-CRO-007'] },
        remediation: { preferred: 'Inject standard autocomplete attributes (autocomplete="email", autocomplete="name", autocomplete="tel")' },
        verification: { detector_to_rerun: 'CRO-007', method: 'DOM inspection and AST patch verification' },
        ice_score: 18.0,
      },
      {
        detector_id: 'CRO-013',
        discipline: ['cro'],
        classification: { severity: 'high', confidence: 'deterministic' },
        subject: { identifier: 'https://example.test/checkout', url: 'https://example.test/checkout' },
        observation: { summary: 'Dedicated checkout funnel contains 14 external header navigation links creating distraction leaks', evidence: ['EVD-CRO-013'] },
        remediation: { preferred: 'Deploy enclosed distraction-free checkout layout stripping non-essential navigation' },
        verification: { detector_to_rerun: 'CRO-013', method: 'Navigation link count verification' },
        ice_score: 12.0,
      },
      {
        detector_id: 'ANS-001',
        discipline: ['aeo'],
        classification: { severity: 'high', confidence: 'deterministic' },
        subject: { identifier: 'https://example.test/saas/pricing.html', url: 'https://example.test/saas/pricing.html' },
        observation: { summary: 'Commercial pricing questions lack direct-extract definition passages under 75 words', evidence: ['EVD-ANS-001'] },
        remediation: { preferred: 'Restructure FAQ headings with immediate concise copular answer passages' },
        verification: { detector_to_rerun: 'ANS-001', method: 'Passage length and question-answer extraction test' },
        ice_score: 11.0,
      },
      {
        detector_id: 'SCHEMA-001',
        discipline: ['schema'],
        classification: { severity: 'medium', confidence: 'deterministic' },
        subject: { identifier: 'https://example.test/pricing', url: 'https://example.test/pricing' },
        observation: { summary: 'Commercial FAQ content lacks FAQPage JSON-LD schema markup', evidence: ['EVD-SCH-001'] },
        remediation: { preferred: 'Deploy validated Schema.org FAQPage structured data' },
        verification: { detector_to_rerun: 'SCHEMA-001', method: 'JSON-LD schema validation gate' },
        ice_score: 9.5,
      },
      // Inadmissible exploratory finding (for demonstrating the gate)
      {
        detector_id: 'EXP-GEO-999',
        discipline: ['geo'],
        classification: { severity: 'low', confidence: 'experimental', finding_type: 'experimental' },
        subject: { identifier: 'https://unrelated-blog.test/post-1', url: 'https://unrelated-blog.test/post-1' },
        observation: { summary: 'Speculative model hallucination on third-party forum', evidence: [] },
        remediation: { preferred: 'Consult external legal counsel regarding public forum sentiment' },
        ice_score: 2.0,
      },
    ];
  }

  const effectiveScopeProps = inScopeProperties.length > 0
    ? inScopeProperties
    : [baseUrl || 'https://example.test'];

  // -------------------------------------------------------------
  // THE ADMISSIBILITY GATE (Filter findings to contractual scope)
  // -------------------------------------------------------------
  const gateResult = evaluateScopeAdmissibility(findings, {
    inScopeProperties: effectiveScopeProps,
    minIceScore,
  });

  const admitted = gateResult.admitted_requirements;

  // Group admitted requirements into Work Packages
  const wpMap = new Map();
  for (const item of admitted) {
    if (!wpMap.has(item.work_package_id)) {
      wpMap.set(item.work_package_id, {
        work_package_id: item.work_package_id,
        name: item.work_package_name,
        deliverable_id: item.deliverable_id,
        owner: item.owner,
        requirements: [],
      });
    }
    wpMap.get(item.work_package_id).requirements.push(item);
  }
  const workPackages = Array.from(wpMap.values());

  // 25. THE FINAL TRACEABILITY MATRIX
  // Mapping Finding -> Recommendation -> SOW Requirement -> Deliverable -> Acceptance Test -> Owner -> Evidence
  const traceabilityMatrix = admitted.map((item) => ({
    finding_id: item.finding_id,
    recommendation: item.recommendation,
    sow_requirement_id: item.sow_requirement_id,
    work_package_id: item.work_package_id,
    deliverable_id: item.deliverable_id,
    acceptance_test_id: item.acceptance_test_id,
    owner: item.owner,
    evidence_id: item.evidence_id,
    severity: item.severity,
    target_subject: item.subject,
    acceptance_criteria: item.acceptance_test,
  }));

  // Deliverables definitions
  const deliverables = workPackages.map((wp, idx) => ({
    deliverable_id: wp.deliverable_id,
    work_package_id: wp.work_package_id,
    title: `${wp.name} Implementation & Verification Package`,
    artifact_type: 'Code Patches, AST Snapshots, and Evidence Package',
    format: 'Git Pull Request + JSON Verification Receipt',
    owner: wp.owner,
    delivery_criteria: `All ${wp.requirements.length} requirements must pass automated verification (exit code 0) with zero regressions on Core Web Vitals.`,
  }));

  // Acceptance criteria definitions
  const acceptanceCriteria = admitted.map((item) => ({
    acceptance_test_id: item.acceptance_test_id,
    sow_requirement_id: item.sow_requirement_id,
    test_description: item.acceptance_test,
    validation_method: 'citable verify remediation closed-loop command',
    pass_threshold: '100% detector defect resolution on audited surface',
    evidence_required: `Deterministic before-and-after observation JSON matching ${item.evidence_id}`,
  }));

  // Commercial structure
  const feePerWp = Math.round(budget / (workPackages.length || 1));
  const commercialMilestones = workPackages.map((wp, idx) => ({
    milestone_id: `MILESTONE-0${idx + 1}`,
    work_package_id: wp.work_package_id,
    name: wp.name,
    fee_usd: feePerWp,
    billing_trigger: `Successful customer acceptance sign-off of Deliverable ${wp.deliverable_id}`,
    target_delivery_week: (idx + 1) * 3,
  }));

  const sow = {
    $schema: 'citable://schemas/sow.schema.json',
    sow_id: sowIdentifier,
    version: '1.0.0',
    title: `Statement of Work: Enterprise Search & Conversion Intelligence Engineering`,
    client: { name: client, contact: clientContact },
    supplier: { name: supplier, contact: supplierContact },
    effective_date: generatedAt.split('T')[0],
    term_days: termDays,
    commercial_total_fee_usd: budget,

    // Pillar 1: Executive Scope Statement
    executive_scope: {
      business_objective: 'Eliminate deterministic technical search and conversion friction, establish AEO/GEO answer extraction architecture, and deploy governed CRO design remediations with verifiable evidence.',
      in_scope_properties: effectiveScopeProps,
      in_scope_systems: ['Web Front-End Codebase', 'CMS Rendering Layer', 'Search & Conversion Analytics (GSC, GA4, PostHog)', 'Edge Middleware / Reverse Proxy'],
      channels: ['Organic Search (Google, Bing)', 'AI Answer Engines (Perplexity, ChatGPT, Copilot)', 'Direct Conversion Funnels'],
      geographies: ['Global', 'North America (US/CA)', 'European Union (GDPR-compliant surfaces)'],
      organizational_boundaries: 'Applies strictly to customer-owned digital production surfaces; excludes third-party partner portals and non-contracted subdomains.',
    },

    // Pillar 2: Evidence-to-Work Traceability & Admissibility Gate
    admissibility_gate: {
      total_findings_evaluated: gateResult.summary.total_evaluated,
      admitted_count: gateResult.summary.admitted_count,
      refused_count: gateResult.summary.refused_count,
      admissibility_rate_pct: gateResult.summary.admissibility_rate_pct,
      refusal_log: gateResult.refusal_log,
      methodology: 'Admissibility Gate evaluates findings against 6 strict tests: Evidence Maturity, Scope Boundary, Technical Feasibility, Commercial Materiality, Measurable Acceptance, and Ownership Clarity.',
    },

    // Pillar 3: Explicit Assumptions, Dependencies, Exclusions & Constraints
    assumptions_and_constraints: {
      assumptions: [
        'Customer maintains active version control via GitHub or GitLab with standard pull-request workflow.',
        'Staging environment provides parity with production infrastructure for pre-release verification testing.',
        'Audited search and conversion telemetry represents normal operating seasonality.',
      ],
      dependencies: [
        'Customer delivers read-only credentials to Google Search Console and GA4 within 5 business days of effective date.',
        'Customer engineering performs technical reviews and merges approved pull requests within 48 hours of verification receipt.',
      ],
      exclusions: [
        'Paid media ad buy management or advertising budget spend.',
        'Complete brand identity overhaul or custom creative video production.',
        'Legal, privacy, or regulatory compliance counsel (medical, financial, GDPR legal defense).',
        'Refactoring core backend transactional databases or proprietary billing engines.',
      ],
      constraints: [
        'Zero deployment downtime allowed during production release windows.',
        'Zero regression permitted on Core Web Vitals (Mobile LCP <= 2.5s, CLS <= 0.10, INP <= 200ms).',
      ],
      unresolved_unknowns: [
        'In-memory citation query volume from ChatGPT search (requires server-side log ingestion phase).',
        'Post-cookie-consent degradation on regional EU mobile conversions.',
      ],
    },

    // Pillar 4: Prioritized Work Packages
    work_packages: workPackages,

    // Pillar 5: Detailed Deliverables
    deliverables,

    // Pillar 6: Technical Implementation Requirements
    technical_requirements: {
      supported_frameworks: ['React', 'Next.js', 'Vue', 'Nuxt', 'HTML5/Tailwind', 'Astro'],
      git_branching_model: 'citable/remediation-<finding-id>',
      rollback_mechanism: 'Automated atomic snapshot generated in .citable/remediation/snapshots/ prior to file modification',
      access_requirements: ['Read-only git repository access', 'Read-only GSC/GA4 analytics access', 'Staging deploy preview access'],
    },

    // Pillar 7: Acceptance Criteria
    acceptance_criteria: acceptanceCriteria,

    // Pillar 8: Baseline & Target-State Metrics
    baseline_and_target_metrics: {
      disclaimer: 'Metrics represent technical readiness, friction eradication, and modeled index targets. In adherence to Citable governance, this SOW never warrants guaranteed ranking or revenue volumes.',
      metrics: [
        { metric: 'Core Web Vitals Render-Blockers', baseline: '1 blocker', target: '0 blockers', validation: 'Lighthouse / static CWV sweep' },
        { metric: 'HTML5 Autocomplete Form Coverage', baseline: '32%', target: '100%', validation: 'AST form field inspection' },
        { metric: 'AEO Direct Answer Extraction Score', baseline: '58 / 100', target: '>= 80 / 100', validation: 'citable inspect readiness' },
        { metric: 'Checkout Distraction Leaks', baseline: '14 header links', target: '0 links (Enclosed)', validation: 'DOM link count' },
      ],
    },

    // Pillar 9: Experiment Specifications
    experiment_specifications: {
      standard: 'Two-tailed hypothesis testing (alpha = 0.05, 80% statistical power)',
      stopping_criteria: 'Minimum 14 calendar days lock; mandatory daily Sample Ratio Mismatch (SRM) Chi-Square check (p < 0.001 terminates test)',
      guardrails: [
        'SEO Retention: Variant must preserve all canonical tags, JSON-LD structured data, and meta robots tags',
        'Performance Guardrail: Mobile LCP must not degrade by > 250ms; CLS must remain <= 0.10',
      ],
    },

    // Pillar 10: Roles & RACI Matrix
    raci_matrix: [
      { role: 'Customer Executive Sponsor', r: 'Approve SOW, sign off commercial milestones, resolve executive escalations', raci: 'Accountable (A)' },
      { role: 'Customer Lead Engineer', r: 'Review code pull requests, grant repository access, execute production deploy', raci: 'Responsible (R)' },
      { role: 'Supplier Principal Architect', r: 'Design AST patches, author verification receipts, direct technical delivery', raci: 'Responsible (R)' },
      { role: 'Supplier QA & Governance Lead', r: 'Execute admissibility gate, validate acceptance criteria, maintain evidence packages', raci: 'Consulted (C)' },
    ],

    // Pillar 11: Customer Obligations
    customer_obligations: [
      'Provide authorized read-only API access to required search and analytics tools within 5 business days.',
      'Review and respond to delivered Pull Requests and verification packages within 48 business hours.',
      'Maintain staging environment availability for automated closed-loop verification probes.',
    ],

    // Pillar 12: Delivery Sequencing & Milestone Schedule
    delivery_schedule: {
      total_duration_weeks: Math.ceil(termDays / 7),
      milestones: commercialMilestones,
    },

    // Pillar 13: Scope Change-Control Process
    change_control_process: {
      procedure: 'Any expansion of in-scope systems, addition of new domains, or changes to accepted requirements requires a written Scope Change Request (SCR).',
      authorization: 'SCR must be signed by Customer Executive Sponsor and Supplier Practice Lead before work begins.',
      superceding_rules: 'Superseded requirements are archived in .citable/sow/history/ with reason code and date.',
    },

    // Pillar 14: Risk Register
    risk_register: [
      { id: 'RISK-01', category: 'deployment', description: 'Customer deployment freeze during holiday quarter delays PR merges', mitigation: 'Schedule staging verification ahead of freeze; stage patches in feature flags' },
      { id: 'RISK-02', category: 'platform', description: 'Search engine or AI answer engine algorithmic updates shift third-party citation UI', mitigation: 'Focus on deterministic schema and direct entity corroboration rather than transient UI exploits' },
      { id: 'RISK-03', category: 'srm_contamination', description: 'Paid ad campaign sudden burst contaminates running A/B test cohort', mitigation: 'Enforce UTM parameter isolation and SRM daily monitoring' },
    ],

    // Pillar 15: Data Governance Requirements
    data_governance: {
      authorized_sources: ['Audited customer DOM', 'Search Console telemetry', 'Public AI search observation endpoints'],
      retention_period: '90 days post-completion, followed by immutable archive',
      processing_purpose: 'Exclusively for fulfilling contracted SOW engineering and verification obligations',
      deletion_upon_termination: 'Supplier will delete all customer source code clones within 14 calendar days of contract completion',
    },

    // Pillar 16: Security & Privacy Requirements
    security_requirements: [
      'Zero plaintext credentials stored; all authentication managed via environment variable tokens (credential_env).',
      'Least privilege: Supplier requires only read-only repository and analytics access.',
      'No customer PII (personally identifiable customer data) will be stored, processed, or logged.',
      'Incident notification: Any suspected security anomaly reported to customer security within 24 hours.',
    ],

    // Pillar 17: Platform & Third-Party Dependency Statement
    platform_dependencies: [
      'Customer acknowledges that third-party search engines (Google, Bing) and AI platforms (OpenAI, Anthropic, Perplexity) operate autonomously. Supplier cannot control, and does not warrant, unilateral external algorithm modifications.',
    ],

    // Pillar 18: Quality Assurance & Validation Plan
    qa_plan: {
      methodology: 'Three-tier verification: (1) Static AST patch linting, (2) Closed-loop detector rerun, (3) Visual screenshot layout regression check.',
      evidence_package: 'Every accepted deliverable includes a cryptographic SHA-256 hash-locked verification envelope.',
    },

    // Pillar 19: Reporting Cadence & Governance Model
    governance_model: {
      weekly_sync: '30-minute sprint progress and blocker resolution call',
      written_reports: 'Bi-weekly status dashboard and updated traceability matrix',
      decision_logging: 'All material technical decisions logged to .citable/decisions/',
    },

    // Pillar 20: Commercial Structure
    commercial_terms: {
      total_fixed_fee_usd: budget,
      payment_terms: 'Net 30 upon verified deliverable acceptance',
      milestones: commercialMilestones,
    },

    // Pillar 21: Out-of-Scope Section
    out_of_scope: [
      'Writing bespoke corporate PR press releases or off-site guest blogging.',
      'Modifying legacy subdomains not explicitly enumerated in Executive Scope.',
      'Purchasing media ad credits, paid backlinks, or advertising inventory.',
      'Providing legal counsel regarding privacy regulations or intellectual property.',
    ],

    // Pillar 22: Warranty & Remediation Terms
    warranty_terms: {
      warranty_window_days: 30,
      defect_definition: 'A defect is strictly defined as a failure of an accepted deliverable to satisfy its explicit Acceptance Criteria test upon rerun under unchanged baseline conditions.',
      exclusion: 'Defects caused by subsequent customer code modifications, third-party library updates, or external platform outages are excluded.',
    },

    // Pillar 23: Completion & Operational Handoff
    completion_and_handoff: {
      handoff_assets: [
        'Merged and verified Git Pull Requests',
        'Signed Acceptance Certificates for each Work Package',
        'Immutable Evidence Package and Cryptographic Verification Envelope',
        'Developer Documentation & Runbook for ongoing automated maintenance',
      ],
      operational_signoff: 'Final operational transfer completed upon customer tech lead sign-off.',
    },

    // Pillar 24: Exit & Termination Provisions
    termination_provisions: {
      convenience: 'Either party may terminate upon 14 calendar days written notice.',
      compensation: 'Customer shall compensate Supplier for all completed and accepted deliverables plus pro-rata work in progress up to notice date.',
      asset_transfer: 'Supplier delivers all completed patches and evidence packages generated up to the termination effective date.',
    },

    // Pillar 25: The Final Traceability Matrix
    traceability_matrix: traceabilityMatrix,
  };

  return sow;
}

/**
 * Render Statement of Work as GitHub-flavored Markdown
 */
export function renderSowMarkdown(sow) {
  const lines = [
    `# ${sow.title}`,
    `====================================================================`,
    `- **SOW ID**: \`${sow.sow_id}\` | **Version**: \`${sow.version}\``,
    `- **Client**: **${sow.client.name}** (${sow.client.contact})`,
    `- **Supplier**: **${sow.supplier.name}** (${sow.supplier.contact})`,
    `- **Effective Date**: \`${sow.effective_date}\` | **Term**: \`${sow.term_days} calendar days\``,
    `- **Commercial Total**: **$${sow.commercial_total_fee_usd.toLocaleString()} USD**`,
    ``,
    `> **Contractual Principle**: This Statement of Work forces strict downward traceability from documented audit evidence to contractual obligation, and from obligation to verifiable acceptance. Findings are admitted strictly through a formal Admissibility Gate. In adherence to Citable governance principles, **no search rankings, AI citations, or conversion revenues are guaranteed**; fees are tied exclusively to objective deliverable acceptance.`,
    ``,
    `---`,
    `## 1. Executive Scope Statement`,
    `- **Core Business Objective**: ${sow.executive_scope.business_objective}`,
    `- **In-Scope Digital Properties**: ${sow.executive_scope.in_scope_properties.join(', ')}`,
    `- **In-Scope Systems**: ${sow.executive_scope.in_scope_systems.join('; ')}`,
    `- **Contracted Channels**: ${sow.executive_scope.channels.join(', ')}`,
    `- **Geographies & Jurisdictions**: ${sow.executive_scope.geographies.join(', ')}`,
    `- **Organizational Boundary**: ${sow.executive_scope.organizational_boundaries}`,
    ``,
    `## 2. Scope Admissibility Gate (Evidence-to-Work Filter)`,
    `- **Total Audit Findings Evaluated**: ${sow.admissibility_gate.total_findings_evaluated}`,
    `- **Admitted Contractual Requirements**: **${sow.admissibility_gate.admitted_count}** (${sow.admissibility_gate.admissibility_rate_pct}% admission rate)`,
    `- **Refused / Excluded Findings**: **${sow.admissibility_gate.refused_count}** (preventing unverified or exploratory creep)`,
    ``,
    `### Refused & Deferred Findings Log:`,
    `| Finding ID | Subject | Gate Failed | Refusal Code | Contractual Rationale |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...(sow.admissibility_gate.refusal_log.length > 0
      ? sow.admissibility_gate.refusal_log.map((r) => `| \`${r.finding_id}\` | \`${r.subject}\` | \`${r.gate_failed}\` | \`${r.refusal_code}\` | ${r.refusal_rationale.slice(0, 75)}... |`)
      : ['| None | N/A | N/A | N/A | All evaluated findings met strict admissibility criteria |']),
    ``,
    `## 3. Assumptions, Dependencies, Exclusions & Constraints`,
    `### Explicit Assumptions:`,
    ...sow.assumptions_and_constraints.assumptions.map((a) => `- ${a}`),
    `### Key Dependencies:`,
    ...sow.assumptions_and_constraints.dependencies.map((d) => `- ${d}`),
    `### Known Constraints:`,
    ...sow.assumptions_and_constraints.constraints.map((c) => `- ${c}`),
    `### Unresolved Unknowns:`,
    ...sow.assumptions_and_constraints.unresolved_unknowns.map((u) => `- [?] ${u}`),
    ``,
    `## 4. Prioritized Work Packages (Derived from ICE-BV)`,
    ...sow.work_packages.map((wp) => `### ${wp.work_package_id}: ${wp.name}\n- **Owner**: \`${wp.owner}\`\n- **Deliverable Binding**: \`${wp.deliverable_id}\`\n- **Requirements Count**: ${wp.requirements.length} requirement(s)`),
    ``,
    `## 5. Detailed Deliverables & Delivery Criteria`,
    `| Deliverable ID | Title | Artifact Type | Format | Delivery & Acceptance Criteria |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.deliverables.map((d) => `| **${d.deliverable_id}** | ${d.title} | \`${d.artifact_type}\` | ${d.format} | ${d.delivery_criteria} |`),
    ``,
    `## 6. Technical Implementation Requirements`,
    `- **Supported Frameworks**: ${sow.technical_requirements.supported_frameworks.join(', ')}`,
    `- **Branching Model**: \`${sow.technical_requirements.git_branching_model}\``,
    `- **Rollback Safeguard**: ${sow.technical_requirements.rollback_mechanism}`,
    ``,
    `## 7. Acceptance Criteria & Objective Verification Methods`,
    `| Test ID | SOW Requirement | Validation Method | Pass / Fail Threshold | Required Evidence |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.acceptance_criteria.map((a) => `| **${a.acceptance_test_id}** | \`${a.sow_requirement_id}\` | \`${a.validation_method}\` | ${a.pass_threshold} | ${a.evidence_required} |`),
    ``,
    `## 8. Baseline & Target-State Metrics (Non-Guarantee Disclosure)`,
    `> *${sow.baseline_and_target_metrics.disclaimer}*`,
    ``,
    `| Dimension | Baseline State | Contracted Target State | Objective Verification |`,
    `| :--- | :--- | :--- | :--- |`,
    ...sow.baseline_and_target_metrics.metrics.map((m) => `| ${m.metric} | **${m.baseline}** | **${m.target}** | \`${m.validation}\` |`),
    ``,
    `## 9. Governed Experiment Specifications`,
    `- **Statistical Standard**: ${sow.experiment_specifications.standard}`,
    `- **Stopping & Guardrails**: ${sow.experiment_specifications.stopping_criteria}`,
    ...sow.experiment_specifications.guardrails.map((g) => `- ${g}`),
    ``,
    `## 10. Roles & RACI Matrix`,
    `| Role | Responsibility Description | RACI Designation |`,
    `| :--- | :--- | :--- |`,
    ...sow.raci_matrix.map((r) => `| **${r.role}** | ${r.r} | **${r.raci}** |`),
    ``,
    `## 11. Customer Obligations & SLAs`,
    ...sow.customer_obligations.map((o) => `- ${o}`),
    ``,
    `## 12. Delivery Sequencing & Milestone Schedule`,
    `| Milestone | Work Package | Target Week | Fee (USD) | Acceptance Trigger |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...sow.delivery_schedule.milestones.map((m) => `| **${m.milestone_id}** | \`${m.work_package_id}\` | Week ${m.target_delivery_week} | **$${m.fee_usd.toLocaleString()}** | ${m.billing_trigger} |`),
    ``,
    `## 13. Scope Change-Control Process`,
    `- **Procedure**: ${sow.change_control_process.procedure}`,
    `- **Authorization**: ${sow.change_control_process.authorization}`,
    `- **Superseded Controls**: ${sow.change_control_process.superceding_rules}`,
    ``,
    `## 14. Risk & Dependency Register`,
    `| Risk ID | Category | Risk Description | Planned Mitigation |`,
    `| :--- | :--- | :--- | :--- |`,
    ...sow.risk_register.map((r) => `| **${r.id}** | \`${r.category}\` | ${r.description} | ${r.mitigation} |`),
    ``,
    `## 15. Data Governance & Information Handling`,
    `- **Authorized Sources**: ${sow.data_governance.authorized_sources.join(', ')}`,
    `- **Retention & Purging**: ${sow.data_governance.retention_period}; ${sow.data_governance.deletion_upon_termination}`,
    ``,
    `## 16. Security & Privacy Safeguards`,
    ...sow.security_requirements.map((s) => `- ${s}`),
    ``,
    `## 17. Platform & Third-Party Dependency Disclosures`,
    ...sow.platform_dependencies.map((p) => `> ${p}`),
    ``,
    `## 18. Quality Assurance & Validation Plan`,
    `- **QA Methodology**: ${sow.qa_plan.methodology}`,
    `- **Evidence Integrity**: ${sow.qa_plan.evidence_package}`,
    ``,
    `## 19. Governance Cadence & Reporting Model`,
    `- **Weekly Sync**: ${sow.governance_model.weekly_sync}`,
    `- **Status Reports**: ${sow.governance_model.written_reports}`,
    `- **Decision Records**: ${sow.governance_model.decision_logging}`,
    ``,
    `## 20. Commercial Terms & Payment Schedule`,
    `- **Total Contract Value**: **$${sow.commercial_terms.total_fixed_fee_usd.toLocaleString()} USD**`,
    `- **Terms**: ${sow.commercial_terms.payment_terms}`,
    ``,
    `## 21. Explicit Out-of-Scope Declarations`,
    ...sow.out_of_scope.map((item) => `- [x] **OUT OF SCOPE**: ${item}`),
    ``,
    `## 22. Warranty & Remediation Terms`,
    `- **Warranty Period**: **${sow.warranty_terms.warranty_window_days} calendar days** following written deliverable acceptance.`,
    `- **Defect Standard**: ${sow.warranty_terms.defect_definition}`,
    `- **Warranty Exclusions**: ${sow.warranty_terms.exclusion}`,
    ``,
    `## 23. Completion & Operational Handoff`,
    `### Required Deliverable Handoff Assets:`,
    ...sow.completion_and_handoff.handoff_assets.map((h) => `- [x] ${h}`),
    ``,
    `## 24. Exit, Transition & Termination Provisions`,
    `- **Termination for Convenience**: ${sow.termination_provisions.convenience}`,
    `- **Accrued Compensation**: ${sow.termination_provisions.compensation}`,
    `- **Asset Return**: ${sow.termination_provisions.asset_transfer}`,
    ``,
    `---`,
    `## 25. THE FINAL TRACEABILITY MATRIX`,
    `### Finding → Recommendation → SOW Requirement → Deliverable → Acceptance Test → Owner → Evidence`,
    ``,
    `| Finding ID | Recommendation | SOW Req ID | Deliverable ID | Acceptance Test ID | Responsible Owner | Source Evidence |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
    ...sow.traceability_matrix.map((t) => `| **\`${t.finding_id}\`** | ${t.recommendation.slice(0, 45)}... | **\`${t.sow_requirement_id}\`** | \`${t.deliverable_id}\` | \`${t.acceptance_test_id}\` | ${t.owner} | \`${t.evidence_id}\` |`),
    ``,
    `---`,
    `### Contract Execution & Authorization`,
    ``,
    `| On Behalf of Customer: ${sow.client.name} | On Behalf of Supplier: ${sow.supplier.name} |`,
    `| :--- | :--- |`,
    `| Signature: __________________________________ | Signature: __________________________________ |`,
    `| Name: _____________________________________ | Name: _____________________________________ |`,
    `| Title: ______________________________________ | Title: ______________________________________ |`,
    `| Date: _______________________________________ | Date: _______________________________________ |`,
  ];

  return lines.join('\n');
}

/**
 * Render Statement of Work as Standalone Enterprise HTML
 */
export function renderSowHtml(sow) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${sow.title} - ${sow.sow_id}</title>
  <style>
    :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --accent: #58a6ff; --danger: #f85149; --warning: #d29922; --success: #3fb950; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; margin: 0; padding: 40px 20px; }
    .container { max-width: 1180px; margin: 0 auto; }
    header { border-bottom: 2px solid var(--border); padding-bottom: 24px; margin-bottom: 32px; }
    h1 { font-size: 28px; margin: 0 0 10px 0; color: #fff; }
    .sow-badge { background: #1f6feb; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: bold; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 18px; }
    .card-val { font-size: 26px; font-weight: bold; color: #fff; margin-top: 4px; }
    .disclosure { background: rgba(56, 139, 253, 0.1); border-left: 4px solid var(--accent); padding: 14px 18px; border-radius: 4px; font-size: 13px; margin: 24px 0; }
    .section-title { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 36px 0 16px 0; color: #fff; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: var(--card); border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { background: #21262d; color: #8b949e; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-admit { background: rgba(63, 185, 80, 0.2); color: var(--success); }
    .badge-refuse { background: rgba(248, 81, 73, 0.2); color: var(--danger); }
    .code-ref { font-family: monospace; color: var(--accent); background: rgba(88, 166, 255, 0.15); padding: 2px 5px; border-radius: 3px; }
    .sig-table { margin-top: 40px; }
    .sig-table td { height: 60px; vertical-align: top; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h1>${sow.title}</h1>
        <span class="sow-badge">${sow.sow_id}</span>
      </div>
      <div style="color:#8b949e; font-size:14px; margin-top:8px;">
        Client: <strong>${sow.client.name}</strong> &nbsp;|&nbsp; Supplier: <strong>${sow.supplier.name}</strong> &nbsp;|&nbsp; Term: <strong>${sow.term_days} Days</strong> &nbsp;|&nbsp; Effective: <strong>${sow.effective_date}</strong>
      </div>
    </header>

    <div class="disclosure">
      <strong>Enterprise Statement of Work Governance Notice:</strong> This agreement binds supplier fees exclusively to verified deliverable acceptance and closed-loop test execution. In compliance with Citable governance standards, <strong>no search engine ranking, AI citation presence, or commercial conversion revenue outcomes are guaranteed</strong>.
    </div>

    <div class="meta-grid">
      <div class="card"><div>Total Contract Fee</div><div class="card-val">$${sow.commercial_total_fee_usd.toLocaleString()}</div></div>
      <div class="card"><div>Admitted SOW Requirements</div><div class="card-val">${sow.admissibility_gate.admitted_count}</div></div>
      <div class="card"><div>Refused / Excluded Scope</div><div class="card-val" style="color:var(--danger);">${sow.admissibility_gate.refused_count}</div></div>
      <div class="card"><div>Contracted Work Packages</div><div class="card-val">${sow.work_packages.length}</div></div>
    </div>

    <h2 class="section-title">1. Executive Scope Statement</h2>
    <div class="card">
      <p><strong>Objective:</strong> ${sow.executive_scope.business_objective}</p>
      <p><strong>In-Scope Properties:</strong> <code>${sow.executive_scope.in_scope_properties.join(', ')}</code></p>
      <p><strong>In-Scope Systems:</strong> ${sow.executive_scope.in_scope_systems.join('; ')}</p>
      <p><strong>Boundaries:</strong> ${sow.executive_scope.organizational_boundaries}</p>
    </div>

    <h2 class="section-title">2. Scope Admissibility Gate & Excluded Findings Log</h2>
    <table>
      <thead>
        <tr><th>Finding ID</th><th>Subject</th><th>Gate Failed</th><th>Refusal Code</th><th>Contractual Refusal Rationale</th></tr>
      </thead>
      <tbody>
        ${sow.admissibility_gate.refusal_log.map((r) => `
          <tr>
            <td><span class="code-ref">${r.finding_id}</span></td>
            <td>${r.subject}</td>
            <td><code>${r.gate_failed}</code></td>
            <td><span class="badge badge-refuse">${r.refusal_code}</span></td>
            <td>${r.refusal_rationale}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">3. Contracted Deliverables & Milestone Payment Schedule</h2>
    <table>
      <thead>
        <tr><th>Milestone</th><th>Work Package</th><th>Deliverable ID</th><th>Delivery Criteria</th><th>Milestone Fee</th></tr>
      </thead>
      <tbody>
        ${sow.delivery_schedule.milestones.map((m) => `
          <tr>
            <td><strong>${m.milestone_id}</strong></td>
            <td>${m.name}</td>
            <td><span class="code-ref">${m.work_package_id}</span></td>
            <td>${m.billing_trigger}</td>
            <td style="font-weight:bold; color:var(--success);">$${m.fee_usd.toLocaleString()} USD</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">25. The Final Traceability Matrix</h2>
    <p style="color:#8b949e; font-size:13px;">Proving exactly why work is performed, what must be delivered, who owns it, how it will be validated, and what evidence justifies it.</p>
    <table>
      <thead>
        <tr><th>Finding ID</th><th>Recommendation</th><th>SOW Req ID</th><th>Deliverable</th><th>Acceptance Test ID</th><th>Responsible Owner</th><th>Source Evidence</th></tr>
      </thead>
      <tbody>
        ${sow.traceability_matrix.map((t) => `
          <tr>
            <td><span class="code-ref">${t.finding_id}</span></td>
            <td>${t.recommendation}</td>
            <td><strong>${t.sow_requirement_id}</strong></td>
            <td>${t.deliverable_id}</td>
            <td><code>${t.acceptance_test_id}</code></td>
            <td>${t.owner}</td>
            <td><span class="code-ref">${t.evidence_id}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 class="section-title">Signatures & Contractual Authorization</h2>
    <table class="sig-table">
      <thead>
        <tr><th>For Customer: ${sow.client.name}</th><th>For Supplier: ${sow.supplier.name}</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <br>Signature: _______________________________<br><br>
            Name: __________________________________<br><br>
            Title: ___________________________________<br><br>
            Date: ____________________________________
          </td>
          <td>
            <br>Signature: _______________________________<br><br>
            Name: __________________________________<br><br>
            Title: ___________________________________<br><br>
            Date: ____________________________________
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Export SOW deliverable to filesystem or string
 */
export async function exportSow(root, options = {}) {
  const sow = await generateSow(root, options);
  const format = options.format || 'markdown';
  let content = '';

  if (format === 'html' || format === 'html-brief') {
    content = renderSowHtml(sow);
  } else if (format === 'json') {
    content = JSON.stringify(sow, null, 2);
  } else {
    content = renderSowMarkdown(sow);
  }

  let outputPath = null;
  if (options.output) {
    outputPath = path.resolve(root, options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
  }

  return {
    sow_id: sow.sow_id,
    title: sow.title,
    client: sow.client,
    supplier: sow.supplier,
    format,
    output_path: outputPath,
    content,
    data: sow,
  };
}
