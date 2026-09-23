import { canonicalEvidenceJson, createEvidenceHashes } from './hashes.js';
import { sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const OBSERVATION_SCHEMA = 'external-observation.schema.json';
const DATASET_SCHEMA = 'research-dataset.schema.json';
const DERIVATION_SCHEMA = 'derivation.schema.json';
const CLAIM_SCHEMA = 'claim-evidence.schema.json';
const COMPARISON_SCHEMA = 'external-comparison.schema.json';
const VERIFICATION_SCHEMA = 'claim-verification.schema.json';

function without(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function integrity(value, key) {
  return sha256(canonicalEvidenceJson(without(value, key)));
}

function validate(schema, value, label) {
  const result = validateAgainst(schema, value);
  if (!result.valid) throw new Error(`${label} violates contract: ${result.errors.join('; ')}`);
  return value;
}

export function createExternalObservation(input) {
  const item = { ...input };
  item.evidence_hash = integrity(item, 'evidence_hash');
  return validate(OBSERVATION_SCHEMA, item, 'external observation');
}

export function verifyExternalObservation(item) {
  const failures = [];
  const check = validateAgainst(OBSERVATION_SCHEMA, item);
  if (!check.valid) failures.push(...check.errors);
  if (item?.evidence_hash !== integrity(item || {}, 'evidence_hash')) failures.push('evidence hash is inconsistent');
  return { valid: failures.length === 0, failures };
}

export function createResearchDataset(input, { previous = null } = {}) {
  const item = { ...input };
  item.dataset_hash = integrity(item, 'dataset_hash');
  validate(DATASET_SCHEMA, item, 'research dataset');
  if (previous && previous.dataset_id === item.dataset_id && previous.dataset_version === item.dataset_version
    && previous.dataset_hash !== item.dataset_hash) {
    throw new Error('research dataset version is immutable; create a new dataset_version');
  }
  return item;
}

export function verifyResearchDataset(item, { previous = null } = {}) {
  const failures = [];
  const check = validateAgainst(DATASET_SCHEMA, item);
  if (!check.valid) failures.push(...check.errors);
  if (item?.dataset_hash !== integrity(item || {}, 'dataset_hash')) failures.push('dataset hash is inconsistent');
  if (previous && previous.dataset_id === item?.dataset_id && previous.dataset_version === item?.dataset_version
    && previous.dataset_hash !== item?.dataset_hash) failures.push('research dataset version is immutable');
  if (failures.length) throw new Error(`research dataset verification failed: ${failures.join('; ')}`);
  return { valid: true, failures: [] };
}

export function createDerivation(input) {
  const item = { ...input };
  item.derivation_hash = integrity(item, 'derivation_hash');
  return validate(DERIVATION_SCHEMA, item, 'derivation');
}

function verifyDerivation(item) {
  const check = validateAgainst(DERIVATION_SCHEMA, item);
  if (!check.valid || item.derivation_hash !== integrity(item, 'derivation_hash')) return false;
  return true;
}

export function createEvidenceClaim(input) {
  const item = { ...input };
  item.claim_hash = integrity(item, 'claim_hash');
  return validate(CLAIM_SCHEMA, item, 'claim evidence');
}

function verifyClaimIdentity(item) {
  const check = validateAgainst(CLAIM_SCHEMA, item);
  return check.valid && item.claim_hash === integrity(item, 'claim_hash');
}

function valueAt(object, path) {
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function reason(code, message) {
  return { code, message };
}

function evaluatePredicate(assertion, observations) {
  if (!observations.length) return { status: 'NOT_OBSERVED', reasons: [reason('observation_missing', 'No referenced observation was available.')] };
  const results = observations.map((item) => valueAt(item, assertion.path) === assertion.value);
  if (results.every(Boolean)) return { status: 'SUPPORTED', reasons: [] };
  if (results.some(Boolean)) return { status: 'PARTIALLY_SUPPORTED', reasons: [reason('predicate_partial', 'The predicate matched only part of the referenced population.')] };
  return { status: 'CONTRADICTED', reasons: [reason('predicate_contradicted', 'In-scope evidence establishes an incompatible predicate value.')] };
}

function evaluateAssertion(assertion, observations, derivations) {
  if (!assertion || typeof assertion !== 'object') return { status: 'INDETERMINATE', reasons: [reason('assertion_missing', 'The claim has no structured assertion.')] };
  if (assertion.type === 'predicate' || assertion.type === 'all') return evaluatePredicate(assertion, observations);
  if (assertion.type === 'count') {
    const derivation = derivations[0];
    if (!derivation || !verifyDerivation(derivation)) return { status: 'INDETERMINATE', reasons: [reason('derivation_unavailable', 'The referenced derivation is missing or unverifiable.')] };
    if (derivation.result?.count === assertion.expected) return { status: 'SUPPORTED', reasons: [] };
    return { status: 'CONTRADICTED', reasons: [reason('count_contradicted', 'The preserved derivation result differs from the claimed value.')] };
  }
  if (assertion.type === 'compound') {
    const results = (assertion.assertions || []).map((part) => evaluateAssertion(part, observations, derivations));
    if (!results.length) return { status: 'INDETERMINATE', reasons: [reason('compound_empty', 'The compound claim has no components.')] };
    const reasons = results.flatMap((item) => item.reasons);
    if (results.every((item) => item.status === 'SUPPORTED')) return { status: 'SUPPORTED', reasons };
    if (results.some((item) => item.status === 'CONTRADICTED')) return { status: 'PARTIALLY_SUPPORTED', reasons: [...reasons, reason('compound_component_unsupported', 'At least one compound component is contradicted.')] };
    if (results.some((item) => item.status === 'SUPPORTED')) return { status: 'PARTIALLY_SUPPORTED', reasons: [...reasons, reason('compound_component_unsupported', 'At least one compound component is unsupported.')] };
    return { status: results.some((item) => item.status === 'NOT_OBSERVED') ? 'NOT_OBSERVED' : 'UNSUPPORTED', reasons };
  }
  return { status: 'INDETERMINATE', reasons: [reason('assertion_unsupported', `Assertion type ${assertion.type || 'unknown'} is not supported.`)] };
}

function scopeSupport(claim, datasets, observations) {
  const scope = claim.declared_scope;
  if (scope.generalization === 'universal') return { status: 'UNSUPPORTED', reasons: [reason('generalization_outside_population', 'The evidence population does not support a universal claim.')] };
  if (scope.type === 'observation' && scope.observation_reference
    && !(claim.observation_references || []).includes(scope.observation_reference)) {
    return { status: 'INDETERMINATE', reasons: [reason('scope_reference_mismatch', 'The declared observation scope is not among the claim evidence references.')] };
  }
  if (scope.type === 'dataset' && scope.dataset_reference
    && !(claim.dataset_references || []).includes(scope.dataset_reference)) {
    return { status: 'INDETERMINATE', reasons: [reason('scope_reference_mismatch', 'The declared dataset scope is not among the claim evidence references.')] };
  }
  if (scope.type === 'dataset') {
    const dataset = datasets[0];
    if (!dataset || !verifyDatasetSafe(dataset)) return { status: 'INDETERMINATE', reasons: [reason('dataset_unavailable', 'The declared dataset is missing or unverifiable.')] };
    if (dataset.coverage_status !== 'complete_for_declared_population') return { status: 'PARTIALLY_SUPPORTED', reasons: [reason('dataset_coverage_incomplete', `Dataset coverage is ${dataset.coverage_status}, not complete for the declared population.`)] };
    const referenced = new Set(claim.observation_references || []);
    const missingMembers = (dataset.observation_references || []).filter((id) => !referenced.has(id));
    if (missingMembers.length) return { status: 'PARTIALLY_SUPPORTED', reasons: [reason('dataset_members_missing', `The claim does not reference every observation in the declared dataset: ${missingMembers.join(', ')}`)] };
  }
  if (!observations.length) return { status: 'NOT_OBSERVED', reasons: [reason('observation_missing', 'The declared scope has no observed members.')] };
  return { status: 'SUPPORTED', reasons: [] };
}

function verifyDatasetSafe(dataset) {
  try { return verifyResearchDataset(dataset).valid; } catch { return false; }
}

function datasetReference(dataset) {
  return `${dataset.dataset_id}@${dataset.dataset_version}`;
}

function resolveDatasetReference(reference, datasets) {
  const exact = datasets.filter((item) => datasetReference(item) === reference);
  if (exact.length === 1) return exact[0];
  // Legacy id-only references remain valid only while the id has one version.
  // Once versions diverge, silently selecting one would rewrite historical
  // claim meaning.
  if (!String(reference).includes('@')) {
    const byId = datasets.filter((item) => item.dataset_id === reference);
    return byId.length === 1 ? byId[0] : null;
  }
  return null;
}

function combine(proposition, scope) {
  if (proposition.status === 'NOT_OBSERVED') return 'NOT_OBSERVED';
  if (proposition.status === 'INDETERMINATE' || scope.status === 'INDETERMINATE') return 'INDETERMINATE';
  if (proposition.status === 'CONTRADICTED') return 'CONTRADICTED';
  if (proposition.status === 'PARTIALLY_SUPPORTED' || scope.status === 'PARTIALLY_SUPPORTED' || scope.status === 'UNSUPPORTED') return 'PARTIALLY_SUPPORTED';
  if (proposition.status === 'UNSUPPORTED') return 'UNSUPPORTED';
  return 'SUPPORTED';
}

export function verifyClaim(claim, { observations = [], datasets = [], derivations = [] } = {}) {
  if (!verifyClaimIdentity(claim)) {
    return {
      claim_id: claim?.claim_id || 'unknown', claim_version: claim?.claim_version || 1,
      overall: 'INDETERMINATE', proposition_support: 'INDETERMINATE', scope_support: 'INDETERMINATE',
      reasons: [reason('claim_unverifiable', 'Claim identity, schema, or integrity hash could not be verified.')],
      lineage: { claim_reference: claim?.claim_id || 'unknown', observation_references: claim?.observation_references || [], dataset_references: claim?.dataset_references || [], derivation_references: claim?.derivation_references || [] }, limitations: ['Claim evidence could not be verified.'],
    };
  }
  const byId = new Map(observations.map((item) => [item.observation_id, item]));
  const referenced = (claim.observation_references || []).map((id) => byId.get(id)).filter(Boolean);
  const missing = (claim.observation_references || []).filter((id) => !byId.has(id));
  const integrityFailure = referenced.some((item) => !verifyExternalObservation(item).valid);
  let proposition;
  if (integrityFailure) proposition = { status: 'INDETERMINATE', reasons: [reason('evidence_unverifiable', 'Referenced observation integrity verification failed.')] };
  else if (missing.length) proposition = { status: 'NOT_OBSERVED', reasons: [reason('observation_missing', `Missing referenced observations: ${missing.join(', ')}`)] };
  else proposition = evaluateAssertion(claim.assertion, referenced, (claim.derivation_references || []).map((id) => derivations.find((item) => item.derivation_id === id)).filter(Boolean));
  const selectedDatasets = (claim.dataset_references || []).map((reference) => resolveDatasetReference(reference, datasets)).filter(Boolean);
  const missingDatasets = (claim.dataset_references || []).filter((reference) => !resolveDatasetReference(reference, datasets));
  const scope = scopeSupport(claim, selectedDatasets, referenced);
  if (missingDatasets.length && claim.declared_scope.type === 'dataset') {
    scope.status = 'INDETERMINATE';
    scope.reasons.push(reason('dataset_reference_ambiguous_or_missing', `Dataset references could not be resolved exactly: ${missingDatasets.join(', ')}`));
  }
  const result = {
    claim_id: claim.claim_id, claim_version: claim.claim_version, overall: combine(proposition, scope),
    proposition_support: proposition.status, scope_support: scope.status,
    reasons: [...proposition.reasons, ...scope.reasons],
    lineage: { claim_reference: claim.claim_id, observation_references: claim.observation_references || [], dataset_references: claim.dataset_references || [], derivation_references: claim.derivation_references || [] },
    limitations: claim.limitations || [],
  };
  return validate(VERIFICATION_SCHEMA, result, 'claim verification');
}

const COMPARISON_DIMENSIONS = ['source', 'subject', 'collector', 'parser', 'configuration', 'population', 'normalization', 'dataset_version', 'derivation_version'];

function dimensionValue(item, dimension) {
  if (dimension === 'source') return item.source?.provider;
  if (dimension === 'subject') return item.subject?.id;
  if (dimension === 'collector') return `${item.collector?.id || ''}@${item.collector?.version || ''}` || null;
  if (dimension === 'parser') return item.parser ? `${item.parser.id}@${item.parser.version}` : null;
  if (dimension === 'configuration') return item.configuration ? `${item.configuration.id}@${item.configuration.version}` : null;
  if (dimension === 'population') return item.population?.declared?.id || item.declared_population?.id;
  if (dimension === 'normalization') return item.normalization ? `${item.normalization.method}@${item.normalization.version}` : null;
  if (dimension === 'dataset_version') return item.dataset_id ? `${item.dataset_id}@${item.dataset_version}` : null;
  if (dimension === 'derivation_version') return item.derivation_id ? `${item.derivation_id}@${item.derivation_version}` : null;
  return null;
}

function compareItems(left, right, leftReference, rightReference, dimensionsToCompare = COMPARISON_DIMENSIONS) {
  const dimensions = {};
  for (const key of dimensionsToCompare) {
    const a = dimensionValue(left, key); const b = dimensionValue(right, key);
    dimensions[key] = a == null || b == null ? 'missing' : a === b ? 'match' : 'mismatch';
  }
  const mismatches = Object.values(dimensions).filter((x) => x === 'mismatch').length;
  const missing = Object.values(dimensions).filter((x) => x === 'missing').length;
  const status = mismatches ? 'NOT_COMPARABLE' : missing ? 'PARTIALLY_COMPARABLE' : 'COMPARABLE';
  const result = { comparison_id: `CMP-${sha256(canonicalEvidenceJson({ leftReference, rightReference, dimensions })).slice(0, 16)}`, left_reference: leftReference, right_reference: rightReference, status, dimensions, limitations: status === 'COMPARABLE' ? [] : ['No delta should be generalized beyond the aligned dimensions.'] };
  return validate(COMPARISON_SCHEMA, result, 'external comparison');
}

export function compareExternalObservations(left, right) {
  if (!verifyExternalObservation(left).valid || !verifyExternalObservation(right).valid) {
    return { comparison_id: `CMP-${sha256(`${left?.observation_id || ''}:${right?.observation_id || ''}`).slice(0, 16)}`, left_reference: left?.observation_id || 'unknown', right_reference: right?.observation_id || 'unknown', status: 'INDETERMINATE', dimensions: {}, limitations: ['Observation integrity could not be verified.'] };
  }
  return compareItems(left, right, left.observation_id, right.observation_id,
    ['source', 'subject', 'collector', 'parser', 'configuration', 'population']);
}

export function compareResearchDatasets(left, right) {
  if (!verifyDatasetSafe(left) || !verifyDatasetSafe(right)) return { comparison_id: 'CMP-invalid', left_reference: left?.dataset_id || 'unknown', right_reference: right?.dataset_id || 'unknown', status: 'INDETERMINATE', dimensions: {}, limitations: ['Dataset integrity could not be verified.'] };
  return compareItems(left, right, `${left.dataset_id}@${left.dataset_version}`, `${right.dataset_id}@${right.dataset_version}`,
    ['dataset_version', 'normalization', 'population']);
}

export {
  createArtifactProvenance,
  verifyArtifactProvenance,
  classifyAcquisitionAuthority,
  ACQUISITION_AUTHORITIES,
  TRANSPORT_MECHANISMS,
} from './artifactProvenance.js';

