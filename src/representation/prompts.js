import { canonicalEvidenceJson } from '../evidence/hashes.js';
import { sha256 } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const PROMPT_SCHEMA = 'prompt-set.schema.json';

function without(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function promptId({ prompt_text, context = null, locale = null }) {
  return `PROMPT-${sha256(canonicalEvidenceJson({ prompt_text, context, locale })).slice(0, 24)}`;
}

export function createPrompt(input) {
  if (!input || typeof input.prompt_text !== 'string' || !input.prompt_text.trim()) throw new TypeError('prompt_text is required');
  const prompt = {
    prompt_id: input.prompt_id || promptId(input),
    prompt_text: input.prompt_text,
    ...(input.context == null ? {} : { context: input.context }),
    ...(input.locale == null ? {} : { locale: input.locale }),
  };
  return prompt;
}

function normalizeIncluded(prompts = []) {
  if (!Array.isArray(prompts)) throw new TypeError('included_prompts must be an array');
  const normalized = prompts.map(createPrompt);
  const ids = new Set();
  for (const item of normalized) {
    if (ids.has(item.prompt_id)) throw new Error(`duplicate prompt_id: ${item.prompt_id}`);
    ids.add(item.prompt_id);
  }
  return normalized.sort((left, right) => left.prompt_id.localeCompare(right.prompt_id));
}

function normalizeExcluded(prompts = []) {
  if (!Array.isArray(prompts)) throw new TypeError('excluded_prompts must be an array');
  return prompts.map((item) => ({
    prompt_id: item.prompt_id || promptId(item),
    ...(item.prompt_text == null ? {} : { prompt_text: item.prompt_text }),
    exclusion_reason: item.exclusion_reason,
  })).sort((left, right) => left.prompt_id.localeCompare(right.prompt_id));
}

function hashPromptSet(item) {
  const value = without(item, 'prompt_set_hash');
  return sha256(canonicalEvidenceJson({
    ...value,
    included_prompts: [...(value.included_prompts || [])].sort((left, right) => left.prompt_id.localeCompare(right.prompt_id)),
    excluded_prompts: [...(value.excluded_prompts || [])].sort((left, right) => left.prompt_id.localeCompare(right.prompt_id)),
  }));
}

export function createPromptSet(input, { previous = null } = {}) {
  if (!input || typeof input.prompt_set_id !== 'string' || !input.prompt_set_id) throw new TypeError('prompt_set_id is required');
  if (!Number.isInteger(input.prompt_set_version) || input.prompt_set_version < 1) throw new TypeError('prompt_set_version must be a positive integer');
  const included = normalizeIncluded(input.included_prompts);
  const excluded = normalizeExcluded(input.excluded_prompts || []);
  const item = {
    prompt_set_id: input.prompt_set_id,
    prompt_set_version: input.prompt_set_version,
    purpose: input.purpose,
    generation_method: input.generation_method,
    generation_method_version: input.generation_method_version ?? null,
    generation_input: input.generation_input ?? null,
    generated_at: input.generated_at,
    population_size: included.length,
    sampling_method: input.sampling_method,
    included_prompts: included,
    excluded_prompts: excluded,
    intended_population: input.intended_population,
    limitations: [...new Set(input.limitations || [])],
  };
  item.prompt_set_hash = hashPromptSet(item);
  const check = validateAgainst(PROMPT_SCHEMA, item);
  if (!check.valid) throw new TypeError(`prompt set violates contract: ${check.errors.join('; ')}`);
  if (previous && previous.prompt_set_id === item.prompt_set_id && previous.prompt_set_version === item.prompt_set_version && previous.prompt_set_hash !== item.prompt_set_hash) {
    throw new Error('prompt set version is immutable; create a new prompt_set_version');
  }
  return item;
}

export function verifyPromptSet(item, { previous = null } = {}) {
  const failures = [];
  const check = validateAgainst(PROMPT_SCHEMA, item);
  if (!check.valid) failures.push(...check.errors);
  if (item?.prompt_set_hash !== hashPromptSet(item || {})) failures.push('prompt set hash is inconsistent');
  if (previous && previous.prompt_set_id === item?.prompt_set_id && previous.prompt_set_version === item?.prompt_set_version && previous.prompt_set_hash !== item?.prompt_set_hash) failures.push('prompt set version is immutable');
  return { valid: failures.length === 0, failures };
}

export function promptReference(promptSet, promptIdValue) {
  if (!verifyPromptSet(promptSet).valid) throw new Error('cannot reference an unverifiable prompt set');
  const prompt = promptSet.included_prompts.find((item) => item.prompt_id === promptIdValue);
  if (!prompt) throw new Error(`prompt ${promptIdValue} is not included in prompt set ${promptSet.prompt_set_id}@${promptSet.prompt_set_version}`);
  return `${promptSet.prompt_set_id}@${promptSet.prompt_set_version}:${prompt.prompt_id}`;
}

export function comparePromptSets(left, right) {
  const validLeft = verifyPromptSet(left).valid;
  const validRight = verifyPromptSet(right).valid;
  if (!validLeft || !validRight) return { status: 'INDETERMINATE', dimensions: {}, limitations: ['Prompt-set integrity could not be verified.'] };
  const dimensions = {
    prompt_set_id: left.prompt_set_id === right.prompt_set_id ? 'match' : 'mismatch',
    prompt_set_version: left.prompt_set_version === right.prompt_set_version ? 'match' : 'mismatch',
    population: left.population_size === right.population_size ? 'match' : 'mismatch',
    sampling_method: left.sampling_method === right.sampling_method ? 'match' : 'mismatch',
  };
  const status = dimensions.prompt_set_id === 'match' && dimensions.prompt_set_version === 'match' && dimensions.population === 'match' && dimensions.sampling_method === 'match'
    ? 'COMPARABLE' : 'NOT_COMPARABLE';
  return { status, left_reference: `${left.prompt_set_id}@${left.prompt_set_version}`, right_reference: `${right.prompt_set_id}@${right.prompt_set_version}`, dimensions, limitations: status === 'COMPARABLE' ? [] : ['Prompt population, sampling, or version changed; no denominator is reused silently.'] };
}

export { promptId };
