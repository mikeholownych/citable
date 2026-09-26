import { sha256 } from "../shared/io.js";

/**
 * Builds and analyzes third-party dependency graph (B-075).
 * Inventories external dependencies with purpose, blocking state, performance cost,
 * failure effect, and privacy effect.
 */
export function buildThirdPartyDependencyGraph(dependenciesList = [], siteUrl = "https://example.test") {
  const nowIso = new Date().toISOString();

  let blockingCount = 0;
  const criticalFailureDeps = [];

  const normalizedDeps = dependenciesList.map((dep, idx) => {
    const depId = dep.dependency_id || `dep_${sha256(dep.name || dep.host_domain || String(idx)).slice(0, 12)}`;
    const blocking = dep.blocking_state || "async";

    if (blocking === "render_blocking" || blocking === "parser_blocking") {
      blockingCount += 1;
    }

    const failureEffect = dep.failure_effect || "benign_fail_open";
    if (failureEffect === "critical_blocking" || failureEffect === "payment_outage") {
      criticalFailureDeps.push(dep.name || dep.host_domain || depId);
    }

    return {
      dependency_id: depId,
      name: dep.name || "Unknown Dependency",
      host_domain: dep.host_domain || "external.test",
      purpose: dep.purpose || "unknown",
      blocking_state: blocking,
      performance_cost: {
        transfer_size_bytes: dep.performance_cost?.transfer_size_bytes ?? 0,
        estimated_execution_time_ms: dep.performance_cost?.estimated_execution_time_ms ?? 0,
      },
      failure_effect: failureEffect,
      privacy_effect: {
        collects_pii: Boolean(dep.privacy_effect?.collects_pii),
        sets_cookies: Boolean(dep.privacy_effect?.sets_cookies),
        shares_data_broker: Boolean(dep.privacy_effect?.shares_data_broker),
      },
    };
  });

  const seed = `${siteUrl}|${normalizedDeps.length}|${blockingCount}|${nowIso}`;
  const graphId = `dep_grp_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    graph_id: graphId,
    site_url: siteUrl,
    dependencies: normalizedDeps,
    total_dependencies: normalizedDeps.length,
    blocking_count: blockingCount,
    critical_failure_dependencies: criticalFailureDeps,
    generated_at: nowIso,
  };
}
