import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../evidence/run.js';
import { canonicalJson } from '../release/governance.js';
import { nowIso, readJson, sha256, writeJson } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const PUBLICATION_LEVELS = new Set(['sanitized_artifacts', 'public_artifacts']);
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/i,
  /\b(?:ghp|github_pat|npm)_[A-Za-z0-9_]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,}]{8,}/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

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

function propertyRefs(corpus, propertyId) {
  const property = corpus.properties.find((item) => item.property_id === propertyId);
  const refs = [
    ...property.evidence_package_refs,
    property.authorization.evidence_ref,
    property.sanitization.evidence_ref,
  ];
  for (const item of corpus.detector_cases.filter((entry) => entry.property_id === propertyId)) refs.push(...item.evidence_refs);
  for (const item of corpus.semantic_reviews.filter((entry) => entry.property_id === propertyId)) refs.push(...item.evidence_refs, ...item.reviewer_assignment_refs, ...item.disagreement_refs);
  for (const item of corpus.executions.filter((entry) => entry.property_id === propertyId)) {
    refs.push(...item.raw_artifact_refs, ...item.deterministic_finding_refs, ...item.heuristic_finding_refs, ...item.reviewer_assignment_refs, ...item.disagreement_refs, ...item.exception_refs, ...item.intervention_refs, ...item.verification_refs, item.reproducibility_receipt_ref);
  }
  for (const item of corpus.remediation_verifications.filter((entry) => entry.property_id === propertyId)) refs.push(...item.evidence_refs);
  return [...new Set(refs.filter(Boolean))].sort();
}

function safeArtifactRef(ref) {
  return typeof ref === 'string' && ref.length > 0 && !path.isAbsolute(ref) && !ref.includes('\\') && !ref.split('/').includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

export function validateCorpusData(corpus, { forPublication = false, at = new Date() } = {}) {
  const check = validateAgainst('acceptance-corpus.schema.json', corpus);
  if (!check.valid) throw new Error(`acceptance corpus violates contract: ${check.errors.join('; ')}`);
  const propertyIds = new Set(corpus.properties.map((item) => item.property_id));
  if (propertyIds.size !== corpus.properties.length) throw new Error('acceptance corpus contains duplicate property ids');
  const unknown = [
    ...corpus.detector_cases.map((item) => item.property_id),
    ...corpus.semantic_reviews.map((item) => item.property_id),
    ...corpus.executions.map((item) => item.property_id),
    ...corpus.remediation_verifications.map((item) => item.property_id),
  ].filter((id) => !propertyIds.has(id));
  if (unknown.length) throw new Error(`acceptance corpus references unknown properties: ${[...new Set(unknown)].join(', ')}`);
  if (!corpus.properties.some((item) => item.intentionally_incomplete || ['observed', 'unresolved'].includes(item.contradiction_status))) {
    throw new Error('acceptance corpus requires at least one intentionally incomplete or contradictory property');
  }
  if (forPublication) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(JSON.stringify(corpus)))) throw new Error('public corpus contains credential or personal-data patterns');
    if (new Date(corpus.created_at) > at) throw new Error('public corpus creation timestamp is in the future');
    for (const property of corpus.properties) {
      if (!PUBLICATION_LEVELS.has(property.publication.level)) throw new Error(`${property.property_id} publication level ${property.publication.level} cannot enter a public corpus`);
      const requiredScopes = ['collect', 'retain', 'review', 'publish_artifacts'];
      const missingScopes = requiredScopes.filter((scope) => !property.authorization.scope.includes(scope));
      if (missingScopes.length) throw new Error(`${property.property_id} authorization lacks required scopes: ${missingScopes.join(', ')}`);
      if (property.authorization.expires_at && new Date(property.authorization.expires_at) <= at) throw new Error(`${property.property_id} owner authorization is expired`);
      if (!property.publication.approved_by || !property.publication.approved_at) throw new Error(`${property.property_id} lacks publication approval`);
      const sanitization = property.sanitization;
      if (!sanitization.reviewed_by || !sanitization.reviewed_at || !sanitization.evidence_ref || sanitization.pii_status === 'not_reviewed' || sanitization.credential_status === 'not_reviewed' || sanitization.source_identifiers === 'not_reviewed') throw new Error(`${property.property_id} lacks completed sanitization review`);
      const futureEvents = [property.authorization.authorized_at, property.publication.approved_at, sanitization.reviewed_at, ...property.collection_methods.map((item) => item.collected_at)].filter((timestamp) => new Date(timestamp) > at);
      if (futureEvents.length) throw new Error(`${property.property_id} contains future-dated authorization, collection, sanitization, or approval evidence`);
      const refs = propertyRefs(corpus, property.property_id);
      const unsafe = [...new Set([...refs, ...property.publication.allowed_artifact_refs].filter((ref) => !safeArtifactRef(ref)))];
      if (unsafe.length) throw new Error(`${property.property_id} contains unsafe artifact references: ${unsafe.join(', ')}`);
      const allowed = new Set(property.publication.allowed_artifact_refs);
      const unapproved = refs.filter((ref) => !allowed.has(ref));
      if (unapproved.length) throw new Error(`${property.property_id} contains artifact references not approved for publication: ${unapproved.join(', ')}`);
    }
  }
  return { valid: true, property_ids: [...propertyIds], publishable: forPublication };
}

export function evaluateCorpusData(corpus) {
  validateCorpusData(corpus);
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
    false_negative_discovery_limitations: corpus.false_negative_discovery_limitations,
    causal_limitations: corpus.causal_limitations,
    limitations: corpus.limitations,
  };
}

export function publishCorpus(root, { input, output, at = nowIso() }) {
  if (!input || !fs.existsSync(input)) throw new Error('corpus publish requires --input <json>');
  if (!output) throw new Error('corpus publish requires --output <json>');
  if (fs.existsSync(output)) throw new Error(`corpus publish refuses to overwrite ${output}`);
  const raw = fs.readFileSync(input, 'utf8');
  const corpus = readJson(input);
  validateCorpusData(corpus, { forPublication: true, at: new Date(at) });
  const published = `${JSON.stringify(corpus, null, 2)}\n`;
  writeJson(output, corpus);
  const receipt = {
    schema_version: 1,
    receipt_id: `CORPUS-PUBLICATION-${sha256(`${corpus.corpus_id}:${sha256(published)}:${at}`).slice(0, 20).toUpperCase()}`,
    corpus_id: corpus.corpus_id,
    corpus_version: corpus.version,
    source_hash: sha256(raw),
    published_hash: sha256(published),
    property_ids: corpus.properties.map((item) => item.property_id).sort(),
    publication_levels: [...new Set(corpus.properties.map((item) => item.publication.level))].sort(),
    generated_at: at,
    authority: 'owner_authorized_publication_projection',
    limitations: [
      'Publication receipt records publisher-controlled approval and projection integrity, not independent validation.',
      'Automated pattern checks supplement but do not replace the recorded human sanitization review.',
    ],
  };
  receipt.receipt_hash = sha256(canonicalJson(receipt));
  const receiptCheck = validateAgainst('corpus-publication-receipt.schema.json', receipt);
  if (!receiptCheck.valid) throw new Error(`corpus publication receipt violates contract: ${receiptCheck.errors.join('; ')}`);
  const receiptFile = `${output}.receipt.json`;
  writeJson(receiptFile, receipt);
  const run = createRun(root, { command: 'corpus publish', argv: process.argv.slice(2), target: { kind: 'source', location: path.resolve(input), environment: 'local' } });
  run.addInput('acceptance_corpus', raw);
  run.writeArtifact('published-corpus.json', corpus);
  run.writeArtifact('publication-receipt.json', receipt);
  run.manifest.warnings.push('Publication is owner-authorized and sanitization-reviewed but is not independently attested.');
  return { runId: run.runId, dir: run.finalize('completed'), output, receiptFile, receipt };
}

export function verifyCorpusPublicationReceipt(receipt, publishedCorpus) {
  const check = validateAgainst('corpus-publication-receipt.schema.json', receipt);
  const failures = check.valid ? [] : [...check.errors];
  const { receipt_hash: ignored, ...unsigned } = receipt;
  if (receipt.receipt_hash !== sha256(canonicalJson(unsigned))) failures.push('publication receipt hash is inconsistent');
  const published = typeof publishedCorpus === 'string' ? publishedCorpus : `${JSON.stringify(publishedCorpus, null, 2)}\n`;
  if (receipt.published_hash !== sha256(published)) failures.push('published corpus hash is inconsistent');
  return { valid: failures.length === 0, failures };
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
