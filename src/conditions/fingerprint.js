import crypto from 'node:crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function normalizeFunctionSource(fn) {
  if (!fn) return '';
  const str = typeof fn === 'function' ? fn.toString() : String(fn);
  return str
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a deterministic semantic fingerprint over check logic, thresholds,
 * and output shape (B-021 invariant).
 */
export function computeSemanticFingerprint(detectorOrCondition) {
  const d = detectorOrCondition;
  if (!d) throw new Error('Cannot fingerprint null or undefined condition');

  const checkSource = normalizeFunctionSource(d.check);
  const outputShape = {
    applicable_requirement: d.applicable_requirement || null,
    confidence_model: d.confidence_model || null,
    coverage_requirement: d.coverage_requirement || null,
    deterministic: Boolean(d.deterministic),
    discipline: Array.isArray(d.discipline) ? [...d.discipline].sort() : [],
    finding_type: d.finding_type || null,
    impact: d.impact ? Object.keys(d.impact).sort().reduce((acc, k) => { acc[k] = d.impact[k]; return acc; }, {}) : {},
    namespace: d.namespace || (d.id ? d.id.split('-')[0] : null),
    remediation: d.remediation || null,
    severity: d.severity || null,
    verification: d.verification || null,
  };

  const payload = {
    check_source: checkSource,
    condition_id: d.condition_id || d.id,
    output_shape: outputShape,
    thresholds: d.thresholds || null,
  };

  return sha256(canonicalJson(payload));
}
