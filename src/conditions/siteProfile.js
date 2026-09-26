import { SITE_PROFILES } from "./constants.js";

/**
 * Detectors that require e-commerce functionality (offers, transactions, shopping carts).
 * On content-only properties, these conditions are resolved as NOT_APPLICABLE.
 */
export const ECOMMERCE_DETECTOR_IDS = new Set([
  "SCHEMA-006", // Stale offer price validity
  "CRO-013",    // Distraction navigation menus on checkout pages
  "CRO-021",    // High-intent conversion step lacks express payment wallet options
  "AGENT-010",  // Agent commerce checkout / purchase action
]);

/**
 * Inspect site signals to determine whether e-commerce or commercial features are present.
 */
function detectEcommerceSignals(pages = []) {
  for (const page of pages) {
    const pathname = (() => {
      try { return new URL(page.url).pathname; } catch { return page.url || ""; }
    })();
    if (/\/(?:products?|collections?|cart|checkout)(?:\/|$)/i.test(pathname)) return true;
    if (/\b(?:add to cart|buy now|checkout|add to bag)\b/i.test(page.text || "")) return true;
    for (const item of page.jsonLd || []) {
      for (const block of item.blocks || []) {
        const types = Array.isArray(block?.["@type"]) ? block["@type"] : [block?.["@type"]];
        if (types.some((t) => t === "Product" || t === "Offer" || t === "MerchantReturnPolicy")) {
          return true;
        }
      }
    }
  }
  return false;
}

function detectSaasSignals(pages = []) {
  for (const page of pages) {
    const pathname = (() => {
      try { return new URL(page.url).pathname; } catch { return page.url || ""; }
    })();
    if (/\/pricing(?:\/|$)/i.test(pathname)) return true;
    if (/\b(?:free trial|sign up|start trial)\b/i.test(page.text || "")) return true;
  }
  return false;
}

/**
 * Resolves the effective site profile from configuration or DOM signals.
 */
export function resolveSiteProfile(ctx = {}) {
  if (ctx.config?.site_profile) {
    const configured = String(ctx.config.site_profile).toLowerCase().trim();
    if (Object.values(SITE_PROFILES).includes(configured)) return configured;
  }

  const pages = ctx.site?.pages || [];
  if (pages.length === 0) return SITE_PROFILES.CONTENT_ONLY;

  if (detectEcommerceSignals(pages)) return SITE_PROFILES.ECOMMERCE;
  if (detectSaasSignals(pages)) return SITE_PROFILES.SAAS;

  return SITE_PROFILES.CONTENT_ONLY;
}

/**
 * Determines whether a given detector is applicable to the given site profile.
 * E-commerce conditions evaluated against content-only profiles return applicable: false.
 */
export function isConditionApplicable(detector, siteProfile, subject = null) {
  if (!detector) return { applicable: true };

  const isEcommerce = ECOMMERCE_DETECTOR_IDS.has(detector.id)
    || detector.profile === "ecommerce"
    || (Array.isArray(detector.profiles) && detector.profiles.includes("ecommerce"));

  // Only apply profile gating when site profile is explicitly content_only
  if (siteProfile === SITE_PROFILES.CONTENT_ONLY && isEcommerce) {
    return {
      applicable: false,
      reason: "ecommerce condition not applicable to content-only profile",
    };
  }

  if (Array.isArray(detector.applicable_profiles) && detector.applicable_profiles.length > 0) {
    if (!detector.applicable_profiles.includes(siteProfile)) {
      return {
        applicable: false,
        reason: `condition only applicable to profiles: ${detector.applicable_profiles.join(", ")}`,
      };
    }
  }

  return { applicable: true };
}
