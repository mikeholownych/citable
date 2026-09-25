import { readJson } from "../shared/io.js";

const PKG = readJson(new URL("../../package.json", import.meta.url));

export const DEFAULT_COLLECTOR_VERSION = PKG.version || "1.23.0";
export const DEFAULT_PARSER_VERSION = PKG.version || "1.23.0";
export const DEFAULT_CONFIGURATION_VERSION = "1.0.0";

/**
 * Validates that an observation envelope carries full collector, parser,
 * and configuration lineage (B-030).
 */
export function verifyObservationLineage(observation) {
  const errors = [];
  if (!observation) {
    return { valid: false, errors: ["observation is required"] };
  }
  if (!observation.collector_id || typeof observation.collector_id !== "string") {
    errors.push("missing or invalid collector_id");
  }
  if (!observation.collector_version || typeof observation.collector_version !== "string") {
    errors.push("missing or invalid collector_version");
  }
  if (!observation.parser_version || typeof observation.parser_version !== "string") {
    errors.push("missing or invalid parser_version");
  }
  if (!observation.configuration_version || typeof observation.configuration_version !== "string") {
    errors.push("missing or invalid configuration_version");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Asserts observation lineage; throws if any field is missing.
 */
export function assertObservationLineage(observation) {
  const check = verifyObservationLineage(observation);
  if (!check.valid) {
    throw new Error(`Observation lineage contract violation: ${check.errors.join("; ")}`);
  }
}

/**
 * Extracts consolidated lineage from a set of observations.
 * Enforces B-030: fails closed if any observation lacks lineage.
 */
export function extractObservationLineage(observations) {
  if (!Array.isArray(observations)) {
    throw new TypeError("observations must be an array");
  }
  const collectorIds = new Set();
  const collectorVersions = new Set();
  const parserVersions = new Set();
  const configVersions = new Set();
  const observationIds = [];

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const check = verifyObservationLineage(obs);
    if (!check.valid) {
      throw new Error(
        `Observation at index ${i} (${obs?.observation_id || "unidentified"}) lacks required lineage: ${check.errors.join("; ")}`
      );
    }
    collectorIds.add(obs.collector_id);
    collectorVersions.add(obs.collector_version);
    parserVersions.add(obs.parser_version);
    configVersions.add(obs.configuration_version);
    if (obs.observation_id) observationIds.push(obs.observation_id);
  }

  return {
    collector_ids: [...collectorIds].sort(),
    collector_versions: [...collectorVersions].sort(),
    parser_versions: [...parserVersions].sort(),
    configuration_versions: [...configVersions].sort(),
    observation_references: observationIds,
  };
}

/**
 * Derives a metric with verified lineage to input observations.
 * Guarantees no derived metric lacks lineage (B-030).
 */
export function deriveMetricWithLineage(metricName, computeFn, observations, metadata = {}) {
  const lineage = extractObservationLineage(observations);
  const metricData = typeof computeFn === "function" ? computeFn(observations) : computeFn;
  return {
    metric_name: metricName,
    ...metadata,
    data: metricData,
    lineage,
    derived_at: new Date().toISOString(),
  };
}
