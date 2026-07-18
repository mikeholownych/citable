import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { loadRegistries, saveRegistry } from '../registries/index.js';
import { envelope, observationRun } from '../observations/common.js';
import { parseRefDate, readJson, readYaml } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function inputDocument(file) {
  if (!file) throw new Error('--input <file> is required');
  if (!fs.existsSync(file)) throw new Error(`input not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv') return { raw, rows: parseCsv(raw, { columns: true, skip_empty_lines: true, trim: true }), file: path.resolve(file) };
  const value = ext === '.yaml' || ext === '.yml' ? readYaml(file) : readJson(file);
  return { raw, rows: Array.isArray(value) ? value : value.rows || value.entries || [value], file: path.resolve(file) };
}

function numericValue(raw, type, rowNumber) {
  if (raw === '' || raw == null) throw new Error(`row ${rowNumber}: value is required`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`row ${rowNumber}: value must be numeric`);
  if (type === 'integer' && !Number.isInteger(value)) throw new Error(`row ${rowNumber}: value must be an integer`);
  return value;
}

function isoTime(raw, field, rowNumber) {
  if (!raw || Number.isNaN(new Date(raw).getTime())) throw new Error(`row ${rowNumber}: ${field} must be a valid date-time`);
  return new Date(raw).toISOString();
}

export function importMetrics(root, { input, provider }) {
  if (!provider) throw new Error('metrics import requires --provider <name>');
  const source = inputDocument(input);
  if (!source.rows.length) throw new Error('metric import contains no rows');
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const definitions = new Map(registries.metrics.entries.map((metric) => [metric.metric_id, metric]));
  const observations = source.rows.map((row, index) => {
    const rowNumber = index + 1;
    const metric = definitions.get(row.metric_id);
    if (!metric) throw new Error(`row ${rowNumber}: unknown metric_id ${row.metric_id || '(missing)'}`);
    if (metric.status === 'deprecated') throw new Error(`row ${rowNumber}: metric ${metric.metric_id} is deprecated`);
    if (metric.provider.toLowerCase() !== String(provider).toLowerCase()) {
      throw new Error(`row ${rowNumber}: metric ${metric.metric_id} belongs to ${metric.provider}, not ${provider}`);
    }
    const observedAt = isoTime(row.observed_at || row.date, 'observed_at', rowNumber);
    const dimensions = {};
    for (const dimension of metric.dimensions) {
      if (row[dimension] != null && row[dimension] !== '') dimensions[dimension] = String(row[dimension]);
    }
    const data = {
      metric_id: metric.metric_id,
      provider: metric.provider,
      external_name: metric.external_name,
      value: numericValue(row.value, metric.value_type, rowNumber),
      unit: metric.unit === 'custom' ? metric.custom_unit : metric.unit,
      aggregation: metric.aggregation,
      observed_at: observedAt,
      period_start: row.period_start ? isoTime(row.period_start, 'period_start', rowNumber) : observedAt,
      period_end: row.period_end ? isoTime(row.period_end, 'period_end', rowNumber) : observedAt,
      dimensions,
      source_row: rowNumber,
    };
    if (new Date(data.period_start) > new Date(data.period_end)) throw new Error(`row ${rowNumber}: period_start is after period_end`);
    return envelope('metric', data, {
      method: 'owner_import',
      source: source.file,
      raw: JSON.stringify(row),
      limitations: metric.limitations,
    });
  });
  return observationRun(root, 'metrics import', source.file, observations, { rawInputs: { metric_import: source.raw } });
}

function readObjectiveInput(input) {
  const document = inputDocument(input);
  if (document.rows.length !== 1) throw new Error('objectives init requires exactly one objective');
  return document.rows[0];
}

export function initializeObjective(root, { input, write = false }) {
  const objective = readObjectiveInput(input);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const candidate = { ...registries.objectives, entries: [...registries.objectives.entries, objective] };
  const check = validateAgainst('objective.schema.json', candidate);
  if (!check.valid) throw new Error(`objective violates contract: ${check.errors.join('; ')}`);
  if (registries.objectives.entries.some((item) => item.objective_id === objective.objective_id)) throw new Error(`objective ${objective.objective_id} already exists`);
  const metricIds = new Set(registries.metrics.entries.map((item) => item.metric_id));
  const refs = [...objective.primary_metrics, ...objective.supporting_metrics, ...objective.guardrails.map((item) => item.metric_id)];
  const unknown = [...new Set(refs.filter((ref) => !metricIds.has(ref)))];
  if (unknown.length) throw new Error(`objective references unknown metrics: ${unknown.join(', ')}`);
  if (write) saveRegistry(root, 'objectives', candidate);
  return { objective, written: write, file: path.join(root, '.citable', 'objectives.yaml') };
}

export function validateObjectives(root) {
  const { registries, problems } = loadRegistries(root);
  const objectiveProblems = problems.filter((problem) => problem.startsWith('objectives/') || problem.startsWith('objectives.yaml'));
  return { ok: objectiveProblems.length === 0, problems: objectiveProblems, count: registries.objectives.entries.length };
}

function metricObservations(root) {
  const runs = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runs)) return [];
  const items = [];
  for (const run of fs.readdirSync(runs)) {
    const dir = path.join(runs, run, 'observations');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('-metric.json'))) {
      const item = readJson(path.join(dir, file));
      if (item.kind === 'metric') items.push(item);
    }
  }
  return [...new Map(items.map((item) => [item.evidence_hash, item])).values()];
}

function inCohort(data, cohort) {
  const url = data.dimensions.url || data.dimensions.page || null;
  const query = data.dimensions.query || null;
  const labels = String(data.dimensions.labels || data.dimensions.label || '').split(',').map((label) => label.trim()).filter(Boolean);
  const urlMatch = !cohort.urls.length || (url && cohort.urls.some((pattern) => pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern));
  const queryMatch = !cohort.queries.length || (query && cohort.queries.includes(query));
  const labelMatch = !cohort.labels.length || cohort.labels.some((label) => labels.includes(label));
  return urlMatch && queryMatch && labelMatch;
}

function aggregate(values, method) {
  if (!values.length) return null;
  if (method === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (method === 'minimum') return Math.min(...values);
  if (method === 'maximum') return Math.max(...values);
  if (method === 'latest') return values.at(-1);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateGuardrail(guardrail, metric, definition) {
  if (metric.state !== 'observed') return { ...guardrail, state: 'inconclusive', passed: null, reason: 'metric comparison is inconclusive' };
  let passed;
  if (guardrail.operator === 'gte') passed = metric.evaluation >= guardrail.threshold;
  else if (guardrail.operator === 'lte') passed = metric.evaluation <= guardrail.threshold;
  else if (guardrail.operator === 'increase_by') passed = metric.relative_change != null && metric.relative_change >= guardrail.threshold;
  else if (guardrail.operator === 'decrease_by') passed = metric.relative_change != null && metric.relative_change <= -guardrail.threshold;
  else if (definition.direction === 'increase') passed = metric.evaluation >= metric.baseline;
  else if (definition.direction === 'decrease') passed = metric.evaluation <= metric.baseline;
  else if (definition.direction === 'maintain') passed = metric.relative_change != null && Math.abs(metric.relative_change) <= guardrail.threshold;
  else return { ...guardrail, state: 'inconclusive', passed: null, reason: 'contextual metric requires a user-defined directional guardrail' };
  return { ...guardrail, state: 'observed', passed, reason: passed ? 'observed condition met' : 'observed condition not met' };
}

export function evaluateObjective(root, { objectiveId, refDate }) {
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const objective = objectiveId ? registries.objectives.entries.find((item) => item.objective_id === objectiveId) : registries.objectives.entries[0];
  if (!objective) throw new Error(objectiveId ? `objective not found: ${objectiveId}` : 'no objective configured');
  const definitions = new Map(registries.metrics.entries.map((item) => [item.metric_id, item]));
  const end = parseRefDate(refDate);
  end.setUTCHours(23, 59, 59, 999);
  const evaluationStart = new Date(end); evaluationStart.setUTCDate(evaluationStart.getUTCDate() - objective.comparison.evaluation_days + 1); evaluationStart.setUTCHours(0, 0, 0, 0);
  const baselineEnd = new Date(evaluationStart.getTime() - 1);
  const baselineStart = new Date(baselineEnd); baselineStart.setUTCDate(baselineStart.getUTCDate() - objective.comparison.baseline_days + 1); baselineStart.setUTCHours(0, 0, 0, 0);
  const all = metricObservations(root).filter((item) => inCohort(item.data, objective.cohort));
  const metricIds = [...new Set([...objective.primary_metrics, ...objective.supporting_metrics, ...objective.guardrails.map((item) => item.metric_id)])];
  const metrics = metricIds.map((metricId) => {
    const definition = definitions.get(metricId);
    const observations = all.filter((item) => item.data.metric_id === metricId).sort((a, b) => a.data.observed_at.localeCompare(b.data.observed_at));
    const baselineRows = observations.filter((item) => new Date(item.data.observed_at) >= baselineStart && new Date(item.data.observed_at) <= baselineEnd);
    const evaluationRows = observations.filter((item) => new Date(item.data.observed_at) >= evaluationStart && new Date(item.data.observed_at) <= end);
    const aggregatable = definition.aggregation !== 'provider_defined';
    const enough = aggregatable && baselineRows.length >= objective.comparison.minimum_observations && evaluationRows.length >= objective.comparison.minimum_observations;
    const baseline = enough ? aggregate(baselineRows.map((item) => item.data.value), definition.aggregation) : null;
    const evaluation = enough ? aggregate(evaluationRows.map((item) => item.data.value), definition.aggregation) : null;
    return {
      metric_id: metricId,
      provider: definition.provider,
      state: enough ? 'observed' : 'inconclusive',
      baseline,
      evaluation,
      absolute_change: enough ? evaluation - baseline : null,
      relative_change: enough && baseline !== 0 ? (evaluation - baseline) / Math.abs(baseline) : null,
      baseline_observations: baselineRows.length,
      evaluation_observations: evaluationRows.length,
      limitations: [
        ...definition.limitations,
        ...(!aggregatable ? ['provider_defined aggregation requires an explicit normalized aggregation before evaluation'] : []),
        ...(aggregatable && !enough ? [`requires at least ${objective.comparison.minimum_observations} observations in each window`] : []),
      ],
    };
  });
  const guardrails = objective.guardrails.map((guardrail) => {
    const metric = metrics.find((item) => item.metric_id === guardrail.metric_id);
    return evaluateGuardrail(guardrail, metric, definitions.get(guardrail.metric_id));
  });
  return {
    objective_id: objective.objective_id,
    objective_name: objective.name,
    windows: { baseline_start: baselineStart.toISOString(), baseline_end: baselineEnd.toISOString(), evaluation_start: evaluationStart.toISOString(), evaluation_end: end.toISOString() },
    metrics,
    guardrails,
    guardrail_status: guardrails.some((item) => item.state === 'inconclusive') ? 'inconclusive' : guardrails.some((item) => !item.passed) ? 'not_met' : 'met',
    status: metrics.every((metric) => metric.state === 'observed') ? 'observed' : 'inconclusive',
    interpretation: 'Changes are temporal associations. This evaluation does not establish that an intervention caused an observed outcome.',
  };
}
