import { sha256 } from "../shared/io.js";
import { canonicalEvidenceJson } from "./hashes.js";
import {
  verifyExternalObservation,
  verifyResearchDataset,
  verifyClaim,
  compareExternalObservations,
  compareResearchDatasets,
} from "./external.js";
import { compareSearchDiscoveryObservations } from "../discovery/searchConsole.js";
import { compareBacklinkObservations } from "../discovery/backlinks.js";
import { comparePromptSets } from "../representation/prompts.js";
import { compareRepresentationObservations } from "../representation/representation.js";
import { domainRegistry } from "../domains/registry.js";
import { loadConditionRegistry } from "../conditions/registry.js";

export const EPISTEMIC_STATES = Object.freeze({
  KNOWN_FACT: "KNOWN_FACT",
  OBSERVED: "OBSERVED",
  PARTIAL: "PARTIAL",
  INDETERMINATE: "INDETERMINATE",
  UNOBSERVED: "UNOBSERVED",
  CONTRADICTED: "CONTRADICTED",
  UNVERIFIABLE: "UNVERIFIABLE",
  ERROR: "ERROR",
});

/**
 * Machine-Consumable Evidence Interface (ER-12).
 *
 * Invariants:
 * 1. Exposes structured operations for observations, verification, coverage,
 *    conditions, comparisons, datasets, claims, citations, prompt sets, and lineage.
 * 2. Every operation reports an explicit epistemic state.
 * 3. Transport remains a later consumer-driven choice.
 */
export class EvidenceInterface {
  constructor(stores = {}) {
    this._observations = new Map(Object.entries(stores.observations || {}));
    this._datasets = new Map(Object.entries(stores.datasets || {}));
    this._promptSets = new Map(Object.entries(stores.promptSets || {}));
    this._claims = new Map(Object.entries(stores.claims || {}));
    this._derivations = new Map(Object.entries(stores.derivations || {}));
    this._citations = new Map(Object.entries(stores.citations || {}));
    this._coverage = new Map(Object.entries(stores.coverage || {}));
  }

  // --- 1. Observations ---

  storeObservation(observation) {
    if (!observation || !observation.observation_id) {
      throw new Error("observation must have observation_id");
    }
    this._observations.set(observation.observation_id, observation);
    return observation.observation_id;
  }

  getObservation(observationId) {
    if (!observationId || typeof observationId !== "string") {
      return {
        epistemic_state: EPISTEMIC_STATES.INDETERMINATE,
        observation: null,
        reason: "Invalid observation ID requested",
      };
    }

    const obs = this._observations.get(observationId);
    if (!obs) {
      return {
        epistemic_state: EPISTEMIC_STATES.UNOBSERVED,
        observation: null,
        reason: `Observation "${observationId}" not found in evidence store`,
      };
    }

    return {
      epistemic_state: EPISTEMIC_STATES.OBSERVED,
      observation: obs,
      reason: null,
    };
  }

  queryObservations(filter = {}) {
    const results = [];
    for (const obs of this._observations.values()) {
      if (filter.observation_type && obs.observation_type !== filter.observation_type) continue;
      if (filter.provider && obs.source?.provider !== filter.provider) continue;
      if (filter.subject_type && obs.subject?.type !== filter.subject_type) continue;
      if (filter.subject_id && obs.subject?.id !== filter.subject_id) continue;
      results.push(obs);
    }

    return {
      epistemic_state: results.length > 0 ? EPISTEMIC_STATES.OBSERVED : EPISTEMIC_STATES.UNOBSERVED,
      count: results.length,
      observations: results,
    };
  }

  // --- 2. Evidence Verification ---

  verifyEvidence(item) {
    if (!item || typeof item !== "object") {
      return {
        epistemic_state: EPISTEMIC_STATES.UNVERIFIABLE,
        valid: false,
        failures: ["Item is missing or not an object"],
      };
    }

    // External observation check
    if (item.observation_type && item.evidence_hash) {
      const res = verifyExternalObservation(item);
      return {
        epistemic_state: res.valid ? EPISTEMIC_STATES.KNOWN_FACT : EPISTEMIC_STATES.UNVERIFIABLE,
        valid: res.valid,
        failures: res.failures || [],
      };
    }

    // Research dataset check
    if (item.dataset_id && item.dataset_hash) {
      try {
        const res = verifyResearchDataset(item);
        return {
          epistemic_state: res.valid ? EPISTEMIC_STATES.KNOWN_FACT : EPISTEMIC_STATES.UNVERIFIABLE,
          valid: res.valid,
          failures: [],
        };
      } catch (err) {
        return {
          epistemic_state: EPISTEMIC_STATES.UNVERIFIABLE,
          valid: false,
          failures: [err.message],
        };
      }
    }

    // Passive backlink check
    if (item.observation_id?.startsWith("BL-OBS-")) {
      return {
        epistemic_state: EPISTEMIC_STATES.OBSERVED,
        valid: true,
        failures: [],
      };
    }

    return {
      epistemic_state: EPISTEMIC_STATES.INDETERMINATE,
      valid: false,
      failures: ["Unrecognized evidence item format"],
    };
  }

  // --- 3. Coverage ---

  getCoverage(scopeId) {
    const cov = this._coverage.get(scopeId);
    if (!cov) {
      return {
        epistemic_state: EPISTEMIC_STATES.UNOBSERVED,
        scope_id: scopeId,
        coverage: null,
      };
    }

    let epistemicState = EPISTEMIC_STATES.OBSERVED;
    if (cov.status === "COMPLETE" || cov.status === "complete") {
      epistemicState = EPISTEMIC_STATES.KNOWN_FACT;
    } else if (cov.status === "PARTIAL" || cov.status === "partial") {
      epistemicState = EPISTEMIC_STATES.PARTIAL;
    } else if (cov.status === "FAILED" || cov.status === "failed") {
      epistemicState = EPISTEMIC_STATES.ERROR;
    } else {
      epistemicState = EPISTEMIC_STATES.INDETERMINATE;
    }

    return {
      epistemic_state: epistemicState,
      scope_id: scopeId,
      coverage: cov,
    };
  }

  // --- 4. Conditions ---

  getConditions(filter = {}) {
    let conditions = [];
    try {
      const reg = loadConditionRegistry();
      conditions = reg.conditions || [];
    } catch {
      conditions = [];
    }
    const filtered = conditions.filter((c) => {
      if (filter.namespace && c.namespace !== filter.namespace) return false;
      if (filter.severity && c.severity !== filter.severity) return false;
      return true;
    });

    return {
      epistemic_state: EPISTEMIC_STATES.KNOWN_FACT,
      count: filtered.length,
      conditions: filtered,
    };
  }

  // --- 5. Comparisons ---

  compareEvidence(left, right, kind = "auto") {
    if (!left || !right) {
      return {
        epistemic_state: EPISTEMIC_STATES.INDETERMINATE,
        status: "INDETERMINATE",
        failures: ["Both left and right items are required for comparison"],
      };
    }

    let comparison = null;

    if (kind === "backlink" || (left.observation_id?.startsWith("BL-OBS-") && right.observation_id?.startsWith("BL-OBS-"))) {
      comparison = compareBacklinkObservations(left, right);
    } else if (kind === "search_discovery" || (left.source?.provider === "google_search_console" && right.source?.provider === "google_search_console")) {
      comparison = compareSearchDiscoveryObservations(left, right);
    } else if (kind === "dataset" || (left.dataset_id && right.dataset_id)) {
      comparison = compareResearchDatasets(left, right);
    } else if (kind === "prompt_set" || (left.prompt_set_id && right.prompt_set_id)) {
      comparison = comparePromptSets(left, right);
    } else if (kind === "representation" || (left.data?.representation && right.data?.representation)) {
      comparison = compareRepresentationObservations(left, right);
    } else {
      comparison = compareExternalObservations(left, right);
    }

    return {
      epistemic_state: comparison.status === "COMPARABLE"
        ? EPISTEMIC_STATES.KNOWN_FACT
        : comparison.status === "PARTIALLY_COMPARABLE"
        ? EPISTEMIC_STATES.PARTIAL
        : comparison.status === "NOT_COMPARABLE"
        ? EPISTEMIC_STATES.CONTRADICTED
        : EPISTEMIC_STATES.INDETERMINATE,
      comparison,
    };
  }

  // --- 6. Datasets ---

  storeDataset(dataset) {
    if (!dataset || !dataset.dataset_id) throw new Error("dataset must have dataset_id");
    const key = `${dataset.dataset_id}@${dataset.dataset_version || 1}`;
    this._datasets.set(key, dataset);
    this._datasets.set(dataset.dataset_id, dataset);
    return key;
  }

  getDataset(datasetId, version = null) {
    const key = version ? `${datasetId}@${version}` : datasetId;
    const ds = this._datasets.get(key);
    if (!ds) {
      return {
        epistemic_state: EPISTEMIC_STATES.UNOBSERVED,
        dataset: null,
      };
    }
    return {
      epistemic_state: EPISTEMIC_STATES.KNOWN_FACT,
      dataset: ds,
    };
  }

  // --- 7. Claims and Verifications ---

  verifyClaimAgainstEvidence(claim, evidenceContext = {}) {
    const observations = evidenceContext.observations || [...this._observations.values()];
    const datasets = evidenceContext.datasets || [...this._datasets.values()];
    const derivations = evidenceContext.derivations || [...this._derivations.values()];

    const verification = verifyClaim(claim, { observations, datasets, derivations });

    let epistemicState = EPISTEMIC_STATES.INDETERMINATE;
    if (verification.overall === "SUPPORTED") epistemicState = EPISTEMIC_STATES.KNOWN_FACT;
    else if (verification.overall === "PARTIALLY_SUPPORTED") epistemicState = EPISTEMIC_STATES.PARTIAL;
    else if (verification.overall === "CONTRADICTED") epistemicState = EPISTEMIC_STATES.CONTRADICTED;
    else if (verification.overall === "UNSUPPORTED") epistemicState = EPISTEMIC_STATES.UNOBSERVED;
    else if (verification.overall === "NOT_OBSERVED") epistemicState = EPISTEMIC_STATES.UNOBSERVED;

    return {
      epistemic_state: epistemicState,
      verification,
    };
  }

  // --- 8. Prompt Sets ---

  storePromptSet(promptSet) {
    if (!promptSet || !promptSet.prompt_set_id) throw new Error("promptSet must have prompt_set_id");
    const key = `${promptSet.prompt_set_id}@${promptSet.prompt_set_version || 1}`;
    this._promptSets.set(key, promptSet);
    this._promptSets.set(promptSet.prompt_set_id, promptSet);
    return key;
  }

  getPromptSet(id, version = null) {
    const key = version ? `${id}@${version}` : id;
    const ps = this._promptSets.get(key);
    if (!ps) {
      return {
        epistemic_state: EPISTEMIC_STATES.UNOBSERVED,
        prompt_set: null,
      };
    }
    return {
      epistemic_state: EPISTEMIC_STATES.KNOWN_FACT,
      prompt_set: ps,
    };
  }

  // --- 9. Lineage Trace ---

  getLineage(itemId) {
    if (!itemId) {
      return { epistemic_state: EPISTEMIC_STATES.INDETERMINATE, lineage_chain: [] };
    }

    const chain = [];
    let currentId = itemId;

    // Check observations
    const obs = this._observations.get(currentId);
    if (obs) {
      chain.push({
        id: obs.observation_id,
        type: "OBSERVATION",
        source: obs.source,
        collector: obs.collector,
        timestamp: obs.observed_at,
        evidence_hash: obs.evidence_hash || obs.lineage?.evidence_identity,
      });

      if (obs.lineage?.source_evidence) {
        for (const se of obs.lineage.source_evidence) {
          chain.push({
            id: se,
            type: "SOURCE_EVIDENCE",
          });
        }
      }
    }

    return {
      epistemic_state: chain.length > 0 ? EPISTEMIC_STATES.KNOWN_FACT : EPISTEMIC_STATES.UNOBSERVED,
      lineage_chain: chain,
    };
  }
}

export function createEvidenceInterface(stores = {}) {
  return new EvidenceInterface(stores);
}
