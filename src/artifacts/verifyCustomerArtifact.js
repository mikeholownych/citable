import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

export class CustomerArtifactVerificationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'CustomerArtifactVerificationError';
    this.errors = errors;
  }
}

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /on(?:load|error|click|mouseover|focus|blur|submit)\s*=/i,
  /<iframe\b[^>]*>/i,
  /<object\b[^>]*>/i,
  /<embed\b[^>]*>/i,
];

function scanForInjections(value, pathPrefix = '', found = []) {
  if (typeof value === 'string') {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        found.push(`Potential unescaped script/event injection at ${pathPrefix}: "${value.slice(0, 80)}"`);
        break;
      }
    }
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanForInjections(value[i], `${pathPrefix}[${i}]`, found);
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      scanForInjections(v, pathPrefix ? `${pathPrefix}.${k}` : k, found);
    }
  }
  return found;
}

/**
 * Identify artifact type and validate customer artifact against schema,
 * epistemic invariants, arithmetic integrity, and injection hazards.
 */
export async function verifyCustomerArtifact(artifactPathOrData, options = {}) {
  const { failClosed = false, contractual = false } = options;
  const errors = [];
  const warnings = [];

  let rawContent = null;
  let data = null;
  let format = 'json';
  let artifactPath = null;

  if (typeof artifactPathOrData === 'string') {
    if (fs.existsSync(artifactPathOrData)) {
      artifactPath = artifactPathOrData;
      rawContent = fs.readFileSync(artifactPathOrData, 'utf8');
      const ext = path.extname(artifactPathOrData).toLowerCase();
      if (ext === '.html' || ext === '.htm') {
        format = 'html';
      } else if (ext === '.md' || ext === '.markdown') {
        format = 'markdown';
      } else {
        try {
          data = JSON.parse(rawContent);
          format = 'json';
        } catch (e) {
          errors.push(`Failed to parse JSON file ${artifactPathOrData}: ${e.message}`);
        }
      }
    } else {
      // String content passed directly
      rawContent = artifactPathOrData;
      if (rawContent.trim().startsWith('{')) {
        try {
          data = JSON.parse(rawContent);
          format = 'json';
        } catch {
          format = 'text';
        }
      } else if (rawContent.includes('<!DOCTYPE html>') || rawContent.includes('<html')) {
        format = 'html';
      } else {
        format = 'markdown';
      }
    }
  } else if (typeof artifactPathOrData === 'object' && artifactPathOrData !== null) {
    data = artifactPathOrData;
    format = 'json';
  } else {
    errors.push('Invalid artifact input: must be file path, string content, or JSON object');
  }

  if (errors.length > 0) {
    if (failClosed) throw new CustomerArtifactVerificationError(errors.join('; '), errors);
    return { valid: false, artifact_type: 'UNKNOWN', format, errors, warnings };
  }

  let artifactType = 'UNKNOWN';

  // 1. JSON Verification
  if (format === 'json' && data) {
    // Detect artifact type
    if (data.sow_id || data.traceability_matrix || (data.$schema && data.$schema.includes('sow'))) {
      artifactType = 'SOW';
    } else if (data.fact_status === 'enterprise_search_executive_report' || data.overall_visibility_score !== undefined) {
      artifactType = 'SEARCH_REPORT';
    } else if (data.fact_status === 'enterprise_cro_executive_report' || data.overall_conversion_readiness !== undefined) {
      artifactType = 'CRO_REPORT';
    }

    // Schema validation
    if (artifactType === 'SOW') {
      const val = validateAgainst('sow.schema.json', data);
      if (!val.valid) {
        errors.push(...val.errors.map((e) => `SOW schema violation: ${e}`));
      }

      // Check commercial arithmetic
      if (typeof data.commercial_total_fee_minor === 'number' && typeof data.commercial_total_fee_usd === 'number') {
        if (data.commercial_total_fee_minor !== Math.round(data.commercial_total_fee_usd * 100)) {
          errors.push(`SOW commercial fee mismatch: minor ${data.commercial_total_fee_minor} != usd ${data.commercial_total_fee_usd}`);
        }
      }

      // Milestones check
      if (data.delivery_schedule?.milestones) {
        const minorSum = data.delivery_schedule.milestones.reduce((acc, m) => acc + (m.fee_minor || 0), 0);
        if (data.commercial_total_fee_minor !== undefined && minorSum !== data.commercial_total_fee_minor) {
          errors.push(`SOW milestone fees sum (${minorSum}) does not match total fee (${data.commercial_total_fee_minor})`);
        }
      }

      // Admissibility gate balance
      if (data.admissibility_gate) {
        const { total_findings_evaluated, admitted_count, refused_count } = data.admissibility_gate;
        if (total_findings_evaluated !== admitted_count + refused_count) {
          errors.push(`SOW admissibility numbers do not balance: ${total_findings_evaluated} != ${admitted_count} + ${refused_count}`);
        }
      }

      // Contractual mode checks
      const isContractual = data.generation_mode === 'CONTRACTUAL' || contractual;
      if (isContractual) {
        if (data.synthetic_evidence) {
          errors.push('Contractual SOW cannot contain synthetic_evidence');
        }
        if (data.traceability_matrix) {
          for (const row of data.traceability_matrix) {
            if (row.owner_source === 'built_in_template_default') {
              errors.push(`Contractual SOW requirement ${row.sow_requirement_id} relies on unverified built_in_template_default owner`);
            }
          }
        }
      }

      // Injection scan on user fields
      const injections = scanForInjections({
        client: data.client,
        title: data.title,
        traceability_matrix: data.traceability_matrix,
        refusal_log: data.admissibility_gate?.refusal_log,
      });
      errors.push(...injections);

    } else if (artifactType === 'SEARCH_REPORT') {
      const val = validateAgainst('search-report.schema.json', data);
      if (!val.valid) {
        errors.push(...val.errors.map((e) => `Search report schema violation: ${e}`));
      }

      if (data.pillars && Object.keys(data.pillars).length < 19) {
        errors.push(`Search report must contain all 19 enterprise pillars, found ${Object.keys(data.pillars).length}`);
      }

      // Scan for dangerous injection in titles, client, target
      const injections = scanForInjections({
        client_name: data.client_name,
        target_domain: data.target_domain,
        decision_summary: data.decision_summary,
      });
      errors.push(...injections);

    } else if (artifactType === 'CRO_REPORT') {
      const val = validateAgainst('cro-report.schema.json', data);
      if (!val.valid) {
        errors.push(...val.errors.map((e) => `CRO report schema violation: ${e}`));
      }

      if (data.pillars && Object.keys(data.pillars).length < 25) {
        errors.push(`CRO report must contain all 25 enterprise pillars, found ${Object.keys(data.pillars).length}`);
      }

      // Scan for injection
      const injections = scanForInjections({
        client_name: data.client_name,
        target_domain: data.target_domain,
        decision_summary: data.decision_summary,
      });
      errors.push(...injections);

    } else {
      errors.push('Unrecognized customer artifact structure');
    }

  } else if (format === 'html' || format === 'markdown') {
    // HTML or Markdown scan
    const content = rawContent || '';

    // Check for malicious unescaped scripts
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`Artifact contains forbidden unescaped script or event handler: ${pattern}`);
        break;
      }
    }

    // Check governance disclaimers
    if (content.includes('Statement of Work') || content.includes('SOW-')) {
      artifactType = 'SOW';
      if (!content.includes('guaranteed') && !content.includes('traceability')) {
        warnings.push('SOW document lacks standard non-guarantee governance disclosure');
      }
    } else if (content.includes('Conversion Rate Optimization') || content.includes('CRO')) {
      artifactType = 'CRO_REPORT';
      if (!content.includes('guaranteed') && !content.includes('Scientific Epistemology')) {
        warnings.push('CRO report lacks standard scientific epistemology disclaimer');
      }
    } else if (content.includes('Search Intelligence') || content.includes('SEO')) {
      artifactType = 'SEARCH_REPORT';
      if (!content.includes('guaranteed') && !content.includes('Governance Notice')) {
        warnings.push('Search report lacks standard non-guarantee disclosure');
      }
    }
  }

  const valid = errors.length === 0;
  if (!valid && failClosed) {
    throw new CustomerArtifactVerificationError(`Artifact verification failed: ${errors.join('; ')}`, errors);
  }

  return {
    valid,
    artifact_type: artifactType,
    format,
    generation_mode: data?.generation_mode || data?.generation_provenance?.generation_mode || 'UNKNOWN',
    errors,
    warnings,
    provenance: data?.generation_provenance || null,
    summary: valid
      ? `Artifact verified successfully (${artifactType} - ${format})`
      : `Artifact verification failed (${artifactType} - ${format}): ${errors.length} error(s)`,
  };
}

/**
 * CLI command entry point
 */
export async function verifyCustomerArtifactCommand(filePath, args = [], root = process.cwd()) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  if (!fs.existsSync(fullPath)) {
    return {
      command: 'artifacts verify-customer',
      file: filePath,
      valid: false,
      errors: [`File not found: ${fullPath}`],
      message: `Artifact verification error: file not found: ${fullPath}`,
    };
  }

  const result = await verifyCustomerArtifact(fullPath);
  return {
    command: 'artifacts verify-customer',
    file: filePath,
    ...result,
    message: result.valid
      ? `SUCCESS: Artifact ${filePath} verified successfully (${result.artifact_type}, format: ${result.format}).`
      : `FAILED: Artifact ${filePath} failed verification:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`,
  };
}
