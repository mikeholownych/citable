import { defineDomainModule } from "./interface.js";

/**
 * Domain Registry (B-040, B-041, B-042).
 * Central registry for domain modules. Adding a domain touches no core file.
 */
export class DomainRegistry {
  constructor() {
    this._modules = new Map();
    this._byNamespace = new Map();
  }

  /**
   * Registers a domain module. Fails closed if duplicate ID or conditions collide.
   */
  register(moduleInput) {
    const mod = typeof moduleInput.conditions !== "undefined"
      ? defineDomainModule(moduleInput)
      : moduleInput;

    if (this._modules.has(mod.module_id)) {
      throw new Error(`domain module ${mod.module_id} is already registered`);
    }

    const namespaces = Array.isArray(mod.namespace) ? mod.namespace : [mod.namespace];
    for (const ns of namespaces) {
      if (this._byNamespace.has(ns.toUpperCase())) {
        throw new Error(`namespace ${ns} is already registered by module ${this._byNamespace.get(ns.toUpperCase()).module_id}`);
      }
    }

    this._modules.set(mod.module_id, mod);
    for (const ns of namespaces) {
      this._byNamespace.set(ns.toUpperCase(), mod);
    }

    return mod;
  }

  /**
   * Unregisters a domain module by ID.
   */
  unregister(moduleId) {
    const mod = this._modules.get(moduleId);
    if (!mod) return false;
    this._modules.delete(moduleId);
    const namespaces = Array.isArray(mod.namespace) ? mod.namespace : [mod.namespace];
    for (const ns of namespaces) {
      this._byNamespace.delete(ns.toUpperCase());
    }
    return true;
  }

  /**
   * Retrieves a domain module by ID or namespace.
   */
  get(idOrNamespace) {
    if (!idOrNamespace) return null;
    const byId = this._modules.get(idOrNamespace) || this._modules.get(idOrNamespace.toLowerCase());
    if (byId) return byId;
    return this._byNamespace.get(idOrNamespace.toUpperCase()) || null;
  }

  /**
   * Returns all registered domain modules.
   */
  getAll() {
    return [...this._modules.values()];
  }

  /**
   * Returns all conditions across all registered domain modules.
   */
  getAllConditions() {
    const all = [];
    for (const mod of this._modules.values()) {
      all.push(...mod.conditions);
    }
    return all;
  }

  /**
   * Checks whether a domain is enabled in the given context (B-042).
   * Supports:
   * - ctx.disabled_domains
   * - ctx.config?.disabled_domains
   * - ctx.enabled_domains
   * - siteProfile gating (disallowed_profiles / requires_profile)
   */
  isDomainEnabled(idOrNamespace, ctx = {}) {
    const mod = this.get(idOrNamespace);
    if (!mod) {
      return { enabled: true, reason: null };
    }

    const modId = mod.module_id.toLowerCase();
    const ns = Array.isArray(mod.namespace)
      ? mod.namespace.map((n) => n.toUpperCase())
      : [mod.namespace.toUpperCase()];

    // 1. Check explicit disabled_domains list (case-insensitive)
    const disabled = [
      ...(ctx.disabled_domains || []),
      ...(ctx.config?.disabled_domains || []),
    ].map((d) => String(d).toLowerCase());

    if (disabled.includes(modId) || ns.some((n) => disabled.includes(n.toLowerCase()))) {
      return {
        enabled: false,
        reason: `domain module ${mod.module_id} is disabled by configuration`,
      };
    }

    // 2. Check explicit enabled_domains allowlist if configured
    const enabled = [
      ...(ctx.enabled_domains || []),
      ...(ctx.config?.enabled_domains || []),
    ].map((d) => String(d).toLowerCase());

    if (enabled.length > 0) {
      const match = enabled.includes(modId) || ns.some((n) => enabled.includes(n.toLowerCase()));
      if (!match) {
        return {
          enabled: false,
          reason: `domain module ${mod.module_id} is not in enabled_domains allowlist`,
        };
      }
    }

    // 3. Profile gating
    const profile = ctx.siteProfile || ctx.profile || null;
    if (profile && mod.gating) {
      if (mod.gating.disallowed_profiles?.includes(profile)) {
        return {
          enabled: false,
          reason: `domain module ${mod.module_id} is not applicable to profile ${profile}`,
        };
      }
      if (mod.gating.requires_profile && mod.gating.requires_profile !== profile) {
        return {
          enabled: false,
          reason: `domain module ${mod.module_id} requires profile ${mod.gating.requires_profile}`,
        };
      }
    }

    return { enabled: true, reason: null };
  }

  /**
   * Clears all registered modules (for clean state in tests).
   */
  clear() {
    this._modules.clear();
    this._byNamespace.clear();
  }
}

export const domainRegistry = new DomainRegistry();

export function isDomainEnabled(idOrNamespace, ctx) {
  return domainRegistry.isDomainEnabled(idOrNamespace, ctx);
}
