import { BaseSerpAdapter } from "./base.js";
import { createSerpContext } from "../envelope.js";
import { normalizeSerpElements } from "../elements.js";
import { extractAiOverviewModel } from "../aiOverview.js";
import { sha256 } from "../../shared/io.js";

export class BrightDataSerpAdapter extends BaseSerpAdapter {
  constructor(version = "1.0.0") {
    super("brightdata", version);
  }

  validate(rawPayload) {
    if (!rawPayload || typeof rawPayload !== "object") {
      throw new Error("BrightData payload must be an object");
    }
    if (rawPayload.error) {
      return { valid: false, error: String(rawPayload.error) };
    }
    return { valid: true };
  }

  normalize(rawPayload, contextOptions = {}) {
    const check = this.validate(rawPayload);
    const rawString = JSON.stringify(rawPayload);
    const rawChecksum = sha256(rawString);
    const nowIso = new Date().toISOString();

    const general = rawPayload?.general || {};
    const queryText = contextOptions.query_text || general.query || general.search_engine_query || "unknown query";
    const engine = contextOptions.engine || general.search_engine || "google";
    const device = contextOptions.device || (general.mobile ? "mobile" : "desktop");

    const context = createSerpContext({
      query_text: queryText,
      engine,
      search_surface: contextOptions.search_surface || "organic",
      device,
      language: contextOptions.language || general.language || "en",
      country: contextOptions.country || "US",
      location: contextOptions.location || null,
      ...contextOptions,
    });

    const isSuccess = check.valid && !rawPayload.error;
    const collectionStatus = isSuccess ? "SUCCESS" : "COLLECTION_FAILED";
    const failureReason = isSuccess ? null : (check.error || "BrightData reported error");

    // Flatten organic and specialized blocks
    const items = [];
    if (Array.isArray(rawPayload.organic)) {
      for (const org of rawPayload.organic) {
        items.push({
          type: "ORGANIC",
          rank_absolute: org.pos,
          rank_group: org.pos,
          url: org.link || org.url,
          title: org.title,
          snippet: org.description || org.snippet,
          display_url: org.displayed_link,
        });
      }
    }

    if (Array.isArray(rawPayload.knowledge_panel)) {
      for (const kp of rawPayload.knowledge_panel) {
        items.push({
          type: "KNOWLEDGE_PANEL",
          title: kp.title,
          snippet: kp.description,
          url: kp.link,
        });
      }
    }

    if (Array.isArray(rawPayload.people_also_ask)) {
      for (const paa of rawPayload.people_also_ask) {
        items.push({
          type: "PEOPLE_ALSO_ASK",
          title: paa.question,
          snippet: paa.answer,
          url: paa.link,
        });
      }
    }

    // Retain unrecognized custom fields as UNKNOWN_FEATURE
    if (Array.isArray(rawPayload.custom_experimental_features)) {
      for (const feat of rawPayload.custom_experimental_features) {
        items.push({
          type: "UNKNOWN_FEATURE",
          raw_evidence: feat,
          title: feat.label || "experimental",
        });
      }
    }

    const elements = normalizeSerpElements(items, context);

    const rawAi = rawPayload.ai_overview || rawPayload.generative_summary || null;
    const aiOverview = rawAi ? extractAiOverviewModel(rawAi) : null;

    const observationId = `serp_obs_${sha256(`bd|${rawPayload.request_id || "adhoc"}|${rawChecksum}`).slice(0, 16)}`;

    return {
      schema_version: 1,
      observation_id: observationId,
      context,
      provider: {
        name: this.providerName,
        adapter_version: this.adapterVersion,
        provider_request_id: rawPayload.request_id || null,
        response_latency_ms: rawPayload.response_time_ms || null,
        cost_minor_units: rawPayload.cost_usd ? Math.round(rawPayload.cost_usd * 100) : null,
      },
      collection_status: collectionStatus,
      failure_reason: failureReason,
      timestamps: {
        requested_at: contextOptions.requested_at || nowIso,
        observed_at: general.timestamp || nowIso,
        provider_completed_at: general.timestamp || nowIso,
        normalized_at: nowIso,
      },
      elements,
      ai_overview: aiOverview,
      raw_evidence_checksum: rawChecksum,
    };
  }
}
