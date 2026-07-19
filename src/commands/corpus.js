import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../evidence/run.js';
import { readJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function percentile(values, percentileValue) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil((percentileValue / 100) * ordered.length) - 1];
}

function confusion(cases) {
  const result = { true_positive: 0, false_positive: 0, true_negative: 0, false_negative: 0, incomplete: 0 };
  for (const item of cases) {
    if (item.observed === 'incomplete') result.incomplete += 1;
    else if (item.expected === 'detection' && item.observed === 'detected') result.true_positive += 1;
    else if (item.expected === 'detection') result.false_negative += 1;
    else if (item.observed === 'detected') result.false_positive += 1;
    else result.true_negative += 1;
  }
  const evaluated = result.true_positive + result.false_positive + result.true_negative + result.false_negative;
  return {
    ...result,
    evaluated,
    precision: ratio(result.true_positive, result.true_positive + result.false_positive),
    recall: ratio(result.true_positive, result.true_positive + result.false_negative),
    false_positive_rate: ratio(result.false_positive, result.false_positive + result.true_negative),
    discovered_false_negative_rate: ratio(result.false_negative, result.true_positive + result.false_negative),
    incomplete_rate: ratio(result.incomplete, cases.length),
  };
}

export function evaluateCorpusData(corpus) {
  const check = validateAgainst('acceptance-corpus.schema.json', corpus);
  if (!check.valid) throw new Error(`acceptance corpus violates contract: ${check.errors.join('; ')}`);
  const propertyIds = new Set(corpus.properties.map((item) => item.property_id));
  const unknown = [
    ...corpus.detector_cases.map((item) => item.property_id),
    ...corpus.semantic_reviews.map((item) => item.property_id),
    ...corpus.executions.map((item) => item.property_id),
    ...corpus.remediation_verifications.map((item) => item.property_id),
  ].filter((id) => !propertyIds.has(id));
  if (unknown.length) throw new Error(`acceptance corpus references unknown properties: ${[...new Set(unknown)].join(', ')}`);
  const namespaces = {};
  for (const namespace of [...new Set(corpus.detector_cases.map((item) => item.namespace))].sort()) {
    namespaces[namespace] = confusion(corpus.detector_cases.filter((item) => item.namespace === namespace));
  }
  const reviewable = corpus.semantic_reviews.filter((item) => item.reviewer_verdicts.length >= 2);
  const agreeing = reviewable.filter((item) => new Set(item.reviewer_verdicts).size === 1).length;
  const executions = corpus.executions;
  const remediationComplete = corpus.remediation_verifications.filter((item) => item.status !== 'incomplete');
  return {
    corpus_id: corpus.corpus_id,
    version: corpus.version,
    population: {
      properties: corpus.properties.length,
      detector_cases: corpus.detector_cases.length,
      semantic_reviews: corpus.semantic_reviews.length,
      executions: executions.length,
      remediation_verifications: corpus.remediation_verifications.length,
    },
    detector_accuracy: { overall: confusion(corpus.detector_cases), by_namespace: namespaces },
    reviewer_metrics: {
      reviewable_items: reviewable.length,
      exact_agreement_items: agreeing,
      exact_agreement_rate: ratio(agreeing, reviewable.length),
      adjudicated_items: reviewable.filter((item) => item.adjudicated).length,
      adjudication_rate: ratio(reviewable.filter((item) => item.adjudicated).length, reviewable.length),
    },
    execution_metrics: {
      average_runtime_ms: ratio(executions.reduce((sum, item) => sum + item.runtime_ms, 0), executions.length),
      p95_runtime_ms: percentile(executions.map((item) => item.runtime_ms), 95),
      peak_memory_bytes: executions.length ? Math.max(...executions.map((item) => item.peak_memory_bytes)) : null,
      evidence_storage_bytes: executions.reduce((sum, item) => sum + item.evidence_bytes, 0),
      reproducibility_rate: ratio(executions.filter((item) => item.reproducible).length, executions.length),
      incomplete_evidence_rate: ratio(executions.filter((item) => item.incomplete).length, executions.length),
    },
    remediation_metrics: {
      evaluated: remediationComplete.length,
      verified: remediationComplete.filter((item) => item.status === 'verified').length,
      verification_success_rate: ratio(remediationComplete.filter((item) => item.status === 'verified').length, remediationComplete.length),
      incomplete: corpus.remediation_verifications.filter((item) => item.status === 'incomplete').length,
    },
    limitations: corpus.limitations,
  };
}

export function evaluateCorpus(root, { input }) {
  if (!input || !fs.existsSync(input)) throw new Error('corpus evaluate requires --input <json>');
  const raw = fs.readFileSync(input, 'utf8');
  const corpus = readJson(input);
  const metrics = evaluateCorpusData(corpus);
  const run = createRun(root, { command: 'corpus evaluate', argv: process.argv.slice(2), target: { kind: 'source', location: path.resolve(input), environment: 'local' } });
  run.addInput('acceptance_corpus', raw);
  run.writeArtifact('corpus.json', corpus);
  run.writeArtifact('accuracy-metrics.json', metrics);
  run.manifest.warnings.push('Metrics describe only the disclosed corpus population and do not establish performance on untested properties.');
  return { runId: run.runId, dir: run.finalize('completed'), metrics };
}
