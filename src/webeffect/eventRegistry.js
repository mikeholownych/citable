import { sha256 } from "../shared/io.js";
import { detectEventDuplicates } from "./duplicateDetection.js";

/**
 * Standard default canonical business events.
 */
export const STANDARD_CANONICAL_EVENTS = [
  {
    event_name: "page_view",
    trigger_type: "page_load",
    description: "Initial HTML page document load or single-page route view.",
    required_parameters: ["page_location", "page_title"],
    prohibited_triggers: [],
  },
  {
    event_name: "lead_capture",
    trigger_type: "form_submit",
    description: "Submission of lead generation contact or quote request form.",
    required_parameters: ["form_id"],
    prohibited_triggers: ["page_load", "view_content"],
  },
  {
    event_name: "add_to_cart",
    trigger_type: "button_click",
    description: "User interaction adding product item to shopping cart.",
    required_parameters: ["item_id", "currency", "price"],
    prohibited_triggers: ["page_load"],
  },
  {
    event_name: "initiate_checkout",
    trigger_type: "button_click",
    description: "User starts payment or checkout funnel.",
    required_parameters: ["currency", "value"],
    prohibited_triggers: ["page_load"],
  },
  {
    event_name: "purchase",
    trigger_type: "transaction_confirm",
    description: "Confirmed financial commerce transaction completion.",
    required_parameters: ["transaction_id", "currency", "value"],
    prohibited_triggers: ["page_load", "view_content"],
  },
];

/**
 * Canonical Event Registry and Semantic Event Validation (B-070).
 *
 * Invariant: An event fires only when its business-defined trigger occurs;
 * page load does not satisfy a named business event (e.g. purchase, lead_capture)
 * unless explicitly declared.
 */
export class CanonicalEventRegistry {
  constructor(customEvents = []) {
    this._events = new Map();
    const initial = [...STANDARD_CANONICAL_EVENTS, ...customEvents];
    for (const evt of initial) {
      this._events.set(evt.event_name.toLowerCase(), evt);
    }
  }

  get(eventName) {
    return this._events.get(String(eventName).toLowerCase()) || null;
  }

  getAll() {
    return [...this._events.values()];
  }

  register(eventDef) {
    if (!eventDef.event_name || !eventDef.trigger_type) {
      throw new Error("Event definition requires event_name and trigger_type");
    }
    const def = {
      event_name: eventDef.event_name,
      trigger_type: eventDef.trigger_type,
      description: eventDef.description || "",
      required_parameters: Array.isArray(eventDef.required_parameters) ? eventDef.required_parameters : [],
      prohibited_triggers: Array.isArray(eventDef.prohibited_triggers) ? eventDef.prohibited_triggers : [],
    };
    this._events.set(def.event_name.toLowerCase(), def);
    return def;
  }

  /**
   * Validates a batch of emitted telemetry events against canonical definitions (B-070, B-071).
   */
  validateEmittedEvents(emittedEvents = []) {
    const violations = [];

    for (const em of emittedEvents) {
      const name = String(em.event_name || "").toLowerCase();
      const canonical = this._events.get(name);
      const observedTrigger = String(em.trigger_observed || em.trigger || "unknown").toLowerCase();

      // 1. Unregistered event check
      if (!canonical) {
        violations.push({
          event_name: em.event_name || "unnamed",
          violation_type: "UNREGISTERED_EVENT",
          trigger_observed: observedTrigger,
          reason: `Event "${em.event_name}" is not defined in the canonical event registry`,
        });
        continue;
      }

      // 2. Prohibited trigger check (B-070 invariant)
      if (canonical.prohibited_triggers.map((t) => t.toLowerCase()).includes(observedTrigger)) {
        violations.push({
          event_name: canonical.event_name,
          violation_type: "PROHIBITED_PAGE_LOAD_CONVERSION",
          trigger_observed: observedTrigger,
          reason: `Business event "${canonical.event_name}" cannot fire on prohibited trigger "${observedTrigger}"; page load does not satisfy a named conversion event without user interaction`,
        });
        continue;
      }

      // 3. Semantic trigger mismatch
      if (canonical.trigger_type.toLowerCase() !== observedTrigger) {
        violations.push({
          event_name: canonical.event_name,
          violation_type: "SEMANTIC_TRIGGER_VIOLATION",
          trigger_observed: observedTrigger,
          reason: `Event "${canonical.event_name}" expected trigger "${canonical.trigger_type}", but observed "${observedTrigger}"`,
        });
        continue;
      }

      // 4. Missing required parameters
      const params = em.parameters || em.data || {};
      const missing = canonical.required_parameters.filter((p) => typeof params[p] === "undefined" || params[p] === null || params[p] === "");
      if (missing.length > 0) {
        violations.push({
          event_name: canonical.event_name,
          violation_type: "MISSING_REQUIRED_PARAMETERS",
          trigger_observed: observedTrigger,
          reason: `Event "${canonical.event_name}" missing required parameters: ${missing.join(", ")}`,
        });
      }
    }

    // 5. Detect duplicates (B-071)
    const duplicates = detectEventDuplicates(emittedEvents);

    const registryId = `evt_reg_${sha256(JSON.stringify(this.getAll())).slice(0, 16)}`;

    return {
      schema_version: 1,
      registry_id: registryId,
      events: this.getAll(),
      validation_summary: {
        total_observed_events: emittedEvents.length,
        semantic_violations: violations,
        duplicates_detected: duplicates,
      },
    };
  }
}
