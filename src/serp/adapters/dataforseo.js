import { BaseSerpAdapter } from "./base.js";
import { createSerpContext } from "../envelope.js";
import { normalizeSerpElements } from "../elements.js";
import { extractAiOverviewModel } from "../aiOverview.js";
import { sha256 } from "../../shared/io.js";

export class DataForSeoSerpAdapter extends BaseSerpAdapter {
  constructor(version = "1.0.0") {
    super("dataforseo", version);
  }

  validate(rawPayload) {
    if (!rawPayload || typeof rawPayload !== "object") {
      throw new Error("DataForSeo payload must be an object");
    }
    if (!Array.isArray(rawPayload.tasks) || rawPayload.tasks.length === 0) {
      throw new Error("DataForSeo payload missing tasks array");
    }
    const task = rawPayload.tasks[0];
    if (task.status_code && task.status_code >= 40000) {
      return { valid: false, error: `DataForSeo task error code ${task.status_code}: ${task.status_message || ""}` };
    }
    return { valid: true };
  }

  normalize(rawPayload, contextOptions = {}) {
    const check = this.validate(rawPayload);
    const rawString = JSON.stringify(rawPayload);
    const rawChecksum = sha256(rawString);
    const nowIso = new Date().toISOString();

    const task = rawPayload?.tasks?.[0] || {};
    const taskData = task.data || {};
    const taskResult = task.result?.[0] || {};

    const queryText = contextOptions.query_text || taskData.keyword || taskResult.keyword || "unknown query";
    const engine = contextOptions.engine || taskData.se || "google";
    const device = contextOptions.device || taskData.device || "desktop";
    const language = contextOptions.language || taskData.language_code || "en";

    const context = createSerpContext({
      query_text: queryText,
      engine,
      search_surface: contextOptions.search_surface || "organic",
      device,
      language,
      country: contextOptions.country || "US",
      location: contextOptions.location || null,
      ...contextOptions,
    });

    const isSuccess = check.valid && (task.status_code === 20000 || typeof task.status_code === "undefined");
    const collectionStatus = isSuccess ? "SUCCESS" : "COLLECTION_FAILED";
    const failureReason = isSuccess ? null : (check.error || "task returned non-success status");

    const rawItems = taskResult.items || [];
    const elements = normalizeSerpElements(rawItems, context);

    // Look for AI Overview item or sub-block
    const aiItem = rawItems.find((it) => it.type === "ai_overview" || it.type === "generative_ai" || it.type === "ai_answer");
    const aiOverview = aiItem ? extractAiOverviewModel(aiItem) : null;

    const observationId = `serp_obs_${sha256(`dfs|${task.id || "adhoc"}|${rawChecksum}`).slice(0, 16)}`;

    return {
      schema_version: 1,
      observation_id: observationId,
      context,
      provider: {
        name: this.providerName,
        adapter_version: this.adapterVersion,
        provider_request_id: task.id || null,
        response_latency_ms: typeof task.time_taken === "number" ? Math.round(task.time_taken * 1000) : null,
        cost_minor_units: typeof task.cost === "number" ? Math.round(task.cost * 10000) : null,
      },
      collection_status: collectionStatus,
      failure_reason: failureReason,
      timestamps: {
        requested_at: contextOptions.requested_at || nowIso,
        observed_at: task.datetime || nowIso,
        provider_completed_at: task.datetime || nowIso,
        normalized_at: nowIso,
      },
      elements,
      ai_overview: aiOverview,
      raw_evidence_checksum: rawChecksum,
    };
  }
}
