import { envelope, observationRun, readInput } from './common.js';
import { loadRegistries } from '../registries/index.js';
import { sha256 } from '../shared/io.js';

const FAVORABLE_MARKERS = [
  /\b(?:highly\s+)?recommended\b/i,
  /\bindustry\s+standard\b/i,
  /\bmarket\s+leader\b/i,
  /\bbest(?:-in-class)?\b/i,
  /\btop(?:\s+choice|\s+tier|\s+rated)?\b/i,
  /\bpreferred\s+(?:solution|option|tool|platform)\b/i,
  /\breliable\b/i,
  /\brobust\b/i,
  /\bsecure\b/i,
  /\bperformant\b/i,
  /\befficient\b/i,
  /\bcomprehensive\b/i,
  /\btrusted\b/i,
  /\bintuitive\b/i,
  /\bexcellent\b/i,
];

const UNFAVORABLE_MARKERS = [
  /\bcriticized\s+for\b/i,
  /\bexpensive\b/i,
  /\boverpriced\b/i,
  /\bunreliable\b/i,
  /\boutdated\b/i,
  /\blegacy\b/i,
  /\bslow\b/i,
  /\bbuggy\b/i,
  /\bunstable\b/i,
  /\bvulnerabilit(?:y|ies)\b/i,
  /\bsecurity\s+flaw[s]?\b/i,
  /\bsecurity\s+issue[s]?\b/i,
  /\bbreach(?:es)?\b/i,
  /\blacks?\s+(?:critical|essential|basic|key)\b/i,
  /\bmissing\s+(?:critical|essential|key)\b/i,
  /\bpoor\s+(?:performance|support|usability|documentation)\b/i,
  /\bavoid\b/i,
  /\bnot\s+recommended\b/i,
  /\binferior\b/i,
  /\bworst\b/i,
  /\bsteep\s+learning\s+curve\b/i,
  /\bfrustrating\b/i,
  /\bfrequent\s+(?:downtime|crashes|errors|failures)\b/i,
];

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract sentences from text.
 */
function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/([.?!])\s+/g, '$1|§|')
    .split('|§|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Classify tone / stance towards a specific entity within an answer text.
 * Stance categories: 'favorable', 'neutral', 'unfavorable', 'mixed', 'ambiguous'.
 */
export function classifyAnswerStance(answerText, entity, { reviewer = null, manualStance = null } = {}) {
  const entityId = entity?.entity_id || 'unknown';
  const canonicalName = entity?.canonical_name || entityId;
  const names = [canonicalName, ...(entity?.aliases || [])].filter(Boolean);

  if (!names.length || !answerText) {
    return {
      entity_id: entityId,
      canonical_name: canonicalName,
      mentioned: false,
      stance: 'not_mentioned',
      confidence: 'confirmed',
      evidence_passages: [],
      favorable_markers: [],
      unfavorable_markers: [],
      tone_summary: 'Entity not mentioned in text',
      reviewer,
      review_required: false,
    };
  }

  // Check if any alias / canonical name is mentioned
  const namePatterns = names.map((n) => new RegExp(`\\b${escapeRegex(n)}\\b`, 'i'));
  const isMentioned = namePatterns.some((pattern) => pattern.test(answerText));

  if (!isMentioned) {
    return {
      entity_id: entityId,
      canonical_name: canonicalName,
      mentioned: false,
      stance: 'not_mentioned',
      confidence: 'confirmed',
      evidence_passages: [],
      favorable_markers: [],
      unfavorable_markers: [],
      tone_summary: 'Entity not mentioned in text',
      reviewer,
      review_required: false,
    };
  }

  // If a manual stance from a human reviewer is already recorded, honor it directly
  if (manualStance && ['favorable', 'neutral', 'unfavorable', 'mixed', 'ambiguous'].includes(manualStance)) {
    return {
      entity_id: entityId,
      canonical_name: canonicalName,
      mentioned: true,
      stance: manualStance,
      confidence: reviewer ? 'confirmed' : 'high',
      evidence_passages: [answerText.slice(0, 300)],
      favorable_markers: [],
      unfavorable_markers: [],
      tone_summary: `Human-adjudicated stance: ${manualStance}`,
      reviewer,
      review_required: !reviewer,
    };
  }

  // Find sentences mentioning the entity
  const sentences = splitSentences(answerText);
  const matchedIndices = new Set();
  sentences.forEach((sentence, idx) => {
    if (namePatterns.some((p) => p.test(sentence))) {
      matchedIndices.add(idx);
      // include adjacent sentence context if available
      if (idx > 0) matchedIndices.add(idx - 1);
      if (idx < sentences.length - 1) matchedIndices.add(idx + 1);
    }
  });

  const contextSentences = [...matchedIndices].sort((a, b) => a - b).map((idx) => sentences[idx]);
  const contextText = contextSentences.join(' ');

  const favorableHits = [];
  for (const rx of FAVORABLE_MARKERS) {
    const m = contextText.match(rx);
    if (m) favorableHits.push(m[0].toLowerCase());
  }

  const unfavorableHits = [];
  for (const rx of UNFAVORABLE_MARKERS) {
    const m = contextText.match(rx);
    if (m) unfavorableHits.push(m[0].toLowerCase());
  }

  let stance = 'neutral';
  if (unfavorableHits.length > 0 && favorableHits.length > 0) {
    stance = 'mixed';
  } else if (unfavorableHits.length > 0) {
    stance = 'unfavorable';
  } else if (favorableHits.length > 0) {
    stance = 'favorable';
  }

  const toneSummary = stance === 'unfavorable'
    ? `Unfavorable tone detected with markers: ${unfavorableHits.join(', ')}`
    : stance === 'favorable'
      ? `Favorable tone detected with markers: ${favorableHits.join(', ')}`
      : stance === 'mixed'
        ? `Mixed tone detected (favorable: ${favorableHits.join(', ')}; unfavorable: ${unfavorableHits.join(', ')})`
        : 'Neutral / descriptive tone without evaluative polarity';

  return {
    entity_id: entityId,
    canonical_name: canonicalName,
    mentioned: true,
    stance,
    confidence: reviewer ? 'confirmed' : 'medium',
    evidence_passages: contextSentences.slice(0, 3),
    favorable_markers: [...new Set(favorableHits)],
    unfavorable_markers: [...new Set(unfavorableHits)],
    tone_summary: toneSummary,
    reviewer,
    review_required: !reviewer,
  };
}

/**
 * Execute `citable observe stance`.
 */
export async function observeStance(root, options = {}) {
  const input = readInput(options.input);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);

  const entities = (registries.entities?.entries || []).filter((e) => e.status !== 'retired');
  if (!entities.length) throw new Error('no active entities found in entity registry');

  const targetEntities = options.entity
    ? entities.filter((e) => e.entity_id === options.entity || e.canonical_name.toLowerCase() === options.entity.toLowerCase())
    : entities;

  if (options.entity && !targetEntities.length) {
    throw new Error(`entity not found: ${options.entity}`);
  }

  // Parse candidate items from input
  const doc = input.value;
  const items = Array.isArray(doc)
    ? doc
    : doc.observations || doc.items || doc.answers || doc.prompts || [doc];

  const observations = [];
  for (const item of items) {
    const answerText = item.answer_text || item.answer || item.text || item.data?.answer_text || '';
    if (!answerText) continue;

    const promptId = item.prompt_id || item.data?.prompt_id || 'unknown';
    const promptText = item.prompt_text || item.data?.prompt_text || null;
    const engine = item.provider || item.engine || item.data?.provider || item.data?.engine || 'unknown';
    const reviewer = options.reviewer || item.reviewer || item.evaluator || null;

    for (const entity of targetEntities) {
      const classification = classifyAnswerStance(answerText, entity, {
        reviewer,
        manualStance: item.stance || item.sentiment,
      });

      if (!classification.mentioned) continue;

      const data = {
        prompt_id: promptId,
        prompt_text: promptText,
        engine,
        entity_id: entity.entity_id,
        canonical_name: entity.canonical_name,
        stance: classification.stance,
        evidence_passages: classification.evidence_passages,
        favorable_markers: classification.favorable_markers,
        unfavorable_markers: classification.unfavorable_markers,
        tone_summary: classification.tone_summary,
        reviewer: classification.reviewer,
        review_required: classification.review_required,
      };

      const raw = JSON.stringify({ item, classification });
      observations.push(envelope('stance', data, {
        method: reviewer ? 'human_review' : 'static_analysis',
        source: input.file,
        state: classification.review_required ? 'review_required' : 'observed',
        confidence: classification.confidence,
        raw,
        limitations: classification.review_required
          ? ['Automated stance classification is an evidence-backed semantic finding; authoritative determination requires a named human reviewer per the narrative-accuracy rubric.']
          : [],
      }));
    }
  }

  return observationRun(root, 'observe stance', input.file, observations, {
    rawInputs: { stance_input: input.raw },
  });
}
