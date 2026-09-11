import { safeJsonClone, isSensitiveKey, isSensitiveValue } from './sanitizer.js';

export class RuntimeEventCollector {
  constructor(options = {}) {
    const {
      runtimeEventPolicy = {},
      correlationTracker,
      planId,
      profileId,
    } = options;

    this.policy = runtimeEventPolicy;
    this.enabled = Boolean(this.policy.enabled);
    this.planId = planId || 'plan-unspecified';
    this.profileId = profileId || 'profile-unspecified';
    this.tracker = correlationTracker;

    this.sources = this.policy.sources || [];
    this.allowedEventNames = this.policy.allowed_event_names ? new Set(this.policy.allowed_event_names) : null;
    this.allowedFields = this.policy.allowed_fields || null;
    this.hashFields = this.policy.hash_fields || null;
    this.redactFields = this.policy.redact_fields || null;
    this.maxEvents = Math.min(this.policy.max_events || 200, 1000);
    this.maxPayloadDepth = Math.min(this.policy.max_payload_depth || 5, 10);
    this.maxFieldSize = Math.min(this.policy.max_field_size || 1024, 4096);

    this.events = [];
    this.eventCountsByName = {};
    this.eventCountsBySource = {};
    this.summary = {
      total_events: 0,
      filtered_events: 0,
      by_source: {},
      by_event_name: {},
      collector_status: 'complete',
      truncated: false,
      truncation_reason: null,
      collector_health: {
        status: 'active',
        queue_replaced: false,
        push_replaced: false,
        polling_fallback_used: false,
        supported_contexts: ['top_level_main_frame'],
        unsupported_contexts: ['cross_origin_iframes', 'web_workers', 'service_workers'],
      },
    };
  }

  /**
   * Generates initialization script to be added to browser context or page.
   */
  getInitScript() {
    if (!this.enabled || !this.sources.length) return null;
    const sourcesConfig = JSON.stringify(this.sources);

    return `
      (function() {
        window.__citable_events = window.__citable_events || [];
        window.__citable_health = window.__citable_health || {
          queue_replaced: false,
          push_replaced: false,
          polling_fallback_used: false,
        };
        const sources = ${sourcesConfig};

        function safeExtract(obj, depth, seen) {
          if (depth <= 0) return '[DEPTH_LIMIT]';
          if (obj === null || obj === undefined) return obj;
          const t = typeof obj;
          if (t === 'number' || t === 'boolean' || t === 'string') return obj;
          if (t !== 'object') return String(obj);
          if (seen.has(obj)) return '[CIRCULAR]';
          seen.add(obj);

          if (Array.isArray(obj)) {
            return obj.map(function(item) { return safeExtract(item, depth - 1, seen); });
          }

          const res = {};
          const keys = Object.keys(obj);
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            try {
              res[k] = safeExtract(obj[k], depth - 1, seen);
            } catch (err) {
              res[k] = '[GETTER_ERROR]';
            }
          }
          return res;
        }

        for (var i = 0; i < sources.length; i++) {
          var src = sources[i];
          if (src.type === 'global_array' && src.global_name) {
            var propName = src.global_name.replace(/^window\\./, '');

            (function(sourceConfig, prop) {
              var currentArray = window[prop];
              if (!Array.isArray(currentArray)) {
                currentArray = [];
                window[prop] = currentArray;
              }

              for (var j = 0; j < currentArray.length; j++) {
                try {
                  window.__citable_events.push({
                    source_id: sourceConfig.source_id,
                    payload: safeExtract(currentArray[j], 5, new WeakSet()),
                    ts: Date.now()
                  });
                } catch (e) {}
              }
              currentArray.__citable_drained_count = currentArray.length;

              function wrapPush(arr) {
                var origPush = arr.push;
                arr.push = function(...items) {
                  for (var k = 0; k < items.length; k++) {
                    try {
                      window.__citable_events.push({
                        source_id: sourceConfig.source_id,
                        payload: safeExtract(items[k], 5, new WeakSet()),
                        ts: Date.now()
                      });
                    } catch (e) {}
                  }
                  if (typeof origPush === 'function') {
                    return origPush.apply(this, items);
                  }
                };
              }

              wrapPush(currentArray);

              try {
                var storedArray = currentArray;
                Object.defineProperty(window, prop, {
                  configurable: true,
                  enumerable: true,
                  get: function() { return storedArray; },
                  set: function(newVal) {
                    window.__citable_health.queue_replaced = true;
                    storedArray = newVal;
                    if (Array.isArray(newVal)) {
                      wrapPush(newVal);
                      for (var m = 0; m < newVal.length; m++) {
                        try {
                          window.__citable_events.push({
                            source_id: sourceConfig.source_id,
                            payload: safeExtract(newVal[m], 5, new WeakSet()),
                            ts: Date.now()
                          });
                        } catch (e) {}
                      }
                      newVal.__citable_drained_count = newVal.length;
                    }
                  }
                });
              } catch (e) {}
            })(src, propName);

          } else if (src.type === 'window_event' && src.event_name) {
            (function(sourceConfig) {
              window.addEventListener(sourceConfig.event_name, function(e) {
                try {
                  window.__citable_events.push({
                    source_id: sourceConfig.source_id,
                    payload: {
                      type: e.type,
                      detail: safeExtract(e.detail, 5, new WeakSet()) || null,
                    },
                    ts: Date.now()
                  });
                } catch (err) {}
              }, true);
            })(src);
          }
        }
      })();
    `;
  }

  async installOnPage(page) {
    if (!this.enabled || !this.sources.length) return;
    const script = this.getInitScript();
    if (!script) return;
    try {
      await page.evaluate(script);
    } catch {
      // Ignored if page is not ready yet
    }
  }

  async drainEvents(page) {
    if (!this.enabled || !this.sources.length) return;

    let drainResult = null;
    try {
      drainResult = await page.evaluate((sources) => {
        const events = window.__citable_events ? window.__citable_events.splice(0) : [];
        const health = window.__citable_health || {
          queue_replaced: false,
          push_replaced: false,
          polling_fallback_used: false,
        };

        // Fallback polling for arrays where push was replaced or unhooked
        for (const src of sources) {
          if (src.type === 'global_array' && src.global_name) {
            const prop = src.global_name.replace(/^window\./, '');
            const arr = window[prop];
            if (Array.isArray(arr)) {
              const startIdx = arr.__citable_drained_count || 0;
              if (arr.length > startIdx) {
                health.polling_fallback_used = true;
                for (let i = startIdx; i < arr.length; i++) {
                  events.push({
                    source_id: src.source_id,
                    payload: arr[i],
                    ts: Date.now(),
                  });
                }
                arr.__citable_drained_count = arr.length;
              }
            }
          }
        }

        return { events, health };
      }, this.sources);
    } catch {
      return;
    }

    const eventsList = Array.isArray(drainResult)
      ? drainResult
      : (drainResult && Array.isArray(drainResult.events) ? drainResult.events : []);

    if (!eventsList || eventsList.length === 0) return;

    if (drainResult && !Array.isArray(drainResult) && drainResult.health) {
      if (drainResult.health.queue_replaced) this.summary.collector_health.queue_replaced = true;
      if (drainResult.health.push_replaced) this.summary.collector_health.push_replaced = true;
      if (drainResult.health.polling_fallback_used) this.summary.collector_health.polling_fallback_used = true;
    }

    for (const raw of eventsList) {
      if (this.events.length >= this.maxEvents) {
        this.summary.truncated = true;
        this.summary.truncation_reason = 'max_events_exceeded';
        break;
      }

      const sourceId = raw.source_id || 'unknown';
      const sourceConfig = this.sources.find((s) => s.source_id === sourceId) || {};
      const payload = raw.payload;

      // Extract event name
      let eventName = 'unnamed_event';
      if (typeof payload === 'object' && payload !== null) {
        const keyName = sourceConfig.event_name_key || 'event';
        if (typeof payload[keyName] === 'string') {
          eventName = payload[keyName];
        } else if (typeof payload.type === 'string') {
          eventName = payload.type;
        } else if (sourceConfig.event_name) {
          eventName = sourceConfig.event_name;
        }
      } else if (typeof payload === 'string') {
        eventName = payload;
      }

      // Check allowed event names
      const isAllowed = !this.allowedEventNames || this.allowedEventNames.has(eventName);
      if (!isAllowed) {
        this.summary.filtered_events++;
        continue; // Filtered out
      }

      this.eventCountsByName[eventName] = (this.eventCountsByName[eventName] || 0) + 1;
      this.eventCountsBySource[sourceId] = (this.eventCountsBySource[sourceId] || 0) + 1;
      const occurrenceIndex = this.eventCountsByName[eventName];

      const seq = this.tracker.nextSequence();
      const timing = this.tracker.timing();
      const correlation = this.tracker.getCorrelation();

      // Sanitize payload
      const stats = { redactedCount: 0, filteredFields: [] };
      const sanitizedPayload = typeof payload === 'object' && payload !== null
        ? safeJsonClone(payload, {
            maxDepth: this.maxPayloadDepth,
            maxFieldSize: this.maxFieldSize,
            allowedFields: this.allowedFields,
            hashFields: this.hashFields,
            redactFields: this.redactFields,
            stats,
          })
        : { value: String(payload) };

      const eventRecord = {
        sequence: seq,
        source_id: sourceId,
        event_name: eventName,
        occurrence_index: occurrenceIndex,
        timing,
        correlation,
        payload: sanitizedPayload,
        disposition: {
          capture_status: stats.redactedCount > 0 ? 'redacted' : 'captured',
          redacted_count: stats.redactedCount,
          filtered_fields: stats.filteredFields,
        },
      };

      this.events.push(eventRecord);
      this.summary.total_events++;
    }

    this.summary.by_source = { ...this.eventCountsBySource };
    this.summary.by_event_name = { ...this.eventCountsByName };
  }

  toArtifact() {
    this.summary.collector_status = this.summary.truncated ? 'truncated' : 'complete';
    return {
      schema_version: 1,
      plan_id: this.planId,
      profile_id: this.profileId,
      collected_at: this.tracker.timing().timestamp,
      capture_policy: this.policy,
      summary: this.summary,
      events: this.events,
    };
  }
}
