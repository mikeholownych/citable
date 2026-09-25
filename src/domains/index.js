import { domainRegistry } from "./registry.js";
import { defineDomainModule } from "./interface.js";
import { ALL_DOMAIN_MODULES, registerAllDomainModules } from "./modules/index.js";

// Initialize default registry with all 19 standard domain modules
registerAllDomainModules(domainRegistry);

export {
  domainRegistry,
  defineDomainModule,
  ALL_DOMAIN_MODULES,
};

/**
 * Register a new domain module dynamically without modifying any core file (B-040).
 */
export function registerDomainModule(moduleDefinition) {
  return domainRegistry.register(moduleDefinition);
}

/**
 * Get domain module by ID or namespace.
 */
export function getDomainModule(idOrNamespace) {
  return domainRegistry.get(idOrNamespace);
}

/**
 * Check if a domain module is enabled under the given context (B-042).
 */
export function isDomainEnabled(idOrNamespace, ctx) {
  return domainRegistry.isDomainEnabled(idOrNamespace, ctx);
}
