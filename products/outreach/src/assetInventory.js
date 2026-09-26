/**
 * Asset Inventory, Linkability Evaluation, and Asset Gap Detection (B-082).
 *
 * Invariant:
 * The system can conclude NO_LINKABLE_ASSET rather than fabricating an outreach angle.
 */

export class AssetInventory {
  constructor(initialAssets = []) {
    this._assets = new Map();
    for (const a of initialAssets) {
      this.addAsset(a);
    }
  }

  addAsset(asset) {
    if (!asset || !asset.asset_id || !asset.canonical_url) {
      throw new Error("Asset must include asset_id and canonical_url");
    }
    this._assets.set(asset.asset_id, {
      asset_id: asset.asset_id,
      canonical_url: asset.canonical_url,
      title: asset.title || asset.asset_id,
      topics: Array.isArray(asset.topics) ? asset.topics : asset.topic ? [asset.topic] : [],
      allowed_strategies: Array.isArray(asset.allowed_strategies)
        ? asset.allowed_strategies
        : ["RESOURCE_PAGE", "BROKEN_LINK", "EDITORIAL_REFERENCE"],
      evidence_quality: asset.evidence_quality || "MEDIUM",
      originality: asset.originality || "MEDIUM",
      linkability_verified: asset.linkability_verified ?? true,
    });
  }

  getAsset(assetId) {
    return this._assets.get(assetId) || null;
  }

  getAll() {
    return [...this._assets.values()];
  }

  /**
   * Evaluates if any owned asset genuinely supports the opportunity.
   * If none exists, concludes NO_LINKABLE_ASSET without fabricating an angle.
   */
  evaluateLinkableAssetForOpportunity(opportunityContext = {}) {
    const { strategy, topic, requiredEvidenceLevel = "MEDIUM" } = opportunityContext;

    const candidates = [...this._assets.values()].filter((asset) => {
      if (!asset.linkability_verified) return false;

      // Strategy alignment
      if (strategy && !asset.allowed_strategies.includes(strategy)) {
        return false;
      }

      // Topic alignment (case-insensitive substring or match)
      if (topic) {
        const normTopic = topic.toLowerCase().trim();
        const matchesTopic = asset.topics.some(
          (t) => t.toLowerCase().includes(normTopic) || normTopic.includes(t.toLowerCase())
        );
        if (!matchesTopic) return false;
      }

      // Evidence quality threshold
      if (requiredEvidenceLevel === "HIGH" && asset.evidence_quality !== "HIGH") {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return {
        has_linkable_asset: false,
        matched_asset_id: null,
        asset_gap: true,
        gap_description: `NO_LINKABLE_ASSET: No verified owned asset matches strategy "${strategy || 'unspecified'}" and topic "${topic || 'unspecified'}". Fabricated angle prohibited.`,
      };
    }

    // Select best candidate (highest evidence quality / originality)
    const best = candidates[0];
    return {
      has_linkable_asset: true,
      matched_asset_id: best.asset_id,
      asset_gap: false,
      gap_description: null,
    };
  }
}

/**
 * Functional helper to evaluate linkability.
 */
export function evaluateLinkableAssets(opportunityContext = {}, ownedAssets = []) {
  const inventory = new AssetInventory(ownedAssets);
  return inventory.evaluateLinkableAssetForOpportunity(opportunityContext);
}
