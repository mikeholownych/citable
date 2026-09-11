import { sha256 } from '../../shared/io.js';
import {
  sanitizeQueryParams,
  isSensitiveKey,
  isSensitiveValue,
  REDACTED_MARKER,
} from './sanitizer.js';

export class StateCollector {
  constructor(options = {}) {
    const {
      statePolicy = {},
      correlationTracker,
      planId,
      profileId,
    } = options;

    this.policy = statePolicy;
    this.enabled = Boolean(this.policy.enabled);
    this.planId = planId || 'plan-unspecified';
    this.profileId = profileId || 'profile-unspecified';
    this.tracker = correlationTracker;

    this.checkpointsConfig = this.policy.checkpoints || ['final'];
    this.captureUrl = this.policy.capture_url !== false;
    this.allowedQueryParams = this.policy.allowed_query_params || null;
    this.captureReferrer = Boolean(this.policy.capture_referrer);
    this.captureNavigation = Boolean(this.policy.capture_navigation);
    this.cookiesPolicy = this.policy.cookies || null;
    this.localStoragePolicy = this.policy.local_storage || null;
    this.sessionStoragePolicy = this.policy.session_storage || null;
    this.globalsConfig = this.policy.globals || [];
    this.domQueriesConfig = this.policy.dom_queries || [];
    this.maxObservations = Math.min(this.policy.max_observations || 100, 500);
    this.maxValueLength = Math.min(this.policy.max_value_length || 1024, 4096);

    this.checkpoints = [];
    this.summary = {
      total_checkpoints: 0,
      total_observations: 0,
      truncated: false,
      truncation_reason: null,
    };
  }

  shouldCaptureCheckpoint(type) {
    if (!this.enabled) return false;
    return this.checkpointsConfig.includes(type);
  }

  async observeCheckpoint(page, context, checkpointId, checkpointType) {
    if (!this.enabled) return null;

    if (this.checkpoints.length >= this.maxObservations) {
      this.summary.truncated = true;
      this.summary.truncation_reason = 'max_observations_exceeded';
      return null;
    }

    const seq = this.tracker.nextSequence();
    const timing = this.tracker.timing();
    const correlation = this.tracker.getCorrelation(checkpointId);
    let redactedCount = 0;
    const unavailableItems = [];

    // 1. URL & query params
    const rawUrl = page.url();
    let sanitizedQuery = null;
    if (this.allowedQueryParams) {
      const queryResult = sanitizeQueryParams(rawUrl, this.allowedQueryParams);
      sanitizedQuery = queryResult.query;
      redactedCount += queryResult.redactedCount;
    }

    // 2. Referrer & Navigation
    let referrer = null;
    let navType = null;
    try {
      if (this.captureReferrer || this.captureNavigation) {
        const meta = await page.evaluate(() => ({
          referrer: document.referrer || null,
          navType: (performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].type) || null,
        }));
        if (this.captureReferrer) referrer = meta.referrer;
        if (this.captureNavigation) navType = meta.navType;
      }
    } catch {
      unavailableItems.push('referrer_or_navigation');
    }

    // 3. Cookies (explicitly governed only)
    let cookiesObs = null;
    if (this.cookiesPolicy && Array.isArray(this.cookiesPolicy.allowed_names) && this.cookiesPolicy.allowed_names.length > 0) {
      cookiesObs = {};
      const mode = this.cookiesPolicy.mode || 'presence_only';
      try {
        const cookies = await context.cookies([rawUrl]);
        const cookieMap = new Map(cookies.map((c) => [c.name, c]));
        for (const name of this.cookiesPolicy.allowed_names) {
          if (!cookieMap.has(name)) {
            cookiesObs[name] = { exists: false };
            continue;
          }
          const c = cookieMap.get(name);
          const val = c.value ?? '';
          const len = val.length;
          const isHttpOnly = Boolean(c.httpOnly);
          const isSecure = Boolean(c.secure);
          const sameSite = c.sameSite || null;

          const baseInfo = {
            exists: true,
            length: len,
            http_only: isHttpOnly,
            secure: isSecure,
            same_site: sameSite,
          };

          if (mode === 'presence_only') {
            cookiesObs[name] = baseInfo;
          } else if (mode === 'hash_only') {
            cookiesObs[name] = { ...baseInfo, value_hash: sha256(val) };
          } else if (mode === 'allowlist_values') {
            if (isHttpOnly) {
              // Policy restricts raw HttpOnly values from plaintext exposure
              cookiesObs[name] = { ...baseInfo, value: '[POLICY_RESTRICTED_HTTPONLY]', disposition: 'policy_restricted' };
            } else if (isSensitiveKey(name) || isSensitiveValue(val)) {
              cookiesObs[name] = { ...baseInfo, value: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = val.length > this.maxValueLength ? val.slice(0, this.maxValueLength) + '...[TRUNCATED]' : val;
              cookiesObs[name] = { ...baseInfo, value: bounded };
            }
          }
        }
      } catch {
        unavailableItems.push('cookies:context_error');
        cookiesObs = null;
      }
    }

    // 4. Local Storage (explicitly governed only)
    let localObs = null;
    if (this.localStoragePolicy && Array.isArray(this.localStoragePolicy.allowed_keys) && this.localStoragePolicy.allowed_keys.length > 0) {
      localObs = {};
      const mode = this.localStoragePolicy.mode || 'presence_only';
      try {
        const entries = await page.evaluate((keys) => {
          const res = {};
          for (const k of keys) {
            try {
              res[k] = window.localStorage.getItem(k);
            } catch {
              res[k] = null;
            }
          }
          return res;
        }, this.localStoragePolicy.allowed_keys);

        for (const key of this.localStoragePolicy.allowed_keys) {
          const val = entries[key];
          if (val === null || val === undefined) {
            localObs[key] = { exists: false };
            continue;
          }
          const len = val.length;
          if (mode === 'presence_only') {
            localObs[key] = { exists: true, length: len };
          } else if (mode === 'hash_only') {
            localObs[key] = { exists: true, length: len, value_hash: sha256(val) };
          } else if (mode === 'allowlist_values') {
            if (isSensitiveKey(key) || isSensitiveValue(val)) {
              localObs[key] = { exists: true, length: len, value: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = val.length > this.maxValueLength ? val.slice(0, this.maxValueLength) + '...[TRUNCATED]' : val;
              localObs[key] = { exists: true, length: len, value: bounded };
            }
          }
        }
      } catch {
        unavailableItems.push('local_storage');
        localObs = null;
      }
    }

    // 5. Session Storage (explicitly governed only)
    let sessionObs = null;
    if (this.sessionStoragePolicy && Array.isArray(this.sessionStoragePolicy.allowed_keys) && this.sessionStoragePolicy.allowed_keys.length > 0) {
      sessionObs = {};
      const mode = this.sessionStoragePolicy.mode || 'presence_only';
      try {
        const entries = await page.evaluate((keys) => {
          const res = {};
          for (const k of keys) {
            try {
              res[k] = window.sessionStorage.getItem(k);
            } catch {
              res[k] = null;
            }
          }
          return res;
        }, this.sessionStoragePolicy.allowed_keys);

        for (const key of this.sessionStoragePolicy.allowed_keys) {
          const val = entries[key];
          if (val === null || val === undefined) {
            sessionObs[key] = { exists: false };
            continue;
          }
          const len = val.length;
          if (mode === 'presence_only') {
            sessionObs[key] = { exists: true, length: len };
          } else if (mode === 'hash_only') {
            sessionObs[key] = { exists: true, length: len, value_hash: sha256(val) };
          } else if (mode === 'allowlist_values') {
            if (isSensitiveKey(key) || isSensitiveValue(val)) {
              sessionObs[key] = { exists: true, length: len, value: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = val.length > this.maxValueLength ? val.slice(0, this.maxValueLength) + '...[TRUNCATED]' : val;
              sessionObs[key] = { exists: true, length: len, value: bounded };
            }
          }
        }
      } catch {
        unavailableItems.push('session_storage');
        sessionObs = null;
      }
    }

    // 6. Globals (safe expressions only)
    let globalsObs = null;
    if (this.globalsConfig && this.globalsConfig.length > 0) {
      globalsObs = {};
      for (const item of this.globalsConfig) {
        // Enforce safe expression regex
        if (!/^[a-zA-Z0-9_$.[\]'"]+$/.test(item.expression)) {
          unavailableItems.push(`global:${item.name}:unsafe_expression`);
          continue;
        }
        try {
          const evalRes = await page.evaluate((expr) => {
            try {
              // Safe evaluation using Function or window path traversal
              const parts = expr.replace(/^window\./, '').split('.');
              let curr = window;
              for (const part of parts) {
                if (curr == null) return { exists: false };
                curr = curr[part];
              }
              if (curr === undefined) return { exists: false };
              const type = typeof curr;
              if (type === 'string' || type === 'number' || type === 'boolean') {
                return { exists: true, type, value: String(curr) };
              }
              if (curr === null) return { exists: true, type: 'null', value: 'null' };
              return { exists: true, type, value: JSON.stringify(curr) };
            } catch {
              return { exists: false };
            }
          }, item.expression);

          if (!evalRes.exists) {
            globalsObs[item.name] = { exists: false };
            continue;
          }

          const mode = item.mode || 'presence_only';
          if (mode === 'presence_only') {
            globalsObs[item.name] = { exists: true };
          } else if (mode === 'type_only') {
            globalsObs[item.name] = { exists: true, type: evalRes.type };
          } else if (mode === 'hash_only') {
            globalsObs[item.name] = { exists: true, type: evalRes.type, value_hash: sha256(evalRes.value) };
          } else if (mode === 'scalar_value') {
            if (isSensitiveKey(item.name) || isSensitiveValue(evalRes.value)) {
              globalsObs[item.name] = { exists: true, type: evalRes.type, value: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = evalRes.value.length > this.maxValueLength ? evalRes.value.slice(0, this.maxValueLength) + '...[TRUNCATED]' : evalRes.value;
              globalsObs[item.name] = { exists: true, type: evalRes.type, value: bounded };
            }
          }
        } catch {
          unavailableItems.push(`global:${item.name}`);
        }
      }
    }

    // 7. DOM Queries
    let domObs = null;
    if (this.domQueriesConfig && this.domQueriesConfig.length > 0) {
      domObs = {};
      for (const query of this.domQueriesConfig) {
        try {
          const locator = page.locator(query.selector).first();
          const count = await locator.count();
          if (count === 0) {
            domObs[query.name] = { exists: false };
            continue;
          }

          if (query.property === 'presence') {
            domObs[query.name] = { exists: true };
          } else if (query.property === 'visible') {
            const isVisible = await locator.isVisible();
            domObs[query.name] = { exists: true, visible: isVisible };
          } else if (query.property === 'text_content') {
            const text = await locator.innerText();
            if (isSensitiveValue(text)) {
              domObs[query.name] = { exists: true, text: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = text.length > this.maxValueLength ? text.slice(0, this.maxValueLength) + '...[TRUNCATED]' : text;
              domObs[query.name] = { exists: true, text: bounded };
            }
          } else if (query.property === 'text_length') {
            const text = await locator.innerText();
            domObs[query.name] = { exists: true, text_length: text.length };
          } else if (query.property === 'text_hash') {
            const text = await locator.innerText();
            domObs[query.name] = { exists: true, text_hash: sha256(text) };
          } else if (query.property === 'attribute_value' && query.attribute_name) {
            const attr = await locator.getAttribute(query.attribute_name);
            if (attr === null) {
              domObs[query.name] = { exists: true, attribute: null };
            } else if (isSensitiveKey(query.attribute_name) || isSensitiveValue(attr)) {
              domObs[query.name] = { exists: true, attribute: REDACTED_MARKER };
              redactedCount++;
            } else {
              const bounded = attr.length > this.maxValueLength ? attr.slice(0, this.maxValueLength) + '...[TRUNCATED]' : attr;
              domObs[query.name] = { exists: true, attribute: bounded };
            }
          }
        } catch {
          unavailableItems.push(`dom:${query.name}`);
        }
      }
    }

    const checkpointRecord = {
      checkpoint_id: checkpointId,
      sequence: seq,
      timing,
      correlation: {
        step_id: correlation.step_id,
        step_sequence: correlation.step_sequence,
      },
      state: {
        url: rawUrl,
        query_params: sanitizedQuery,
        referrer,
        navigation_type: navType,
        cookies: cookiesObs,
        local_storage: localObs,
        session_storage: sessionObs,
        globals: globalsObs,
        dom_queries: domObs,
      },
      disposition: {
        observation_status: unavailableItems.length > 0 ? 'partially_observed' : 'observed',
        redacted_count: redactedCount,
        unavailable_items: unavailableItems,
      },
    };

    this.checkpoints.push(checkpointRecord);
    this.summary.total_checkpoints++;
    this.summary.total_observations += 1;
    return checkpointRecord;
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
      checkpoints: this.checkpoints,
    };
  }
}
