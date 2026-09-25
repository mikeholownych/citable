import { validateAgainst } from "../shared/schemaValidator.js";

const REQUIRED_MODULE_FIELDS = [
  "module_id",
  "namespace",
  "title",
  "description",
  "conditions",
  "observation_kinds",
  "collectors",
  "report_projections",
];

/**
 * B-040: Domain module interface.
 * A domain registers conditions, observation kinds, collectors,
 * and report projections through one interface.
 */
export function defineDomainModule(def) {
  if (!def || typeof def !== "object") {
    throw new TypeError("domain module definition must be an object");
  }

  for (const field of REQUIRED_MODULE_FIELDS) {
    if (def[field] === undefined || def[field] === null) {
      throw new Error(`domain module ${def.module_id || "(unidentified)"} missing required field: ${field}`);
    }
  }

  if (!Array.isArray(def.conditions)) {
    throw new TypeError(`domain module ${def.module_id}: conditions must be an array`);
  }

  if (!Array.isArray(def.observation_kinds)) {
    throw new TypeError(`domain module ${def.module_id}: observation_kinds must be an array`);
  }

  if (typeof def.collectors !== "object" || def.collectors === null) {
    throw new TypeError(`domain module ${def.module_id}: collectors must be an object`);
  }

  if (typeof def.report_projections !== "object" || def.report_projections === null) {
    throw new TypeError(`domain module ${def.module_id}: report_projections must be an object`);
  }

  const namespaces = Array.isArray(def.namespace) ? def.namespace : [def.namespace];

  // Validate that conditions match the declared namespace(s)
  for (const c of def.conditions) {
    if (!c.id || !c.name || !c.check) {
      throw new Error(`domain module ${def.module_id}: condition ${c.id || "(unnamed)"} must have id, name, and check`);
    }
    if (!namespaces.includes(c.namespace)) {
      throw new Error(`domain module ${def.module_id}: condition ${c.id} namespace ${c.namespace} does not match module namespace ${def.namespace}`);
    }
  }

  const moduleObj = {
    schema_version: 1,
    version: def.version || "1.0.0",
    gating: {
      default_enabled: true,
      requires_profile: null,
      disallowed_profiles: [],
      ...(def.gating || {}),
    },
    ...def,
  };

  const check = validateAgainst("domain-module.schema.json", moduleObj);
  if (!check.valid) {
    throw new Error(`Domain module ${def.module_id} violates contract: ${check.errors.join("; ")}`);
  }

  return Object.freeze(moduleObj);
}
