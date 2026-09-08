import path from "node:path";
import fs from "node:fs";
import { loadRegistries, contextDir } from "../registries/index.js";
import { audit } from "./audit.js";

/**
 * Returns summary of all properties defined in the fleet registry.
 */
export async function fleetSummary(root) {
  const { registries } = loadRegistries(root);
  const fleet = registries?.fleet?.entries || [];

  const byEnv = {};
  const byOwner = {};
  for (const p of fleet) {
    byEnv[p.environment] = (byEnv[p.environment] || 0) + 1;
    if (p.owner) byOwner[p.owner] = (byOwner[p.owner] || 0) + 1;
  }

  return {
    total_properties: fleet.length,
    active_properties: fleet.filter((p) => p.status === "active").length,
    by_environment: byEnv,
    by_owner: byOwner,
    properties: fleet.map((p) => ({
      property_id: p.property_id,
      name: p.name,
      environment: p.environment,
      primary_domain: p.primary_domain,
      status: p.status,
      owner: p.owner,
    })),
  };
}

/**
 * Runs fleet-wide audit across registered fleet properties.
 */
export async function fleetAudit(root, { propertyId = null, environment = null, scope = null } = {}) {
  const { registries } = loadRegistries(root);
  const fleet = registries?.fleet?.entries || [];

  if (fleet.length === 0) {
    throw new Error("no fleet properties declared in registries (expected .citable/fleet.yaml)");
  }

  let targets = fleet.filter((p) => p.status === "active");
  if (propertyId) {
    targets = targets.filter((p) => p.property_id === propertyId || p.primary_domain === propertyId);
    if (targets.length === 0) throw new Error(`property "${propertyId}" not found in active fleet`);
  }
  if (environment) {
    targets = targets.filter((p) => p.environment === environment);
  }

  const results = [];
  for (const prop of targets) {
    const propTarget = prop.built_output_dir && fs.existsSync(path.resolve(root, prop.built_output_dir))
      ? path.resolve(root, prop.built_output_dir)
      : null;

    let auditRes = null;
    let error = null;

    try {
      if (propTarget || prop.base_url) {
        auditRes = await audit(root, {
          target: propTarget || prop.base_url,
          baseUrl: prop.base_url,
          scope,
        });
      }
    } catch (err) {
      error = err.message;
    }

    results.push({
      property_id: prop.property_id,
      name: prop.name,
      primary_domain: prop.primary_domain,
      environment: prop.environment,
      status: auditRes ? "audited" : (error ? "error" : "skipped"),
      findings_count: auditRes?.findings?.length ?? 0,
      critical_count: auditRes?.findings?.filter((f) => f.severity === "critical").length ?? 0,
      high_count: auditRes?.findings?.filter((f) => f.severity === "high").length ?? 0,
      medium_count: auditRes?.findings?.filter((f) => f.severity === "medium").length ?? 0,
      low_count: auditRes?.findings?.filter((f) => f.severity === "low").length ?? 0,
      error,
    });
  }

  const totalFindings = results.reduce((acc, r) => acc + r.findings_count, 0);
  const totalCritical = results.reduce((acc, r) => acc + r.critical_count, 0);
  const totalHigh = results.reduce((acc, r) => acc + r.high_count, 0);

  return {
    fleet_size: targets.length,
    total_findings: totalFindings,
    total_critical: totalCritical,
    total_high: totalHigh,
    fleet_health: totalCritical === 0 && totalHigh === 0 ? "healthy" : (totalCritical > 0 ? "critical" : "needs_attention"),
    properties: results,
  };
}
